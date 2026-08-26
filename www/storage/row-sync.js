import {
  acknowledgeOperations,
  applyRemoteChanges,
  clearLocalState,
  readLocalState,
  readPendingOperations,
  readSyncMeta,
  resolveLocalConflicts,
  writeLocalState,
} from "./local-store.js?v=homealacarte-78";

const POLL_INTERVAL_MS = 5_000;
export const SYNC_BATCH_SIZE = 100;

const UPSERT_ENTITY_ORDER = new Map([
  ["app", 0],
  ["items", 10],
  ["people", 20],
  ["dishes", 30],
  ["menu", 40],
  ["stock", 50],
  ["extra_needs", 50],
]);
const DELETE_ENTITY_ORDER = new Map([
  ["menu", 0],
  ["stock", 10],
  ["extra_needs", 10],
  ["dishes", 20],
  ["people", 30],
  ["items", 40],
  ["app", 50],
]);

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function operationOrder(operation) {
  const deleting = operation.operation === "delete";
  const entityOrder = deleting ? DELETE_ENTITY_ORDER : UPSERT_ENTITY_ORDER;
  return (deleting ? 100 : 0) + (entityOrder.get(operation.entityType) ?? 60);
}

export function selectSyncBatch(operations, limit = SYNC_BATCH_SIZE) {
  return [...operations]
    .sort((left, right) => (
      operationOrder(left) - operationOrder(right)
      || String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
      || String(left.recordKey || "").localeCompare(String(right.recordKey || ""))
    ))
    .slice(0, limit);
}

export function createRowSync({ remoteClient, emitStatus, notifyRemoteChange }) {
  let drainPromise = null;
  let conflict = null;
  let pollingTimer = null;

  async function pullRemoteChanges(activeSession, notify = true, ignoredChangeIds = new Set()) {
    const meta = await readSyncMeta();
    let cursor = Number(meta.cursor || 0);
    let changed = false;
    while (true) {
      const changes = await remoteClient.fetchRemoteChanges(cursor);
      if (!changes.length) break;
      const nextCursor = Number(changes.at(-1).change_id || cursor);
      const remoteChanges = changes.filter(
        (change) => !ignoredChangeIds.has(Number(change.change_id || 0)),
      );
      const conflicts = await applyRemoteChanges(
        remoteChanges,
        nextCursor,
        activeSession.user.id,
      );
      cursor = nextCursor;
      changed = changed || remoteChanges.length > conflicts.length;
      if (conflicts.length) {
        conflict = { kind: "rows", rows: conflicts };
        emitStatus({ state: "conflict", message: "Online and local records both changed." });
        return false;
      }
      if (changes.length < 1000) break;
    }
    if (changed && notify) notifyRemoteChange(await readLocalState());
    return true;
  }

  async function pushPending(activeSession, conflictChoice = null) {
    const appliedChangeIds = new Set();
    while (true) {
      const pendingOperations = await readPendingOperations();
      if (!pendingOperations.length) return appliedChangeIds;
      const operations = selectSyncBatch(pendingOperations);
      emitStatus({ state: "saving", message: "" });
      const meta = await readSyncMeta();
      const result = await remoteClient.applyRemoteOperations(operations);
      for (const change of result?.applied || []) {
        const changeId = Number(change?.change_id || 0);
        if (changeId > 0) appliedChangeIds.add(changeId);
      }
      await acknowledgeOperations(
        operations,
        result?.applied || [],
        Number(meta.cursor || 0),
        activeSession.user.id,
      );
      if (result?.conflicts?.length) {
        const nextConflict = {
          kind: "rows",
          rows: result.conflicts.map((remote) => ({
            remote,
            operation: remote.operation || "upsert",
          })),
        };
        if (conflictChoice) {
          await resolveLocalConflicts(nextConflict.rows, conflictChoice);
          continue;
        }
        conflict = nextConflict;
        emitStatus({ state: "conflict", message: "The same records changed on another device." });
        return null;
      }
    }
  }

  async function synchronize(notify = true, conflictChoice = null) {
    const activeSession = await remoteClient.ensureSession();
    if (!activeSession) {
      emitStatus({ state: remoteClient.getSession() ? "offline" : "signed-out" });
      return null;
    }
    try {
      await remoteClient.touchAccountActivity();
      const appliedChangeIds = await pushPending(activeSession, conflictChoice);
      if (!appliedChangeIds) return null;
      if (!await pullRemoteChanges(activeSession, notify, appliedChangeIds)) return null;
      emitStatus({ state: "synced", message: "" });
      return readLocalState();
    } catch (error) {
      emitStatus({
        state: remoteClient.isNetworkError(error) ? "offline" : "error",
        message: error.message,
      });
      return null;
    }
  }

  function queueSynchronization() {
    if (drainPromise) return drainPromise;
    drainPromise = Promise.resolve()
      .then(() => synchronize(false))
      .finally(() => { drainPromise = null; });
    return drainPromise;
  }

  async function load() {
    let local = await readLocalState();
    const meta = await readSyncMeta();
    const config = await remoteClient.loadConfig();
    if (!config) {
      emitStatus({ state: "local", message: "" });
      return local;
    }
    const activeSession = await remoteClient.ensureSession();
    if (!activeSession) {
      emitStatus({ state: remoteClient.getSession() ? "offline" : "signed-out", message: "" });
      return local;
    }

    emitStatus({ state: "connecting", message: "" });
    try {
      await remoteClient.touchAccountActivity(true);
      const snapshot = await remoteClient.fetchRemoteSnapshot();
      const remoteRecords = snapshot?.records || [];
      if (remoteRecords.length) {
        const legacyLocal = meta.legacyDirty != null && meta.cursor == null;
        if (legacyLocal && !meta.legacyDirty) {
          await clearLocalState();
          local = undefined;
        }
        const rowConflicts = await applyRemoteChanges(
          remoteRecords.map((row) => ({ ...row, operation: "upsert" })),
          snapshot.cursor,
          activeSession.user.id,
          true,
        );
        if (rowConflicts.length) {
          conflict = { kind: "rows", rows: rowConflicts };
          emitStatus({ state: "conflict", message: "Online and local records both changed." });
          return local;
        }
        local = await readLocalState();
      } else {
        const legacyRemote = await remoteClient.fetchRemoteState();
        if (legacyRemote?.payload) {
          if (local && meta.legacyDirty && !sameValue(local, legacyRemote.payload)) {
            conflict = { kind: "legacy", local, remote: legacyRemote.payload };
            emitStatus({ state: "conflict", message: "Legacy online and local data both changed." });
            return local;
          }
          await clearLocalState();
          await writeLocalState(legacyRemote.payload, { userId: activeSession.user.id });
          local = await readLocalState();
        }
      }
      const migrated = await pushPending(activeSession);
      if (migrated) await remoteClient.deleteLegacyState().catch(() => {});
      emitStatus({ state: conflict ? "conflict" : "synced", message: "" });
      return local;
    } catch (error) {
      emitStatus({
        state: remoteClient.isNetworkError(error) ? "offline" : "error",
        message: error.message,
      });
      return local;
    }
  }

  async function save(value) {
    const activeSession = await remoteClient.ensureSession();
    const result = await writeLocalState(value, {
      userId: activeSession?.user?.id || (await readSyncMeta()).userId || null,
    });
    if (!result.changed) {
      if (activeSession && result.pending) queueSynchronization();
      return;
    }
    if (activeSession) queueSynchronization();
    else emitStatus({
      state: (await remoteClient.loadConfig())
        ? (remoteClient.getSession() ? "offline" : "signed-out")
        : "local",
    });
  }

  async function resolve(choice) {
    if (!conflict) return null;
    const current = conflict;
    conflict = null;
    if (current.kind === "legacy") {
      const value = choice === "remote" ? current.remote : current.local;
      await clearLocalState();
      await writeLocalState(value, { userId: remoteClient.getSession()?.user?.id || null });
    } else {
      await resolveLocalConflicts(current.rows, choice);
    }
    return await synchronize(false, choice) || null;
  }

  function startPolling() {
    if (pollingTimer || typeof setInterval !== "function") return;
    pollingTimer = setInterval(() => {
      if (globalThis.document?.visibilityState === "hidden" || conflict) return;
      synchronize(true).catch(() => {});
    }, POLL_INTERVAL_MS);
  }

  function stop() {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = null;
    conflict = null;
  }

  return {
    load,
    queueSynchronization,
    resolve,
    save,
    startPolling,
    stop,
    synchronize,
  };
}

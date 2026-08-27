import {
  acknowledgeOperations,
  applyRemoteChanges,
  clearLocalState,
  readLocalState,
  readPendingOperations,
  readSyncMeta,
  resolveLocalConflicts,
  writeLocalState,
} from "./local-store.js?v=homealacarte-99";
import { normalizeRemoteRecord, sameJsonValue } from "./row-codec.js?v=homealacarte-99";

const POLL_INTERVAL_MS = 30_000;
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

function operationOrder(operation) {
  const deleting = operation.operation === "delete";
  const entityOrder = deleting ? DELETE_ENTITY_ORDER : UPSERT_ENTITY_ORDER;
  return (deleting ? 100 : 0) + (entityOrder.get(operation.entityType) ?? 60);
}

function syncRecordKey(entityType, entityId) {
  return `${entityType}\u0000${entityId}`;
}

function operationMatchesRemote(operation, remote) {
  return operation?.operation === "upsert"
    && (remote?.operation || "upsert") === "upsert"
    && normalizeRemoteRecord(operation).position === normalizeRemoteRecord(remote).position
    && sameJsonValue(operation.payload, remote.payload);
}

export function partitionOperationConflicts(operations, conflicts = []) {
  const sent = new Map(operations.map((operation) => [
    operation.recordKey || syncRecordKey(operation.entityType, operation.entityId),
    operation,
  ]));
  const reconciled = [];
  const unresolved = [];
  for (const remote of conflicts) {
    const key = syncRecordKey(
      remote.entity_type || remote.entityType,
      remote.entity_id || remote.entityId,
    );
    const operation = sent.get(key);
    if (operationMatchesRemote(operation, remote)) {
      reconciled.push({
        ...remote,
        record_version: Number(remote.record_version ?? remote.version ?? 0),
        operation: remote.operation || "upsert",
      });
    } else {
      unresolved.push(remote);
    }
  }
  return { reconciled, unresolved };
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
  let synchronizationPromise = null;
  let synchronizationQueued = false;
  let queuedNotify = false;
  let queuedConflictChoice = null;
  let conflict = null;
  let pollingTimer = null;

  function accountMismatch(meta, activeSession) {
    return Boolean(meta.userId && meta.userId !== activeSession?.user?.id);
  }

  function reportAccountMismatch() {
    emitStatus({ state: "error", message: "sync_account_mismatch" });
  }

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
      const result = await applyRemoteChanges(
        remoteChanges,
        nextCursor,
        activeSession.user.id,
      );
      cursor = nextCursor;
      changed = changed || result.changedRecordKeys.length > 0;
      if (result.conflicts.length) {
        conflict = { kind: "rows", rows: result.conflicts };
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
      const { reconciled, unresolved } = partitionOperationConflicts(
        operations,
        result?.conflicts || [],
      );
      const appliedChanges = [...(result?.applied || []), ...reconciled];
      for (const change of appliedChanges) {
        const changeId = Number(change?.change_id || 0);
        if (changeId > 0) appliedChangeIds.add(changeId);
      }
      await acknowledgeOperations(
        operations,
        appliedChanges,
        Number(meta.cursor || 0),
        activeSession.user.id,
      );
      if (unresolved.length) {
        const nextConflict = {
          kind: "rows",
          rows: unresolved.map((remote) => ({
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

  async function synchronizeOnce(notify = true, conflictChoice = null) {
    const activeSession = await remoteClient.ensureSession();
    if (!activeSession) {
      emitStatus({ state: remoteClient.getSession() ? "offline" : "signed-out" });
      return null;
    }
    try {
      if (accountMismatch(await readSyncMeta(), activeSession)) {
        reportAccountMismatch();
        return null;
      }
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

  function synchronize(notify = true, conflictChoice = null) {
    synchronizationQueued = true;
    queuedNotify = queuedNotify || notify;
    queuedConflictChoice = conflictChoice || queuedConflictChoice;
    if (synchronizationPromise) return synchronizationPromise;
    synchronizationPromise = Promise.resolve().then(async () => {
      let result = null;
      while (synchronizationQueued) {
        synchronizationQueued = false;
        const nextNotify = queuedNotify;
        const nextChoice = queuedConflictChoice;
        queuedNotify = false;
        queuedConflictChoice = null;
        result = await synchronizeOnce(nextNotify, nextChoice);
        if (conflict) {
          synchronizationQueued = false;
          break;
        }
      }
      return result;
    }).finally(() => {
      synchronizationPromise = null;
    });
    return synchronizationPromise;
  }

  function queueSynchronization(notify = true) {
    return synchronize(notify);
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
    if (accountMismatch(meta, activeSession)) {
      reportAccountMismatch();
      return undefined;
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
        const result = await applyRemoteChanges(
          remoteRecords.map((row) => ({ ...row, operation: "upsert" })),
          snapshot.cursor,
          activeSession.user.id,
          true,
        );
        if (result.conflicts.length) {
          conflict = { kind: "rows", rows: result.conflicts };
          emitStatus({ state: "conflict", message: "Online and local records both changed." });
          return local;
        }
        local = await readLocalState();
      } else {
        const legacyRemote = await remoteClient.fetchRemoteState();
        if (legacyRemote?.payload) {
          if (local && meta.legacyDirty && !sameJsonValue(local, legacyRemote.payload)) {
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
    const meta = await readSyncMeta();
    if (activeSession && accountMismatch(meta, activeSession)) {
      reportAccountMismatch();
      return;
    }
    const result = await writeLocalState(value, {
      userId: activeSession?.user?.id || meta.userId || null,
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
      queueSynchronization(true).catch(() => {});
    }, POLL_INTERVAL_MS);
  }

  function stop() {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = null;
    conflict = null;
    synchronizationQueued = false;
    queuedNotify = false;
    queuedConflictChoice = null;
  }

  function getDiagnostics() {
    return {
      pollIntervalMs: POLL_INTERVAL_MS,
      synchronizing: Boolean(synchronizationPromise),
      conflict: conflict?.kind || "",
    };
  }

  return {
    load,
    getDiagnostics,
    queueSynchronization,
    resolve,
    save,
    startPolling,
    stop,
    synchronize,
  };
}

import * as defaultLocalStore from "./local-store.js?v=homealacarte-106";
import { normalizePrivateState, sameJsonValue } from "./document-codec.js?v=homealacarte-106";

const POLL_INTERVAL_MS = 30_000;

export function createDocumentSync({
  remoteClient,
  emitStatus,
  notifyRemoteChange,
  localStore = defaultLocalStore,
}) {
  const {
    clearLocalState,
    readLocalState,
    readSyncMeta,
    reconcileSyncedLocalState,
    writeLocalState,
  } = localStore;
  let synchronizationPromise = null;
  let synchronizationQueued = false;
  let queuedNotify = false;
  let conflict = null;
  let pollingTimer = null;

  function accountMismatch(meta, activeSession) {
    return Boolean(meta.userId && meta.userId !== activeSession?.user?.id);
  }

  function reportAccountMismatch() {
    emitStatus({ state: "error", message: "sync_account_mismatch" });
  }

  async function acceptRemote(remote, activeSession, notify, force = true) {
    const value = normalizePrivateState(remote.payload);
    const result = await reconcileSyncedLocalState(
      value,
      remote.revision,
      activeSession.user.id,
      force,
    );
    if (notify && result.changed) notifyRemoteChange(await readLocalState());
    return value;
  }

  async function pushLocal(value, expectedRevision, activeSession) {
    emitStatus({ state: "saving", message: "" });
    const normalized = normalizePrivateState(value);
    const result = await remoteClient.saveRemoteState(normalized, expectedRevision);
    if (result.status === "conflict") {
      const remote = normalizePrivateState(result.payload);
      if (sameJsonValue(normalized, remote)) {
        await reconcileSyncedLocalState(
          remote,
          result.revision,
          activeSession.user.id,
          true,
        );
        return { saved: true, value: remote };
      }
      conflict = {
        local: normalized,
        remote,
        remoteRevision: Number(result.revision),
      };
      emitStatus({ state: "conflict", message: "Online and local data both changed." });
      return { saved: false, value: normalized };
    }
    await reconcileSyncedLocalState(
      normalized,
      result.revision,
      activeSession.user.id,
      false,
    );
    return { saved: true, value: normalized };
  }

  async function synchronizeOnce(notify = true) {
    const activeSession = await remoteClient.ensureSession();
    if (!activeSession) {
      emitStatus({ state: remoteClient.getSession() ? "offline" : "signed-out" });
      return null;
    }
    const meta = await readSyncMeta();
    if (accountMismatch(meta, activeSession)) {
      reportAccountMismatch();
      return null;
    }
    try {
      await remoteClient.touchAccountActivity();
      let local = await readLocalState();
      if (local !== undefined && meta.dirty) {
        const pushed = await pushLocal(local, meta.remoteRevision ?? null, activeSession);
        if (!pushed.saved) return null;
        local = pushed.value;
      }
      const remote = await remoteClient.fetchRemoteState();
      if (!remote) {
        if (local === undefined) {
          emitStatus({ state: "synced", message: "" });
          return null;
        }
        const pushed = await pushLocal(local, 0, activeSession);
        if (!pushed.saved) return null;
        emitStatus({ state: "synced", message: "" });
        return pushed.value;
      }
      const currentMeta = await readSyncMeta();
      if (Number(currentMeta.remoteRevision || 0) !== Number(remote.revision)) {
        const current = await readLocalState();
        const remoteValue = normalizePrivateState(remote.payload);
        if (currentMeta.dirty && !sameJsonValue(current, remoteValue)) {
          conflict = {
            local: current,
            remote: remoteValue,
            remoteRevision: Number(remote.revision),
          };
          emitStatus({ state: "conflict", message: "Online and local data both changed." });
          return null;
        }
        local = await acceptRemote(remote, activeSession, notify, true);
      }
      emitStatus({ state: "synced", message: "" });
      return local;
    } catch (error) {
      emitStatus({
        state: remoteClient.isNetworkError(error) ? "offline" : "error",
        message: error.message,
      });
      return null;
    }
  }

  function synchronize(notify = true) {
    synchronizationQueued = true;
    queuedNotify = queuedNotify || notify;
    if (synchronizationPromise) return synchronizationPromise;
    synchronizationPromise = Promise.resolve().then(async () => {
      let result = null;
      while (synchronizationQueued) {
        synchronizationQueued = false;
        const nextNotify = queuedNotify;
        queuedNotify = false;
        result = await synchronizeOnce(nextNotify);
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
      const remote = await remoteClient.fetchRemoteState();
      if (!remote) {
        if (local !== undefined) {
          const pushed = await pushLocal(local, 0, activeSession);
          if (pushed.saved) local = pushed.value;
        } else {
          emitStatus({ state: "synced", message: "" });
        }
        return local;
      }

      const remoteValue = normalizePrivateState(remote.payload);
      if (local !== undefined && meta.dirty) {
        if (Number(meta.remoteRevision) === Number(remote.revision)) {
          const pushed = await pushLocal(local, remote.revision, activeSession);
          if (pushed.saved) {
            emitStatus({ state: "synced", message: "" });
            return pushed.value;
          }
        } else if (sameJsonValue(local, remoteValue)) {
          await reconcileSyncedLocalState(
            remoteValue,
            remote.revision,
            activeSession.user.id,
            true,
          );
          emitStatus({ state: "synced", message: "" });
        } else {
          conflict = { local, remote: remoteValue, remoteRevision: Number(remote.revision) };
          emitStatus({ state: "conflict", message: "Online and local data both changed." });
        }
        return local;
      }

      await acceptRemote(remote, activeSession, false, true);
      emitStatus({ state: "synced", message: "" });
      return remoteValue;
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
    if (activeSession && (result.changed || meta.dirty)) queueSynchronization(false);
    else if (result.changed) emitStatus({
      state: (await remoteClient.loadConfig())
        ? (remoteClient.getSession() ? "offline" : "signed-out")
        : "local",
    });
  }

  async function resolve(choice) {
    if (!conflict) return null;
    const current = conflict;
    conflict = null;
    const activeSession = await remoteClient.ensureSession();
    if (!activeSession?.user?.id) throw new Error("Not signed in");
    if (choice === "remote") {
      await reconcileSyncedLocalState(
        current.remote,
        current.remoteRevision,
        activeSession.user.id,
        true,
      );
      emitStatus({ state: "synced", message: "" });
      return current.remote;
    }
    if (choice === "local") {
      await writeLocalState(current.local, {
        userId: activeSession.user.id,
        remoteRevision: current.remoteRevision,
        dirty: true,
      });
      const result = await synchronize(false);
      return result || null;
    }
    return null;
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
  }

  function getDiagnostics() {
    return {
      pollIntervalMs: POLL_INTERVAL_MS,
      synchronizing: Boolean(synchronizationPromise),
      conflict: conflict ? "document" : "",
    };
  }

  return {
    clearLocalState,
    getDiagnostics,
    load,
    queueSynchronization,
    resolve,
    save,
    startPolling,
    stop,
    synchronize,
  };
}

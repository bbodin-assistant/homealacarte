import {
  clearLocalState,
  readLocalState,
  readSyncMeta,
  reconcileSyncedLocalState,
  writeLocalState,
} from "./storage/local-store.js?v=homealacarte-77";
import { createRemoteClient } from "./storage/remote-client.js?v=homealacarte-77";
let remoteRevision = null;
let pendingRemoteValue = null;
let remoteDrain = null;
let conflict = null;
const remoteClient = createRemoteClient({
  emitStatus: (...args) => emitStatus(...args),
});
const {
  authRequest,
  ensureSession,
  fetchRemoteState,
  getSession,
  insertRemoteState,
  isNetworkError,
  loadConfig,
  normalizeSession,
  restRequest,
  saveSession,
  touchAccountActivity,
  updateRemoteState,
} = remoteClient;

let syncStatus = {
  state: "local",
  email: getSession()?.user?.email || "",
  message: "",
};

function emitStatus(next) {
  syncStatus = {
    ...syncStatus,
    ...next,
    email: next.email ?? getSession()?.user?.email ?? syncStatus.email ?? "",
  };
  globalThis.dispatchEvent?.(
    new CustomEvent("homealacarte-storage-status", { detail: { ...syncStatus } }),
  );
}

export function getStorageStatus() {
  return { ...syncStatus };
}

export function onStorageStatus(listener) {
  const handler = (event) => listener(event.detail);
  globalThis.addEventListener("homealacarte-storage-status", handler);
  listener(getStorageStatus());
  return () => globalThis.removeEventListener("homealacarte-storage-status", handler);
}

function jsonSize(value) {
  return value === undefined ? 0 : new TextEncoder().encode(JSON.stringify(value)).length;
}


async function markLocalSynced(value, revision, userId, force = false) {
  remoteRevision = revision;
  await reconcileSyncedLocalState(value, revision, userId, force);
}

async function pushRemoteState(value, expectedRevision = remoteRevision) {
  const activeSession = await ensureSession();
  if (!activeSession) {
    emitStatus({ state: "signed-out" });
    return false;
  }
  emitStatus({ state: "saving", message: "" });
  try {
    await touchAccountActivity();
    let row;
    if (expectedRevision == null) {
      const current = await fetchRemoteState();
      if (current) {
        conflict = { local: value, remote: current.payload, remoteRevision: current.revision };
        emitStatus({ state: "conflict", message: "Online data is newer than this local copy." });
        return false;
      }
      row = await insertRemoteState(value);
    } else if (expectedRevision === 0) {
      row = await insertRemoteState(value);
    } else {
      row = await updateRemoteState(value, expectedRevision);
    }
    conflict = null;
    await markLocalSynced(value, Number(row.revision), activeSession.user.id);
    emitStatus({ state: "synced", message: "" });
    return true;
  } catch (error) {
    if (error?.code === "sync_conflict" || error?.status === 409) {
      let conflictFetchError;
      const current = await fetchRemoteState().catch((fetchError) => {
        conflictFetchError = fetchError;
        return null;
      });
      if (!current) {
        emitStatus({
          state: isNetworkError(conflictFetchError) ? "offline" : "error",
          message: conflictFetchError?.message || error.message,
        });
        return false;
      }
      conflict = {
        local: value,
        remote: current.payload,
        remoteRevision: Number(current.revision),
      };
      emitStatus({ state: "conflict", message: error.message });
    } else if (isNetworkError(error)) {
      emitStatus({ state: "offline", message: error.message });
    } else {
      emitStatus({ state: "error", message: error.message });
    }
    return false;
  }
}

function queueRemoteSave(value) {
  pendingRemoteValue = structuredClone(value);
  if (remoteDrain) return;
  let drainFailed = false;
  remoteDrain = (async () => {
    await Promise.resolve();
    while (pendingRemoteValue) {
      const next = pendingRemoteValue;
      pendingRemoteValue = null;
      const saved = await pushRemoteState(next);
      if (!saved) {
        drainFailed = true;
        break;
      }
    }
  })().finally(() => {
    remoteDrain = null;
    if (drainFailed) pendingRemoteValue = null;
    else if (pendingRemoteValue) queueRemoteSave(pendingRemoteValue);
  });
}

export async function loadPrivateState() {
  const local = await readLocalState();
  const meta = await readSyncMeta();
  remoteRevision = meta.remoteRevision != null && Number.isFinite(Number(meta.remoteRevision))
    ? Number(meta.remoteRevision)
    : null;

  const config = await loadConfig();
  if (!config) {
    emitStatus({ state: "local", message: "" });
    return local;
  }
  const activeSession = await ensureSession();
  if (!activeSession) {
    emitStatus({ state: getSession() ? "offline" : "signed-out", message: "" });
    return local;
  }

  emitStatus({ state: "connecting", message: "" });
  try {
    await touchAccountActivity(true);
    const remote = await fetchRemoteState();
    if (!remote) {
      remoteRevision = 0;
      if (local !== undefined) await pushRemoteState(local, 0);
      else emitStatus({ state: "synced", message: "" });
      return local;
    }
    remoteRevision = Number(remote.revision);
    if (
      local !== undefined
      && meta.dirty
      && meta.userId === activeSession.user.id
    ) {
      if (Number(meta.remoteRevision) === remoteRevision) {
        await pushRemoteState(local, remoteRevision);
      } else {
        conflict = {
          local,
          remote: remote.payload,
          remoteRevision,
        };
        emitStatus({ state: "conflict", message: "Online and local data both changed." });
      }
      return local;
    }
    await markLocalSynced(remote.payload, remoteRevision, activeSession.user.id, true);
    emitStatus({ state: "synced", message: "" });
    return remote.payload;
  } catch (error) {
    emitStatus({
      state: isNetworkError(error) ? "offline" : "error",
      message: error.message,
    });
    return local;
  }
}

export async function savePrivateState(value) {
  const activeSession = await ensureSession();
  const meta = await readSyncMeta();
  const current = await readLocalState();
  if (current !== undefined && JSON.stringify(current) === JSON.stringify(value)) {
    if (activeSession && meta.dirty) queueRemoteSave(value);
    return;
  }
  await writeLocalState(value, {
    ...meta,
    dirty: true,
    remoteRevision: remoteRevision ?? meta.remoteRevision ?? null,
    userId: activeSession?.user?.id || meta.userId || null,
    locallyUpdatedAt: new Date().toISOString(),
  });
  if (activeSession) queueRemoteSave(value);
  else emitStatus({ state: (await loadConfig()) ? (getSession() ? "offline" : "signed-out") : "local" });
}

export async function deletePrivateData() {
  pendingRemoteValue = null;
  if (remoteDrain) await remoteDrain.catch(() => {});
  const hadSession = Boolean(getSession());
  const activeSession = await ensureSession();
  if (hadSession && !activeSession) {
    throw new Error("delete_data_online_required");
  }

  if (activeSession) {
    const deleted = await restRequest("rpc/request_account_deletion", {
      method: "POST",
      body: "{}",
    });
    if (deleted !== true) throw new Error("delete_data_account_not_found");
    const accessToken = activeSession.access_token;
    saveSession(null);
    authRequest("logout", null, accessToken).catch(() => {});
  }

  remoteRevision = null;
  conflict = null;
  await clearLocalState();
  emitStatus({
    state: (await loadConfig()) ? "signed-out" : "local",
    email: "",
    message: "",
  });
  return {
    accountDeleted: Boolean(activeSession),
  };
}

export async function loadPrivacyRequests() {
  const activeSession = await ensureSession();
  if (!activeSession?.user?.id) return [];
  return restRequest(
    "privacy_requests"
      + "?select=id,request_type,message,status,response_message,created_at,updated_at,resolved_at"
      + "&order=created_at.desc",
  );
}

export async function submitPrivacyRequest(requestType, message) {
  const created = await restRequest("rpc/submit_privacy_request", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      requested_type: requestType,
      requested_message: message,
    }),
  });
  return Array.isArray(created) ? created[0] : created;
}

export async function getStorageDiagnostics() {
  const local = await readLocalState();
  const meta = await readSyncMeta();
  const config = await loadConfig();
  let remote = null;
  let remoteError = "";
  if (config && getSession()) {
    try {
      remote = await fetchRemoteState();
    } catch (error) {
      remoteError = error?.message || String(error);
    }
  }
  let estimate = {};
  try {
    estimate = await navigator.storage?.estimate?.() || {};
  } catch {
    estimate = {};
  }
  return {
    configured: Boolean(config),
    email: getSession()?.user?.email || "",
    userId: getSession()?.user?.id || "",
    controllerName: config?.controllerName || "",
    privacyContact: config?.privacyContact || "",
    lawfulBasis: config?.lawfulBasis || "",
    retentionPolicy: config?.retentionPolicy || "",
    localBytes: jsonSize(local),
    localUpdatedAt: meta.locallyUpdatedAt || "",
    originBytes: Number(estimate.usage || 0),
    originQuotaBytes: Number(estimate.quota || 0),
    remoteBytes: jsonSize(remote?.payload),
    remoteRevision: remote?.revision ?? null,
    remoteUpdatedAt: remote?.updated_at || "",
    remoteError,
  };
}

export async function getPrivateStateCopy() {
  return readLocalState();
}

export async function signIn(email, password) {
  emitStatus({ state: "connecting", message: "" });
  const data = await authRequest("token?grant_type=password", { email, password });
  const nextSession = normalizeSession(data);
  if (!nextSession) throw new Error("Supabase returned an invalid session");
  saveSession(nextSession);
  emitStatus({ state: "connecting", email: nextSession.user?.email || email, message: "" });
  return nextSession;
}

export async function signUp(email, password) {
  emitStatus({ state: "connecting", message: "" });
  const redirectTo = `${location.origin}${location.pathname}`;
  const data = await authRequest(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    email,
    password,
    data: {
      privacy_accepted: true,
      health_data_consent: true,
      authority_confirmed: true,
    },
  });
  const nextSession = normalizeSession(data);
  if (nextSession) {
    saveSession(nextSession);
    emitStatus({ state: "connecting", email: nextSession.user?.email || email, message: "" });
  } else {
    emitStatus({ state: "signed-out", email, message: "confirmation_required" });
  }
  return { confirmationRequired: !nextSession };
}

export async function signOut() {
  const activeSession = getSession();
  saveSession(null);
  remoteRevision = null;
  conflict = null;
  emitStatus({ state: "signed-out", email: "", message: "" });
  if (activeSession?.access_token) {
    await authRequest("logout", null, activeSession.access_token).catch(() => {});
  }
}

export async function synchronizePrivateState() {
  const local = await readLocalState();
  if (local === undefined) return null;
  const saved = await pushRemoteState(local);
  return saved ? local : null;
}

export async function resolveSyncConflict(choice) {
  if (!conflict) return null;
  if (choice === "remote") {
    const activeSession = await ensureSession();
    if (!activeSession?.user?.id) throw new Error("Not signed in");
    const value = conflict.remote;
    await markLocalSynced(value, conflict.remoteRevision, activeSession.user.id, true);
    conflict = null;
    emitStatus({ state: "synced", message: "" });
    return value;
  }
  if (choice === "local") {
    remoteRevision = conflict.remoteRevision;
    const value = conflict.local;
    conflict = null;
    const saved = await pushRemoteState(value, remoteRevision);
    return saved ? value : null;
  }
  return null;
}

globalThis.addEventListener?.("online", () => {
  readLocalState().then((value) => {
    if (value !== undefined) queueRemoteSave(value);
  });
});

globalThis.addEventListener?.("offline", () => {
  emitStatus({ state: "offline", message: "" });
});

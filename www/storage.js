const DB_NAME = "homealacarte-private";
const DB_VERSION = 1;
const STORE = "state";
const ACTIVE_KEY = "active";
const META_KEY = "sync-meta";
const SESSION_KEY = "homealacarte-supabase-session";
const REQUEST_TIMEOUT_MS = 6000;

let configPromise;
let session = readSession();
let remoteRevision = null;
let pendingRemoteValue = null;
let remoteDrain = null;
let conflict = null;
let lastActivityTouch = 0;
let syncStatus = {
  state: "local",
  email: session?.user?.email || "",
  message: "",
};

function emitStatus(next) {
  syncStatus = {
    ...syncStatus,
    ...next,
    email: next.email ?? session?.user?.email ?? syncStatus.email ?? "",
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

async function loadConfig() {
  if (!configPromise) {
    configPromise = import("./supabase-config.js?v=homealacarte-29")
      .then(({ SUPABASE_CONFIG }) => {
        const projectUrl = String(SUPABASE_CONFIG?.projectUrl || "").replace(/\/+$/, "");
        const publishableKey = String(SUPABASE_CONFIG?.publishableKey || "");
        return projectUrl && publishableKey ? {
          projectUrl,
          publishableKey,
          controllerName: String(SUPABASE_CONFIG?.controllerName || ""),
          privacyContact: String(SUPABASE_CONFIG?.privacyContact || ""),
          lawfulBasis: String(SUPABASE_CONFIG?.lawfulBasis || ""),
          retentionPolicy: String(SUPABASE_CONFIG?.retentionPolicy || ""),
        } : null;
      })
      .catch(() => null);
  }
  return configPromise;
}

function openDatabase(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(databaseName, mode, operation) {
  const database = await openDatabase(databaseName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  } finally {
    database.close();
  }
}

async function readEntry(databaseName, key) {
  const database = await openDatabase(databaseName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function readLocalState() {
  return readEntry(DB_NAME, ACTIVE_KEY);
}

async function readSyncMeta() {
  return (await readEntry(DB_NAME, META_KEY)) || {};
}

async function writeLocalState(value, meta) {
  await withStore(DB_NAME, "readwrite", (store) => {
    store.put(value, ACTIVE_KEY);
    store.put(meta, META_KEY);
  });
}

async function reconcileSyncedLocalState(value, revision, userId, force) {
  const database = await openDatabase(DB_NAME);
  try {
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const currentRequest = store.get(ACTIVE_KEY);
      const metaRequest = store.get(META_KEY);
      let currentReady = false;
      let metaReady = false;
      const reconcile = () => {
        if (!currentReady || !metaReady) return;
        const current = currentRequest.result;
        const matches = current === undefined
          || JSON.stringify(current) === JSON.stringify(value);
        store.put(force || matches ? value : current, ACTIVE_KEY);
        store.put({
          ...(metaRequest.result || {}),
          dirty: force ? false : !matches,
          remoteRevision: revision,
          userId,
          lastSyncedAt: new Date().toISOString(),
        }, META_KEY);
      };
      currentRequest.onsuccess = () => {
        currentReady = true;
        reconcile();
      };
      metaRequest.onsuccess = () => {
        metaReady = true;
        reconcile();
      };
      currentRequest.onerror = () => reject(currentRequest.error);
      metaRequest.onerror = () => reject(metaRequest.error);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  } finally {
    database.close();
  }
}

async function clearLocalState() {
  await withStore(DB_NAME, "readwrite", (store) => {
    store.delete(ACTIVE_KEY);
    store.delete(META_KEY);
  });
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(value) {
  session = value;
  if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else localStorage.removeItem(SESSION_KEY);
}

function userFromAccessToken(accessToken) {
  try {
    const encoded = accessToken.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    return payload.sub ? { id: payload.sub, email: payload.email || "" } : null;
  } catch {
    return null;
  }
}

function normalizeSession(data) {
  if (!data?.access_token || !data?.refresh_token) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at
      || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    user: data.user || session?.user || userFromAccessToken(data.access_token),
  };
}

function captureCallbackSession() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (!hash.has("access_token")) return;
  const nextSession = normalizeSession({
    access_token: hash.get("access_token"),
    refresh_token: hash.get("refresh_token"),
    expires_in: hash.get("expires_in"),
    user: null,
  });
  if (nextSession) saveSession(nextSession);
  history.replaceState(null, "", `${location.pathname}${location.search}#family`);
}

captureCallbackSession();

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function responseData(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function authRequest(path, body, accessToken = "") {
  const config = await loadConfig();
  if (!config) throw new Error("Supabase is not configured");
  const response = await request(`${config.projectUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await responseData(response);
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || `Authentication failed (${response.status})`);
  }
  return data;
}

async function ensureSession() {
  if (!session) return null;
  if (Number(session.expires_at || 0) > Math.floor(Date.now() / 1000) + 60) return session;
  try {
    const data = await authRequest("token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
    const refreshed = normalizeSession(data);
    if (!refreshed) throw new Error("Supabase returned an invalid session");
    saveSession(refreshed);
    return refreshed;
  } catch (error) {
    if (error instanceof TypeError || error?.name === "AbortError") {
      emitStatus({ state: "offline", message: error.message });
      return null;
    }
    saveSession(null);
    emitStatus({ state: "signed-out", email: "", message: error.message });
    return null;
  }
}

async function restRequest(path, options = {}) {
  const config = await loadConfig();
  const activeSession = await ensureSession();
  if (!config || !activeSession) throw new Error("Not signed in");
  const response = await request(`${config.projectUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${activeSession.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await responseData(response);
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || `Supabase request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

async function fetchRemoteState() {
  const activeSession = await ensureSession();
  if (!activeSession?.user?.id) return null;
  const rows = await restRequest(
    `household_state?user_id=eq.${encodeURIComponent(activeSession.user.id)}&select=payload,revision,updated_at`,
  );
  return rows?.[0] || null;
}

async function touchAccountActivity(force = false) {
  if (!force && Date.now() - lastActivityTouch < 6 * 60 * 60 * 1000) return;
  await restRequest("rpc/touch_account_activity", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: "{}",
  });
  lastActivityTouch = Date.now();
}

async function insertRemoteState(value) {
  const activeSession = await ensureSession();
  const rows = await restRequest("household_state", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: activeSession.user.id,
      payload: value,
      revision: 1,
    }),
  });
  return rows?.[0] || { revision: 1 };
}

async function updateRemoteState(value, expectedRevision) {
  const activeSession = await ensureSession();
  const rows = await restRequest(
    `household_state?user_id=eq.${encodeURIComponent(activeSession.user.id)}&revision=eq.${expectedRevision}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        payload: value,
        revision: expectedRevision + 1,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!rows?.length) {
    const error = new Error("The online data changed on another device");
    error.code = "sync_conflict";
    throw error;
  }
  return rows[0];
}

function isNetworkError(error) {
  return error instanceof TypeError
    || error?.name === "AbortError"
    || /failed to fetch|load failed|network/i.test(String(error?.message || ""));
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
    emitStatus({ state: session ? "offline" : "signed-out", message: "" });
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
  else emitStatus({ state: (await loadConfig()) ? (session ? "offline" : "signed-out") : "local" });
}

export async function deletePrivateData() {
  pendingRemoteValue = null;
  if (remoteDrain) await remoteDrain.catch(() => {});
  const hadSession = Boolean(session);
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
  if (config && session) {
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
    email: session?.user?.email || "",
    userId: session?.user?.id || "",
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
  const activeSession = session;
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

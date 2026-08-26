const SESSION_KEY = "homealacarte-supabase-session";
const REQUEST_TIMEOUT_MS = 6000;
const SYNC_REQUEST_TIMEOUT_MS = 20000;

export function createRemoteClient({
  emitStatus,
  storage = localStorage,
  locationRef = location,
  historyRef = history,
  fetchFn = fetch,
  configValue,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  syncRequestTimeoutMs = SYNC_REQUEST_TIMEOUT_MS,
}) {
  let configPromise;
  let session = readSession();
  let lastActivityTouch = 0;

  async function loadConfig() {
    if (!configPromise) {
      configPromise = (configValue
        ? Promise.resolve({ SUPABASE_CONFIG: configValue })
        : import("../supabase-config.js?v=homealacarte-96"))
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

  function readSession() {
    try {
      return JSON.parse(storage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveSession(value) {
    session = value;
    if (value) storage.setItem(SESSION_KEY, JSON.stringify(value));
    else storage.removeItem(SESSION_KEY);
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
    const hash = new URLSearchParams(locationRef.hash.replace(/^#/, ""));
    if (!hash.has("access_token")) return;
    const nextSession = normalizeSession({
      access_token: hash.get("access_token"),
      refresh_token: hash.get("refresh_token"),
      expires_in: hash.get("expires_in"),
      user: null,
    });
    if (nextSession) saveSession(nextSession);
    historyRef.replaceState(null, "", `${locationRef.pathname}${locationRef.search}#family`);
  }

  captureCallbackSession();

  async function request(url, options = {}) {
    const { timeoutMs = requestTimeoutMs, ...requestOptions } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchFn(url, { ...requestOptions, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        let pathname = String(url);
        try {
          pathname = new URL(url).pathname;
        } catch {}
        const method = String(requestOptions.method || "GET").toUpperCase();
        const duration = timeoutMs >= 1000 && timeoutMs % 1000 === 0
          ? `${timeoutMs / 1000}s`
          : `${timeoutMs}ms`;
        const timeoutError = new Error(`Request timed out after ${duration}: ${method} ${pathname}`);
        timeoutError.name = "TimeoutError";
        timeoutError.cause = error;
        throw timeoutError;
      }
      throw error;
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
      if (error instanceof TypeError || error?.name === "AbortError" || error?.name === "TimeoutError") {
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

  async function deleteLegacyState() {
    const activeSession = await ensureSession();
    if (!activeSession?.user?.id) return;
    await restRequest(
      `household_state?user_id=eq.${encodeURIComponent(activeSession.user.id)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
  }

  async function fetchRemoteSnapshot() {
    return restRequest("rpc/get_household_sync_snapshot", {
      method: "POST",
      body: "{}",
      timeoutMs: syncRequestTimeoutMs,
    });
  }

  async function fetchRemoteChanges(cursor) {
    const activeSession = await ensureSession();
    if (!activeSession?.user?.id) return [];
    return restRequest(
      "household_changes"
        + `?user_id=eq.${encodeURIComponent(activeSession.user.id)}`
        + `&change_id=gt.${encodeURIComponent(Number(cursor || 0))}`
        + "&select=change_id,entity_type,entity_id,operation,position,payload,record_version"
        + "&order=change_id.asc&limit=1000",
    );
  }

  async function applyRemoteOperations(operations) {
    const rows = operations.map((operation) => ({
      operation_id: operation.operationId,
      operation: operation.operation,
      entity_type: operation.entityType,
      entity_id: operation.entityId,
      position: operation.position || 0,
      payload: operation.operation === "upsert" ? operation.payload : null,
      expected_version: Number(operation.expectedVersion || 0),
    }));
    return restRequest("rpc/apply_household_sync_operations", {
      method: "POST",
      body: JSON.stringify({ operations: rows }),
      timeoutMs: syncRequestTimeoutMs,
    });
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

  function isNetworkError(error) {
    return error instanceof TypeError
      || error?.name === "AbortError"
      || error?.name === "TimeoutError"
      || /failed to fetch|load failed|network/i.test(String(error?.message || ""));
  }

  function getSession() {
    return session;
  }

  return {
    applyRemoteOperations,
    authRequest,
    deleteLegacyState,
    ensureSession,
    fetchRemoteState,
    fetchRemoteChanges,
    fetchRemoteSnapshot,
    getSession,
    isNetworkError,
    loadConfig,
    normalizeSession,
    restRequest,
    saveSession,
    touchAccountActivity,
  };
}

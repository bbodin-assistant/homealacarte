import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRemoteClient } from "../www/storage/remote-client.js";

const values = new Map();
const client = createRemoteClient({
  emitStatus: () => {},
  storage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  },
  locationRef: { hash: "", pathname: "/", search: "" },
  historyRef: { replaceState: () => {} },
  fetchFn: async () => { throw new TypeError("offline"); },
});

assert.equal(client.getSession(), null);
assert.equal(client.isNetworkError(new TypeError("offline")), true);
assert.equal(client.isNetworkError(new Error("validation failed")), false);

const requests = [];
const authenticatedValues = new Map([["homealacarte-supabase-session", JSON.stringify({
  access_token: "header.payload.signature",
  refresh_token: "refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "user-1", email: "test@example.com" },
})]]);
const authenticated = createRemoteClient({
  emitStatus: () => {},
  configValue: { projectUrl: "https://project.example", publishableKey: "publishable" },
  storage: {
    getItem: (key) => authenticatedValues.get(key) ?? null,
    setItem: (key, value) => authenticatedValues.set(key, value),
    removeItem: (key) => authenticatedValues.delete(key),
  },
  locationRef: { hash: "", pathname: "/", search: "" },
  historyRef: { replaceState: () => {} },
  fetchFn: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ status: "applied", payload: {}, revision: 1 }) };
  },
});
await authenticated.fetchRemoteState();
await authenticated.saveRemoteState({ version: 12 }, 4);
assert.match(requests[0].url, /rest\/v1\/rpc\/get_household_state$/);
assert.match(requests[1].url, /rest\/v1\/rpc\/save_household_state$/);
assert.deepEqual(JSON.parse(requests[1].options.body), {
  new_payload: { version: 12 },
  expected_revision: 4,
});

const timeoutValues = new Map([["homealacarte-supabase-session", JSON.stringify({
  access_token: "header.payload.signature",
  refresh_token: "refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "user-timeout", email: "timeout@example.com" },
})]]);
const timeoutClient = createRemoteClient({
  emitStatus: () => {},
  configValue: { projectUrl: "https://project.example", publishableKey: "publishable" },
  syncRequestTimeoutMs: 1,
  storage: {
    getItem: (key) => timeoutValues.get(key) ?? null,
    setItem: (key, value) => timeoutValues.set(key, value),
    removeItem: (key) => timeoutValues.delete(key),
  },
  locationRef: { hash: "", pathname: "/", search: "" },
  historyRef: { replaceState: () => {} },
  fetchFn: async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }),
});
await assert.rejects(timeoutClient.fetchRemoteState(), (error) => {
  assert.equal(error.name, "TimeoutError");
  assert.match(
    error.message,
    /Request timed out after 1ms: POST \/rest\/v1\/rpc\/get_household_state/,
  );
  assert.equal(timeoutClient.isNetworkError(error), true);
  return true;
});

const coordinator = await readFile(new URL("../www/storage.js", import.meta.url), "utf8");
assert.match(coordinator, /createRemoteClient/);
assert.doesNotMatch(coordinator, /function authRequest/);
assert.doesNotMatch(coordinator, /function restRequest/);
assert.doesNotMatch(coordinator, /function ensureSession/);

console.log("Remote configuration, sessions, timeouts, authentication, and REST transport have one client owner.");

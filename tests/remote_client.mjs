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

const coordinator = await readFile(new URL("../www/storage.js", import.meta.url), "utf8");
assert.match(coordinator, /createRemoteClient/);
assert.doesNotMatch(coordinator, /function authRequest/);
assert.doesNotMatch(coordinator, /function restRequest/);
assert.doesNotMatch(coordinator, /function ensureSession/);

console.log("Remote configuration, sessions, authentication, and REST transport have one client owner.");

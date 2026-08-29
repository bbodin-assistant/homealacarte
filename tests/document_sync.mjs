import assert from "node:assert/strict";
import { createDocumentSync } from "../www/storage/document-sync.js";
import { normalizePrivateState } from "../www/storage/document-codec.js";

function state(note) {
  return {
    version: 12,
    language: "en",
    sources: [{
      path: "homealacarte_data.json",
      content: JSON.stringify({
        items: [], dishes: [], people: [], stock: [], extra_needs: [],
        menu: [{ id: "legacy", item_key: "rice", notes: note }],
      }),
    }],
  };
}

let local = state("same");
let meta = { dirty: true, remoteRevision: null, userId: "user-1" };
const emitted = [];
const localStore = {
  clearLocalState: async () => { local = undefined; meta = {}; },
  readLocalState: async () => normalizePrivateState(local),
  readSyncMeta: async () => ({ ...meta }),
  writeLocalState: async (value, patch) => {
    const changed = JSON.stringify(local) !== JSON.stringify(value);
    local = structuredClone(value);
    meta = { ...meta, ...patch, dirty: changed || meta.dirty };
    return { changed };
  },
  reconcileSyncedLocalState: async (value, revision, userId, force) => {
    const changed = JSON.stringify(local) !== JSON.stringify(value);
    if (force || !changed) local = structuredClone(value);
    meta = { ...meta, revision, remoteRevision: revision, userId, dirty: force ? false : changed };
    return { changed, dirty: meta.dirty };
  },
};
let remote = { payload: state("same"), revision: 7, updated_at: "2026-08-29T00:00:00Z" };
const remoteClient = {
  ensureSession: async () => ({ user: { id: "user-1" } }),
  fetchRemoteState: async () => structuredClone(remote),
  getSession: () => ({ user: { id: "user-1" } }),
  isNetworkError: () => false,
  loadConfig: async () => ({}),
  saveRemoteState: async (payload, expectedRevision) => {
    if (expectedRevision !== remote.revision) {
      return { status: "conflict", ...structuredClone(remote) };
    }
    remote = { payload: structuredClone(payload), revision: remote.revision + 1 };
    return { status: "applied", ...structuredClone(remote) };
  },
  touchAccountActivity: async () => {},
};
const sync = createDocumentSync({
  remoteClient,
  localStore,
  emitStatus: (status) => emitted.push(status),
  notifyRemoteChange: () => {},
});

await sync.load();
assert.equal(meta.remoteRevision, 7);
assert.equal(meta.dirty, false, "ID-only differences reconcile without a conflict");
assert.equal("id" in JSON.parse(local.sources[0].content).menu[0], false);
assert.equal(emitted.at(-1).state, "synced");

local = state("local edit");
meta = { ...meta, dirty: true, remoteRevision: 7 };
remote = { payload: state("remote edit"), revision: 8 };
await sync.synchronize();
assert.equal(emitted.at(-1).state, "conflict");
await sync.resolve("remote");
assert.equal(JSON.parse(local.sources[0].content).menu[0].notes, "remote edit");
assert.equal(meta.remoteRevision, 8);
assert.equal(meta.dirty, false);

console.log("Server-versioned document sync reconciles legacy IDs and preserves real concurrent-edit conflicts.");

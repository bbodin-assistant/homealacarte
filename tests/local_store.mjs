import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [storage, localStore] = await Promise.all([
  readFile(new URL("../www/storage.js", import.meta.url), "utf8"),
  readFile(new URL("../www/storage/local-store.js", import.meta.url), "utf8"),
]);

assert.match(storage, /from "\.\/storage\/local-store\.js/);
assert.doesNotMatch(storage, /indexedDB\.open/);
assert.doesNotMatch(storage, /function openDatabase/);
assert.match(localStore, /indexedDB\.open/);
assert.match(localStore, /export async function readLocalState/);
assert.match(localStore, /export async function writeLocalState/);
assert.match(localStore, /export async function reconcileSyncedLocalState/);
assert.match(localStore, /export async function clearLocalState/);

console.log("IndexedDB persistence is isolated from authentication and remote synchronization.");

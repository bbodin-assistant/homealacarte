import assert from "node:assert/strict";
import { buildZip } from "../www/core/downloads.js";

const archive = buildZip([
  { path: "data/items.json", content: "{}" },
  { path: "menu.json", content: "[]" },
]);
const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
assert.equal(view.getUint32(0, true), 0x04034b50);
assert.equal(view.getUint32(archive.length - 22, true), 0x06054b50);
assert.throws(() => buildZip([{ path: "../secret", content: "x" }]), /Invalid ZIP path/);

console.log("ZIP downloads remain valid and reject unsafe paths.");

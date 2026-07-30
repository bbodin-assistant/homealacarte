import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, style] = await Promise.all([
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
  readFile(new URL("../www/style.css", import.meta.url), "utf8"),
]);

assert.match(index, /class="button ghost add-extra-need-button"/);
assert.match(style, /\.add-extra-need-button\s*\{[^}]*white-space:\s*nowrap;/s);

console.log("The Add to needs action stays on one line.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../www/index.html", import.meta.url), "utf8");
const layers = [
  "tokens",
  "base",
  "layout",
  "components",
  "family",
  "menu",
  "grocery",
  "catalogue",
  "data-account",
  "dishes",
  "responsive",
];
let previous = -1;
for (const layer of layers) {
  const href = `./styles/${layer}.css`;
  const position = index.indexOf(href);
  assert.ok(position > previous, `${layer} must preserve cascade order`);
  previous = position;
  const source = await readFile(new URL(`../www/styles/${layer}.css`, import.meta.url), "utf8");
  assert.ok(source.split("\n").length <= 500, `${layer} must stay under 500 lines`);
}
assert.doesNotMatch(index, /\.\/style\.css/);

console.log("CSS layers are linked in their original cascade order and remain bounded.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const template = await readFile(new URL("../www/index.html", import.meta.url), "utf8");
const partials = [
  "family",
  "menu",
  "grocery",
  "dishes",
  "catalogue",
  "data",
  "dialogs",
];
let previous = -1;
for (const partial of partials) {
  const directive = `{{ include: views/${partial}.html }}`;
  const position = template.indexOf(directive);
  assert.ok(position > previous, `${partial} must preserve document order`);
  previous = position;
  const source = await readFile(new URL(`../www/views/${partial}.html`, import.meta.url), "utf8");
  assert.ok(source.split("\n").length <= 500, `${partial} must stay under 500 lines`);
  assert.doesNotMatch(source, /\{\{ include:/);
}
assert.equal(template.match(/\{\{ include:/g)?.length, partials.length);

console.log("HTML partials are bounded and composed in deterministic document order.");

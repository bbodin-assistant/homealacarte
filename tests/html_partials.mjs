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

const visibleVersion = template.match(/class="app-version"[^>]*>v(\d+)</)?.[1];
const appModuleVersion = template.match(/src="\.\/app\.js\?v=homealacarte-(\d+)"/)?.[1];
assert.ok(visibleVersion, "index must expose an application version");
assert.equal(
  appModuleVersion,
  visibleVersion,
  "app.js cache version must match the visible application version",
);

console.log("HTML partials are bounded, ordered, and load the current app module version.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, entry, app, feature] = await Promise.all([
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/app/feature-composition.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/dish-editor.js", import.meta.url), "utf8"),
]);

assert.match(app, /createDishEditorFeature/);
assert.match(app, /dishEditorFeature\.mount\(\)/);
assert.doesNotMatch(app, /selectAll: \$,/);
assert.doesNotMatch(app, /#new-dish-form.*addEventListener/);
assert.match(feature, /#new-dish-form.*addEventListener/);
assert.match(feature, /send\("save-dish"/);
assert.match(feature, /customIngredients/);
assert.match(feature, /setDishComponentMode/);
assert.match(feature, /#new-dish-intro"\)\.textContent = translate\(/);
assert.doesNotMatch(feature, /\bt\s*\(/);
assert.match(index, /app\.js\?v=homealacarte-79/);
assert.match(entry, /app\/feature-composition\.js\?v=homealacarte-79/);
assert.match(app, /features\/dish-editor\.js\?v=homealacarte-79/);

console.log("Dish editor owns form rendering, validation, events, save payloads, injected translation, and cache-busted loading.");

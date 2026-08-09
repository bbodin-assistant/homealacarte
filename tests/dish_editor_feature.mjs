import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, feature] = await Promise.all([
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

console.log("Dish editor owns form rendering, validation, events, and save payloads.");

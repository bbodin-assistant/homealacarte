import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, menu] = await Promise.all([
  readFile(new URL("../www/app/feature-composition.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/menu.js", import.meta.url), "utf8"),
]);

assert.match(app, /createMenuFeature/);
assert.match(app, /menuFeature\.mount\(\)/);
assert.doesNotMatch(app, /#weekly-menu.*addEventListener/);
assert.doesNotMatch(app, /#meal-replace-form.*addEventListener/);
assert.match(menu, /#weekly-menu.*addEventListener/);
assert.match(menu, /#meal-replace-form.*addEventListener/);
assert.match(menu, /mergeCompatibleMenuRows/);
assert.match(menu, /buildScheduledDishRow/);
assert.doesNotMatch(app, /selectAll: \$,/);

console.log("Manual menu rendering, scheduling, dialogs, and events have one feature owner.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, menu, view] = await Promise.all([
  readFile(new URL("../www/app/feature-composition.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/menu.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/menu.html", import.meta.url), "utf8"),
]);

assert.match(app, /createMenuFeature/);
assert.match(app, /menuFeature\.mount\(\)/);
assert.doesNotMatch(app, /#weekly-menu.*addEventListener/);
assert.doesNotMatch(app, /#meal-replace-form.*addEventListener/);
assert.match(menu, /#weekly-menu.*addEventListener/);
assert.match(menu, /#meal-replace-form.*addEventListener/);
assert.match(menu, /mergeCompatibleMenuRows/);
assert.match(menu, /buildScheduledDishRow/);
assert.match(menu, /countryFlag/);
assert.match(menu, /function itemDisplayName/);
assert.match(menu, /menuWeek\(state\.snapshot\.days, state\.menuWeekOffset\)/);
assert.match(menu, /#menu-previous-week/);
assert.match(menu, /#menu-next-week/);
assert.match(menu, /data-menu-drop-date/);
assert.match(menu, /menuNutritionByDate/);
assert.match(view, /id="menu-week-range"/);
assert.match(view, /id="menu-previous-week"/);
assert.match(view, /id="menu-next-week"/);
assert.doesNotMatch(app, /selectAll: \$,/);

console.log("Manual menu rendering, dated week navigation, scheduling, dialogs, flags, and events have one feature owner.");

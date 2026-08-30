import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, menu, navigation, view] = await Promise.all([
  readFile(new URL("../www/app/feature-composition.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/menu.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/menu/navigation.js", import.meta.url), "utf8"),
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
assert.match(menu, /menuDateWindow\(state\.snapshot\.days, state\.menuDayOffset\)/);
assert.match(menu, /\[data-menu-navigation-days\]/);
assert.match(menu, /#menu-today/);
assert.match(menu, /#menu-table-frame/);
assert.match(menu, /createMenuDragNavigation/);
assert.match(navigation, /data-menu-drag-navigation-days/);
assert.doesNotMatch(navigation, /closest\("\[data-menu-navigation-days\]"\)/);
assert.match(menu, /class="menu-entry" draggable="true"/);
assert.match(menu, /data-menu-drop-date/);
assert.match(menu, /menuNutritionByDate/);
assert.match(view, /id="menu-week-range"/);
assert.match(view, /id="menu-previous-week"/);
assert.match(view, /id="menu-previous-day"/);
assert.match(view, /id="menu-today"/);
assert.match(view, /id="menu-next-day"/);
assert.match(view, /id="menu-next-week"/);
assert.match(view, /data-menu-drag-navigation-days="-1"/);
assert.match(view, /data-menu-drag-navigation-days="1"/);
const navigationStart = view.indexOf('id="menu-date-navigation"');
const navigationEnd = view.indexOf("</div>", navigationStart);
const rangePosition = view.indexOf('id="menu-week-range"');
assert.ok(navigationStart >= 0 && navigationEnd >= 0 && rangePosition > navigationEnd);
assert.doesNotMatch(app, /selectAll: \$,/);

console.log("Manual menu rendering, dated week navigation, scheduling, dialogs, flags, and events have one feature owner.");

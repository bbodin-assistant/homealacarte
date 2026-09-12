import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  autoMenuDateWindow,
  autoMenuSettingKey,
  buildAutoMenuRequest,
  parseAutoMenuDate,
} from "../www/features/auto-menu.js";

assert.equal(autoMenuSettingKey("person", "Monday", "Lunch"), '["person","Monday","Lunch"]');
assert.equal(parseAutoMenuDate("2026-09-12")?.getDate(), 12);
assert.equal(parseAutoMenuDate("not-a-date"), null);
assert.deepEqual(
  autoMenuDateWindow(
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "2026-09-12",
  ).map(({ day, date }) => [day, date]),
  [
    ["Saturday", "2026-09-12"],
    ["Sunday", "2026-09-13"],
    ["Monday", "2026-09-14"],
    ["Tuesday", "2026-09-15"],
    ["Wednesday", "2026-09-16"],
    ["Thursday", "2026-09-17"],
    ["Friday", "2026-09-18"],
  ],
);

const request = buildAutoMenuRequest(
  {
    kcalThreshold: 150,
    minPortions: 0.5,
    maxPortions: 2,
    portionStep: 0.25,
    samePortionForEveryone: true,
  },
  [
    { person_key: "alex", day: "Tuesday", meal: "Lunch", date: "2026-08-25" },
    { person_key: "alex", day: "Tuesday", meal: "Dinner", date: "2026-08-25" },
    { person_key: "alex", day: "Wednesday", meal: "Dinner", date: "2026-08-26" },
  ],
  [{ day: "Tuesday", meal: "Dinner" }],
  ["curry"],
);

assert.deepEqual(request, {
  kcal_threshold: 150,
  min_portions: 0.5,
  max_portions: 2,
  portion_step: 0.25,
  same_portion_for_everyone: true,
  availability: [{ person_key: "alex", day: "Tuesday", meal: "Dinner", date: "2026-08-25" }],
  slots: [{ day: "Tuesday", meal: "Dinner" }],
  candidate_dish_keys: ["curry"],
});

const [feature, worker, view, styles] = await Promise.all([
  readFile(new URL("../www/features/auto-menu.js", import.meta.url), "utf8"),
  readFile(new URL("../www/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/menu.html", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/menu-generator-presence.css", import.meta.url), "utf8"),
]);
assert.match(feature, /countryFlag/);
assert.match(feature, /function dishDisplayName/);
assert.match(feature, /menuDateWindow/);
assert.match(feature, /generationRows: rows/);
assert.match(feature, /data-auto-availability-meal/);
assert.match(feature, /auto-menu-calorie-track/);
assert.match(feature, /auto-menu-proposal-grid/);
assert.match(view, /id="auto-menu-start-date"/);
assert.match(view, /data-auto-date-shift="-1"/);
assert.doesNotMatch(view, /id="auto-menu-slots"/);
assert.doesNotMatch(view, /data-i18n="slots_to_fill"/);
assert.match(styles, /\.auto-menu-presence-stack/);
assert.match(styles, /\.auto-menu-calorie-track/);
assert.match(styles, /\.auto-menu-result-summary small/);
assert.match(styles, /\.auto-menu-dish-ineligible[^}]*color:\s*#b42318/s);
assert.match(styles, /\.auto-menu-dish-ineligible[^}]*cursor:\s*help/s);
assert.match(worker, /data\.generationRows/);
assert.match(worker, /finally/);
assert.match(worker, /engine\.replace_menu\(rows\)/);

console.log("Automatic-menu feature supports start-date windows, meal-level attendance, integrated occupied-slot disabling, clear ineligible-dish tooltips, and visual proposal/calorie summaries.");

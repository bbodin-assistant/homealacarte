import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  autoMenuSettingKey,
  buildAutoMenuRequest,
} from "../www/features/auto-menu.js";

assert.equal(autoMenuSettingKey("person", "Monday"), '["person","Monday"]');

const request = buildAutoMenuRequest(
  {
    kcalThreshold: 150,
    minPortions: 0.5,
    maxPortions: 2,
    portionStep: 0.25,
    samePortionForEveryone: true,
  },
  [
    { person_key: "alex", day: "Monday", date: "2026-08-24" },
    { person_key: "alex", day: "Tuesday", date: "2026-08-25" },
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
  availability: [{ person_key: "alex", day: "Tuesday", date: "2026-08-25" }],
  slots: [{ day: "Tuesday", meal: "Dinner" }],
  candidate_dish_keys: ["curry"],
});

const [feature, worker] = await Promise.all([
  readFile(new URL("../www/features/auto-menu.js", import.meta.url), "utf8"),
  readFile(new URL("../www/worker.js", import.meta.url), "utf8"),
]);
assert.match(feature, /countryFlag/);
assert.match(feature, /function dishDisplayName/);
assert.match(feature, /menuWeek\(state\.snapshot\.days, 0\)/);
assert.match(feature, /generationRows: rows/);
assert.match(feature, /data-auto-availability-date/);
assert.match(feature, /dateMenuRowsForWeek/);
assert.match(worker, /data\.generationRows/);
assert.match(worker, /finally/);
assert.match(worker, /engine\.replace_menu\(rows\)/);

console.log("Automatic-menu feature builds day-scoped requests and limits generation to the current dated week.");

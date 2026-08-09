import assert from "node:assert/strict";
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
    { person_key: "alex", day: "Monday" },
    { person_key: "alex", day: "Tuesday" },
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
  availability: [{ person_key: "alex", day: "Tuesday" }],
  slots: [{ day: "Tuesday", meal: "Dinner" }],
  candidate_dish_keys: ["curry"],
});

console.log("Automatic-menu feature builds a day-scoped solver request.");

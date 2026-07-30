import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildScheduledDishRow } from "../www/dish-scheduling.js";

assert.deepEqual(buildScheduledDishRow({
  dishKey: "vegetable_curry",
  day: "Monday",
  meal: "Dinner",
  people: ["alex", "sam"],
  quantity: "2",
  quantityUnit: "portion",
}), {
  day: "Monday",
  meal: "Dinner",
  item_key: "vegetable_curry",
  people: ["alex", "sam"],
  quantity: 2,
  quantity_unit: "portion",
  notes: "",
});
assert.throws(() => buildScheduledDishRow({
  dishKey: "vegetable_curry",
  day: "Monday",
  meal: "Dinner",
  people: [],
  quantity: 1,
  quantityUnit: "portion",
}), /person/);
assert.throws(() => buildScheduledDishRow({
  dishKey: "vegetable_curry",
  day: "Monday",
  meal: "Dinner",
  people: ["alex"],
  quantity: 0,
  quantityUnit: "portion",
}), /positive/);

const [app, index] = await Promise.all([
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
]);
assert.match(index, /id="dish-details-schedule"/);
assert.match(index, /id="dish-details-schedule-cancel"/);
assert.match(app, /openDishScheduleEditor/);
assert.match(app, /state\.draft\.push\(scheduledRow\)/);

console.log("Dish details can build and append a validated scheduled menu row.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildScheduledDishRow } from "../www/features/menu/scheduling.js";

assert.deepEqual(buildScheduledDishRow({
  dishKey: "vegetable_curry",
  date: "2026-08-17",
  day: "Monday",
  meal: "Dinner",
  people: ["alex", "sam"],
  quantity: "2",
  quantityUnit: "portion",
  notes: "Serve warm",
}), {
  date: "2026-08-17",
  day: "Monday",
  meal: "Dinner",
  item_key: "vegetable_curry",
  people: ["alex", "sam"],
  quantity: 2,
  quantity_unit: "portion",
  notes: "Serve warm",
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

const [menu, editor, index] = await Promise.all([
  readFile(new URL("../www/features/menu.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/dish-editor.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/dialogs.html", import.meta.url), "utf8"),
]);
assert.match(index, /id="dish-details-schedule"/);
assert.match(index, /id="dish-details-schedule-cancel"/);
assert.match(index, /id="dish-menu-notes"/);
assert.match(index, /id="new-dish-notes-list"/);
assert.match(menu, /openDishScheduleEditor/);
assert.match(menu, /state\.draft\.push\(scheduledRow\)/);
assert.match(menu, /date: menuDateForDay/);
assert.match(editor, /source_notes: dishSourceNotesPayload\(\)/);
assert.match(editor, /data-component-source-quantity/);
assert.match(editor, /source_quantity: row\.querySelector\("\[data-component-source-quantity\]"\)/);

console.log("Dish details can build and append a validated dated menu row.");

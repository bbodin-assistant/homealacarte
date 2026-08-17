import assert from "node:assert/strict";
import { mergeCompatibleMenuRows } from "../www/features/menu/rows.js";
import {
  dateMenuRowsForWeek,
  menuNutritionByDate,
  menuRowsForWeek,
  menuWeek,
  migrateUndatedMenuRows,
} from "../www/features/menu/week.js";

const common = {
  date: "2026-08-17",
  day: "Monday",
  meal: "Dinner",
  item_key: "vegetable_curry",
  quantity: 1,
  quantity_unit: "portion",
  notes: "Serve warm",
};

const merged = mergeCompatibleMenuRows([
  { ...common, people: ["alex"] },
  { ...common, people: ["sam"] },
  { ...common, people: ["alex"] },
  { ...common, quantity: 2, people: ["jo"] },
  { ...common, notes: "No chilli", people: ["pat"] },
  { ...common, date: "2026-08-24", people: ["lee"] },
]);

assert.deepEqual(merged, [
  { ...common, people: ["alex", "sam"] },
  { ...common, people: ["alex"] },
  { ...common, quantity: 2, people: ["jo"] },
  { ...common, notes: "No chilli", people: ["pat"] },
  { ...common, date: "2026-08-24", people: ["lee"] },
]);

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const today = new Date(2026, 7, 16, 12);
const currentWeek = menuWeek(days, 0, today);
assert.deepEqual(currentWeek, [
  { day: "Sunday", date: "2026-08-16" },
  { day: "Monday", date: "2026-08-17" },
  { day: "Tuesday", date: "2026-08-18" },
  { day: "Wednesday", date: "2026-08-19" },
  { day: "Thursday", date: "2026-08-20" },
  { day: "Friday", date: "2026-08-21" },
  { day: "Saturday", date: "2026-08-22" },
]);
assert.equal(menuWeek(days, -1, today)[0].date, "2026-08-09");
assert.equal(menuWeek(days, 1, today)[0].date, "2026-08-23");

const migration = migrateUndatedMenuRows([
  { day: "Sunday", meal: "Dinner" },
  { day: "Monday", meal: "Lunch", date: "2026-08-10" },
], days, today);
assert.equal(migration.changed, true);
assert.equal(migration.rows[0].date, "2026-08-16");
assert.equal(migration.rows[1].date, "2026-08-10");

const scheduled = dateMenuRowsForWeek([
  { day: "Tuesday", meal: "Lunch" },
], currentWeek);
assert.equal(scheduled[0].date, "2026-08-18");
assert.deepEqual(menuRowsForWeek([
  { date: "2026-08-16", day: "Sunday" },
  { date: "2026-08-23", day: "Sunday" },
], currentWeek), [{ date: "2026-08-16", day: "Sunday" }]);

const nutrition = menuNutritionByDate({
  profile: "alex",
  ingredients: [{
    key: "bread",
    grams: 100,
    grams_per_measure_unit: 25,
    kcal: 200,
    protein_g: 10,
    carbs_g: 30,
    fat_g: 4,
    fiber_g: 3,
  }],
  dishes: [{
    key: "curry",
    per_serving: { grams: 300, kcal: 400, protein_g: 20, carbs_g: 50, fat_g: 10, fiber_g: 8 },
  }],
}, [
  { date: "2026-08-16", item_key: "bread", people: ["alex"], quantity: 50, quantity_unit: "g" },
  { date: "2026-08-16", item_key: "curry", people: ["alex"], quantity: 2, quantity_unit: "portion" },
  { date: "2026-08-16", item_key: "bread", people: ["sam"], quantity: 100, quantity_unit: "g" },
]);
assert.equal(nutrition.get("2026-08-16").kcal, 900);

console.log("Menu rows stay separated by date and week windows start on the requested day.");

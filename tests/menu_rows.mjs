import assert from "node:assert/strict";
import { mergeCompatibleMenuRows } from "../www/menu-rows.js";

const common = {
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
]);

assert.deepEqual(merged, [
  { ...common, people: ["alex", "sam"] },
  { ...common, people: ["alex"] },
  { ...common, quantity: 2, people: ["jo"] },
  { ...common, notes: "No chilli", people: ["pat"] },
]);

console.log("Compatible menu rows merge people without collapsing repeated portions.");

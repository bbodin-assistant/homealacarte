import assert from "node:assert/strict";
import {
  buildAiExtraNeedsRows,
  buildAiStockPayload,
  itemOptionsForAi,
} from "../www/features/ai-list/payload.js";

const snapshot = {
  ingredients: [
    {
      key: "rice", name: "Basmati rice", measure_unit: "bag",
      grams_per_measure_unit: 500,
    },
  ],
  household_items: [
    { key: "soap", name: "Hand soap", measure_unit: "bottle" },
  ],
  stock_options: [
    {
      item_key: "rice", name: "Basmati rice", category: "Food::Dry",
      quantity_unit: "unit", measure_unit: "bag",
      grams_per_measure_unit: 500, household: false,
    },
    {
      item_key: "soap", name: "Hand soap", category: "Home::Bathroom",
      quantity_unit: "unit", measure_unit: "bottle",
      grams_per_measure_unit: 1, household: true,
    },
  ],
  household_options: [
    {
      key: "rice", name: "Basmati rice", category: "Food::Dry",
      measure_unit: "bag", purchase_unit: "1 kg",
      purchase_quantity: 2, estimated_price: 3, custom: false,
    },
    {
      key: "soap", name: "Hand soap", category: "Home::Bathroom",
      measure_unit: "bottle", purchase_unit: "bottle",
      purchase_quantity: 1, estimated_price: 2.5, custom: false,
    },
  ],
};

const aiStockOptions = itemOptionsForAi(snapshot, "stock");
assert.equal(aiStockOptions.length, 2);
const aiNeedOptions = itemOptionsForAi(snapshot, "needs");
assert.equal(aiNeedOptions.find((item) => item.key === "soap").household, true);
assert.equal(aiNeedOptions.find((item) => item.key === "rice").grams_per_measure_unit, 500);

const stockPayload = buildAiStockPayload([
  {
    name: "Basmati rice", kind: "food", quantity: 2000, unit: "g",
    grams_quantity: 2000, source_quantity: "2 kg basmati rice", note: "",
    existing_key: "rice",
  },
  {
    name: "Hand soap", kind: "household", quantity: 3, unit: "bottle",
    grams_quantity: 0, source_quantity: "3 bottles hand soap", note: "",
    existing_key: "soap",
  },
  {
    name: "Saffron", kind: "food", quantity: 5, unit: "g",
    grams_quantity: 5, source_quantity: "5 g saffron", note: "",
    existing_key: "",
  },
  {
    name: "Batteries", kind: "household", quantity: 4, unit: "piece",
    grams_quantity: 0, source_quantity: "4 batteries", note: "AA",
    existing_key: "",
  },
], snapshot, [{
  item_key: "rice", quantity: 500, quantity_unit: "g", notes: "", household: false,
}]);

assert.equal(stockPayload.rows.find((row) => row.item_key === "rice").quantity, 2500);
assert.equal(stockPayload.rows.find((row) => row.item_key === "soap").quantity, 3);
assert.equal(stockPayload.customIngredients.length, 1);
assert.equal(stockPayload.customIngredients[0].name, "Saffron");
assert.equal(stockPayload.customIngredients[0].custom, true);
assert.equal(stockPayload.customIngredients[0].incomplete, true);
assert.equal(stockPayload.customHouseholdItems.length, 1);
assert.equal(stockPayload.customHouseholdItems[0].name, "Batteries");
assert.equal(stockPayload.customHouseholdItems[0].measure_unit, "piece");
assert.equal(stockPayload.customHouseholdItems[0].category, "Other");
assert.equal(stockPayload.rows.find((row) =>
  row.item_key === stockPayload.customHouseholdItems[0].key).quantity, 4);

const needs = buildAiExtraNeedsRows([
  {
    name: "Basmati rice", kind: "food", quantity: 1000, unit: "g",
    grams_quantity: 1000, source_quantity: "1 kg rice", note: "",
    existing_key: "rice",
  },
  {
    name: "Hand soap", kind: "household", quantity: 2, unit: "bottle",
    grams_quantity: 0, source_quantity: "2 bottles", note: "",
    existing_key: "soap",
  },
  {
    name: "Napkins", kind: "household", quantity: 3, unit: "pack",
    grams_quantity: 0, source_quantity: "3 packs napkins", note: "",
    existing_key: "",
  },
], snapshot, []);

assert.equal(needs.find((item) => item.key === "rice").quantity, 2);
assert.equal(needs.find((item) => item.key === "soap").quantity, 2);
const customNeed = needs.find((item) => item.name === "Napkins");
assert.equal(customNeed.quantity, 3);
assert.equal(customNeed.measure_unit, "pack");
assert.equal(customNeed.custom, true);

assert.throws(() => buildAiStockPayload([{
  name: "Mystery", kind: "food", quantity: 1, unit: "piece",
  grams_quantity: 0, source_quantity: "1 mystery", note: "", existing_key: "",
}], snapshot, []), (error) => error.message === "ai_unsupported_quantity");

assert.throws(() => buildAiStockPayload([{
  name: "Hand soap", kind: "household", quantity: 3, unit: "roll",
  grams_quantity: 0, source_quantity: "3 rolls hand soap", note: "", existing_key: "soap",
}], snapshot, []), (error) => error.message === "ai_unsupported_quantity");

const wrongKind = buildAiStockPayload([{
  name: "Basmati rice", kind: "household", quantity: 2, unit: "piece",
  grams_quantity: 0, source_quantity: "2 rice things", note: "", existing_key: "rice",
}], snapshot, []);
assert.equal(wrongKind.customHouseholdItems.length, 1);
assert.equal(wrongKind.rows.some((row) => row.item_key === "rice"), false);

console.log("AI stock/extra-needs payloads preserve quantities, reuse catalogue items, and create safe custom fallbacks.");

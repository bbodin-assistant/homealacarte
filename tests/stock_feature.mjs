import assert from "node:assert/strict";
import {
  addStockQuantity,
  stockPayload,
  updateStockItem,
} from "../www/features/stock.js";

const state = {
  snapshot: {
    stock_options: [
      {
        item_key: "rice",
        name: "Rice",
        category: "Food::Dry",
        quantity_unit: "g",
        measure_unit: "bag",
        grams_per_measure_unit: 500,
        household: false,
      },
      {
        item_key: "soap",
        name: "Soap",
        category: "Home",
        quantity_unit: "unit",
        measure_unit: "bottle",
        grams_per_measure_unit: 1,
        household: true,
      },
    ],
  },
  stockDraft: [],
};

assert.equal(addStockQuantity(state, "missing", 1, "g"), false);
assert.equal(addStockQuantity(state, "rice", 100, "g"), true);
assert.equal(addStockQuantity(state, "rice", 2, "unit", "Top shelf"), true);
assert.equal(state.stockDraft[0].quantity, 1100);
assert.equal(state.stockDraft[0].notes, "Top shelf");

assert.equal(updateStockItem(state.stockDraft[0], "quantity_unit", "unit"), true);
assert.equal(state.stockDraft[0].quantity, 2.2);
assert.equal(updateStockItem(state.stockDraft[0], "notes", "Opened"), false);
assert.equal(state.stockDraft[0].notes, "Opened");

assert.equal(addStockQuantity(state, "soap", 3, "g"), true);
assert.equal(state.stockDraft[1].quantity_unit, "unit");
assert.deepEqual(stockPayload(state.stockDraft), [
  {
    item_key: "rice",
    quantity: 2.2,
    quantity_unit: "unit",
    notes: "Opened",
    household: false,
  },
  {
    item_key: "soap",
    quantity: 3,
    quantity_unit: "unit",
    notes: "",
    household: true,
  },
]);

console.log("Stock feature preserves payloads and unit conversions after extraction.");

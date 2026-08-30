import assert from "node:assert/strict";
import {
  addStockQuantity,
  groupStockRowsByCategory,
  nextStockSort,
  sortStockRows,
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
assert.match(state.stockDraft[0].added_at, /^\d{4}-\d{2}-\d{2}$/);

assert.equal(updateStockItem(state.stockDraft[0], "quantity_unit", "unit"), true);
assert.equal(state.stockDraft[0].quantity, 2.2);
assert.equal(updateStockItem(state.stockDraft[0], "notes", "Opened"), false);
assert.equal(state.stockDraft[0].notes, "Opened");

assert.equal(addStockQuantity(state, "soap", 3, "g"), true);
assert.equal(state.stockDraft[1].quantity_unit, "unit");
const addedAt = state.stockDraft[0].added_at;
assert.equal(state.stockDraft[1].added_at, addedAt);
assert.deepEqual(stockPayload(state.stockDraft), [
  {
    item_key: "rice",
    quantity: 2.2,
    quantity_unit: "unit",
    notes: "Opened",
    added_at: addedAt,
    household: false,
  },
  {
    item_key: "soap",
    quantity: 3,
    quantity_unit: "unit",
    notes: "",
    added_at: addedAt,
    household: true,
  },
]);

const sortable = [
  { name: "Soap", category: "Home", quantity: 3, added_at: "2026-08-27" },
  { name: "Rice", category: "Food", quantity: 2.2, added_at: "2026-08-28" },
  { name: "Old", category: "Food", quantity: 8, added_at: "" },
];
assert.deepEqual(nextStockSort(null, "asc", "name"), { key: "name", direction: "asc" });
assert.deepEqual(nextStockSort("name", "asc", "name"), { key: "name", direction: "desc" });
assert.deepEqual(nextStockSort("name", "desc", "name"), { key: null, direction: "asc" });
assert.deepEqual(sortStockRows(sortable, { key: null }).map((row) => row.name), ["Soap", "Rice", "Old"]);
assert.deepEqual(
  groupStockRowsByCategory(sortable, { locale: "en" })
    .map((group) => [group.label, group.rows.map((row) => row.name)]),
  [
    ["Food", ["Rice", "Old"]],
    ["Home", ["Soap"]],
  ],
);
assert.deepEqual(sortStockRows(sortable, { key: "name", direction: "asc", locale: "en" }).map((row) => row.name), ["Old", "Rice", "Soap"]);
assert.deepEqual(sortStockRows(sortable, { key: "quantity", direction: "desc", locale: "en" }).map((row) => row.name), ["Old", "Soap", "Rice"]);
assert.deepEqual(sortStockRows(sortable, { key: "added_at", direction: "desc", locale: "en" }).map((row) => row.name), ["Rice", "Soap", "Old"]);

console.log("Stock feature preserves payloads and unit conversions while default grouping is by category and sorting cycles ascending, descending, then grouped default.");

import assert from "node:assert/strict";
import { dishStockAvailability, stockGramsByKey } from "../www/stock-availability.js";

const stock = [
  { item_key: "rice", quantity: 2, quantity_unit: "unit", grams_per_measure_unit: 500 },
  { item_key: "rice", quantity: 100, quantity_unit: "g", grams_per_measure_unit: 500 },
  { item_key: "sauce", quantity: 300, quantity_unit: "g", grams_per_measure_unit: 1 },
  { item_key: "soap", quantity: 4, quantity_unit: "unit", household: true },
];

assert.deepEqual([...stockGramsByKey(stock)], [["rice", 1100], ["sauce", 300]]);

const availability = dishStockAvailability({
  components: [
    { key: "rice", grams: 200 },
    { key: "sauce", grams: 100 },
  ],
}, stock);
assert.equal(availability.portions, 3);
assert.equal(availability.limitingKey, "sauce");

assert.deepEqual(
  dishStockAvailability({ components: [{ key: "missing", grams: 50 }] }, stock),
  { portions: 0, limitingKey: "missing" },
);

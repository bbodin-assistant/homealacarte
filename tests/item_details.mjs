import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  catalogItemsForGrocery,
  combinedPriceHistory,
  priceChartGeometry,
} from "../www/item-details.js";

const apple = {
  key: "apple",
  name: "Apple",
  category: "Produce::Fruit",
  measure_unit: "pieces",
  grams_per_measure_unit: 150,
  purchase_unit: "1 kg bag",
  purchase_quantity_grams: 1000,
  price_history: [
    { date: "2026-01-02", price: 2.8, description: "Estimate" },
    { date: "2026-07-25", price: 3.2, description: "Receipt" },
  ],
};
const soap = {
  key: "soap",
  name: "Soap",
  price_history: [{ date: "2026-07-25", price: 1.2, description: "Receipt" }],
};
const snapshot = { ingredients: [apple], household_items: [soap] };

assert.deepEqual(catalogItemsForGrocery(snapshot, {
  id: "food-identity",
  name: "Apple",
  category: "Produce",
  subcategory: "Fruit",
  measure_unit: "pieces",
  grams_per_measure_unit: 150,
  purchase_unit: "1 kg bag",
  purchase_quantity: 1000,
  household: false,
}), [apple]);
assert.deepEqual(catalogItemsForGrocery(snapshot, {
  id: "household-soap",
  household: true,
}), [soap]);

const history = combinedPriceHistory([apple, {
  price_history: [
    { date: "2026-07-25", price: 3.2, description: "Receipt" },
    { date: "2026-09-01", price: 3.5, description: "Later receipt" },
  ],
}]);
assert.equal(history.length, 3);
assert.equal(history[2].price, 3.5);

const chart = priceChartGeometry(history, 640, 220);
assert.equal(chart.points.length, 3);
assert.match(chart.path, /^M /);
assert.ok(chart.points.every((point) =>
  point.x >= 42 && point.x <= 622 && point.y >= 18 && point.y <= 186));

const [app, index] = await Promise.all([
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
]);
assert.match(app, /data-item-details=/);
assert.match(app, /openCatalogueItemDetails/);
assert.match(app, /priceHistoryMarkup/);
assert.match(app, /grocery-details-edit/);
assert.match(app, /price_history: priceHistoryFormPayload\("#ingredient-price-history-list"\)/);
assert.match(app, /price_history: priceHistoryFormPayload\("#household-item-price-history-list"\)/);
assert.match(index, /id="grocery-details-information"/);
assert.match(index, /id="grocery-details-edit"/);
assert.match(index, /id="ingredient-price-history-list"/);
assert.match(index, /id="household-item-price-history-list"/);

console.log("Catalog and grocery item details share matching data and price-chart geometry.");

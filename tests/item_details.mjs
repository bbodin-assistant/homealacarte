import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  catalogItemsForGrocery,
  combinedPriceHistory,
  latestPriceTrend,
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
assert.deepEqual(latestPriceTrend([apple]), {
  direction: "up",
  previous: 2.8,
  latest: 3.2,
  delta: 0.40000000000000036,
  percent: 14.285714285714299,
});
assert.equal(latestPriceTrend([soap]), null);
assert.equal(latestPriceTrend([{
  price_history: [
    { date: "2026-01-01", price: 4, description: "Earlier" },
    { date: "2026-02-01", price: 3, description: "Latest" },
  ],
}]).direction, "down");

const chart = priceChartGeometry(history, 640, 220);
assert.equal(chart.points.length, 3);
assert.match(chart.path, /^M /);
assert.ok(chart.points.every((point) =>
  point.x >= 42 && point.x <= 622 && point.y >= 18 && point.y <= 186));

const [app, itemDetailsFeature, catalogueFeature, index, stockFeature, extraNeedsFeature] = await Promise.all([
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/item-details.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/catalogue.js", import.meta.url), "utf8"),
  Promise.all([
    "grocery",
    "catalogue",
    "dialogs",
  ].map((name) => readFile(new URL(`../www/views/${name}.html`, import.meta.url), "utf8")))
    .then((parts) => parts.join("\n")),
  readFile(new URL("../www/features/stock.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/extra-needs.js", import.meta.url), "utf8"),
]);
assert.match(catalogueFeature, /data-item-details=/);
assert.match(catalogueFeature, /openDetails/);
assert.match(itemDetailsFeature, /priceHistoryMarkup/);
assert.match(itemDetailsFeature, /grocery-details-edit/);
assert.match(catalogueFeature, /price_history: priceHistoryFormPayload\("#ingredient-price-history-list"\)/);
assert.match(catalogueFeature, /price_history: priceHistoryFormPayload\("#household-item-price-history-list"\)/);
assert.match(index, /id="grocery-details-information"/);
assert.match(index, /id="grocery-details-edit"/);
assert.match(index, /id="ingredient-price-history-list"/);
assert.match(index, /id="household-item-price-history-list"/);
assert.match(index, /id="stock-add-notes"/);
assert.match(index, /id="custom-add-notes"/);
assert.match(stockFeature, /data-stock-field="notes"/);
assert.match(extraNeedsFeature, /data-custom-field="notes"/);
for (const source of [app, itemDetailsFeature, catalogueFeature, index, stockFeature, extraNeedsFeature]) {
  for (const input of source.matchAll(/<input\b[^>]*\btype="number"[^>]*>/g)) {
    assert.match(input[0], /\bstep="(?:any|\d+(?:\.\d+)?)"/);
  }
  assert.doesNotMatch(source, /<input\b[^>]*\btype="(?:date|url)"/);
}
assert.doesNotMatch(app, /Math\.round\(\(Number\(value\)/);

console.log("Catalog and grocery item details share matching data and price-chart geometry.");

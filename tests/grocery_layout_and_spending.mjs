import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSpendingAnalysis } from "../www/features/grocery-spending.js";

function observation(date, total, store) {
  return {
    date,
    price: total,
    price_basis: "purchase_unit",
    description: store,
    purchase: {
      quantity: 1,
      unit: "unit",
      total_paid: total,
      store,
      purchase_id: `${date}-${store}`,
    },
  };
}

const snapshot = {
  ingredients: [
    {
      key: "apple",
      name: "Apple",
      category: "Produce",
      price_history: [observation("2026-08-12", 10, "Market")],
    },
    {
      key: "milk",
      name: "Milk",
      category: "Dairy",
      price_history: [
        observation("2026-08-20", 5, "Market"),
        observation("2026-09-04", 3, "Corner shop"),
      ],
    },
  ],
  household_items: [{
    key: "soap",
    name: "Soap",
    category: "Home",
    purchase_unit: "bottle",
    price_history: [observation("2026-07-08", 7, "Home shop")],
  }],
};

const analysis = buildSpendingAnalysis(
  snapshot,
  new Date("2026-09-10T12:00:00Z"),
  "en",
  { category: "2026-08", store: "2026-07" },
);

assert.equal(analysis.categoryMonth, "2026-08");
assert.equal(analysis.storeMonth, "2026-07");
assert.deepEqual(analysis.availableMonths, ["2026-09", "2026-08", "2026-07"]);
assert.deepEqual(
  analysis.byCategory.map(({ key, spend, count }) => ({ key, spend, count })),
  [
    { key: "Produce", spend: 10, count: 1 },
    { key: "Dairy", spend: 5, count: 1 },
  ],
);
assert.deepEqual(
  analysis.byStore.map(({ key, spend, count }) => ({ key, spend, count })),
  [{ key: "Home shop", spend: 7, count: 1 }],
);

const [view, menuCss, groceryCss, spending] = await Promise.all([
  readFile(new URL("../www/views/grocery.html", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/menu.css", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/grocery.css", import.meta.url), "utf8"),
  readFile(new URL("../www/features/grocery-spending.js", import.meta.url), "utf8"),
]);
assert.match(view, /page-heading-with-summary/);
assert.match(view, /household-sticky-table-controls/);
assert.match(view, /id="stock-head"/);
assert.match(menuCss, /grid-template-columns: 164px minmax\(0, 1fr\)/);
assert.match(groceryCss, /\.purchase-list \{ overflow: visible; \}/);
assert.match(spending, /data-spending-month/);

console.log("Grocery and menu use compact left-side navigation, page-scrolling tables, sticky entry controls, and independent spending-month filters.");

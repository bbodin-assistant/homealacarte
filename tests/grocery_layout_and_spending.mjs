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
      category: "Produce::Fruit",
      price_history: [observation("2026-08-12", 10, "Market")],
    },
    {
      key: "milk",
      name: "Milk",
      category: "Dairy::Milk",
      price_history: [
        observation("2026-08-20", 5, "Market"),
        observation("2026-09-04", 3, "Corner shop"),
      ],
    },
  ],
  household_items: [{
    key: "soap",
    name: "Soap",
    category: "Home::Cleaning",
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
  analysis.bySubcategory.map(({ key, category, spend, count }) => ({ key, category, spend, count })),
  [
    { key: "Fruit", category: "Produce", spend: 10, count: 1 },
    { key: "Milk", category: "Dairy", spend: 5, count: 1 },
  ],
);
assert.deepEqual(
  analysis.byStore.map(({ key, spend, count }) => ({ key, spend, count })),
  [{ key: "Home shop", spend: 7, count: 1 }],
);

const [
  view,
  menuCss,
  groceryCss,
  layoutFollowup,
  spending,
  spendingCss,
  stickyGroups,
  index,
] = await Promise.all([
  readFile(new URL("../www/views/grocery.html", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/menu.css", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/grocery.css", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/grocery-layout-followup.css", import.meta.url), "utf8"),
  readFile(new URL("../www/features/grocery-spending.js", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/grocery-spending.css", import.meta.url), "utf8"),
  readFile(new URL("../www/features/grocery-sticky-groups.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
]);
assert.match(view, /page-heading-with-summary/);
assert.match(view, /household-sticky-table-controls/);
assert.match(view, /id="stock-head"/);
assert.match(menuCss, /\.grocery-subview\.active \{ display: block/);
assert.match(groceryCss, /\.purchase-list \{ overflow: visible; \}/);
assert.match(spending, /data-spending-month/);
assert.match(spending, /categoryDonut\(analysis\.byCategory, analysis\.bySubcategory/);
assert.match(spendingCss, /\.spending-double-donut/);
assert.match(layoutFollowup, /min-height: 38px/);
assert.match(layoutFollowup, /\.sidebar \.planner-mode-switch/);
assert.match(layoutFollowup, /\.nav-item\.active \+ \.planner-mode-switch/);
assert.match(layoutFollowup, /#grocery-view\.active,[\s\S]*#menu-view\.active \{\s*display: block;/);
assert.doesNotMatch(layoutFollowup, /margin-left: clamp\(-58px, -4vw, -22px\)/);
assert.match(layoutFollowup, /--stock-sticky-controls-height/);
assert.match(layoutFollowup, /--purchase-sticky-controls-height/);
assert.match(stickyGroups, /ResizeObserver/);
assert.match(stickyGroups, /purchase-sticky-controls/);
assert.match(index, /switcher\.classList\.add\("sidebar-subnav"\)/);
assert.match(index, /insertAdjacentElement\("afterend", switcher\)/);
assert.match(index, /grocery-layout-followup\.css\?v=homealacarte-119/);
assert.match(index, /grocery-sticky-groups\.js\?v=homealacarte-119/);
assert.match(index, /menu-generator-presence\.css\?v=homealacarte-119/);
assert.match(index, /app\.js\?v=homealacarte-119/);
assert.match(index, />v119<\/small>/);

console.log("Grocery and menu use nested sidebar navigation, compact heading totals, page-scrolling tables, sticky group headings, independent spending-month filters, and nested category spending data.");

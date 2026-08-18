import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  applyPurchaseToDocument,
  collectPurchaseHistory,
  parsePurchaseBatch,
  parsePurchaseDescription,
} from "../www/core/purchases.js";

const snapshot = {
  ingredients: [{
    key: "tomato",
    name: "Tomato",
    price_history: [{ date: "2026-08-01", price: 2, description: "Market check" }],
  }],
  household_items: [{
    key: "soap",
    name: "Hand soap",
    purchase_unit: "bottle",
    price_history: [],
  }],
  stock_options: [
    {
      item_key: "tomato",
      name: "Tomato",
      measure_unit: "piece",
      grams_per_measure_unit: 120,
      household: false,
    },
    {
      item_key: "soap",
      name: "Hand soap",
      measure_unit: "bottle",
      grams_per_measure_unit: 1,
      household: true,
    },
  ],
};

const document = {
  items: [
    {
      key: "tomato",
      name: "Tomato",
      grams: 100,
      kcal: 20,
      protein_g: 1,
      carbs_g: 4,
      fat_g: 0,
      fiber_g: 1,
      category: "Produce",
      source: "test",
      url: "",
      price_per_kg: 2,
      price_source: "old",
      price_checked_at: "2026-08-01",
      price_history: [{ date: "2026-08-01", price: 2, description: "Market check" }],
      measure_unit: "piece",
      grams_per_measure_unit: 120,
      purchase_unit: "500 g",
      purchase_quantity_grams: 500,
    },
    {
      key: "soap",
      name: "Hand soap",
      category: "Household",
      purchase_unit: "bottle",
      purchase_quantity: 1,
      estimated_price: 1.2,
      price_history: [],
      measure_unit: "bottle",
      last_bought_at: "",
      lasting_days: null,
      notes: "Bathroom",
      custom: false,
    },
  ],
  stock: [
    { item_key: "tomato", quantity: 1, quantity_unit: "unit", notes: "ripe" },
    { item_key: "soap", quantity: 1, quantity_unit: "unit" },
  ],
  dishes: [],
  people: [],
  menu: [],
  extra_needs: [],
};

const updated = applyPurchaseToDocument(document, {
  date: "2026-08-18",
  store: "Market",
  purchase_id: "purchase-test",
  lines: [
    {
      item_key: "tomato",
      quantity: 2,
      quantity_unit: "unit",
      display_unit: "piece",
      total_price: 3,
    },
    {
      item_key: "soap",
      quantity: 2,
      quantity_unit: "unit",
      display_unit: "bottle",
      total_price: 4.4,
    },
  ],
});

assert.notEqual(updated, document);
assert.equal(document.items[0].price_per_kg, 2, "source document must not mutate");
const tomato = updated.items.find((item) => item.key === "tomato");
assert.equal(tomato.price_per_kg, 12.5);
assert.equal(tomato.price_checked_at, "2026-08-18");
assert.equal(tomato.price_source, "Market");
assert.equal(tomato.price_history.length, 2);
assert.deepEqual(parsePurchaseDescription(tomato.price_history[1].description), {
  quantity: 2,
  unit: "piece",
  totalPrice: 3,
  store: "Market",
  purchaseId: "purchase-test-1",
});
const tomatoStock = updated.stock.find((row) => row.item_key === "tomato");
assert.equal(tomatoStock.quantity, 3);
assert.equal(tomatoStock.quantity_unit, "unit");
assert.equal(tomatoStock.notes, "ripe");

const soap = updated.items.find((item) => item.key === "soap");
assert.equal(soap.estimated_price, 2.2);
assert.equal(soap.last_bought_at, "2026-08-18");
assert.equal(soap.notes, "Bathroom");
assert.equal(updated.stock.find((row) => row.item_key === "soap").quantity, 3);

const withNewItems = applyPurchaseToDocument(updated, {
  date: "2026-08-18",
  purchase_id: "purchase-new",
  lines: [
    {
      quantity: 750,
      quantity_unit: "g",
      display_unit: "g",
      total_price: 2.25,
      new_item: { name: "Lentils", kind: "food" },
    },
    {
      quantity: 6,
      quantity_unit: "unit",
      display_unit: "roll",
      total_price: 3.6,
      new_item: { name: "Kitchen roll", kind: "household", measure_unit: "roll" },
    },
  ],
});
const lentils = withNewItems.items.find((item) => item.name === "Lentils");
assert.ok(lentils?.custom);
assert.ok(lentils?.incomplete);
assert.equal(lentils.price_per_kg, 3);
assert.equal(lentils.price_history.length, 1);
assert.equal(withNewItems.stock.find((row) => row.item_key === lentils.key).quantity, 750);
const rolls = withNewItems.items.find((item) => item.name === "Kitchen roll");
assert.equal(rolls.purchase_quantity, 6);
assert.equal(rolls.purchase_unit, "6 roll");
assert.equal(rolls.estimated_price, 3.6);
assert.equal(withNewItems.stock.find((row) => row.item_key === rolls.key).quantity, 6);

const repeatedHousehold = applyPurchaseToDocument(withNewItems, {
  date: "2026-08-19",
  store: "Market",
  purchase_id: "purchase-rolls",
  lines: [{
    item_key: rolls.key,
    quantity: 12,
    quantity_unit: "unit",
    display_unit: "roll",
    total_price: 8,
  }],
});
const repeatedRolls = repeatedHousehold.items.find((item) => item.key === rolls.key);
assert.equal(repeatedRolls.estimated_price, 4, "household price is normalized to its purchase quantity");
assert.equal(repeatedHousehold.stock.find((row) => row.item_key === rolls.key).quantity, 18);
assert.equal(repeatedRolls.price_history.length, 2);

assert.throws(
  () => applyPurchaseToDocument(document, {
    date: "2026-08-18",
    lines: [{
      quantity: 1,
      quantity_unit: "unit",
      total_price: 2,
      new_item: { name: "Unknown fruit", kind: "food" },
    }],
  }),
  /purchase_new_food_requires_grams/,
);

const batch = parsePurchaseBatch([
  "name;quantity;unit;total;kind",
  "Tomato;2;piece;3.00",
  "Hand soap | 3 | bottle | 6.30",
  "Lentils\t1.5\tkg\t4,20\tfood",
  "Sponges;2;pack;3.50;household",
].join("\n"), snapshot);
assert.equal(batch.length, 4);
assert.deepEqual(batch[0], {
  item_key: "tomato",
  quantity: 2,
  quantity_unit: "unit",
  display_unit: "piece",
  total_price: 3,
});
assert.equal(batch[1].item_key, "soap");
assert.equal(batch[2].quantity, 1500);
assert.equal(batch[2].new_item.kind, "food");
assert.equal(batch[3].new_item.kind, "household");
assert.throws(
  () => parsePurchaseBatch("Unknown;1;g;2.00", snapshot),
  /add food or household as column 5/,
);

const history = collectPurchaseHistory({
  ingredients: withNewItems.items.filter((item) => Object.hasOwn(item, "price_per_kg")),
  household_items: withNewItems.items.filter((item) => Object.hasOwn(item, "estimated_price")),
});
assert.ok(history.length >= 5);
assert.equal(history[0].date, "2026-08-18");
assert.ok(history.some((row) => row.description === "Market check"));
assert.ok(history.some((row) => row.purchase?.purchaseId === "purchase-test-1"));

const [groceryView, groceryFeature, shell, worker, app, composition, index] = await Promise.all([
  readFile(new URL("../www/views/grocery.html", import.meta.url), "utf8"),
  readFile(new URL("../www/features/grocery.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/shell.js", import.meta.url), "utf8"),
  readFile(new URL("../www/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/app/feature-composition.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
]);
assert.match(groceryView, /data-grocery-mode="purchases"/);
assert.match(groceryView, /data-grocery-panel="purchases"/);
assert.match(groceryView, /id="purchase-add-form"/);
assert.match(groceryView, /id="purchase-batch-form"/);
assert.match(shell, /\["list", "stock", "needs", "purchases"\]/);
assert.match(worker, /type === "record-purchase"/);
assert.match(worker, /core\/purchases\.js\?v=homealacarte-1/);
assert.match(groceryFeature, /core\/purchases\.js\?v=homealacarte-1/);
assert.match(composition, /features\/grocery\.js\?v=homealacarte-78/);
assert.match(composition, /features\/shell\.js\?v=homealacarte-81/);
assert.match(app, /feature-composition\.js\?v=homealacarte-85/);
assert.match(app, /worker\.js\?v=homealacarte-84/);
assert.match(index, /class="app-version"[^>]*>v87</);
assert.match(index, /app\.js\?v=homealacarte-87/);

console.log("Purchases update stock and item price history, create missing items, parse batches, and expose the new Grocery subview.");

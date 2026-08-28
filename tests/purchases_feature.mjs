import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decodePurchaseBatchPayload,
  parsePurchaseDescription,
  purchaseDescription,
  PURCHASE_DESCRIPTION_PREFIX,
} from "../www/core/purchases.js";

const purchase = {
  item_key: "milk",
  purchased_quantity: 2,
  purchased_unit: "unit",
  paid_total: 4.5,
  purchase_date: "2026-08-28",
  source: "receipt",
  add_to_stock: true,
};

const description = purchaseDescription(purchase);
assert.match(description, new RegExp(`^${PURCHASE_DESCRIPTION_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
assert.deepEqual(parsePurchaseDescription(description), purchase);
assert.equal(parsePurchaseDescription("supermarket shelf"), null);

const batch = decodePurchaseBatchPayload({
  purchases: [
    purchase,
    {
      item_key: "soap",
      purchased_quantity: 1,
      purchased_unit: "unit",
      paid_total: 2.75,
      purchase_date: "2026-08-28",
      source: "manual",
      add_to_stock: false,
    },
  ],
});
assert.equal(batch.length, 2);
assert.equal(batch[0].item_key, "milk");
assert.equal(batch[1].add_to_stock, false);

await assert.rejects(
  () => Promise.resolve().then(() => decodePurchaseBatchPayload({ purchases: [] })),
  /purchase/i,
);
await assert.rejects(
  () => Promise.resolve().then(() => decodePurchaseBatchPayload({
    purchases: [{ ...purchase, paid_total: -1 }],
  })),
  /paid/i,
);

const [
  groceryView,
  shell,
  worker,
  groceryFeature,
  app,
  composition,
  index,
  receiptFeature,
] = await Promise.all([
  readFile(new URL("../www/views/grocery.html", import.meta.url), "utf8"),
  readFile(new URL("../www/features/shell.js", import.meta.url), "utf8"),
  readFile(new URL("../www/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/grocery.js", import.meta.url), "utf8"),
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/app/feature-composition.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
  readFile(new URL("../www/features/receipt-purchases.js", import.meta.url), "utf8"),
]);
assert.match(groceryView, /data-grocery-mode="purchases"/);
assert.match(groceryView, /id="purchase-add-form"/);
assert.match(groceryView, /id="purchase-batch-form"/);
assert.match(shell, /\["list", "stock", "needs", "purchases"\]/);
assert.match(worker, /type === "record-purchase"/);
assert.match(worker, /core\/purchases\.js\?v=homealacarte-1/);
assert.match(worker, /homealacarte_web\.js\?v=homealacarte-94/);
assert.match(groceryFeature, /core\/purchases\.js\?v=homealacarte-1/);
assert.match(composition, /features\/grocery\.js\?v=homealacarte-79/);
assert.match(composition, /features\/shell\.js\?v=homealacarte-91/);
assert.match(app, /feature-composition\.js\?v=homealacarte-103/);
assert.match(app, /worker\.js\?v=homealacarte-94/);
const appVersion = index.match(/class="app-version"[^>]*>v(\d+)</)?.[1];
assert.ok(appVersion, "index.html must expose a numeric app version");
assert.match(index, new RegExp(`app\\.js\\?v=homealacarte-${appVersion}`));
assert.match(index, new RegExp(`features\\/receipt-purchases\\.js\\?v=homealacarte-${appVersion}`));
assert.match(index, new RegExp(`features\\/purchase-review-enhancements\\.js\\?v=homealacarte-${appVersion}`));
assert.match(index, /Incomplete catalogue items/);
assert.match(receiptFeature, /parseSupermarketReceipt/);
assert.match(receiptFeature, /purchase-batch-form/);

console.log("Purchase recording owns structured single/batch purchase metadata and wired purchase UI paths.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_PURCHASE_SORT,
  nextSort,
  sortableNumber,
  sortRecords,
} from "../www/features/sortable-grocery-tables.js";

assert.equal(sortableNumber("1 234,50 €"), 1234.5);
assert.equal(sortableNumber("€12.75"), 12.75);
assert.deepEqual(nextSort("name", "asc", "name"), { key: "name", direction: "desc" });
assert.deepEqual(nextSort("name", "desc", "quantity"), { key: "quantity", direction: "asc" });
assert.deepEqual(DEFAULT_PURCHASE_SORT, { key: null, direction: "asc" });

const rows = [
  { name: "Banana", quantity: 2 },
  { name: "apple", quantity: 10 },
  { name: "Carrot", quantity: 4 },
];
assert.deepEqual(sortRecords(rows, {
  key: "name",
  direction: "asc",
  locale: "en",
  valueFor: (row, key) => row[key],
  tieBreaker: (row) => row.name,
}).map((row) => row.name), ["apple", "Banana", "Carrot"]);
assert.deepEqual(sortRecords(rows, {
  key: "quantity",
  direction: "desc",
  locale: "en",
  valueFor: (row, key) => row[key],
  tieBreaker: (row) => row.name,
}).map((row) => row.quantity), [10, 4, 2]);

const [moduleSource, index, groceryView] = await Promise.all([
  readFile(new URL("../www/features/sortable-grocery-tables.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
  readFile(new URL("../www/views/grocery.html", import.meta.url), "utf8"),
]);
assert.match(moduleSource, /data-extra-needs-sort/);
assert.match(moduleSource, /data-purchase-history-sort/);
assert.match(moduleSource, /MutationObserver/);
assert.match(moduleSource, /direction === "desc" \? " ↓" : " ↑"/);
assert.match(moduleSource, /historyPanel\.insertBefore\(singleForm/);
assert.match(moduleSource, /purchase-batch-dialog/);
assert.match(moduleSource, /purchase-batch-open/);
assert.match(moduleSource, /Ajouter avec AI/);
assert.match(moduleSource, /queueMicrotask\(\(\) => \{[\s\S]*purchase-batch-error[\s\S]*dialog\.close\(\)/);
assert.match(moduleSource, /purchaseState = \{ \.\.\.DEFAULT_PURCHASE_SORT \}/);
assert.match(moduleSource, /if \(!sortState\.key\) return;/);
assert.match(moduleSource, /list\.replaceChildren\(\.\.\.sorted\)/);
assert.match(groceryView, /id="purchase-add-form"/);
assert.match(groceryView, /id="purchase-batch-form"/);
assert.match(groceryView, /purchase-history-panel/);
assert.match(index, /features\/sortable-grocery-tables\.js\?v=homealacarte-115/);

console.log("Extra needs and purchase history use stock-style sorting; purchases default to date groups, then switch to a global column sort on demand.");

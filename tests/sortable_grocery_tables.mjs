import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  nextSort,
  sortableNumber,
  sortRecords,
} from "../www/features/sortable-grocery-tables.js";

assert.equal(sortableNumber("1 234,50 €"), 1234.5);
assert.equal(sortableNumber("€12.75"), 12.75);
assert.deepEqual(nextSort("name", "asc", "name"), { key: "name", direction: "desc" });
assert.deepEqual(nextSort("name", "desc", "quantity"), { key: "quantity", direction: "asc" });

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

const [moduleSource, index] = await Promise.all([
  readFile(new URL("../www/features/sortable-grocery-tables.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
]);
assert.match(moduleSource, /data-extra-needs-sort/);
assert.match(moduleSource, /data-purchase-history-sort/);
assert.match(moduleSource, /purchase-date-group/);
assert.match(moduleSource, /MutationObserver/);
assert.match(moduleSource, /direction === "desc" \? " ↓" : " ↑"/);
assert.match(index, /features\/sortable-grocery-tables\.js\?v=homealacarte-114/);

console.log("Extra needs and purchase history expose stock-style sortable column headers.");

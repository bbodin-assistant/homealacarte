import assert from "node:assert/strict";
import { groceryProgress } from "../www/features/grocery.js";

assert.deepEqual(groceryProgress({
  estimated_full_purchase_total: 25,
  items: [
    { stock_sufficient: false, estimated_purchase_price: 10 },
    { stock_sufficient: true, estimated_purchase_price: 0 },
  ],
}), {
  checked: 1,
  fullTotal: 25,
  remaining: 1,
  remainingTotal: 10,
  total: 2,
});

console.log("Grocery summary shows the remaining and full estimated totals.");

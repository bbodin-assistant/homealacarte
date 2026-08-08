import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../www/app.js", import.meta.url), "utf8");
const progress = app.slice(
  app.indexOf("function updateGroceryProgress()"),
  app.indexOf("function renderNutriScoreAudit()"),
);

assert.match(progress, /estimated_full_purchase_total/);
assert.match(progress, /`\$\{formatMoney\(remainingTotal\)\} \/ \$\{formatMoney\(/);

console.log("Grocery summary shows the remaining and full estimated totals.");

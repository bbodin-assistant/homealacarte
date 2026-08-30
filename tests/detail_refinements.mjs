import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [feature, app, style] = await Promise.all([
  readFile(new URL("../www/features/detail-refinements.js", import.meta.url), "utf8"),
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/detail-refinements.css", import.meta.url), "utf8"),
]);

const moduleUrl = `data:text/javascript;base64,${Buffer.from(feature).toString("base64")}`;
const refinements = await import(moduleUrl);

assert.equal(refinements.scaledDishComponentQuantity({ quantity: 125 }, 3), 375);
assert.equal(refinements.scaledDishComponentQuantity({ quantity: 0.5 }, 2.5), 1.25);
assert.equal(refinements.preferredDishDetailPortions({
  dishDetailsMenuIndex: 0,
  draft: [{ item_key: "dish", quantity_unit: "portion", quantity: 3 }],
}, { key: "dish", servings: 4 }), 3);
assert.equal(refinements.preferredDishDetailPortions({
  dishDetailsMenuIndex: 0,
  draft: [{ item_key: "dish", quantity_unit: "g", quantity: 300 }],
}, { key: "dish", servings: 4 }), 4);
assert.equal(refinements.preferredDishDetailPortions({}, { key: "dish", servings: 6 }), 6);

assert.match(feature, /detail-refinements\.css\?v=homealacarte-113/);
assert.match(feature, /function renderRecipeLink\(\)/);
assert.match(feature, /recipeLink\.replaceChildren\(url, arrow\)/);
assert.match(feature, /health\.append\(allergens, status\)/);
assert.match(feature, /<details class="dish-nutri-disclosure">/);
assert.match(feature, /summary title=/);
assert.match(feature, /dish-ingredients-heading/);
assert.match(feature, /preferredDishDetailPortions\(state, dish\)/);
assert.match(feature, /data-dish-details-portions/);
assert.doesNotMatch(feature, /<small>\$\{escapeHtml\(`\$\{formatNumber\(dish\.servings\)/);
assert.match(feature, /↗/);
assert.match(feature, /MutationObserver/);
assert.match(app, /createDetailRefinements/);
assert.match(app, /detailRefinements\.mount\(\)/);
assert.match(style, /#dish-details-recipe-link/);
assert.match(style, /background: #5a382a/);
assert.match(style, /\.dish-details-health \{[\s\S]*align-items: center;/);
assert.match(style, /grid-template-columns: minmax\(0, 1fr\) auto/);
assert.match(style, /#dish-details-allergens-section h3 \{\s*display: none;/s);
assert.match(style, /\.dish-nutri-disclosure p \{\s*position: absolute/s);
assert.match(style, /\.dish-nutri-score-badge\.metric-a/);
assert.match(style, /\.dish-details-health/);
assert.match(style, /\.dish-details-content\s*\{[\s\S]*?grid-auto-rows:\s*max-content[\s\S]*?align-content:\s*start/);
assert.match(style, /\.dish-ingredients-heading/);
assert.match(style, /\.dish-portion-toolbar \{[\s\S]*border: 0;/);
assert.match(style, /\.dish-portion-control input/);
assert.match(style, /\.item-allergen-badges,[\s\S]*color: #b52f2a;/);
assert.match(style, /\.dish-stock-filter/);
assert.match(style, /\.dish-card-nutri-score/);
assert.match(style, /\.item-detail-fields/);

console.log("Dish and item detail refinements are wired, styled, and portion scaling is deterministic.");

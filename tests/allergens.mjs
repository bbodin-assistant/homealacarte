import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALLERGEN_CODES,
  allergenCodesOverlap,
  allergenIconSvg,
  allergenLabel,
} from "../www/core/allergens.js";

assert.equal(ALLERGEN_CODES.length, 26);
assert.equal(new Set(ALLERGEN_CODES).size, ALLERGEN_CODES.length);
assert.equal(allergenLabel("hazelnut", "fr"), "Noisettes");
assert.equal(allergenLabel("hazelnut", "en"), "Hazelnuts");
const allergenSvgs = ALLERGEN_CODES.map(allergenIconSvg);
assert.ok(allergenSvgs.every((svg) => svg.startsWith("<svg")));
assert.equal(new Set(allergenSvgs).size, ALLERGEN_CODES.length);
assert.ok(allergenIconSvg("sesame").includes("ellipse"));
assert.ok(allergenIconSvg("crustacean").includes("circle"));
assert.equal(allergenCodesOverlap("hazelnut", "hazelnut"), true);
assert.equal(allergenCodesOverlap("pistachio", "hazelnut"), false);

const itemDetails = readFileSync(new URL("../www/features/item-details.js", import.meta.url), "utf8");
const catalogueStyles = readFileSync(new URL("../www/styles/catalogue.css", import.meta.url), "utf8");
const dishesView = readFileSync(new URL("../www/views/dishes.html", import.meta.url), "utf8");
assert.match(itemDetails, /ingredientAllergenBadges/);
assert.doesNotMatch(itemDetails, /allergenIcon\(/);
assert.match(catalogueStyles, /\.item-detail-allergens \.allergen-icon \{ width: 16px; height: 16px;/);
assert.match(dishesView, /dish-filter-summary-icon[^]*?<svg class="allergen-icon"/);

console.log("Allergen registry provides explicit stable codes, localized labels, dedicated SVG icons, and exact matching.");

import assert from "node:assert/strict";
import {
  ALLERGEN_CODES,
  allergenCodesOverlap,
  allergenIcon,
  allergenLabel,
  isSpecificTreeNut,
} from "../www/core/allergens.js";

assert.equal(ALLERGEN_CODES.length, 27);
assert.equal(new Set(ALLERGEN_CODES).size, ALLERGEN_CODES.length);
assert.equal(allergenLabel("hazelnut", "fr"), "Noisettes");
assert.equal(allergenLabel("hazelnut", "en"), "Hazelnuts");
assert.equal(allergenIcon("hazelnut"), "🥜");
assert.equal(allergenIcon("Peanut butter"), "🥜");
assert.equal(allergenCodesOverlap("tree_nut", "hazelnut"), true);
assert.equal(allergenCodesOverlap("pistachio", "tree_nut"), true);
assert.equal(allergenCodesOverlap("pistachio", "hazelnut"), false);
assert.equal(isSpecificTreeNut("hazelnut"), true);
assert.equal(isSpecificTreeNut("tree_nut"), false);

console.log("Allergen registry provides stable codes, localized labels, icons, and overlap rules.");

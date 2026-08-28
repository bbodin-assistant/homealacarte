import assert from "node:assert/strict";
import {
  ALLERGEN_CODES,
  allergenCodesOverlap,
  allergenIcon,
  allergenIconSvg,
  allergenLabel,
} from "../www/core/allergens.js";

assert.equal(ALLERGEN_CODES.length, 26);
assert.equal(new Set(ALLERGEN_CODES).size, ALLERGEN_CODES.length);
assert.equal(ALLERGEN_CODES.includes(["tree", "nut"].join("_")), false);
assert.equal(allergenLabel("hazelnut", "fr"), "Noisettes");
assert.equal(allergenLabel("hazelnut", "en"), "Hazelnuts");
assert.equal(allergenIcon("hazelnut"), "🥜");
assert.equal(allergenIcon("Peanut butter"), "🥜");
const allergenSvgs = ALLERGEN_CODES.map(allergenIconSvg);
assert.ok(allergenSvgs.every((svg) => svg.startsWith("<svg")));
assert.equal(new Set(allergenSvgs).size, ALLERGEN_CODES.length);
assert.ok(allergenIconSvg("sesame").includes("ellipse"));
assert.ok(allergenIconSvg("crustacean").includes("circle"));
assert.equal(allergenCodesOverlap("hazelnut", "hazelnut"), true);
assert.equal(allergenCodesOverlap("pistachio", "hazelnut"), false);
assert.equal(allergenCodesOverlap(["tree", "nut"].join("_"), "hazelnut"), false);

console.log("Allergen registry provides explicit stable codes, localized labels, dedicated SVG icons, and exact matching.");

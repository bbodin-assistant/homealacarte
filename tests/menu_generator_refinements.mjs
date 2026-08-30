import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  disabledAutoMenuDishReason,
  menuGeneratorRefinementCopy,
  MENU_GENERATOR_REFINEMENT_CSS,
} from "../www/features/menu-generator-refinements.js";

assert.equal(disabledAutoMenuDishReason(false, "650 kcal · €3.20"), "");
assert.equal(disabledAutoMenuDishReason(true, "650 kcal · €3.20"), "already-scheduled");
assert.equal(disabledAutoMenuDishReason(true, "Pas un repas principal"), "not-main-meal");
assert.equal(menuGeneratorRefinementCopy("fr", "already-scheduled"), "Déjà planifié cette semaine");
assert.equal(menuGeneratorRefinementCopy("en", "not-main-meal"), "This dish is not enabled for lunch or dinner");

assert.match(MENU_GENERATOR_REFINEMENT_CSS, /@media \(min-width: 1181px\)/);
assert.match(MENU_GENERATOR_REFINEMENT_CSS, /grid-template-columns: repeat\(4, minmax\(105px, 1fr\)\) minmax\(270px, 1\.55fr\)/);
assert.match(MENU_GENERATOR_REFINEMENT_CSS, /\.auto-menu-parameters \.auto-menu-toggle \{[\s\S]*grid-column: auto;/);
assert.match(MENU_GENERATOR_REFINEMENT_CSS, /\.food-rule-item-selection \{[\s\S]*max-height: 104px;[\s\S]*overflow-y: auto;/);
assert.match(MENU_GENERATOR_REFINEMENT_CSS, /\.family-food-rule \{[\s\S]*align-items: start;/);
assert.match(MENU_GENERATOR_REFINEMENT_CSS, /\.family-food-rule \.remove-food-rule \{[\s\S]*align-self: start;/);

const [moduleSource, index] = await Promise.all([
  readFile(new URL("../www/features/menu-generator-refinements.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
]);
assert.match(moduleSource, /data-auto-dish-disabled-reason/);
assert.match(moduleSource, /MutationObserver/);
assert.match(index, /features\/menu-generator-refinements\.js\?v=homealacarte-115/);

console.log("Menu generator refinements keep desktop parameters compact and explain disabled dishes.");

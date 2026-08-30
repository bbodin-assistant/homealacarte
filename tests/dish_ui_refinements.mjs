import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  nutriScoreAuditHasProblems,
} from "../www/features/dish-ui-refinements.js";

const [feature, index] = await Promise.all([
  readFile(new URL("../www/features/dish-ui-refinements.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
]);

assert.equal(
  nutriScoreAuditHasProblems("Complétude du Nutri-Score 120/120 ingrédients prêts · 42/42 plats calculés · 0 valeurs manquantes"),
  false,
);
assert.equal(
  nutriScoreAuditHasProblems("Complétude du Nutri-Score 119/120 ingrédients prêts · 42/42 plats calculés · 1 valeurs manquantes"),
  true,
);
assert.equal(
  nutriScoreAuditHasProblems("Nutri-Score completeness 120/120 ingredients ready · 41/42 dishes calculated · 0 missing values"),
  true,
);
assert.equal(nutriScoreAuditHasProblems(""), false);
assert.equal(nutriScoreAuditHasProblems("Unexpected audit text"), true);

assert.match(feature, /background: var\(--accent\) !important/);
assert.match(feature, /background: var\(--accent-dark\) !important/);
assert.match(feature, /#dish-details-allergens-section h3/);
assert.match(feature, /display: none !important/);
assert.match(feature, /dish-nutri-disclosure\[open\]/);
assert.match(feature, /disclosure\.removeAttribute\("open"\)/);
assert.match(feature, /MutationObserver/);
assert.match(feature, /audit\.hidden = !nutriScoreAuditHasProblems/);
assert.match(index, /dish-ui-refinements\.js\?v=homealacarte-115/);

console.log("Dish details use theme colors, align health indicators, close Nutri-Score outside clicks, and hide complete audits.");

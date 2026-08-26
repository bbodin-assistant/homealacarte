import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ALLERGEN_CODES, foodRuleAcceptsItem } from "../www/features/family.js";

const [feature, index, translations, guide] = await Promise.all([
  readFile(new URL("../www/features/family.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/dialogs.html", import.meta.url), "utf8"),
  readFile(new URL("../www/translations.js", import.meta.url), "utf8"),
  readFile(new URL("../HOMEALACARTE_JSON_AGENT_GUIDE.md", import.meta.url), "utf8"),
]);

assert.match(index, /id="family-food-rule-add"/);
assert.match(index, /id="family-food-rules-list"/);
assert.match(feature, /function familyFoodRulesPayload/);
assert.match(feature, /food_rules: foodRules/);
assert.match(feature, /data-food-rule-items] input:checked/);
assert.match(feature, /data-food-rule-selected-items/);
assert.match(feature, /function filterFoodRuleItems/);
assert.match(feature, /results\.hidden = !query/);
assert.match(feature, /data-food-rule-selected-item/);
assert.match(feature, /data-food-rule-days] input:checked/);
assert.match(feature, /days: kind !== "routine"/);
assert.match(feature, /value="allergy"/);
assert.match(feature, /value="favorite"/);
assert.equal(foodRuleAcceptsItem("allergy", "ingredient"), true);
assert.equal(foodRuleAcceptsItem("allergy", "dish"), false);
assert.equal(foodRuleAcceptsItem("favorite", "dish"), true);
assert.equal(foodRuleAcceptsItem("favorite", "ingredient"), false);
assert.equal(foodRuleAcceptsItem("never", "dish"), true);
for (const allergen of ["walnut", "cashew_nut", "pistachio", "milk", "egg", "gluten"]) {
  assert.ok(ALLERGEN_CODES.includes(allergen), `missing major allergen code: ${allergen}`);
}
assert.match(translations, /food_rule_routine:/);
assert.match(translations, /food_rule_days:/);
assert.match(translations, /food_rule_never:/);
assert.match(guide, /"kind": "routine"/);
assert.match(guide, /"kind": "never"/);
assert.match(guide, /"days": \["monday"/);

console.log("Family profiles expose routine, forbidden, allergy, and favorite rule types with appropriate item scopes.");

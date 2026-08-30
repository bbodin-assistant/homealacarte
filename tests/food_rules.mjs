import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ALLERGEN_CODES, foodRuleAcceptsItem } from "../www/features/family.js";
import {
  canonicalMemberPreferenceKind,
  likedDishesCopy,
} from "../www/features/liked-dishes.js";

const [feature, dialogs, translations, likedDishes, publicIndex, loader] = await Promise.all([
  readFile(new URL("../www/features/family.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/dialogs.html", import.meta.url), "utf8"),
  readFile(new URL("../www/translations.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/liked-dishes.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/loader/menu.rs", import.meta.url), "utf8"),
]);

assert.match(dialogs, /id="family-food-rule-add"/);
assert.match(dialogs, /id="family-food-rules-list"/);
assert.match(feature, /function familyFoodRulesPayload/);
assert.match(feature, /food_rules: foodRules/);
assert.match(feature, /data-food-rule-items] input:checked/);
assert.match(feature, /data-food-rule-selected-items/);
assert.match(feature, /function filterFoodRuleItems/);
assert.match(feature, /results\.hidden = !query/);
assert.match(feature, /data-food-rule-selected-item/);
assert.match(feature, /data-food-rule-days] input:checked/);
assert.match(feature, /days: kind !== "routine"/);
assert.match(feature, /data-food-rule-period-\$\{boundary\}-month/);
assert.match(feature, /annualPeriodIsValid/);
assert.match(feature, /value="allergy"/);
assert.match(feature, /value="favorite"/);
assert.match(feature, /value="dislike"/);
assert.equal(foodRuleAcceptsItem("allergy", "ingredient"), true);
assert.equal(foodRuleAcceptsItem("allergy", "dish"), false);
assert.equal(foodRuleAcceptsItem("favorite", "dish"), true);
assert.equal(foodRuleAcceptsItem("favorite", "ingredient"), false);
assert.equal(foodRuleAcceptsItem("dislike", "ingredient"), true);
assert.equal(foodRuleAcceptsItem("never", "dish"), true);
for (const allergen of ["walnut", "cashew_nut", "pistachio", "milk", "egg", "gluten", "mollusc", "lupin"]) {
  assert.ok(ALLERGEN_CODES.includes(allergen), `missing major allergen code: ${allergen}`);
}
assert.equal(canonicalMemberPreferenceKind("like"), "favorite");
assert.equal(canonicalMemberPreferenceKind("favorite"), "favorite");
assert.equal(likedDishesCopy("en").label, "Liked dishes");
assert.equal(likedDishesCopy("fr").label, "Plats aimés");
assert.match(likedDishes, /legacyLike\?\.remove\(\)/);
assert.match(likedDishes, /select\.value = "favorite"/);
assert.match(loader, /rule\.kind == "like"[\s\S]*rule\.kind = "favorite"\.to_string\(\)/);
assert.match(publicIndex, /features\/liked-dishes\.js\?v=homealacarte-115/);
assert.match(translations, /food_rule_routine:/);
assert.match(translations, /food_rule_days:/);
assert.match(translations, /food_rule_period:/);
assert.match(translations, /food_rule_never:/);

console.log("Family profiles expose one member-facing Liked dishes concept backed by favorite behavior.");

import assert from "node:assert/strict";

import {
  mergeBundledDishClassifications,
  mergeBundledFoodRules,
} from "../www/profile-rules.js";

const description = "Keep this original description.";
const saved = [{ key: "Harry", description, food_rules: [] }, { key: "Visitor" }];
const bundled = [{
  key: "Harry",
  description: "Do not copy this description.",
  food_rules: [{
    kind: "routine",
    meal: "morning_snack",
    item_keys: ["yaourt_a_boire"],
    days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  }],
}];

const migrated = mergeBundledFoodRules(saved, bundled);
assert.equal(migrated[0].description, description);
assert.deepEqual(migrated[0].food_rules[0].days, [
  "monday", "tuesday", "wednesday", "thursday", "friday",
]);
assert.equal(migrated[1].food_rules, undefined);

const existingRule = { kind: "never", meal: "any", item_keys: ["milk"] };
const preserved = mergeBundledFoodRules(
  [{ key: "Harry", food_rules: [existingRule] }],
  bundled,
);
assert.equal(preserved[0].food_rules[0], existingRule);
assert.equal(preserved[0].food_rules.length, 2);

const modifiedExistingRule = {
  ...bundled[0].food_rules[0],
  quantity: 2,
};
const modifiedPreserved = mergeBundledFoodRules(
  [{ key: "Harry", food_rules: [modifiedExistingRule] }],
  bundled,
);
assert.deepEqual(modifiedPreserved[0].food_rules, [modifiedExistingRule]);

const sources = [{
  path: "saved.json",
  content: JSON.stringify({
    dishes: [
      { key: "plat_mochi", name: "Keep me", components: ["unchanged"] },
      { key: "main", name: "Main" },
    ],
  }),
}];
const migratedSources = mergeBundledDishClassifications(sources, [
  { key: "plat_mochi", auto_menu_main: false },
]);
const migratedDishes = JSON.parse(migratedSources[0].content).dishes;
assert.equal(migratedDishes[0].auto_menu_main, false);
assert.deepEqual(migratedDishes[0].components, ["unchanged"]);
assert.equal(migratedDishes[1].auto_menu_main, undefined);

console.log("Legacy profiles receive missing rules and dish classifications without data loss.");

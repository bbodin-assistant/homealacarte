import assert from "node:assert/strict";

import {
  mergeBundledDishClassifications,
  mergeBundledIngredientNutrition,
  mergeDuplicateIngredient,
  mergeBundledFoodRuleDependencies,
  mergeBundledFoodRules,
  mergeBundledFoodRulesInSources,
} from "../www/core/profile-rules.js";

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

const summerRule = {
  kind: "routine",
  meal: "breakfast",
  item_keys: ["summer_salad"],
  quantity: 1,
  quantity_unit: "portion",
};
const seasonalDefaults = [{
  key: "Bruno",
  food_rules: [
    { ...summerRule, period_start: "07-01", period_end: "08-31" },
    {
      ...summerRule,
      item_keys: ["autumn_salad"],
      period_start: "09-01",
      period_end: "10-31",
    },
  ],
}];
const seasonal = mergeBundledFoodRules(
  [{ key: "Bruno", food_rules: [{ ...summerRule, days: [] }] }],
  seasonalDefaults,
);
assert.equal(seasonal[0].food_rules.length, 2);
assert.equal(seasonal[0].food_rules[0].period_start, "07-01");
assert.equal(seasonal[0].food_rules[1].period_end, "10-31");

const seasonalSources = mergeBundledFoodRulesInSources([{
  path: "people.json",
  content: JSON.stringify({ people: [{ key: "Bruno", food_rules: [{ ...summerRule, days: [] }] }] }),
}], seasonalDefaults);
assert.equal(JSON.parse(seasonalSources[0].content).people[0].food_rules.length, 2);

const dependencies = mergeBundledFoodRuleDependencies(
  [{ path: "existing.json", content: JSON.stringify({ items: [{ key: "apple" }] }) }],
  seasonalDefaults,
  [{ key: "autumn_salad", components: [{ item_key: "apple" }, { item_key: "pear" }] }],
  [{ key: "apple" }, { key: "pear" }],
);
assert.equal(dependencies.length, 2);
assert.deepEqual(JSON.parse(dependencies[1].content), {
  items: [{ key: "pear" }],
  dishes: [{ key: "autumn_salad", components: [{ item_key: "apple" }, { item_key: "pear" }] }],
});

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

const duplicateSources = [{
  path: "items.json",
  content: JSON.stringify({
    items: [
      { key: "fromage_rape", name: "Fromage râpé", price_history: [{ date: "old", price: 9 }] },
      { key: "emmental_rape", name: "Emmental râpé", price_history: [{ date: "new", price: 8 }] },
    ],
    dishes: [{ components: [{ item_key: "fromage_rape" }] }],
  }),
}];
const mergedIngredientSources = mergeDuplicateIngredient(duplicateSources);
const mergedIngredientData = JSON.parse(mergedIngredientSources[0].content);
assert.deepEqual(mergedIngredientData.items.map((item) => item.key), ["emmental_rape"]);
assert.deepEqual(
  mergedIngredientData.items[0].price_history.map((entry) => entry.date),
  ["old", "new"],
);
assert.equal(mergedIngredientData.dishes[0].components[0].item_key, "emmental_rape");
const promotedIngredientData = JSON.parse(mergeDuplicateIngredient([{
  path: "legacy.json",
  content: JSON.stringify({ items: [{ key: "fromage_rape", name: "Fromage râpé" }] }),
}])[0].content);
assert.deepEqual(
  promotedIngredientData.items.map((item) => [item.key, item.name]),
  [["emmental_rape", "Emmental râpé"]],
);

const nutritionSources = [{
  path: "nutrition.json",
  content: JSON.stringify({
    items: [
      { key: "spice", sugars_g: null, salt_g: 0.2 },
      { key: "custom", sugars_g: 4.5 },
    ],
  }),
}];
const migratedNutrition = JSON.parse(mergeBundledIngredientNutrition(
  nutritionSources,
  [
    { key: "spice", sugars_g: 1.2, salt_g: 0.8, saturated_fat_g: 0.1 },
    { key: "custom", sugars_g: 9.9 },
  ],
)[0].content).items;
assert.deepEqual(migratedNutrition[0], {
  key: "spice", sugars_g: 1.2, salt_g: 0.2, saturated_fat_g: 0.1,
});
assert.equal(migratedNutrition[1].sugars_g, 4.5);

console.log("Legacy profiles receive missing rules and dish classifications without data loss.");

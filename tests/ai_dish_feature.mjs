import assert from "node:assert/strict";
import { buildDishSavePayload, uniqueAiKey } from "../www/features/ai-dish.js";

const snapshot = {
  item_options: [
    { kind: "ingredient", key: "rice", name: "Basmati rice", measure_unit: "g" },
    { kind: "ingredient", key: "egg", name: "Egg", measure_unit: "piece" },
    { kind: "dish", key: "dish_fried_rice", name: "Old fried rice", measure_unit: "portion" },
  ],
};

assert.equal(uniqueAiKey("dish", "Fried rice", new Set(["dish_fried_rice"])), "dish_fried_rice_2");

const payload = buildDishSavePayload({
  name: "Fried rice",
  servings: 4,
  recipe_url: "https://example.com/rice",
  source: "Copied recipe",
  source_notes: ["Cook quickly"],
  auto_menu_main: true,
  ingredients: [
    { name: "Basmati rice", existing_key: "rice", quantity: 300, unit: "g", source_quantity: "300 g rice" },
    { name: "Egg", existing_key: "egg", quantity: 2, unit: "pieces", source_quantity: "2 eggs" },
    { name: "Saffron", existing_key: "", quantity: 1, unit: "g", source_quantity: "a pinch saffron" },
  ],
}, snapshot);

assert.equal(payload.dish.key, "dish_fried_rice_2");
assert.equal(payload.dish.components.length, 3);
assert.equal(payload.dish.components[1].quantity_unit, "piece");
assert.equal(payload.customIngredients.length, 1);
assert.equal(payload.customIngredients[0].name, "Saffron");
assert.equal(payload.customIngredients[0].custom, true);
assert.equal(payload.customIngredients[0].incomplete, true);
assert.equal(payload.customIngredients[0].measure_unit, "g");
assert.equal(payload.customIngredients[0].kcal, 0);
assert.equal(payload.replacing, false);

const reused = buildDishSavePayload({
  name: "Rice bowl",
  servings: 1,
  recipe_url: "",
  source: "",
  source_notes: [],
  auto_menu_main: true,
  ingredients: [
    { name: "basmati rice", existing_key: "", quantity: 100, unit: "g", source_quantity: "100 g" },
  ],
}, snapshot);
assert.equal(reused.customIngredients.length, 0);
assert.equal(reused.dish.components[0].item_key, "rice");

assert.throws(() => buildDishSavePayload({
  name: "Bad",
  servings: 1,
  ingredients: [{ name: "Rice", existing_key: "not_a_key", quantity: 1, unit: "g", source_quantity: "" }],
}, snapshot), (error) => error.message === "ai_unknown_ingredient");

assert.throws(() => buildDishSavePayload({
  name: "Bad",
  servings: 1,
  ingredients: [{ name: "Mystery onion", existing_key: "", quantity: 1, unit: "piece", source_quantity: "1 onion" }],
}, snapshot), (error) => error.message === "ai_unsupported_unit");

console.log("AI dish payload reuses catalogue items and creates only safe incomplete gram-based ingredients.");

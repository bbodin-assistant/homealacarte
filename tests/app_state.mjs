import assert from "node:assert/strict";
import { createAppState } from "../www/core/app-state.js";

const values = new Map([
  ["homealacarte-language", "en"],
  ["homealacarte-item-catalogue-tab", "other"],
  ["homealacarte-grocery-hide-stocked", "true"],
  ["homealacarte-auto-menu-options", JSON.stringify({ kcalThreshold: 200, samePortionForEveryone: true })],
]);
const state = createAppState({ getItem: (key) => values.get(key) ?? null }, () => ({ state: "local" }));
assert.equal(state.language, "en");
assert.equal(state.itemCatalogueTab, "other");
assert.equal(state.groceryHideStocked, true);
assert.equal(state.autoMenuOptions.kcalThreshold, 200);
assert.equal(state.autoMenuOptions.samePortionForEveryone, true);
assert.deepEqual(state.storageStatus, { state: "local" });

console.log("Application state initialization preserves stored preferences and defaults.");

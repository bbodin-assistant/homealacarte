import assert from "node:assert/strict";
import { createAppState } from "../www/core/app-state.js";

const values = new Map([
  ["homealacarte-language", "es"],
  ["homealacarte-item-catalogue-tab", "other"],
  ["homealacarte-grocery-hide-stocked", "true"],
  ["homealacarte-auto-menu-options", JSON.stringify({ kcalThreshold: 200, samePortionForEveryone: true })],
]);
const storage = { getItem: (key) => values.get(key) ?? null };
const state = createAppState(storage, () => ({ state: "local" }), "de");
assert.equal(state.language, "es");
assert.equal(state.itemCatalogueTab, "other");
assert.equal(state.groceryHideStocked, true);
assert.equal(state.autoMenuOptions.kcalThreshold, 200);
assert.equal(state.autoMenuOptions.samePortionForEveryone, true);
assert.deepEqual(state.storageStatus, { state: "local" });

values.delete("homealacarte-language");
const defaulted = createAppState(storage, () => ({ state: "local" }), "de");
assert.equal(defaulted.language, "de");

console.log("Application state initialization preserves stored preferences and caller-provided locale defaults.");

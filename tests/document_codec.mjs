import assert from "node:assert/strict";
import { normalizePrivateState, sameJsonValue } from "../www/storage/document-codec.js";

const document = {
  items: [{ key: "rice", name: "Rice" }],
  dishes: [],
  people: [{ key: "alex", name: "Alex", kind: "adult" }],
  menu: [{
    date: "2026-08-31",
    day: "monday",
    meal: "dinner",
    item_key: "rice",
    people: ["alex"],
    quantity: 1,
    quantity_unit: "g",
    notes: "",
  }],
  stock: [],
  extra_needs: [],
};
const normalized = normalizePrivateState({
  version: 12,
  sources: [{ path: "house.json", content: JSON.stringify(document) }],
});
const normalizedDocument = JSON.parse(normalized.sources[0].content);
assert.deepEqual(normalizedDocument, document);
assert.notEqual(normalized.sources[0], document, "normalization must not mutate its caller");
assert.equal(sameJsonValue({ key: "rice", name: "Rice" }, { name: "Rice", key: "rice" }), true);

console.log("Private household documents normalize without legacy shape conversion.");

const migrated = normalizePrivateState({
  version: 13,
  sources: [{
    path: "legacy-items.json",
    content: JSON.stringify({
      items: [{
        key: "oil",
        kcal: 900,
        measure_unit: "ml",
        grams_per_measure_unit: 0.92,
        purchase_quantity_grams: 920,
        price_per_kg: 10,
        price_history: [{ date: "2026-01-01", price: 9, description: "Old value" }],
      }],
    }),
  }],
});
const migratedItem = JSON.parse(migrated.sources[0].content).items[0];
assert.equal(migratedItem.price, 10);
assert.equal(migratedItem.price_basis, "kg");
assert.equal(migratedItem.purchase_quantity, 1000);
assert.equal(migratedItem.purchase_quantity_unit, "ml");
assert.equal(migratedItem.price_history[0].price_basis, "kg");
assert.equal(Object.hasOwn(migratedItem, "price_per_kg"), false);
assert.equal(Object.hasOwn(migratedItem, "purchase_quantity_grams"), false);

console.log("Legacy purchase pricing migrates when private household data is read.");

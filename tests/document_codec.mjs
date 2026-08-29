import assert from "node:assert/strict";
import { normalizePrivateState, sameJsonValue } from "../www/storage/document-codec.js";
import { legacyRowsToPrivateState } from "../www/storage/row-migration.js";

const document = {
  items: [{ key: "rice", name: "Rice" }],
  dishes: [],
  people: [{ key: "alex", name: "Alex" }],
  menu: [{
    id: "obsolete-menu-id",
    date: "2026-08-29",
    day: "saturday",
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
  menu: [{ id: "legacy-copy", item_key: "rice" }],
  document,
  sources: [{ path: "house.json", content: JSON.stringify(document) }],
});
assert.equal("id" in normalized.menu[0], false);
assert.equal("id" in normalized.document.menu[0], false);
assert.equal("id" in JSON.parse(normalized.sources[0].content).menu[0], false);
assert.equal("id" in document.menu[0], true, "normalization must not mutate its caller");
assert.equal(sameJsonValue({ key: "rice", name: "Rice" }, { name: "Rice", key: "rice" }), true);

const migrated = legacyRowsToPrivateState([
  { entityType: "app", entityId: "settings", payload: { version: 12, language: "en" } },
  { entityType: "menu", entityId: "old-id", position: 1, payload: document.menu[0] },
  { entityType: "people", entityId: "alex", position: 0, payload: document.people[0] },
  { entityType: "items", entityId: "rice", position: 8, payload: document.items[0] },
]);
const migratedDocument = JSON.parse(migrated.sources[0].content);
assert.equal(migrated.version, 12);
assert.equal(migrated.language, "en");
assert.equal("id" in migratedDocument.menu[0], false);
assert.equal(migratedDocument.items[0].key, "rice");

console.log("Private household documents and legacy row replicas normalize without menu IDs.");

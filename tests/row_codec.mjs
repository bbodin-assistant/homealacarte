import assert from "node:assert/strict";
import {
  privateStateToRecords,
  recordsToPrivateState,
  sameJsonValue,
  sameRecordContent,
} from "../www/storage/row-codec.js";

const document = {
  items: [{ key: "rice", name: "Rice" }],
  dishes: [{ key: "curry", name: "Curry", components: [] }],
  people: [{ key: "alex", name: "Alex" }],
  menu: [{
    id: "menu_stable",
    day: "Monday",
    meal: "Dinner",
    item_key: "curry",
    people: ["alex"],
    quantity: 1,
    quantity_unit: "portion",
    notes: "",
  }],
  stock: [{ item_key: "rice", quantity: 500, quantity_unit: "g" }],
  extra_needs: [],
};
const state = {
  version: 10,
  language: "en",
  sources: [{ path: "house.json", content: JSON.stringify(document) }],
  people: null,
  menu: null,
  stock: null,
  customGrocery: null,
};

const records = privateStateToRecords(state);
assert.equal(records.length, 6);
assert.equal(records.find((row) => row.entityType === "menu").entityId, "menu_stable");
assert.equal(records.find((row) => row.entityType === "stock").entityId, "rice");
assert.equal(records.find((row) => row.entityType === "items").position, 0);
assert.equal(records.find((row) => row.entityType === "dishes").position, 0);
assert.equal(records.find((row) => row.entityType === "people").position, 0);
assert.equal(sameJsonValue({ key: "rice", name: "Rice" }, { name: "Rice", key: "rice" }), true);
assert.equal(sameRecordContent(
  { entityType: "items", position: 8, payload: { key: "rice", name: "Rice" } },
  { entityType: "items", position: 0, payload: { name: "Rice", key: "rice" } },
), true, "unordered records ignore array position and JSON object key order");
assert.equal(sameRecordContent(
  { entityType: "menu", position: 1, payload: { id: "menu_stable" } },
  { entityType: "menu", position: 0, payload: { id: "menu_stable" } },
), false, "menu order remains synchronized");

const restored = recordsToPrivateState(records);
assert.equal(restored.version, 10);
assert.equal(restored.language, "en");
assert.deepEqual(JSON.parse(restored.sources[0].content), document);

const withoutId = structuredClone(state);
const parsed = JSON.parse(withoutId.sources[0].content);
delete parsed.menu[0].id;
withoutId.sources[0].content = JSON.stringify(parsed);
const generated = privateStateToRecords(withoutId).find((row) => row.entityType === "menu");
assert.match(generated.entityId, /^menu_[a-f0-9]+_0$/);
assert.equal(generated.payload.id, generated.entityId);

console.log("Private JSON documents round-trip through stable relational synchronization rows.");

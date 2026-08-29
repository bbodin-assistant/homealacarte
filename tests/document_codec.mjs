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

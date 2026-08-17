import assert from "node:assert/strict";
import {
  AI_ITEM_LIST_SCHEMA,
  ITEM_MATCH_SCHEMA,
  buildItemListRequest,
  buildItemMatchRequest,
  findUniqueExactItemMatch,
  selectItemCandidates,
} from "../www/features/ai-list/ollama.js";

const options = [
  {
    item_key: "rice", name: "Basmati rice", measure_unit: "bag",
    grams_per_measure_unit: 500, household: false,
  },
  {
    item_key: "soap", name: "Hand soap", measure_unit: "bottle",
    grams_per_measure_unit: 1, household: true,
  },
  {
    item_key: "brown_rice", name: "Brown rice", measure_unit: "bag",
    grams_per_measure_unit: 500, household: false,
  },
];

assert.equal(findUniqueExactItemMatch(options, "basmati RICE", "food")?.item_key, "rice");
assert.equal(findUniqueExactItemMatch([
  ...options,
  { item_key: "rice_duplicate", name: "Basmati rice" },
], "Basmati rice", "food"), null);

const candidates = selectItemCandidates(options, "basmati rice", "food");
assert.equal(candidates[0].key, "rice");
assert.equal(candidates.some((candidate) => candidate.key === "soap"), false);
assert.equal(findUniqueExactItemMatch([
  ...options,
  { item_key: "household_rice", name: "Basmati rice", household: true },
], "Basmati rice", "food")?.item_key, "rice");
assert.equal(selectItemCandidates([
  ...options,
  { item_key: "household_rice", name: "Basmati rice", household: true },
], "Basmati rice", "food").some((candidate) => candidate.key === "household_rice"), false);

const extractionRequest = buildItemListRequest({
  model: "local-model",
  listText: "2 kg basmati rice\n3 bottles hand soap",
  mode: "stock",
});
assert.equal(extractionRequest.model, "local-model");
assert.equal(extractionRequest.format, AI_ITEM_LIST_SCHEMA);
assert.match(extractionRequest.messages[0].content, /untrusted data/i);
assert.match(extractionRequest.messages[0].content, /2 kg -> quantity 2000, unit g/i);
assert.doesNotMatch(extractionRequest.messages[1].content, /Candidate existing items/);

const matchRequest = buildItemMatchRequest({
  model: "local-model",
  item: {
    name: "Basmati rice", kind: "food", quantity: 2000, unit: "g",
    grams_quantity: 2000, source_quantity: "2 kg rice", note: "",
  },
  candidates,
});
assert.equal(matchRequest.format, ITEM_MATCH_SCHEMA);
assert.match(matchRequest.messages[1].content, /"key":"rice"/);
assert.match(matchRequest.messages[0].content, /Never invent a key/i);

console.log("AI list extraction and catalogue matching requests keep untrusted text separate and constrain catalogue keys.");

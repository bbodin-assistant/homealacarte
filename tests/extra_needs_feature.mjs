import assert from "node:assert/strict";
import {
  buildExtraNeed,
  extraNeedsPayload,
} from "../www/features/extra-needs.js";

const catalogueItem = buildExtraNeed({
  option: { key: "soap", purchase_unit: "bottle", purchase_quantity: 2 },
  name: "Soap",
  category: "Home::Bathroom",
  quantity: "3",
  measureUnit: "bottle",
  estimatedPrice: "5.5",
  notes: "Sensitive",
  suffix: "unused",
});
assert.deepEqual(catalogueItem, {
  key: "soap",
  name: "Soap",
  category: "Home::Bathroom",
  quantity: 3,
  measure_unit: "bottle",
  purchase_unit: "bottle",
  purchase_quantity: 2,
  estimated_price: 5.5,
  notes: "Sensitive",
  custom: false,
});

const customItem = buildExtraNeed({
  name: "Batteries",
  category: "Home::Other",
  quantity: 4,
  measureUnit: "units",
  estimatedPrice: 3,
  notes: "",
  suffix: "1234-5678.9",
});
assert.equal(customItem.key, "custom_1234_5678_9");
assert.equal(customItem.custom, true);
assert.equal(buildExtraNeed({ name: "", quantity: 1, estimatedPrice: 1 }), null);

assert.deepEqual(extraNeedsPayload([customItem], (value) => value.replace("::", "/")), [{
  key: "custom_1234_5678_9",
  name: "Batteries",
  category: "Home/Other",
  quantity: 4,
  measure_unit: "units",
  purchase_unit: "units",
  purchase_quantity: 1,
  estimated_price: 3,
  notes: "",
  custom: true,
}]);

console.log("Extra-needs feature preserves catalogue and custom-item payloads.");

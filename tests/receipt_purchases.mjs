import assert from "node:assert/strict";
import {
  looksLikeStructuredPurchase,
  parseSupermarketReceipt,
} from "../www/features/receipt-purchases.js";
import { resolvePurchaseReviewWeight } from "../www/features/purchase-review-enhancements.js";

const receipt = `CHIPS
CHIPS EXT.CRAQ.NATURE U 6X30G 1,60 € 11
1 x 1,60 EUR
FRUITS
POMME GOLDEN DELICIOUS 1,48 € 11
Pesée manuelle
0,530 kg x 2,79 €/kg
FROMAGE LS
APERIC.PAN.CAMPAGNE 22,5% 125G 4,80 € 11
2 x 2,40 EUR
POISSON FRAIS PREEMBALLE
FILET SAUMON FJORDS U 6,61 € 11
Pesée manuelle
0,288 kg x 22,95 €/kg
FILET SAUMON FJORDS U 7,25 € 11
Pesée manuelle
0,316 kg x 22,95 €/kg
BOISSONS SANS ALCOOL
PEPSI MAX PET 5X1,5L+1 OFFERT 6,00 € 11
1 x 6,00 EUR
EAUX
EAU SRCE GAZ.CRISTALINE 6X1,5L 5,76 € 11
3 x 1,92 EUR
ENTRETIEN DE LA MAISON
CREME CITRON CIF 750ML 2,89 € 13
1 x 2,89 EUR`;

const rows = parseSupermarketReceipt(receipt, [
  { value: "apple", name: "Pomme Golden" },
  { value: "salmon", name: "Filet de saumon" },
]);

assert.equal(rows.length, 7);

const chips = rows.find((row) => row.label.startsWith("CHIPS EXT"));
assert.equal(chips.quantity, 180);
assert.equal(chips.unit, "g");
assert.equal(chips.totalPrice, 1.6);
assert.equal(chips.weightNeeded, false);

const apple = rows.find((row) => row.label.startsWith("POMME"));
assert.equal(apple.quantity, 530);
assert.equal(apple.unit, "g");
assert.equal(apple.suggested.value, "apple");

const aperic = rows.find((row) => row.label.startsWith("APERIC"));
assert.equal(aperic.quantity, 250);
assert.equal(aperic.totalPrice, 4.8);

const salmon = rows.find((row) => row.label.startsWith("FILET SAUMON"));
assert.equal(salmon.quantity, 604);
assert.equal(salmon.totalPrice, 13.86);
assert.equal(salmon.suggested.value, "salmon");
assert.equal(salmon.sourceLines.length, 6);

const pepsi = rows.find((row) => row.label.startsWith("PEPSI"));
assert.equal(pepsi.quantity, 9000);
assert.equal(pepsi.unit, "g");
assert.equal(pepsi.weightNeeded, false);

const water = rows.find((row) => row.label.startsWith("EAU SRCE"));
assert.equal(water.quantity, 27000);
assert.equal(water.unit, "g");

const cleaner = rows.find((row) => row.label.startsWith("CREME CITRON"));
assert.equal(cleaner.kind, "household");
assert.equal(cleaner.quantity, 1);
assert.equal(cleaner.unit, "unit");
assert.equal(cleaner.weightNeeded, false);

assert.deepEqual(
  resolvePurchaseReviewWeight({ matched: false, kind: "food", quantity: 2, unit: "piece" }),
  { required: true, valid: false, grams: 0 },
);
assert.deepEqual(
  resolvePurchaseReviewWeight({ matched: false, kind: "food", quantity: 2, unit: "piece", weight: 340 }),
  { required: true, valid: true, grams: 340 },
);
assert.deepEqual(
  resolvePurchaseReviewWeight({ matched: false, kind: "food", quantity: 0.53, unit: "kg" }),
  { required: true, valid: true, grams: 530 },
);
assert.deepEqual(
  resolvePurchaseReviewWeight({ matched: true, kind: "food", quantity: 2, unit: "piece" }),
  { required: false, valid: true, grams: 0 },
);

assert.equal(looksLikeStructuredPurchase("Tomato;2;g;3.00"), true);
assert.equal(looksLikeStructuredPurchase(receipt), false);
assert.throws(() => parseSupermarketReceipt("FRUITS\nNOT A PRODUCT", []), /No receipt product lines/);

console.log("Raw supermarket receipts parse sections and make unresolved new-food weights explicitly resolvable in review.");

import { applyPurchaseToDocument as applyBasePurchase } from "./purchases.js?v=homealacarte-1";

function stockItemKey(row) {
  return String(row?.item_key || row?.key || "").trim();
}

function foodItem(item) {
  return Object.hasOwn(item || {}, "price_per_kg");
}

function positiveConversion(item) {
  const value = Number(item?.grams_per_measure_unit || 0);
  return Number.isFinite(value) && value > 0;
}

function patchUnneededGramConversions(document, purchase) {
  const lines = Array.isArray(purchase?.lines) ? purchase.lines : [];
  const unitPurchaseKeys = new Set(lines
    .filter((line) => line?.item_key && line.quantity_unit === "unit")
    .map((line) => String(line.item_key)));
  const gramPurchaseKeys = new Set(lines
    .filter((line) => line?.item_key && line.quantity_unit === "g")
    .map((line) => String(line.item_key)));
  const patched = new Set();

  for (const key of gramPurchaseKeys) {
    if (unitPurchaseKeys.has(key)) continue;
    const item = (document.items || []).find((candidate) => candidate.key === key);
    if (!foodItem(item) || positiveConversion(item)) continue;
    const stock = (document.stock || []).find((row) => stockItemKey(row) === key);
    if (stock?.quantity_unit === "unit") continue;

    // The core purchase function historically required grams-per-unit even for
    // an already gram-denominated purchase and gram-denominated stock. No
    // conversion is needed in that case; use a temporary neutral conversion
    // only while applying the purchase, then restore the catalogue value.
    item.grams_per_measure_unit = 1;
    patched.add(key);
  }
  return patched;
}

export function applyPurchaseToDocument(sourceDocument, rawPurchase) {
  const working = structuredClone(sourceDocument || {});
  const patched = patchUnneededGramConversions(working, rawPurchase);
  const updated = applyBasePurchase(working, rawPurchase);

  for (const key of patched) {
    const sourceItem = (sourceDocument?.items || []).find((item) => item.key === key);
    const updatedItem = (updated.items || []).find((item) => item.key === key);
    if (!sourceItem || !updatedItem) continue;
    if (Object.hasOwn(sourceItem, "grams_per_measure_unit")) {
      updatedItem.grams_per_measure_unit = sourceItem.grams_per_measure_unit;
    } else {
      delete updatedItem.grams_per_measure_unit;
    }
  }
  return updated;
}

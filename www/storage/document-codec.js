function clone(value) {
  return value == null ? value : structuredClone(value);
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalJsonValue(value[key])]),
  );
}

function migratePurchasePricing(document) {
  if (!document || typeof document !== "object" || !Array.isArray(document.items)) return document;
  document.items.forEach((item) => {
    const legacyFood = Object.hasOwn(item, "price_per_kg");
    const food = legacyFood || Object.hasOwn(item, "kcal");
    if (legacyFood) {
      item.price = item.price_per_kg;
      item.price_basis = "kg";
      delete item.price_per_kg;
      const legacyGrams = Number(item.purchase_quantity_grams);
      const gramsPerMeasure = Number(item.grams_per_measure_unit);
      const measureUnit = String(item.measure_unit || "g");
      const volumeMeasure = ["ml", "cl", "l"].includes(measureUnit.trim().toLowerCase());
      item.purchase_quantity = volumeMeasure && gramsPerMeasure > 0
        ? legacyGrams / gramsPerMeasure
        : legacyGrams;
      item.purchase_quantity_unit = volumeMeasure ? measureUnit : "g";
      delete item.purchase_quantity_grams;
    }
    if (Array.isArray(item.price_history)) {
      item.price_history.forEach((observation) => {
        if (!observation.price_basis) {
          observation.price_basis = food ? (item.price_basis || "kg") : "purchase_unit";
        }
      });
    }
  });
  return document;
}

export function normalizePrivateState(value) {
  if (!value || typeof value !== "object") return value;
  const normalized = clone(value);
  if (Array.isArray(normalized.sources)) {
    normalized.sources = normalized.sources.map((source) => {
      try {
        const parsed = migratePurchasePricing(JSON.parse(String(source?.content || "")));
        const content = `${JSON.stringify(canonicalJsonValue(parsed), null, 2)}\n`;
        if (content === source.content) return source;
        return {
          ...source,
          content,
        };
      } catch {
        return source;
      }
    });
  }
  return normalized;
}

export function sameJsonValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index] && sameJsonValue(left[key], right[key])
    ));
}

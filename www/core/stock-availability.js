import { ingredientPricePerKg } from "./purchase-pricing.js?v=homealacarte-110";

export function stockGramsByKey(stockRows = []) {
  const totals = new Map();
  stockRows.forEach((row) => {
    if (row.household) return;
    const quantity = Number(row.quantity || 0);
    const gramsPerUnit = Number(row.grams_per_measure_unit || 1);
    const grams = row.quantity_unit === "unit" ? quantity * gramsPerUnit : quantity;
    if (!row.item_key || !Number.isFinite(grams) || grams <= 0) return;
    totals.set(row.item_key, (totals.get(row.item_key) || 0) + grams);
  });
  return totals;
}

export function estimatedStockValue(stockRows = [], ingredients = [], householdItems = []) {
  const foodByKey = new Map(ingredients.map((item) => [item.key, item]));
  const householdByKey = new Map(householdItems.map((item) => [item.key, item]));
  return stockRows.reduce((total, row) => {
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return total;
    if (row.household) {
      const item = householdByKey.get(row.item_key);
      const purchaseQuantity = Number(item?.purchase_quantity);
      const price = Number(item?.estimated_price);
      return Number.isFinite(purchaseQuantity) && purchaseQuantity > 0
        && Number.isFinite(price) && price >= 0
        ? total + quantity / purchaseQuantity * price
        : total;
    }
    const item = foodByKey.get(row.item_key);
    const pricePerKg = ingredientPricePerKg(item);
    const gramsPerUnit = Number(row.grams_per_measure_unit);
    const grams = row.quantity_unit === "unit" ? quantity * gramsPerUnit : quantity;
    return Number.isFinite(grams) && grams > 0
      && Number.isFinite(pricePerKg) && pricePerKg >= 0
      ? total + grams * pricePerKg / 1000
      : total;
  }, 0);
}

export function dishStockAvailability(dish, stockRows = []) {
  const stock = stockGramsByKey(stockRows);
  const requirements = new Map();
  (dish?.components || []).forEach((component) => {
    const grams = Number(component.grams || 0);
    if (!component.key || !Number.isFinite(grams) || grams <= 0) return;
    requirements.set(component.key, (requirements.get(component.key) || 0) + grams);
  });
  if (!requirements.size) return { portions: 0, limitingKey: "" };
  let portions = Number.POSITIVE_INFINITY;
  let limitingKey = "";
  requirements.forEach((neededGrams, key) => {
    const candidate = (stock.get(key) || 0) / neededGrams;
    if (candidate < portions) {
      portions = candidate;
      limitingKey = key;
    }
  });
  return {
    portions: Number.isFinite(portions) ? Math.max(0, portions) : 0,
    limitingKey,
  };
}

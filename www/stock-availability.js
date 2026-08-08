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

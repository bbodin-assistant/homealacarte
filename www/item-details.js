const splitCategory = (value) => {
  const [category = "", ...subcategory] = String(value || "").split("::");
  return [category, subcategory.join("::")];
};

const sameNumber = (left, right) => Math.abs(Number(left) - Number(right)) < 0.000001;

export function catalogItemsForGrocery(snapshot, groceryItem) {
  if (!snapshot || !groceryItem) return [];
  if (groceryItem.household) {
    const key = String(groceryItem.id || "").replace(/^household-/, "");
    return (snapshot.household_items || []).filter((item) => item.key === key);
  }
  const exact = (snapshot.ingredients || []).filter((item) => {
    const [category, subcategory] = splitCategory(item.category);
    return item.name === groceryItem.name
      && category === groceryItem.category
      && subcategory === groceryItem.subcategory
      && item.measure_unit === groceryItem.measure_unit
      && item.purchase_unit === groceryItem.purchase_unit
      && sameNumber(item.grams_per_measure_unit, groceryItem.grams_per_measure_unit)
      && sameNumber(item.purchase_quantity_grams, groceryItem.purchase_quantity);
  });
  return exact.length
    ? exact
    : (snapshot.ingredients || []).filter((item) => item.name === groceryItem.name);
}

export function combinedPriceHistory(items) {
  const observations = new Map();
  for (const item of items || []) {
    for (const row of item.price_history || []) {
      const price = Number(row.price);
      if (!Number.isFinite(price) || price < 0) continue;
      const observation = {
        date: String(row.date || "").trim(),
        price,
        description: String(row.description || "").trim(),
      };
      observations.set(
        `${observation.date}\u001f${observation.price}\u001f${observation.description}`,
        observation,
      );
    }
  }
  return [...observations.values()].sort((left, right) =>
    left.date.localeCompare(right.date)
      || left.price - right.price
      || left.description.localeCompare(right.description));
}

export function menuUsageContext(row, people) {
  const peopleNames = new Map(
    (people || []).map((person) => [person.key, person.name]),
  );
  const participants = (row?.people || [])
    .map((key) => peopleNames.get(key) || key)
    .join(", ");
  return [row?.day, row?.meal, participants]
    .filter(Boolean)
    .join(" · ");
}

export function priceChartGeometry(history, width = 640, height = 220) {
  const observations = combinedPriceHistory([{ price_history: history }]);
  if (!observations.length) return { observations, points: [], path: "", minPrice: 0, maxPrice: 0 };
  const left = 42;
  const right = width - 18;
  const top = 18;
  const bottom = height - 34;
  const prices = observations.map((row) => row.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceSpan = maxPrice - minPrice;
  const points = observations.map((row, index) => ({
    ...row,
    x: observations.length === 1
      ? (left + right) / 2
      : left + ((right - left) * index / (observations.length - 1)),
    y: priceSpan === 0
      ? (top + bottom) / 2
      : bottom - ((bottom - top) * (row.price - minPrice) / priceSpan),
  }));
  return {
    observations,
    points,
    path: points.map((point, index) =>
      `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" "),
    minPrice,
    maxPrice,
  };
}

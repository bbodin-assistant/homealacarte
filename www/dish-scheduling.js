export function buildScheduledDishRow({
  dishKey,
  day,
  meal,
  people,
  quantity,
  quantityUnit,
}) {
  const numericQuantity = Number(quantity);
  if (!String(dishKey || "").trim()) throw new Error("A dish is required.");
  if (!String(day || "").trim() || !String(meal || "").trim()) {
    throw new Error("A day and meal are required.");
  }
  if (!Array.isArray(people) || people.length === 0) {
    throw new Error("At least one person is required.");
  }
  if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    throw new Error("Quantity must be positive.");
  }
  if (!["portion", "g", "unit"].includes(quantityUnit)) {
    throw new Error("Unsupported quantity unit.");
  }
  return {
    day,
    meal,
    item_key: dishKey,
    people: [...people],
    quantity: numericQuantity,
    quantity_unit: quantityUnit,
    notes: "",
  };
}

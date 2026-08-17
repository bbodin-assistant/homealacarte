export function ingredientCatalogueStats(
  itemKey,
  dishes = [],
  stockRows = [],
  measureUnit = "",
) {
  const dishCount = dishes.filter((dish) => (dish.components || []).some((component) =>
    (component.key || component.item_key) === itemKey)).length;
  const stockItem = stockRows.find((item) => {
    const quantity = Number(item.quantity);
    return item.item_key === itemKey
      && !item.household
      && Number.isFinite(quantity)
      && quantity > 0;
  });
  if (!stockItem) return { dishCount, stockQuantity: null };
  return {
    dishCount,
    stockQuantity: {
      quantity: Number(stockItem.quantity),
      unit: stockItem.quantity_unit === "unit"
        ? (measureUnit || stockItem.measure_unit || "unit")
        : (stockItem.quantity_unit || "g"),
    },
  };
}

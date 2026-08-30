export function dishesUsingIngredient(itemKey, dishes = []) {
  return (dishes || []).filter((dish) => (dish.components || []).some((component) =>
    (component.key || component.item_key) === itemKey));
}

export function menuUsesForIngredient(itemKey, dishes = [], menuRows = []) {
  const dishKeys = new Set(dishesUsingIngredient(itemKey, dishes).map((dish) => dish.key));
  return (menuRows || []).filter((row) =>
    row.item_key === itemKey || dishKeys.has(row.item_key));
}

export function ingredientCatalogueStats(
  itemKey,
  dishes = [],
  stockRows = [],
  measureUnit = "",
  menuRows = [],
) {
  const linkedDishes = dishesUsingIngredient(itemKey, dishes);
  const menuDishCount = menuUsesForIngredient(itemKey, linkedDishes, menuRows).length;
  const stockItem = stockRows.find((item) => {
    const quantity = Number(item.quantity);
    return item.item_key === itemKey
      && !item.household
      && Number.isFinite(quantity)
      && quantity > 0;
  });
  if (!stockItem) {
    return {
      dishCount: linkedDishes.length,
      menuDishCount,
      stockQuantity: null,
    };
  }
  return {
    dishCount: linkedDishes.length,
    menuDishCount,
    stockQuantity: {
      quantity: Number(stockItem.quantity),
      unit: stockItem.quantity_unit === "unit"
        ? (measureUnit || stockItem.measure_unit || "unit")
        : (stockItem.quantity_unit || "g"),
    },
  };
}

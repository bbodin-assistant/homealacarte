export function ingredientPurchaseGrams(item) {
  const quantity = Number(item?.purchase_quantity);
  return item?.purchase_quantity_unit === "g"
    ? quantity
    : quantity * Number(item?.grams_per_measure_unit);
}

export function ingredientPricePerKg(item) {
  const price = Number(item?.price);
  return item?.price_basis === "kg"
    ? price
    : price * 1000 / ingredientPurchaseGrams(item);
}

export function ingredientPurchasePrice(item) {
  const price = Number(item?.price);
  return item?.price_basis === "purchase_unit"
    ? price
    : price * ingredientPurchaseGrams(item) / 1000;
}

export function purchasedFoodPrice(item, purchasedGrams, totalPaid) {
  const packageGrams = ingredientPurchaseGrams(item);
  if (!Number.isFinite(packageGrams) || packageGrams <= 0) return null;
  const packages = purchasedGrams / packageGrams;
  const wholePackages = Math.round(packages);
  if (wholePackages >= 1 && Math.abs(packages - wholePackages) < 0.000001) {
    return { price: totalPaid / wholePackages, priceBasis: "purchase_unit" };
  }
  return { price: totalPaid / purchasedGrams * 1000, priceBasis: "kg" };
}

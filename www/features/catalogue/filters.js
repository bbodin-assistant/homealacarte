export function catalogueCategories(items) {
  return [...new Set(
    (items || [])
      .map((item) => String(item.category || "").trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

export function catalogueItemIsIncomplete(item, missingNutriScore = 0) {
  return Boolean(item?.incomplete || Number(missingNutriScore) > 0);
}

export function filterCatalogueItems(
  items,
  { name = "", category = "", incomplete = false } = {},
) {
  const search = String(name).trim().toLocaleLowerCase();
  return (items || []).filter((item) => {
    const matchesName = !search
      || String(item.name || "").toLocaleLowerCase().includes(search);
    const matchesCategory = !category || item.category === category;
    const matchesIncomplete = !incomplete || Boolean(item.catalogue_incomplete);
    return matchesName && matchesCategory && matchesIncomplete;
  });
}

export function sortCatalogueItems(
  items,
  { key = "name", direction = "asc", locale } = {},
) {
  const sortKey = ["name", "type", "category", "dishes"].includes(key) ? key : "name";
  const multiplier = direction === "desc" ? -1 : 1;
  const compareText = (left, right) =>
    String(left || "").localeCompare(String(right || ""), locale);

  return [...(items || [])].sort((left, right) => {
    let comparison;
    if (sortKey === "dishes") {
      comparison = (Number(left.dish_count) || 0) - (Number(right.dish_count) || 0);
    } else if (sortKey === "type") {
      comparison = compareText(left.item_kind, right.item_kind);
    } else if (sortKey === "category") {
      comparison = compareText(left.category, right.category);
    } else {
      comparison = compareText(left.name, right.name);
    }
    if (comparison) return comparison * multiplier;
    return compareText(left.name, right.name);
  });
}

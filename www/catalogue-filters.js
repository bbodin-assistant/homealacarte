export function catalogueCategories(items) {
  return [...new Set(
    (items || [])
      .map((item) => String(item.category || "").trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

export function filterCatalogueItems(items, { name = "", category = "" } = {}) {
  const search = String(name).trim().toLocaleLowerCase();
  return (items || []).filter((item) => {
    const matchesName = !search
      || String(item.name || "").toLocaleLowerCase().includes(search);
    const matchesCategory = !category || item.category === category;
    return matchesName && matchesCategory;
  });
}

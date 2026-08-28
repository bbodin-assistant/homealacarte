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
  if (key === "original") return [...(items || [])];
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

function numericDishCount(row) {
  const usage = row.querySelector(".item-catalogue-usage small:not(.in-stock)");
  const match = usage?.textContent?.match(/([0-9][0-9\s.,]*)\s*$/);
  if (!match) return row.dataset.itemKind === "food" ? 0 : 0;
  return Number(match[1].replace(/[^0-9]/g, "")) || 0;
}

function sortIndicator(activeKey, direction, key) {
  if (activeKey !== key) return "";
  return direction === "desc" ? " ↓" : " ↑";
}

export function installCatalogueHeaderSorting(documentRef = globalThis.document) {
  if (!documentRef || documentRef.documentElement?.dataset.catalogueHeaderSorting === "true") return;
  documentRef.documentElement.dataset.catalogueHeaderSorting = "true";

  function enhance() {
    const sortSelect = documentRef.querySelector("#item-sort");
    const directionButton = documentRef.querySelector("#item-sort-direction");
    const catalogue = documentRef.querySelector("#item-catalogue");
    const head = catalogue?.querySelector(".item-catalogue-head");
    if (!sortSelect || !directionButton || !head) return;

    if (!sortSelect.querySelector('option[value="original"]')) {
      sortSelect.insertAdjacentHTML("beforeend", '<option value="original">Original</option>');
    }
    const sortLabel = sortSelect.closest("label");
    if (sortLabel) sortLabel.hidden = true;
    directionButton.hidden = true;

    const filterPanel = documentRef.querySelector("#item-filter-panel");
    const activeKey = sortSelect.value === "original" ? "" : sortSelect.value;
    const direction = directionButton.dataset.direction || "asc";
    const currentLabels = [...head.children].map((node) => node.textContent.trim());
    const dishLabel = sortSelect.querySelector('option[value="dishes"]')?.textContent?.trim() || "Dishes";
    const labels = [currentLabels[0] || "Name", currentLabels[1] || "Type", currentLabels[2] || "Category", dishLabel];
    const keys = ["name", "type", "category", "dishes"];
    head.style.gridTemplateColumns = "minmax(180px,1.2fr) 130px minmax(180px,1fr) 72px auto";
    head.innerHTML = `${keys.map((key, index) => `
      <button type="button" data-catalogue-sort="${key}" style="justify-self:start;padding:0;color:inherit;background:none;border:0;cursor:pointer;font:inherit;letter-spacing:inherit;text-transform:inherit">
        ${labels[index]}${sortIndicator(activeKey, direction, key)}
      </button>`).join("")}<span></span>`;

    catalogue.querySelectorAll(".item-catalogue-row").forEach((row) => {
      row.style.gridTemplateColumns = "minmax(180px,1.2fr) 130px minmax(180px,1fr) 72px auto";
      let countCell = row.querySelector(".item-dish-count");
      if (!countCell) {
        countCell = documentRef.createElement("span");
        countCell.className = "item-dish-count";
        row.querySelector(".item-catalogue-actions")?.before(countCell);
      }
      countCell.textContent = String(numericDishCount(row));
      row.querySelector(".item-catalogue-usage small:not(.in-stock)")?.remove();
    });

    if (filterPanel) {
      filterPanel.dataset.catalogueSortKey = sortSelect.value;
      filterPanel.dataset.catalogueSortDirection = direction;
    }
  }

  documentRef.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-catalogue-sort]");
    if (!button) return;
    const sortSelect = documentRef.querySelector("#item-sort");
    const directionButton = documentRef.querySelector("#item-sort-direction");
    if (!sortSelect || !directionButton) return;
    event.preventDefault();
    event.stopPropagation();
    const key = button.dataset.catalogueSort;
    const sameKey = sortSelect.value === key;
    if (!sameKey) {
      sortSelect.value = key;
      directionButton.dataset.direction = "asc";
    } else if (directionButton.dataset.direction === "asc") {
      directionButton.dataset.direction = "desc";
    } else {
      sortSelect.value = "original";
      directionButton.dataset.direction = "asc";
    }
    sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const observer = new MutationObserver(enhance);
  const start = () => {
    const catalogue = documentRef.querySelector("#item-catalogue");
    if (catalogue) observer.observe(catalogue, { childList: true, subtree: true });
    enhance();
  };
  if (documentRef.readyState === "loading") documentRef.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

if (typeof document !== "undefined") installCatalogueHeaderSorting(document);

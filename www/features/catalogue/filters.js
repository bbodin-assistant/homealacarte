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
  if (!match) return 0;
  return Number(match[1].replace(/[^0-9]/g, "")) || 0;
}

function sortIndicator(activeKey, direction, key) {
  if (activeKey !== key) return "";
  return direction === "desc" ? " ↓" : " ↑";
}

function enhanceCatalogueEditButtons(catalogue) {
  catalogue.querySelectorAll("[data-item-edit]").forEach((button) => {
    if (button.dataset.catalogueEditIcon === "true") return;
    button.dataset.catalogueEditIcon = "true";
    button.className = "icon-button item-edit-icon";
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4ZM13.5 6.5l4 4"/></svg>';
  });
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
    const keys = ["name", "type", "category", "dishes"];
    const fallbacks = ["Name", "Type", "Category", "Dishes"];
    const labels = keys.map((key, index) =>
      sortSelect.querySelector(`option[value="${key}"]`)?.textContent?.trim() || fallbacks[index]);
    const signature = JSON.stringify({ activeKey, direction, labels });
    head.style.gridTemplateColumns = "minmax(180px,1.2fr) 130px minmax(180px,1fr) 82px 72px";
    if (head.dataset.catalogueSortSignature !== signature) {
      head.dataset.catalogueSortSignature = signature;
      head.innerHTML = `${keys.map((key, index) => `
        <button type="button" data-catalogue-sort="${key}" style="justify-self:${key === "dishes" ? "center" : "start"};padding:0;color:inherit;background:none;border:0;cursor:pointer;font:inherit;letter-spacing:inherit;text-transform:inherit">
          ${labels[index]}${sortIndicator(activeKey, direction, key)}
        </button>`).join("")}<span></span>`;
    }

    catalogue.querySelectorAll(".item-catalogue-row").forEach((row) => {
      row.style.gridTemplateColumns = "minmax(180px,1.2fr) 130px minmax(180px,1fr) 82px 72px";
      let countCell = row.querySelector(".item-dish-count");
      if (!countCell) {
        countCell = documentRef.createElement("span");
        countCell.className = "item-dish-count";
        row.querySelector(".item-catalogue-actions")?.before(countCell);
      }
      const count = String(numericDishCount(row));
      if (countCell.textContent !== count) countCell.textContent = count;
      countCell.style.textAlign = "center";
      row.querySelector(".item-catalogue-usage small:not(.in-stock)")?.remove();
    });
    enhanceCatalogueEditButtons(catalogue);

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
    if (sortSelect.value === key) {
      directionButton.dataset.direction = directionButton.dataset.direction === "asc" ? "desc" : "asc";
    } else {
      sortSelect.value = key;
      directionButton.dataset.direction = "asc";
    }
    sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const observer = new MutationObserver(enhance);
  const start = () => {
    const catalogue = documentRef.querySelector("#item-catalogue");
    if (catalogue) observer.observe(catalogue, { childList: true });
    enhance();
  };
  if (documentRef.readyState === "loading") documentRef.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

export function installCatalogueCategorySearch(documentRef = globalThis.document) {
  if (!documentRef || documentRef.documentElement?.dataset.catalogueCategorySearch === "true") return;
  documentRef.documentElement.dataset.catalogueCategorySearch = "true";

  function install() {
    const select = documentRef.querySelector("#item-category-filter");
    if (!select || documentRef.querySelector("#item-category-search")) return;
    const datalist = documentRef.createElement("datalist");
    datalist.id = "item-category-options";
    const input = documentRef.createElement("input");
    input.id = "item-category-search";
    input.type = "search";
    input.setAttribute("list", datalist.id);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-label", select.closest("label")?.querySelector("span")?.textContent?.trim() || "Category");
    input.style.cssText = "width:100%;min-width:0;height:39px;padding:8px 10px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;font:inherit;font-size:11px";
    select.before(input);
    select.after(datalist);
    select.hidden = true;

    const refresh = () => {
      const options = [...select.options].filter((option) => option.value);
      datalist.innerHTML = options
        .map((option) => `<option value="${option.textContent.replaceAll('"', '&quot;')}"></option>`)
        .join("");
      input.value = select.value ? select.selectedOptions[0]?.textContent?.trim() || "" : "";
      input.placeholder = select.options[0]?.textContent?.trim() || "";
    };
    const apply = () => {
      const value = input.value.trim();
      if (!value) {
        if (select.value) {
          select.value = "";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      const match = [...select.options].find((option) => option.value && (
        option.textContent.trim().toLocaleLowerCase() === value.toLocaleLowerCase()
        || option.value.toLocaleLowerCase() === value.toLocaleLowerCase()
      ));
      if (match && select.value !== match.value) {
        select.value = match.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    input.addEventListener("input", apply);
    input.addEventListener("change", apply);
    new MutationObserver(refresh).observe(select, { childList: true, subtree: true });
    refresh();
  }

  const start = () => {
    install();
    if (!documentRef.querySelector("#item-category-search")) {
      new MutationObserver(install).observe(documentRef.body, { childList: true, subtree: true });
    }
  };
  if (documentRef.readyState === "loading") documentRef.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

if (typeof document !== "undefined") {
  installCatalogueHeaderSorting(document);
  installCatalogueCategorySearch(document);
}

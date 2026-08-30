import {
  catalogueItemIsIncomplete,
  filterCatalogueItems,
} from "./catalogue/filters.js?v=homealacarte-102";
import { ingredientNutriScoreMissing } from "../core/nutrition.js?v=homealacarte-77";

export const CALENDAR_DATE_SELECTOR = [
  'input[type="date"]',
  "#ingredient-price-checked-at",
  "#household-item-last-bought",
  "[data-price-observation-date]",
].join(", ");

export function calendarDateKeyAction(key) {
  if (key === "Tab" || key === "Escape") return "allow";
  if (key === "Enter" || key === " " || key === "Spacebar" || key === "ArrowDown") {
    return "picker";
  }
  return "block";
}

export function prepareCalendarDateInput(input) {
  if (!input?.matches?.(CALENDAR_DATE_SELECTOR)) return false;
  if (input.type !== "date") input.type = "date";
  input.removeAttribute("placeholder");
  input.removeAttribute("data-i18n-placeholder");
  input.setAttribute("inputmode", "none");
  input.setAttribute("autocomplete", "off");
  input.dataset.calendarOnlyDate = "true";
  return true;
}

export function catalogueFilterCounts(snapshot = {}, filters = {}) {
  const foods = (snapshot.ingredients || []).map((item) => ({
    ...item,
    catalogue_incomplete: catalogueItemIsIncomplete(item, ingredientNutriScoreMissing(item)),
  }));
  const others = (snapshot.household_items || []).map((item) => ({
    ...item,
    catalogue_incomplete: false,
  }));
  const filteredFoods = filterCatalogueItems(foods, filters);
  const filteredOthers = filterCatalogueItems(others, filters);
  return {
    all: filteredFoods.length + filteredOthers.length,
    food: filteredFoods.length,
    other: filteredOthers.length,
  };
}

export function catalogueSortLabel(language = "") {
  return String(language || "").toLowerCase().startsWith("fr") ? "Tri" : "Sorting";
}

export function selectedCatalogueMatchLabel(select) {
  if (!select?.value) return "";
  const selected = select.selectedOptions?.[0]
    || [...(select.options || [])].find((option) => option.value === select.value);
  return selected?.textContent?.trim() || "";
}

export function installFamilyFormatCompatibility(formatInputNumber, globalRef = globalThis) {
  if (typeof formatInputNumber !== "function") return false;
  globalRef.formatInputNumber = formatInputNumber;
  return true;
}

function openCalendar(input) {
  if (typeof input?.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch {
    // Browsers can reject showPicker outside an explicit user gesture.
  }
}

function prepareDateInputs(root) {
  if (!root) return;
  if (root.matches?.(CALENDAR_DATE_SELECTOR)) prepareCalendarDateInput(root);
  root.querySelectorAll?.(CALENDAR_DATE_SELECTOR).forEach(prepareCalendarDateInput);
}

function installCalendarOnlyDates(documentRef) {
  prepareDateInputs(documentRef);
  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach(prepareDateInputs));
  });
  observer.observe(documentRef.documentElement, { childList: true, subtree: true });

  documentRef.addEventListener("keydown", (event) => {
    const input = event.target.closest?.(CALENDAR_DATE_SELECTOR);
    if (!input) return;
    prepareCalendarDateInput(input);
    const action = calendarDateKeyAction(event.key);
    if (action === "allow") return;
    event.preventDefault();
    if (action === "picker") openCalendar(input);
  }, true);
  ["paste", "drop"].forEach((type) => documentRef.addEventListener(type, (event) => {
    if (event.target.closest?.(CALENDAR_DATE_SELECTOR)) event.preventDefault();
  }, true));
  documentRef.addEventListener("beforeinput", (event) => {
    const input = event.target.closest?.(CALENDAR_DATE_SELECTOR);
    if (!input) return;
    if (/^(?:insert|delete)/.test(event.inputType || "")) event.preventDefault();
  }, true);
  documentRef.addEventListener("click", (event) => {
    const input = event.target.closest?.(CALENDAR_DATE_SELECTOR);
    if (!input) return;
    prepareCalendarDateInput(input);
    openCalendar(input);
  });
}

function updateCatalogueSortLabel(documentRef) {
  const sort = documentRef.querySelector("#item-sort");
  const indicator = sort?.closest("label")?.querySelector("span");
  if (!indicator) return false;
  const label = catalogueSortLabel(documentRef.documentElement?.lang);
  if (indicator.textContent !== label) indicator.textContent = label;
  indicator.removeAttribute("aria-hidden");
  return true;
}

function installCatalogueSortLabel(documentRef) {
  const update = () => updateCatalogueSortLabel(documentRef);
  update();
  const panel = documentRef.querySelector("#item-filter-panel");
  if (panel) {
    new MutationObserver(update).observe(panel, { childList: true, subtree: true });
  }
  new MutationObserver(update).observe(documentRef.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
}

function updateCatalogueCounts(documentRef, state) {
  if (!state.snapshot) return;
  const search = documentRef.querySelector("#item-search");
  const category = documentRef.querySelector("#item-category-filter");
  if (!search || !category) return;
  const counts = catalogueFilterCounts(state.snapshot, {
    name: search.value,
    category: category.value,
    incomplete: Boolean(documentRef.querySelector("#item-incomplete-filter")?.checked),
  });
  Object.entries(counts).forEach(([tab, count]) => {
    const badge = documentRef.querySelector(
      `[data-item-catalogue-tab="${tab}"] .item-catalogue-tab-count`,
    );
    if (badge && badge.textContent !== String(count)) badge.textContent = String(count);
  });
}

function installCatalogueCountUpdates(documentRef, state) {
  const schedule = () => queueMicrotask(() => updateCatalogueCounts(documentRef, state));
  documentRef.addEventListener("input", (event) => {
    if (event.target.closest?.("#item-search")) schedule();
  });
  documentRef.addEventListener("change", (event) => {
    if (event.target.closest?.("#item-category-filter, #item-incomplete-filter")) schedule();
  });
  documentRef.addEventListener("click", (event) => {
    if (event.target.closest?.("#item-clear-filters, [data-item-catalogue-tab]")) schedule();
  });
  const catalogue = documentRef.querySelector("#item-catalogue");
  if (catalogue) {
    new MutationObserver((records) => {
      const renderedTabs = records.some((record) => [...record.addedNodes].some((node) =>
        node.nodeType === 1
        && (node.matches?.(".item-catalogue-tabs") || node.querySelector?.(".item-catalogue-tabs"))));
      if (renderedTabs) schedule();
    }).observe(catalogue, { childList: true, subtree: true });
  }
  schedule();
}

function syncPurchaseMatchStatuses(documentRef) {
  documentRef.querySelectorAll("[data-receipt-row]").forEach((row) => {
    if (row.classList.contains("invalid")) return;
    const match = row.querySelector("[data-receipt-match]");
    const status = row.querySelector("[data-receipt-status]");
    const label = selectedCatalogueMatchLabel(match);
    if (!status || !label) return;
    if (status.textContent !== label) status.textContent = label;
    status.classList.remove("warning");
  });
}

function installPurchaseStatusSync(documentRef) {
  documentRef.addEventListener("change", (event) => {
    if (!event.target.closest?.("[data-receipt-match]")) return;
    syncPurchaseMatchStatuses(documentRef);
  });
  new MutationObserver((records) => {
    const receiptChanged = records.some((record) => {
      const parent = record.target.parentElement;
      return parent?.closest?.("#purchase-receipt-review")
        || [...record.addedNodes].some((node) =>
          node.nodeType === 1 && (node.matches?.("#purchase-receipt-review, [data-receipt-row]")
            || node.querySelector?.("[data-receipt-row]")));
    });
    if (receiptChanged) queueMicrotask(() => syncPurchaseMatchStatuses(documentRef));
  }).observe(documentRef.body, { childList: true, subtree: true });
}

function availabilitySelectAllButton(documentRef, translate, row) {
  const firstInput = row.querySelector("input[data-auto-availability-person]:not(:disabled)");
  const cell = row.querySelector("td:first-child");
  if (!firstInput || !cell) return;
  let button = cell.querySelector("[data-auto-availability-select-all]");
  if (!button) {
    button = documentRef.createElement("button");
    button.type = "button";
    button.className = "auto-menu-availability-all";
    button.dataset.autoAvailabilitySelectAll = "true";
    cell.append(button);
  }
  const label = translate("select_all");
  if (button.textContent !== label) button.textContent = label;
  const person = cell.querySelector("strong")?.textContent?.trim();
  button.setAttribute("aria-label", person ? `${label}: ${person}` : label);
}

function installAvailabilitySelectAll(documentRef, translate) {
  const container = documentRef.querySelector("#auto-menu-availability");
  if (!container) return;
  const enhance = () => container.querySelectorAll("tbody tr")
    .forEach((row) => availabilitySelectAllButton(documentRef, translate, row));
  new MutationObserver(enhance).observe(container, { childList: true, subtree: true });
  container.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-auto-availability-select-all]");
    if (!button) return;
    const row = button.closest("tr");
    row?.querySelectorAll("input[data-auto-availability-person]:not(:disabled)").forEach((input) => {
      if (input.checked) return;
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  enhance();
}

function installDismissableDishFilters(documentRef) {
  documentRef.addEventListener("click", (event) => {
    documentRef.querySelectorAll("#dish-country-filter[open], #dish-allergen-filter[open]")
      .forEach((filter) => {
        if (!filter.contains(event.target)) filter.removeAttribute("open");
      });
  });
}

function installUiConsistencyStyles(documentRef) {
  if (documentRef.querySelector("#ui-consistency-styles")) return;
  const style = documentRef.createElement("style");
  style.id = "ui-consistency-styles";
  style.textContent = `
    .auto-menu-availability-all{margin-left:7px;padding:1px 2px;color:var(--muted);background:transparent;border:0;cursor:pointer;font-size:8px;font-weight:800;line-height:1.2;text-decoration:underline;text-underline-offset:2px;opacity:.72}
    .auto-menu-availability-all:hover,.auto-menu-availability-all:focus-visible{color:var(--accent-dark);opacity:1}
  `;
  documentRef.head.append(style);
}

export function installUiConsistency({
  state,
  documentRef = document,
  formatInputNumber,
  translate = (key) => key,
} = {}) {
  installFamilyFormatCompatibility(formatInputNumber);
  installUiConsistencyStyles(documentRef);
  installCalendarOnlyDates(documentRef);
  installCatalogueSortLabel(documentRef);
  installCatalogueCountUpdates(documentRef, state);
  installPurchaseStatusSync(documentRef);
  installAvailabilitySelectAll(documentRef, translate);
  installDismissableDishFilters(documentRef);
}

import { latestPriceTrend } from "../core/item-details.js?v=homealacarte-77";
import {
  displayLocalizedName,
  localizedFormValues,
  localizedNameValues,
  renderLocalizedInputs,
} from "../core/data-localization.js?v=homealacarte-80";
import {
  catalogueCategories,
  filterCatalogueItems,
} from "./catalogue/filters.js?v=homealacarte-77";

export function createCatalogueFeature({
  state,
  select,
  selectAll,
  translate,
  translatedTemplate,
  locales,
  escapeHtml,
  formatInputNumber,
  formatMoney,
  formatNumber,
  displayCategory,
  normalizedCategory,
  optionalInputNumber,
  customIngredientKey,
  ingredientNutriScoreMissing,
  setCountBadge,
  openConfirmation,
  openDetails,
  send,
}) {
function priceHistoryFormPayload(selector) {
  return [...select(selector).querySelectorAll(".item-price-history-row")].map((row) => {
    const priceInput = row.querySelector("[data-price-observation-price]");
    return {
      date: row.querySelector("[data-price-observation-date]").value,
      price: priceInput.value === "" ? Number.NaN : Number(priceInput.value),
      description: row.querySelector("[data-price-observation-description]").value.trim(),
    };
  });
}

function priceHistoryFormIsValid(history) {
  return history.every((observation) =>
    Number.isFinite(observation.price) && observation.price >= 0);
}

function priceHistoryRowMarkup(observation = {}) {
  return `
    <div class="item-price-history-row">
      <label class="item-price-history-date">
        <span class="sr-only">${escapeHtml(translate("observation_date"))}</span>
        <input type="text" inputmode="numeric" placeholder="${escapeHtml(translate("date_format_hint"))}" value="${escapeHtml(observation.date || "")}" data-price-observation-date>
      </label>
      <label class="item-price-history-price">
        <span class="sr-only">${escapeHtml(translate("observed_price"))}</span>
        <input type="number" min="0" step="any" value="${escapeHtml(observation.price ?? "")}" data-price-observation-price required>
      </label>
      <label class="item-price-history-description">
        <span class="sr-only">${escapeHtml(translate("observation_description"))}</span>
        <input value="${escapeHtml(observation.description || "")}" data-price-observation-description>
      </label>
      <button class="icon-button remove-price-observation" type="button" aria-label="${escapeHtml(translate("remove_price_observation"))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
      </button>
    </div>`;
}

function updatePriceHistoryEmptyState(selector) {
  const list = select(selector);
  const empty = list.querySelector(".item-price-history-empty");
  if (list.querySelector(".item-price-history-row")) {
    empty?.remove();
  } else if (!empty) {
    list.innerHTML = `<p class="item-price-history-empty">${escapeHtml(translate("no_price_observations"))}</p>`;
  }
}

function renderPriceHistoryForm(selector, history = []) {
  select(selector).innerHTML = history.map(priceHistoryRowMarkup).join("");
  updatePriceHistoryEmptyState(selector);
}

function addPriceHistoryFormRow(selector) {
  const list = select(selector);
  list.querySelector(".item-price-history-empty")?.remove();
  list.insertAdjacentHTML("beforeend", priceHistoryRowMarkup());
  list.querySelector(".item-price-history-row:last-child [data-price-observation-date]").focus();
}

function itemNameFormValues(prefix) {
  return localizedFormValues(select(`#${prefix}-name-fields`));
}

function setItemNameFormValues(prefix, key, fallbackName) {
  const names = localizedNameValues(
    state.serializedData,
    "items",
    key,
    fallbackName,
    locales,
  );
  renderLocalizedInputs(select(`#${prefix}-name-fields`), locales, names, state.language);
}

function focusItemName(prefix) {
  const inputs = [...select(`#${prefix}-name-fields`).querySelectorAll("[data-locale]")];
  const language = String(state.language || "").toLowerCase();
  const primary = language.split("-")[0];
  const input = inputs.find((candidate) => candidate.dataset.locale.toLowerCase() === language)
    || inputs.find((candidate) => candidate.dataset.locale.toLowerCase().split("-")[0] === primary)
    || inputs[0];
  input?.focus();
}

function ingredientFormPayload() {
  const existing = state.snapshot.ingredients
    .find((ingredient) => ingredient.key === state.ingredientSelectedKey);
  if (!existing && !state.itemEditorCreating) return null;
  const nameI18n = itemNameFormValues("ingredient");
  const name = displayLocalizedName(nameI18n, state.language, locales);
  return {
    key: existing?.key || customIngredientKey(name),
    name,
    name_i18n: nameI18n,
    custom: existing ? Boolean(existing.custom) : true,
    incomplete: select("#ingredient-incomplete").checked,
    grams: Number(select("#ingredient-grams").value),
    kcal: Number(select("#ingredient-kcal").value),
    protein_g: Number(select("#ingredient-protein").value),
    carbs_g: Number(select("#ingredient-carbs").value),
    fat_g: Number(select("#ingredient-fat").value),
    fiber_g: Number(select("#ingredient-fiber").value),
    sugars_g: optionalInputNumber("#ingredient-sugars"),
    saturated_fat_g: optionalInputNumber("#ingredient-saturated-fat"),
    salt_g: optionalInputNumber("#ingredient-salt"),
    fruit_vegetable_legume_percent: optionalInputNumber("#ingredient-fvl-percent"),
    category: normalizedCategory(select("#ingredient-category").value.trim()),
    source: select("#ingredient-source").value.trim(),
    url: select("#ingredient-url").value.trim(),
    price_per_kg: Number(select("#ingredient-price").value),
    price_source: select("#ingredient-price-source").value.trim(),
    price_checked_at: select("#ingredient-price-checked-at").value,
    measure_unit: select("#ingredient-measure-unit").value.trim(),
    grams_per_measure_unit: Number(select("#ingredient-grams-per-unit").value),
    purchase_unit: select("#ingredient-purchase-unit").value.trim(),
    purchase_quantity_grams: Number(select("#ingredient-purchase-grams").value),
    price_history: priceHistoryFormPayload("#ingredient-price-history-list"),
  };
}

function ingredientFormSignature() {
  return JSON.stringify(ingredientFormPayload());
}

function ingredientFormIsValid(ingredient) {
  if (!ingredient
    || !ingredient.name
    || !ingredient.measure_unit
    || !ingredient.purchase_unit
    || (!ingredient.incomplete && !ingredient.category)) return false;
  return [
    ingredient.grams,
    ingredient.grams_per_measure_unit,
    ingredient.purchase_quantity_grams,
  ].every((value) => Number.isFinite(value) && value > 0)
    && [
      ingredient.kcal,
      ingredient.protein_g,
      ingredient.carbs_g,
      ingredient.fat_g,
      ingredient.fiber_g,
      ingredient.price_per_kg,
    ].every((value) => Number.isFinite(value) && value >= 0)
    && [
      ingredient.sugars_g,
      ingredient.saturated_fat_g,
      ingredient.salt_g,
    ].every((value) => value == null || (Number.isFinite(value) && value >= 0))
    && priceHistoryFormIsValid(ingredient.price_history)
    && (ingredient.fruit_vegetable_legume_percent == null
      || (Number.isFinite(ingredient.fruit_vegetable_legume_percent)
        && ingredient.fruit_vegetable_legume_percent >= 0
        && ingredient.fruit_vegetable_legume_percent <= 100));
}

function updateIngredientSaveState() {
  updateIngredientPurchasePrice();
  const payload = ingredientFormPayload();
  select("#ingredient-save").disabled = !ingredientFormIsValid(payload)
    || ingredientFormSignature() === state.ingredientOriginal;
}

function updateIngredientPurchasePrice() {
  const pricePerKg = Number(select("#ingredient-price").value);
  const purchaseGrams = Number(select("#ingredient-purchase-grams").value);
  const calculated = pricePerKg * purchaseGrams / 1000;
  select("#ingredient-purchase-price").value = Number.isFinite(calculated)
    ? formatMoney(calculated)
    : "";
}

function populateIngredientForm(key) {
  const ingredient = state.snapshot.ingredients.find((item) => item.key === key);
  if (!ingredient) return;
  state.ingredientSelectedKey = ingredient.key;
  state.itemEditorCreating = false;
  select("#ingredient-delete").hidden = false;
  select("#ingredient-save").textContent = translate("save_changes");
  select("#ingredient-editor-name").textContent = ingredient.name;
  setItemNameFormValues("ingredient", ingredient.key, ingredient.name);
  select("#ingredient-category").value = displayCategory(ingredient.category);
  select("#ingredient-measure-unit").value = ingredient.measure_unit;
  select("#ingredient-grams-per-unit").value = formatInputNumber(ingredient.grams_per_measure_unit);
  select("#ingredient-grams").value = formatInputNumber(ingredient.grams);
  select("#ingredient-kcal").value = formatInputNumber(ingredient.kcal);
  select("#ingredient-protein").value = formatInputNumber(ingredient.protein_g);
  select("#ingredient-carbs").value = formatInputNumber(ingredient.carbs_g);
  select("#ingredient-fat").value = formatInputNumber(ingredient.fat_g);
  select("#ingredient-fiber").value = formatInputNumber(ingredient.fiber_g);
  select("#ingredient-sugars").value = ingredient.sugars_g == null ? "" : formatInputNumber(ingredient.sugars_g);
  select("#ingredient-saturated-fat").value = ingredient.saturated_fat_g == null ? "" : formatInputNumber(ingredient.saturated_fat_g);
  select("#ingredient-salt").value = ingredient.salt_g == null ? "" : formatInputNumber(ingredient.salt_g);
  select("#ingredient-fvl-percent").value = ingredient.fruit_vegetable_legume_percent == null
    ? ""
    : formatInputNumber(ingredient.fruit_vegetable_legume_percent);
  select("#ingredient-price").value = formatInputNumber(ingredient.price_per_kg);
  select("#ingredient-price-source").value = ingredient.price_source || "";
  select("#ingredient-price-checked-at").value = ingredient.price_checked_at || "";
  select("#ingredient-purchase-unit").value = ingredient.purchase_unit;
  select("#ingredient-purchase-grams").value = formatInputNumber(ingredient.purchase_quantity_grams);
  select("#ingredient-source").value = ingredient.source;
  select("#ingredient-url").value = ingredient.url;
  select("#ingredient-incomplete").checked = Boolean(ingredient.incomplete);
  renderPriceHistoryForm("#ingredient-price-history-list", ingredient.price_history);
  updateIngredientPurchasePrice();
  const status = select("#ingredient-completeness");
  status.className = `ingredient-completeness ${ingredient.incomplete ? "incomplete" : "complete"}`;
  status.textContent = translate(
    ingredient.incomplete ? "ingredient_incomplete" : "ingredient_complete",
  );
  select("#ingredient-form-message").textContent = "";
  state.ingredientOriginal = ingredientFormSignature();
  updateIngredientSaveState();
}

function householdItemFormPayload() {
  const existing = (state.snapshot.household_items || [])
    .find((item) => item.key === state.ingredientSelectedKey);
  if (!existing && !state.itemEditorCreating) return null;
  const nameI18n = itemNameFormValues("household-item");
  const name = displayLocalizedName(nameI18n, state.language, locales);
  const lastingDays = select("#household-item-lasting-days").value;
  return {
    key: existing?.key || customIngredientKey(name),
    name,
    name_i18n: nameI18n,
    category: normalizedCategory(select("#household-item-category").value.trim()),
    purchase_unit: select("#household-item-purchase-unit").value.trim(),
    purchase_quantity: Number(select("#household-item-purchase-quantity").value),
    estimated_price: Number(select("#household-item-price").value),
    measure_unit: select("#household-item-measure-unit").value.trim(),
    last_bought_at: select("#household-item-last-bought").value,
    lasting_days: lastingDays === "" ? null : Number(lastingDays),
    notes: select("#household-item-notes").value.trim(),
    custom: existing ? Boolean(existing.custom) : true,
    price_history: priceHistoryFormPayload("#household-item-price-history-list"),
  };
}

function householdItemFormSignature() {
  return JSON.stringify(householdItemFormPayload());
}

function householdItemFormIsValid(item) {
  return Boolean(item
    && item.name
    && item.category
    && item.purchase_unit
    && item.measure_unit
    && Number.isFinite(item.purchase_quantity)
    && item.purchase_quantity > 0
    && Number.isFinite(item.estimated_price)
    && item.estimated_price >= 0
    && priceHistoryFormIsValid(item.price_history)
    && (item.lasting_days == null
      || (Number.isFinite(item.lasting_days) && item.lasting_days > 0)));
}

function updateHouseholdItemSaveState() {
  const item = householdItemFormPayload();
  select("#household-item-save").disabled = !householdItemFormIsValid(item)
    || householdItemFormSignature() === state.householdItemOriginal;
}

function populateHouseholdItemForm(key) {
  const item = (state.snapshot.household_items || []).find((candidate) => candidate.key === key);
  if (!item) return;
  state.ingredientSelectedKey = item.key;
  state.itemEditorCreating = false;
  select("#household-item-delete").hidden = false;
  select("#household-item-save").textContent = translate("save_changes");
  select("#household-item-editor-name").textContent = item.name;
  setItemNameFormValues("household-item", item.key, item.name);
  select("#household-item-category").value = displayCategory(item.category);
  select("#household-item-measure-unit").value = item.measure_unit;
  select("#household-item-purchase-unit").value = item.purchase_unit;
  select("#household-item-purchase-quantity").value = formatInputNumber(item.purchase_quantity);
  select("#household-item-price").value = formatInputNumber(item.estimated_price);
  select("#household-item-last-bought").value = item.last_bought_at || "";
  select("#household-item-lasting-days").value = item.lasting_days ?? "";
  select("#household-item-notes").value = item.notes || "";
  renderPriceHistoryForm("#household-item-price-history-list", item.price_history);
  select("#household-item-form-message").textContent = "";
  state.householdItemOriginal = householdItemFormSignature();
  updateHouseholdItemSaveState();
}

function closeItemEditor() {
  state.ingredientSelectedKey = null;
  state.itemEditorCreating = false;
  state.ingredientOriginal = "";
  state.householdItemOriginal = "";
  select("#ingredient-form").hidden = true;
  select("#household-item-form").hidden = true;
  select("#add-catalogue-item").hidden = false;
  select("#item-filter-panel").hidden = false;
  select("#item-catalogue").hidden = false;
}

function openItemEditor(key, kind) {
  state.itemEditorCreating = false;
  select("#add-catalogue-item").hidden = true;
  select("#item-filter-panel").hidden = true;
  select("#item-catalogue").hidden = true;
  const food = kind === "food";
  select("#ingredient-form").hidden = !food;
  select("#household-item-form").hidden = food;
  if (food) populateIngredientForm(key);
  else populateHouseholdItemForm(key);
}

function openNewCatalogueItem() {
  state.ingredientSelectedKey = null;
  state.itemEditorCreating = true;
  select("#add-catalogue-item").hidden = true;
  select("#item-filter-panel").hidden = true;
  select("#item-catalogue").hidden = true;
  const food = state.itemCatalogueTab === "food";
  select("#ingredient-form").hidden = !food;
  select("#household-item-form").hidden = food;
  const selectedCategory = displayCategory(select("#item-category-filter").value);
  if (food) {
    select("#ingredient-editor-name").textContent = translate("new_food_item");
    select("#ingredient-delete").hidden = true;
    select("#ingredient-save").textContent = translate("add_catalogue_item");
    setItemNameFormValues("ingredient", "", "");
    select("#ingredient-category").value = selectedCategory;
    select("#ingredient-measure-unit").value = "g";
    select("#ingredient-grams-per-unit").value = "1";
    select("#ingredient-grams").value = "100";
    select("#ingredient-kcal").value = "0";
    select("#ingredient-protein").value = "0";
    select("#ingredient-carbs").value = "0";
    select("#ingredient-fat").value = "0";
    select("#ingredient-fiber").value = "0";
    select("#ingredient-sugars").value = "";
    select("#ingredient-saturated-fat").value = "";
    select("#ingredient-salt").value = "";
    select("#ingredient-fvl-percent").value = "";
    select("#ingredient-price").value = "0";
    select("#ingredient-price-source").value = "";
    select("#ingredient-price-checked-at").value = "";
    select("#ingredient-purchase-unit").value = "1 kg";
    select("#ingredient-purchase-grams").value = "1000";
    select("#ingredient-source").value = "";
    select("#ingredient-url").value = "";
    select("#ingredient-incomplete").checked = true;
    renderPriceHistoryForm("#ingredient-price-history-list");
    select("#ingredient-completeness").className = "ingredient-completeness incomplete";
    select("#ingredient-completeness").textContent = translate("ingredient_incomplete");
    select("#ingredient-form-message").textContent = "";
    state.ingredientOriginal = "";
    updateIngredientSaveState();
    focusItemName("ingredient");
    return;
  }
  select("#household-item-editor-name").textContent = translate("new_general_item");
  select("#household-item-delete").hidden = true;
  select("#household-item-save").textContent = translate("add_catalogue_item");
  setItemNameFormValues("household-item", "", "");
  select("#household-item-category").value = selectedCategory || translate("other");
  select("#household-item-measure-unit").value = translate("units");
  select("#household-item-purchase-unit").value = translate("units");
  select("#household-item-purchase-quantity").value = "1";
  select("#household-item-price").value = "0";
  select("#household-item-last-bought").value = "";
  select("#household-item-lasting-days").value = "";
  select("#household-item-notes").value = "";
  renderPriceHistoryForm("#household-item-price-history-list");
  select("#household-item-form-message").textContent = "";
  state.householdItemOriginal = "";
  updateHouseholdItemSaveState();
  focusItemName("household-item");
}

function configureItemCategoryFilter(items) {
  const categorySelect = select("#item-category-filter");
  const categories = catalogueCategories(items);
  const selected = categories.includes(select.value) ? select.value : "";
  select.innerHTML = `
    <option value="">${escapeHtml(translate("all_categories"))}</option>
    ${categories.map((category) =>
    `<option value="${escapeHtml(category)}">${escapeHtml(displayCategory(category))}</option>`)
    .join("")}`;
  select.value = selected;
  return selected;
}

function itemPriceTrendMarkup(item) {
  const trend = latestPriceTrend([item]);
  if (!trend) return "";
  const directionKey = trend.direction === "up" ? "price_increased" : "price_decreased";
  const percent = trend.percent == null
    ? ""
    : ` ${formatNumber(Math.abs(trend.percent), 1)} %`;
  return `<span class="item-price-trend ${trend.direction}" title="${escapeHtml(translatedTemplate(directionKey, {
    previous: formatMoney(trend.previous),
    latest: formatMoney(trend.latest),
  }))}">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8 4l4 4-4 4"/></svg>
    <small>${escapeHtml(percent.trim())}</small>
  </span>`;
}

function renderItemsCatalogue() {
  const ingredients = state.snapshot.ingredients || [];
  const householdItems = state.snapshot.household_items || [];
  const incompleteCount = ingredients.filter((ingredient) => ingredient.incomplete).length;
  setCountBadge("#ingredient-incomplete-count", incompleteCount);
  select("#add-catalogue-item-label").textContent = translate("short_add");
  const catalogueRows = state.itemCatalogueTab === "food"
    ? ingredients.map((item) => ({ ...item, item_kind: "food" }))
    : householdItems.map((item) => ({
      ...item,
      item_kind: "general",
      incomplete: false,
    }));
  const selectedCategory = configureItemCategoryFilter(catalogueRows);
  const rows = filterCatalogueItems(catalogueRows, {
    name: select("#item-search").value,
    category: selectedCategory,
  })
    .sort((left, right) => left.name.localeCompare(right.name, state.language));
  select("#item-catalogue").innerHTML = `
    <div class="item-catalogue-tabs" role="tablist" aria-label="${escapeHtml(translate("item_type"))}">
      <button class="item-catalogue-tab${state.itemCatalogueTab === "food" ? " active" : ""}" type="button" role="tab" aria-selected="${state.itemCatalogueTab === "food"}" data-item-catalogue-tab="food">
        <span>${escapeHtml(translate("food_items_tab"))}</span>
        <span class="item-catalogue-tab-count">${ingredients.length}</span>
      </button>
      <button class="item-catalogue-tab${state.itemCatalogueTab === "other" ? " active" : ""}" type="button" role="tab" aria-selected="${state.itemCatalogueTab === "other"}" data-item-catalogue-tab="other">
        <span>${escapeHtml(translate("other_items_tab"))}</span>
        <span class="item-catalogue-tab-count">${householdItems.length}</span>
      </button>
    </div>
    <div class="item-catalogue-head">
      <span>${escapeHtml(translate("name"))}</span>
      <span>${escapeHtml(translate("item_type"))}</span>
      <span>${escapeHtml(translate("category"))}</span>
      <span></span>
    </div>
    ${rows.map((item) => `
      <div class="item-catalogue-row" role="button" tabindex="0" data-item-details="${escapeHtml(encodeURIComponent(item.key))}" data-item-kind="${item.item_kind}" aria-label="${escapeHtml(`${translate("details")}: ${item.name}`)}">
        <strong class="item-catalogue-name">
          <span class="item-catalogue-name-line"><span>${item.incomplete ? "⚠ " : ""}${escapeHtml(item.name)}</span>${item.item_kind === "food" ? itemPriceTrendMarkup(item) : ""}</span>
          ${item.item_kind === "food" && ingredientNutriScoreMissing(item)
            ? `<small>${escapeHtml(translatedTemplate("nutri_score_values_missing", { count: ingredientNutriScoreMissing(item) }))}</small>`
            : ""}
        </strong>
        <span class="item-type-badge">${escapeHtml(translate(item.item_kind === "food" ? "food_item" : "general_item"))}</span>
        <span>${escapeHtml(displayCategory(item.category))}</span>
        <span class="item-catalogue-actions">
          <button class="button ghost compact" type="button" data-item-edit="${escapeHtml(encodeURIComponent(item.key))}" data-item-kind="${item.item_kind}" aria-label="${escapeHtml(`${translate("edit")}: ${item.name}`)}">${escapeHtml(translate("edit"))}</button>
          <button class="icon-button" type="button" data-item-delete="${escapeHtml(encodeURIComponent(item.key))}" data-item-name="${escapeHtml(item.name)}" aria-label="${escapeHtml(`${translate("delete")}: ${item.name}`)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
          </button>
        </span>
      </div>
    `).join("") || `<p class="item-catalogue-empty">${escapeHtml(translate(catalogueRows.length ? "no_matching_items" : state.itemCatalogueTab === "food" ? "no_food_items" : "no_other_items"))}</p>`}
  `;
  if (!select("#ingredient-form").hidden && state.ingredientSelectedKey) {
    const exists = ingredients.some((item) => item.key === state.ingredientSelectedKey);
    if (exists) populateIngredientForm(state.ingredientSelectedKey);
    else closeItemEditor();
  } else if (!select("#household-item-form").hidden && state.ingredientSelectedKey) {
    const exists = (state.snapshot.household_items || [])
      .some((item) => item.key === state.ingredientSelectedKey);
    if (exists) populateHouseholdItemForm(state.ingredientSelectedKey);
    else closeItemEditor();
  }
}

function requestItemDeletion(key, name) {
  openConfirmation({
    title: translatedTemplate("delete_item_title", { name }),
    message: translate("delete_item_message"),
    confirmLabel: translate("delete"),
    action: () => {
      closeItemEditor();
      send("delete-item", { key });
    },
  });
}

  function mount() {
select("#item-filter-panel").addEventListener("input", (event) => {
  if (event.target.matches("#item-search")) renderItemsCatalogue();
});
select("#item-filter-panel").addEventListener("change", (event) => {
  if (event.target.matches("#item-category-filter")) renderItemsCatalogue();
});
select("#item-clear-filters").addEventListener("click", () => {
  select("#item-search").value = "";
  select("#item-category-filter").value = "";
  renderItemsCatalogue();
  select("#item-search").focus();
});
select("#add-catalogue-item").addEventListener("click", openNewCatalogueItem);
select("#item-catalogue").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-item-catalogue-tab]");
  if (tab) {
    state.itemCatalogueTab = tab.dataset.itemCatalogueTab;
    localStorage.setItem("homealacarte-item-catalogue-tab", state.itemCatalogueTab);
    renderItemsCatalogue();
    return;
  }
  const edit = event.target.closest("[data-item-edit]");
  if (edit) {
    openItemEditor(decodeURIComponent(edit.dataset.itemEdit), edit.dataset.itemKind);
    return;
  }
  const remove = event.target.closest("[data-item-delete]");
  if (remove) {
    requestItemDeletion(
      decodeURIComponent(remove.dataset.itemDelete),
      remove.dataset.itemName,
    );
    return;
  }
  const details = event.target.closest("[data-item-details]");
  if (details) {
    openDetails(
      decodeURIComponent(details.dataset.itemDetails),
      details.dataset.itemKind,
    );
  }
});
select("#item-catalogue").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.target.closest("button")) return;
  const details = event.target.closest("[data-item-details]");
  if (!details) return;
  event.preventDefault();
  openDetails(
    decodeURIComponent(details.dataset.itemDetails),
    details.dataset.itemKind,
  );
});
selectAll(".item-editor-back").forEach((button) => button.addEventListener("click", closeItemEditor));
select("#ingredient-form").addEventListener("input", updateIngredientSaveState);
select("#ingredient-form").addEventListener("change", updateIngredientSaveState);
select("#ingredient-price-history-add").addEventListener("click", () => {
  addPriceHistoryFormRow("#ingredient-price-history-list");
  updateIngredientSaveState();
});
select("#ingredient-price-history-list").addEventListener("click", (event) => {
  const remove = event.target.closest(".remove-price-observation");
  if (!remove) return;
  remove.closest(".item-price-history-row").remove();
  updatePriceHistoryEmptyState("#ingredient-price-history-list");
  updateIngredientSaveState();
});
select("#ingredient-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const ingredient = ingredientFormPayload();
  if (!ingredientFormIsValid(ingredient)) {
    select("#ingredient-form-message").textContent = translate("ingredient_invalid");
    return;
  }
  const creating = state.itemEditorCreating;
  if (creating) {
    state.ingredientSelectedKey = ingredient.key;
  }
  send(creating ? "add-ingredient" : "replace-ingredient", { ingredient });
});
select("#ingredient-delete").addEventListener("click", () => {
  const ingredient = state.snapshot.ingredients
    .find((item) => item.key === state.ingredientSelectedKey);
  if (ingredient) requestItemDeletion(ingredient.key, ingredient.name);
});
select("#household-item-form").addEventListener("input", updateHouseholdItemSaveState);
select("#household-item-form").addEventListener("change", updateHouseholdItemSaveState);
select("#household-item-price-history-add").addEventListener("click", () => {
  addPriceHistoryFormRow("#household-item-price-history-list");
  updateHouseholdItemSaveState();
});
select("#household-item-price-history-list").addEventListener("click", (event) => {
  const remove = event.target.closest(".remove-price-observation");
  if (!remove) return;
  remove.closest(".item-price-history-row").remove();
  updatePriceHistoryEmptyState("#household-item-price-history-list");
  updateHouseholdItemSaveState();
});
select("#household-item-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const item = householdItemFormPayload();
  if (!householdItemFormIsValid(item)) {
    select("#household-item-form-message").textContent = translate("item_invalid");
    return;
  }
  const creating = state.itemEditorCreating;
  if (creating) {
    state.ingredientSelectedKey = item.key;
  }
  send(creating ? "add-household-item" : "replace-household-item", { item });
});
select("#household-item-delete").addEventListener("click", () => {
  const item = (state.snapshot.household_items || [])
    .find((candidate) => candidate.key === state.ingredientSelectedKey);
  if (item) requestItemDeletion(item.key, item.name);
});
  }

  return {
    closeEditor: closeItemEditor,
    mount,
    openEditor: openItemEditor,
    render: renderItemsCatalogue,
  };
}

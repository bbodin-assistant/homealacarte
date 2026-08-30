import {
  catalogItemsForGrocery,
  combinedPriceHistory,
  ingredientPurchaseGrams,
  ingredientPurchasePrice,
  menuUsageContext,
  priceChartGeometry,
} from "../core/item-details.js?v=homealacarte-110";
import { ingredientAllergenBadges } from "./catalogue/allergens.js?v=homealacarte-104";
import { dishesUsingIngredient } from "./catalogue/usage.js?v=homealacarte-112";

const EDITABLE_DETAIL_FIELDS = {
  sugars_g: { label: "sugars_grams", kind: "number", reference: "nutrition" },
  saturated_fat_g: { label: "saturated_fat_grams", kind: "number", reference: "nutrition" },
  salt_g: { label: "salt_grams", kind: "number", reference: "nutrition" },
  fruit_vegetable_legume_percent: {
    label: "fruit_vegetable_legume_percent",
    kind: "number",
    reference: "percent",
  },
  category: { label: "category", kind: "text" },
  source: { label: "source", kind: "text" },
  url: { label: "source_url", kind: "text", inputMode: "url" },
  price_checked_at: {
    label: "price_checked_at",
    kind: "text",
    inputMode: "numeric",
    placeholder: "date_format_hint",
  },
  price_source: { label: "price_source", kind: "text" },
};

export function createItemDetailsFeature({
  state,
  select,
  storage,
  translate,
  translatedTemplate,
  escapeHtml,
  externalHttpUrl,
  displayCategory,
  formatMoney,
  formatNumber,
  normalizedCategory,
  addStockQuantity,
  renderStock,
  scheduleStockUpdate,
  openConfirmation,
  openMealReplacement,
  renderMenu,
  scheduleMenuUpdate,
  send,
  switchTab,
  renderItemsCatalogue,
  openItemEditor,
}) {
function groceryItemUsage(item) {
  const itemKey = item?.key || "";
  const dishKeys = new Set(
    (state.snapshot.dishes || [])
      .filter((dish) => (dish.components || []).some((component) => {
        const componentKey = component.key || component.item_key;
        return itemKey ? componentKey === itemKey : component.name === item.name;
      }))
      .map((dish) => dish.key),
  );
  const directIngredientKeys = new Set(
    itemKey
      ? [itemKey]
      : (state.snapshot.item_options || [])
        .filter((option) => option.kind === "ingredient" && option.name === item.name)
        .map((option) => option.key),
  );
  const itemNames = new Map((state.snapshot.item_options || [])
    .map((option) => [option.key, option.name]));
  return (state.draft || [])
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => dishKeys.has(row.item_key) || directIngredientKeys.has(row.item_key))
    .map(({ row, index }) => ({
      index,
      name: itemNames.get(row.item_key) || row.item_key,
      context: menuUsageContext(row, state.snapshot.people),
      direct: directIngredientKeys.has(row.item_key),
    }));
}

function ensureCatalogueDishUsageSection() {
  let section = select("#grocery-details-library-usages");
  if (section) return section;
  select("#grocery-details-usages").insertAdjacentHTML("afterend", `
    <section id="grocery-details-library-usages" hidden>
      <h3 id="grocery-details-library-title"></h3>
      <div id="grocery-details-library-list" class="grocery-details-list"></div>
    </section>`);
  return select("#grocery-details-library-usages");
}

function renderCatalogueDishUsage(item) {
  const section = ensureCatalogueDishUsageSection();
  const dishes = item?.key
    ? dishesUsingIngredient(item.key, state.snapshot.dishes || [])
    : [];
  select("#grocery-details-library-title").textContent =
    `${translate("recipes_eyebrow")} · ${translate("nav_dishes")}: ${formatNumber(dishes.length, 0)}`;
  select("#grocery-details-library-list").innerHTML = dishes.map((dish) => {
    const context = [
      dish.source || "",
      dish.servings ? `${formatNumber(dish.servings, 0)} ${translate("servings")}` : "",
    ].filter(Boolean).join(" · ");
    return `<article class="grocery-usage">
      <strong>${escapeHtml(dish.name)}</strong>
      ${context ? `<small>${escapeHtml(context)}</small>` : ""}
    </article>`;
  }).join("");
  section.hidden = dishes.length === 0;
}

function detailValue(value, suffix = "") {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return null;
  return `${formatNumber(value, 2)}${suffix}`;
}

function detailFields(rows, itemKey = "") {
  return `<dl class="item-detail-fields">${rows.map(([label, value, raw = false, field = ""]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      ${value == null || value === ""
        ? field && itemKey
          ? `<dd><button class="item-detail-missing item-detail-missing-button" type="button" data-missing-value-field="${escapeHtml(field)}" data-missing-value-item="${escapeHtml(encodeURIComponent(itemKey))}"><span aria-hidden="true">!</span>${escapeHtml(translate("not_available"))}<small>${escapeHtml(translate("click_to_propose"))}</small></button></dd>`
          : `<dd class="item-detail-missing"><span aria-hidden="true">!</span>${escapeHtml(translate("not_available"))}</dd>`
        : `<dd>${raw ? value : escapeHtml(value)}</dd>`}
    </div>
  `).join("")}</dl>`;
}

function ingredientAllergensMarkup(allergens = []) {
  if (!allergens.length) return null;
  return `<span class="item-detail-allergens">${ingredientAllergenBadges(
    allergens,
    state.language,
    escapeHtml,
  )}</span>`;
}

function ingredientStockPresentation(itemKey) {
  const option = (state.snapshot?.stock_options || [])
    .find((item) => item.item_key === itemKey && !item.household);
  if (!option) return null;
  const stock = state.stockDraft.find((row) => row.item_key === itemKey && !row.household);
  const gramsPerUnit = Number(option.grams_per_measure_unit || 1);
  const grams = stock
    ? Number(stock.quantity) * (stock.quantity_unit === "unit" ? gramsPerUnit : 1)
    : 0;
  return { option, grams, gramsPerUnit };
}

function ingredientStockDetailMarkup(ingredient) {
  const presentation = ingredientStockPresentation(ingredient.key);
  if (!presentation) return "";
  const { option, grams, gramsPerUnit } = presentation;
  const equivalent = option.measure_unit !== "g"
    ? translatedTemplate("stock_unit_equivalent", {
      quantity: formatNumber(grams / gramsPerUnit, 2),
      unit: option.measure_unit,
    })
    : translate(grams > 0 ? "stock_available" : "stock_empty_for_item");
  return `<section class="ingredient-detail-stock" data-ingredient-stock-detail="${escapeHtml(encodeURIComponent(ingredient.key))}">
    <h3>${escapeHtml(translate("ingredient_stock_title"))}</h3>
    <div class="ingredient-stock-detail-card">
      <div class="ingredient-stock-current">
        <span>${escapeHtml(translate("current_stock"))}</span>
        <strong>${escapeHtml(`${formatNumber(grams, 1)} g`)}</strong>
        <small>${escapeHtml(equivalent)}</small>
      </div>
      <label class="dialog-field">
        <span>${escapeHtml(translate("quantity_to_add"))}</span>
        <input type="number" min="0.000000001" step="any" value="1" data-detail-stock-quantity>
      </label>
      <label class="dialog-field">
        <span>${escapeHtml(translate("unit"))}</span>
        <select data-detail-stock-unit>
          <option value="g">g</option>
          ${option.measure_unit === "g" ? "" : `<option value="unit" selected>${escapeHtml(option.measure_unit)}</option>`}
        </select>
      </label>
      <button class="button primary compact" type="button" data-detail-stock-add>${escapeHtml(translate("add_to_stock"))}</button>
      <button class="button ghost compact" type="button" data-detail-stock-purchase>${escapeHtml(translate("add_purchase_unit"))}</button>
      <p class="ingredient-stock-feedback" data-detail-stock-feedback role="status"></p>
    </div>
  </section>`;
}

function refreshIngredientDetailStock(ingredient, message = "") {
  const current = [...select("#grocery-details-information")
    .querySelectorAll("[data-ingredient-stock-detail]")]
    .find((section) => decodeURIComponent(section.dataset.ingredientStockDetail) === ingredient.key);
  if (!current) return;
  current.outerHTML = ingredientStockDetailMarkup(ingredient);
  const refreshed = [...select("#grocery-details-information")
    .querySelectorAll("[data-ingredient-stock-detail]")]
    .find((section) => decodeURIComponent(section.dataset.ingredientStockDetail) === ingredient.key);
  const feedback = refreshed?.querySelector("[data-detail-stock-feedback]");
  if (feedback) feedback.textContent = message;
}

function priceHistoryMarkup(items) {
  const history = combinedPriceHistory(items);
  const chart = priceChartGeometry(history);
  if (!history.length) {
    return `<p class="grocery-usage-empty">${escapeHtml(translate("no_price_history"))}</p>`;
  }
  const dateLabel = (value) => value || translate("unknown");
  return `
    <p class="price-history-basis-note">${escapeHtml(translate("price_history_purchase_unit_note"))}</p>
    <div class="price-history-chart">
      <svg viewBox="0 0 640 220" role="img" aria-label="${escapeHtml(translate("price_history_chart"))}">
        <line x1="42" y1="18" x2="42" y2="186"></line>
        <line x1="42" y1="186" x2="622" y2="186"></line>
        <text x="4" y="23">${escapeHtml(formatMoney(chart.maxPrice))}</text>
        <text x="4" y="188">${escapeHtml(formatMoney(chart.minPrice))}</text>
        ${chart.path ? `<path d="${chart.path}"></path>` : ""}
        ${chart.points.map((point) => `
          <circle cx="${point.x}" cy="${point.y}" r="5">
            <title>${escapeHtml(`${dateLabel(point.date)} · ${formatMoney(point.price)} · ${point.description}`)}</title>
          </circle>
        `).join("")}
        <text class="price-chart-date" x="42" y="211">${escapeHtml(dateLabel(history[0].date))}</text>
        <text class="price-chart-date end" x="622" y="211">${escapeHtml(dateLabel(history.at(-1).date))}</text>
      </svg>
    </div>
    <ol class="price-history-list">
      ${[...history].reverse().map((row) => `
        <li>
          <strong>${escapeHtml(formatMoney(row.price))}</strong>
          <span>${escapeHtml(dateLabel(row.date))}</span>
          <small>${escapeHtml(row.description || translate("not_available"))}</small>
        </li>
      `).join("")}
    </ol>`;
}

function itemInformationMarkup(items, groceryItem) {
  const item = items[0];
  if (!item) {
    return `<p class="grocery-usage-empty">${escapeHtml(translate("item_details_unavailable"))}</p>`;
  }
  const food = Object.hasOwn(item, "kcal");
  const sourceUrl = externalHttpUrl(item.url);
  const groceryFields = groceryItem ? detailFields([
    [translate("total_need"), groceryItem.needed_quantity_text],
    [translate("in_stock"), groceryItem.stock_quantity_text || formatNumber(0)],
    [translate("buy"), groceryItem.purchase_quantity_text || translate("stock_enough")],
    [translate("estimated_total"), formatMoney(groceryItem.estimated_purchase_price)],
  ]) : "";
  const identity = detailFields([
    [translate("item_identifier"), item.key],
    [translate("item_type"), translate(food ? "food_item" : "general_item")],
    [translate("category"), displayCategory(item.category), false, food ? "category" : ""],
    [translate("measure_unit_name"), item.measure_unit],
    [translate("description_status"), food
      ? translate(item.incomplete ? "ingredient_incomplete" : "ingredient_complete")
      : translate("ingredient_complete")],
    ...(food ? [[translate("allergens"), ingredientAllergensMarkup(item.allergens), true]] : []),
  ], food ? item.key : "");
  const nutrition = food ? detailFields([
    [translate("nutrition_reference_grams"), detailValue(item.grams, " g")],
    [translate("kcal_for_reference"), detailValue(item.kcal)],
    [translate("protein_grams"), detailValue(item.protein_g, " g")],
    [translate("carbs_grams"), detailValue(item.carbs_g, " g")],
    [translate("fat_grams"), detailValue(item.fat_g, " g")],
    [translate("fiber_grams"), detailValue(item.fiber_g, " g")],
    [translate("sugars_grams"), detailValue(item.sugars_g, " g"), false, "sugars_g"],
    [translate("saturated_fat_grams"), detailValue(item.saturated_fat_g, " g"), false, "saturated_fat_g"],
    [translate("salt_grams"), detailValue(item.salt_g, " g"), false, "salt_g"],
    [translate("fruit_vegetable_legume_percent"), detailValue(item.fruit_vegetable_legume_percent, " %"), false, "fruit_vegetable_legume_percent"],
  ], item.key) : "";
  const source = food ? detailFields([
    [translate("source"), item.source, false, "source"],
    [translate("source_url"), sourceUrl
      ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>`
      : item.url ? escapeHtml(item.url) : null, true, "url"],
  ], item.key) : "";
  const purchase = food ? detailFields([
    [translate("grams_per_unit"), detailValue(item.grams_per_measure_unit, " g")],
    [translate("purchase_unit"), item.purchase_unit],
    [translate("purchase_quantity"), detailValue(item.purchase_quantity, ` ${item.purchase_quantity_unit}`)],
    [translate("price_basis"), translate(item.price_basis === "kg" ? "price_basis_kg" : "price_basis_purchase_unit")],
    [translate("price"), formatMoney(item.price)],
    [translate("price_per_kg"), formatMoney(item.price_basis === "kg"
      ? item.price
      : item.price * 1000 / ingredientPurchaseGrams(item))],
    [translate("estimated_purchase_price"), formatMoney(ingredientPurchasePrice(item))],
    [translate("price_checked_at"), item.price_checked_at, false, "price_checked_at"],
    [translate("price_source"), item.price_source, false, "price_source"],
  ], item.key) : detailFields([
    [translate("purchase_unit"), item.purchase_unit],
    [translate("purchase_quantity"), detailValue(item.purchase_quantity)],
    [translate("unit_price"), formatMoney(item.estimated_price)],
    [translate("last_bought_at"), item.last_bought_at],
    [translate("lasting_days"), detailValue(item.lasting_days)],
    [translate("notes"), item.notes],
  ]);
  return `
    ${groceryItem ? `<section><h3>${escapeHtml(translate("grocery_list"))}</h3>${groceryFields}</section>` : ""}
    <section><h3>${escapeHtml(translate("item_identity_title"))}</h3>${identity}</section>
    ${food ? ingredientStockDetailMarkup(item) : ""}
    ${food ? `<section><h3>${escapeHtml(translate("ingredient_nutrition_title"))}</h3>${nutrition}</section>` : ""}
    ${food ? `<section><h3>${escapeHtml(translate("ingredient_sources_title"))}</h3>${source}</section>` : ""}
    <section><h3>${escapeHtml(translate("ingredient_purchase_title"))}</h3>${purchase}</section>
    <section class="price-history-section">
      <h3>${escapeHtml(translate("price_history"))}</h3>
      ${priceHistoryMarkup(items)}
    </section>`;
}

function openItemDetails(items, groceryItem = null) {
  const item = items[0];
  if (!item && !groceryItem) return;
  const usageItem = groceryItem || item;
  const usages = groceryItemUsage(usageItem);
  select("#grocery-details-title").textContent = item?.name || groceryItem.name;
  select("#grocery-details-information").innerHTML = itemInformationMarkup(items, groceryItem);
  const editButton = select("#grocery-details-edit");
  editButton.hidden = !item;
  editButton.dataset.itemKey = item ? encodeURIComponent(item.key) : "";
  editButton.dataset.itemKind = item
    ? (Object.hasOwn(item, "kcal") ? "food" : "general")
    : "";
  select("#grocery-details-list").innerHTML = usages.map((usage) => `
      <article class="grocery-usage ${usage.direct ? "direct" : ""}">
        <strong>${escapeHtml(usage.name)}</strong>
        <small>${escapeHtml(usage.context)}${usage.direct ? ` · ${escapeHtml(translate("direct_menu_use"))}` : ""}</small>
        <div class="grocery-usage-actions">
          <button class="button danger" type="button" data-grocery-meal-delete="${usage.index}">${escapeHtml(translate("delete"))}</button>
          <button class="button ghost" type="button" data-grocery-meal-replace="${usage.index}">${escapeHtml(translate("replace"))}</button>
        </div>
      </article>
    `).join("") || `<p class="grocery-usage-empty">${escapeHtml(translate("no_linked_dishes"))}</p>`;
  select("#grocery-details-usages").hidden = !usages.length;
  renderCatalogueDishUsage(item && Object.hasOwn(item, "kcal") ? item : null);
  const dialog = select("#grocery-details-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  select("#grocery-details-close").focus();
}

function openGroceryDetails(itemId) {
  const groceryItem = state.snapshot.grocery_plan.items
    .find((candidate) => candidate.id === itemId);
  if (!groceryItem) return;
  openItemDetails(catalogItemsForGrocery(state.snapshot, groceryItem), groceryItem);
}

function openCatalogueItemDetails(key, kind) {
  const items = kind === "food"
    ? (state.snapshot.ingredients || []).filter((item) => item.key === key)
    : (state.snapshot.household_items || []).filter((item) => item.key === key);
  openItemDetails(items);
}

function closeGroceryDetails() {
  const dialog = select("#grocery-details-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function openMissingValueDialog(itemKey, field) {
  const config = EDITABLE_DETAIL_FIELDS[field];
  if (!config) return;
  const ingredient = (state.snapshot?.ingredients || [])
    .find((item) => item.key === itemKey);
  if (!ingredient) return;
  state.pendingMissingValue = { itemKey, field };
  const label = translate(config.label);
  select("#missing-value-context").textContent = ingredient.name;
  select("#missing-value-label").textContent = label;
  select("#missing-value-reference").textContent = config.reference === "percent"
    ? translate("value_reference_percent")
    : config.reference === "nutrition"
      ? translatedTemplate("value_reference_grams", { grams: formatNumber(ingredient.grams, 2) })
      : translate("value_reference_general");
  const input = select("#missing-value-input");
  input.type = config.kind === "number" ? "number" : "text";
  input.min = config.kind === "number" ? "0" : "";
  input.max = field === "fruit_vegetable_legume_percent" ? "100" : "";
  input.step = config.kind === "number" ? "any" : "";
  input.inputMode = config.inputMode || "";
  input.placeholder = config.placeholder ? translate(config.placeholder) : "";
  input.value = ingredient[field] ?? "";
  select("#missing-value-source").value = ingredient.source || "";
  select("#missing-value-url").value = ingredient.url || "";
  select("#missing-value-source-field").hidden = field === "source";
  select("#missing-value-url-field").hidden = field === "url";
  select("#missing-value-error").textContent = "";
  closeGroceryDetails();
  const dialog = select("#missing-value-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  select("#missing-value-input").focus();
}

function closeMissingValueDialog() {
  state.pendingMissingValue = null;
  const dialog = select("#missing-value-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

  function mount() {
select("#grocery-details-list").addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-grocery-meal-delete]");
  if (deleteButton) {
    const index = Number(deleteButton.dataset.groceryMealDelete);
    const row = state.draft[index];
    if (!row) return;
    const item = state.snapshot.item_options.find((option) => option.key === row.item_key);
    closeGroceryDetails();
    openConfirmation({
      title: translate("delete_meal_confirm_title"),
      message: translatedTemplate("delete_meal_confirm_message", {
        name: item?.name || row.item_key,
        context: `${row.day} · ${row.meal}`,
      }),
      confirmLabel: translate("delete"),
      action: () => {
        state.draft.splice(index, 1);
        renderMenu();
        scheduleMenuUpdate();
      },
    });
    return;
  }
  const replaceButton = event.target.closest("[data-grocery-meal-replace]");
  if (replaceButton) {
    const index = Number(replaceButton.dataset.groceryMealReplace);
    closeGroceryDetails();
    openMealReplacement(index);
  }
});
select("#grocery-details-close").addEventListener("click", closeGroceryDetails);
select("#grocery-details-done").addEventListener("click", closeGroceryDetails);
select("#grocery-details-information").addEventListener("click", (event) => {
  const stockAction = event.target.closest("[data-detail-stock-add], [data-detail-stock-purchase]");
  if (stockAction) {
    const section = stockAction.closest("[data-ingredient-stock-detail]");
    const itemKey = decodeURIComponent(section?.dataset.ingredientStockDetail || "");
    const ingredient = (state.snapshot?.ingredients || [])
      .find((item) => item.key === itemKey);
    if (!ingredient) return;
    const purchase = stockAction.hasAttribute("data-detail-stock-purchase");
    const quantity = purchase
      ? Number(ingredient.purchase_quantity)
      : Number(section.querySelector("[data-detail-stock-quantity]").value);
    const unit = purchase
      ? (ingredient.purchase_quantity_unit === "g" ? "g" : "unit")
      : section.querySelector("[data-detail-stock-unit]").value;
    if (!addStockQuantity(ingredient.key, quantity, unit)) return;
    renderStock();
    refreshIngredientDetailStock(
      ingredient,
      purchase
        ? translatedTemplate("purchase_unit_added", { unit: ingredient.purchase_unit })
        : translate("stock_added"),
    );
    scheduleStockUpdate();
    return;
  }
  const button = event.target.closest("[data-missing-value-field]");
  if (!button) return;
  openMissingValueDialog(
    decodeURIComponent(button.dataset.missingValueItem),
    button.dataset.missingValueField,
  );
});
select("#missing-value-close").addEventListener("click", closeMissingValueDialog);
select("#missing-value-cancel").addEventListener("click", closeMissingValueDialog);
select("#missing-value-dialog").addEventListener("close", () => {
  state.pendingMissingValue = null;
});
select("#missing-value-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const pending = state.pendingMissingValue;
  const config = EDITABLE_DETAIL_FIELDS[pending?.field];
  const rawValue = select("#missing-value-input").value.trim();
  const value = config?.kind === "number" ? Number(rawValue) : rawValue;
  const ingredient = (state.snapshot?.ingredients || [])
    .find((item) => item.key === pending?.itemKey);
  const valid = ingredient
    && config
    && (config.kind === "number"
      ? Number.isFinite(value)
        && value >= 0
        && (pending.field !== "fruit_vegetable_legume_percent" || value <= 100)
      : Boolean(value));
  if (!valid) {
    select("#missing-value-error").textContent = translate("invalid_missing_value");
    return;
  }
  const updated = structuredClone(ingredient);
  updated[pending.field] = pending.field === "category" ? normalizedCategory(value) : value;
  if (pending.field !== "source") updated.source = select("#missing-value-source").value.trim();
  if (pending.field !== "url") updated.url = select("#missing-value-url").value.trim();
  closeMissingValueDialog();
  send("replace-ingredient", { ingredient: updated });
});
select("#grocery-details-edit").addEventListener("click", (event) => {
  const button = event.currentTarget;
  if (!button.dataset.itemKey || !button.dataset.itemKind) return;
  const kind = button.dataset.itemKind;
  const key = decodeURIComponent(button.dataset.itemKey);
  closeGroceryDetails();
  state.itemCatalogueTab = kind === "food" ? "food" : "other";
  storage.setItem("homealacarte-item-catalogue-tab", state.itemCatalogueTab);
  switchTab("items");
  renderItemsCatalogue();
  openItemEditor(key, kind);
});
  }

  return {
    close: closeGroceryDetails,
    mount,
    openCatalogue: openCatalogueItemDetails,
    openGrocery: openGroceryDetails,
  };
}

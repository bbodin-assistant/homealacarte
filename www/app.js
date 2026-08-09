import {
  deletePrivateData,
  getStorageStatus,
  getStorageDiagnostics,
  getPrivateStateCopy,
  loadPrivacyRequests,
  loadPrivateState,
  onStorageStatus,
  resolveSyncConflict,
  savePrivateState,
  signIn,
  signOut,
  signUp,
  submitPrivacyRequest,
  synchronizePrivateState,
} from "./storage.js?v=homealacarte-77";
import { t, translations } from "./translations.js?v=homealacarte-77";
import { buildScheduledDishRow } from "./dish-scheduling.js?v=homealacarte-77";
import { mergeCompatibleMenuRows } from "./menu-rows.js?v=homealacarte-77";
import {
  loadBundledDefaults,
  mergeBundledDishClassifications,
  mergeBundledIngredientNutrition,
  mergeDuplicateIngredient,
  mergeBundledFoodRules,
} from "./profile-rules.js?v=homealacarte-77";
import { createStockFeature } from "./features/stock.js?v=homealacarte-77";
import { createExtraNeedsFeature } from "./features/extra-needs.js?v=homealacarte-77";
import { createGroceryFeature } from "./features/grocery.js?v=homealacarte-77";
import { createDishesFeature } from "./features/dishes.js?v=homealacarte-77";
import { createAutoMenuFeature } from "./features/auto-menu.js?v=homealacarte-77";
import { createItemDetailsFeature } from "./features/item-details.js?v=homealacarte-77";
import { createDishEditorFeature } from "./features/dish-editor.js?v=homealacarte-77";
import { createCatalogueFeature } from "./features/catalogue.js?v=homealacarte-77";
import { createFamilyFeature } from "./features/family.js?v=homealacarte-77";
import {
  createFormatters,
  displayCategory,
  escapeHtml,
  externalHttpUrl,
  formatInputNumber,
  normalizedCategory,
  options,
} from "./core/format.js?v=homealacarte-77";
import { createSearchableSelect } from "./core/searchable-select.js?v=homealacarte-77";
import { buildZip, downloadBytes, downloadText } from "./core/downloads.js?v=homealacarte-77";
import { createThemeController } from "./core/theme.js?v=homealacarte-77";
import { createAppState } from "./core/app-state.js?v=homealacarte-77";
import { createWorkerClient } from "./core/worker-client.js?v=homealacarte-77";

document.documentElement.dataset.appModuleLoaded = "true";

const STORAGE_PREFIX = "homealacarte-";
const DATA_SCHEMA_VERSION = 10;
const FOOD_RULE_MIGRATION_VERSIONS = [6, 7];
const INGREDIENT_MIGRATION_VERSIONS = [6, 7, 8];
const NUTRITION_MIGRATION_VERSIONS = [6, 7, 8, 9];
const EMPTY_DATABASE_CONTENT = `${JSON.stringify({
  items: [],
  dishes: [],
  people: [],
  menu: [],
  stock: [],
  extra_needs: [],
}, null, 2)}\n`;
const worker = new Worker("./worker.js?v=homealacarte-77", { type: "module" });
const state = createAppState(localStorage, getStorageStatus);
const themeController = createThemeController(state, localStorage, document.documentElement.style);
const applyColorTheme = themeController.apply;
const randomizeColorTheme = themeController.randomize;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const {
  formatBytes,
  formatDateTime,
  formatMoney,
  formatNumber,
  translatedTemplate,
} = createFormatters(
  () => state.language,
  (key) => t(state.language, key),
);
const searchableSelect = createSearchableSelect({
  getLanguage: () => state.language,
  translate: (key) => t(state.language, key),
  escapeHtml,
});
const enhanceSearchableSelect = searchableSelect.enhance;
const searchableSelectInput = searchableSelect.inputFor;
const setSearchableSelectHidden = searchableSelect.setHidden;
const optionalInputNumber = (selector) => {
  const value = $(selector).value;
  return value === "" ? null : Number(value);
};
const NUTRI_SCORE_FIELDS = [
  "sugars_g",
  "saturated_fat_g",
  "salt_g",
  "fruit_vegetable_legume_percent",
];
const ingredientNutriScoreMissing = (ingredient) =>
  NUTRI_SCORE_FIELDS.filter((field) => ingredient[field] == null).length;

function dishNutriScoreDetail(dish) {
  if (dish.nutri_score_computed) {
    return translatedTemplate("nutri_score_computed_detail", {
      value: dish.nutri_score_value,
    });
  }
  return translatedTemplate(
    dish.nutri_score ? "nutri_score_manual_detail" : "nutri_score_unavailable_detail",
    {
      values: dish.nutri_score_missing_values,
      ingredients: dish.nutri_score_missing_ingredients,
    },
  );
}


function setBusy(busy, message = "") {
  const status = $("#status");
  status.classList.toggle("ready", !busy);
  const busyMessage = message || t(state.language, "loading");
  if (busy) status.lastElementChild.textContent = busyMessage;
  state.engineBusy = busy;
  state.engineMessage = busy ? busyMessage : "";
  renderHeaderStatus();
  const saveState = $("#save-state");
  if (saveState) saveState.textContent = busy ? t(state.language, "saving") : t(state.language, "saved");
  $$("#grocery-grid input[data-id]").forEach((input) => {
    input.disabled = busy;
  });
}

function localizeError(message, code = "") {
  if (code && translations[state.language]?.[code]) return t(state.language, code);
  const rawMessage = String(message || "");
  if (translations[state.language]?.[rawMessage]) return t(state.language, rawMessage);
  const prefixedKey = rawMessage.match(/^([a-z0-9_]+)(?::|$)/)?.[1];
  if (prefixedKey && translations[state.language]?.[prefixedKey]) {
    return t(state.language, prefixedKey);
  }
  const failedAsset = rawMessage.match(/Cannot load\s+(.+)/i);
  if (failedAsset) {
    return translatedTemplate("asset_load_error", { path: failedAsset[1] });
  }
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(rawMessage)) {
    return t(state.language, "network_error");
  }
  if (/script error|module script|worker/i.test(rawMessage)) {
    return t(state.language, "worker_error");
  }
  if (/account deletion is (?:already )?pending/i.test(rawMessage)) {
    return t(state.language, "delete_data_already_pending");
  }
  if (/account not found/i.test(rawMessage)) {
    return t(state.language, "delete_data_account_not_found");
  }
  return rawMessage;
}

function showError(message, code = "") {
  state.lastError = { message, code };
  const panel = $("#error-panel");
  panel.textContent = localizeError(message, code);
  panel.title = String(message || code || "");
  panel.hidden = false;
  setBusy(false);
}

function clearError() {
  state.lastError = null;
  $("#error-panel").hidden = true;
  renderStorageStatus(state.storageStatus);
}

async function handleWorkerMessage(data) {
  if (typeof data.serializedData === "string") state.serializedData = data.serializedData;
  if (data.type === "status") {
    setBusy(true, data.code ? t(state.language, data.code) : data.message);
    return;
  }
  if (data.type === "error") {
    if (state.pendingDataAction?.requestId === data.requestId) state.pendingDataAction = null;
    showError(data.message, data.code);
    return;
  }
  if (data.type === "export-ready") {
    downloadText(data.filename, data.content);
    if (data.snapshot) {
      state.snapshot = data.snapshot;
      state.familyDraft = structuredClone(data.snapshot.people);
      state.draft = structuredClone(data.snapshot.planner);
      state.stockDraft = structuredClone(data.snapshot.stock);
      state.customDraft = structuredClone(data.snapshot.custom_grocery);
      persistDraft();
      render();
    }
    setBusy(false);
    return;
  }
  if (data.type === "folder-export-ready") {
    try {
      downloadBytes(
        "homealacarte_data.zip",
        buildZip(data.files),
        "application/zip",
      );
      if (data.snapshot) {
        state.snapshot = data.snapshot;
        state.familyDraft = structuredClone(data.snapshot.people);
        state.draft = structuredClone(data.snapshot.planner);
        state.stockDraft = structuredClone(data.snapshot.stock);
        state.customDraft = structuredClone(data.snapshot.custom_grocery);
        persistDraft();
        render();
      }
      setBusy(false, t(state.language, "folder_exported"));
    } catch (error) {
      showError(error?.message || String(error));
    }
    return;
  }
  if (data.type === "pdf-ready") {
    const url = URL.createObjectURL(new Blob([data.bytes], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = data.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (data.snapshot) {
      state.snapshot = data.snapshot;
      state.familyDraft = structuredClone(data.snapshot.people);
      state.draft = structuredClone(data.snapshot.planner);
      state.stockDraft = structuredClone(data.snapshot.stock);
      state.customDraft = structuredClone(data.snapshot.custom_grocery);
      persistDraft();
      render();
    }
    setBusy(false);
    return;
  }
  if (data.type === "menu-generated") {
    clearError();
    state.autoMenuProposal = data.proposal;
    renderAutoMenuResult();
    setBusy(false);
    return;
  }
  if (data.snapshot) {
    clearError();
    state.snapshot = data.snapshot;
    state.language = data.snapshot.language;
    state.familyDraft = structuredClone(data.snapshot.people);
    state.draft = structuredClone(data.snapshot.planner);
    state.stockDraft = structuredClone(data.snapshot.stock);
    state.customDraft = structuredClone(data.snapshot.custom_grocery);
    if (data.source) state.source = data.source;
    if (state.restorePeople) {
      const bundledPeople = new Map(
        state.snapshot.people.map((person) => [person.key, person]),
      );
      const rows = state.restorePeople.map((person) => ({
        ...person,
        description: person.description
          || bundledPeople.get(person.key)?.description
          || "",
      }));
      state.restorePeople = null;
      send("replace-people", { rows });
      return;
    }
    if (state.restoreMenu) {
      const rows = state.restoreMenu;
      state.restoreMenu = null;
      send("replace-menu", { rows });
      return;
    }
    if (state.restoreStock) {
      const rows = state.restoreStock;
      state.restoreStock = null;
      send("replace-stock", { rows });
      return;
    }
    if (state.restoreCustom) {
      const rows = state.restoreCustom;
      state.restoreCustom = null;
      send("replace-custom-grocery", { rows });
      return;
    }
    persistDraft();
    render();
    setBusy(false);
    if (state.pendingDataAction?.requestId === data.requestId) {
      const message = $("#data-action-message");
      message.classList.remove("warning");
      message.textContent = t(state.language, state.pendingDataAction.messageKey);
      state.pendingDataAction = null;
    }
  }
}

const workerClient = createWorkerClient({
  worker,
  state,
  setBusy,
  handleMessage: handleWorkerMessage,
  handleError: showError,
});
const send = workerClient.send;

function applyTranslations() {
  document.documentElement.lang = state.language;
  $("#language-select").value = state.language;
  $$("[data-i18n]").forEach((node) => {
    node.textContent = t(state.language, node.dataset.i18n);
  });
  $$("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(state.language, node.dataset.i18nPlaceholder);
  });
  $$("[data-i18n-title]").forEach((node) => {
    node.title = t(state.language, node.dataset.i18nTitle);
  });
  renderStorageStatus(state.storageStatus);
}

function setGroceryMode(mode) {
  const safeMode = ["list", "stock", "needs"].includes(mode) ? mode : "list";
  state.groceryMode = safeMode;
  $$("[data-grocery-mode]").forEach((button) => {
    const active = button.dataset.groceryMode === safeMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$("[data-grocery-panel]").forEach((panel) => {
    const active = panel.dataset.groceryPanel === safeMode;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function setMenuMode(mode) {
  const safeMode = mode === "automatic" ? "automatic" : "manual";
  state.menuMode = safeMode;
  localStorage.setItem("homealacarte-menu-mode", safeMode);
  $$('[data-menu-mode]').forEach((button) => {
    const active = button.dataset.menuMode === safeMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$('[data-menu-panel]').forEach((panel) => {
    const active = panel.dataset.menuPanel === safeMode;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function render() {
  if (!state.snapshot) return;
  applyTranslations();
  setMenuMode(state.menuMode);
  setGroceryMode(state.groceryMode);
  renderFamily();
  renderMenu();
  renderAutoMenu();
  renderGrocery();
  renderCustomGrocery();
  renderStock();
  renderGroceryModeCounts();
  configureDishRanges();
  renderDishes();
  renderItemsCatalogue();
  if (state.activeTab === "data") renderDataOverview();
}

function setCountBadge(selector, count) {
  const badge = $(selector);
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function renderGroceryModeCounts() {
  const remaining = state.snapshot.grocery_plan.items
    .filter((item) => !item.stock_sufficient).length;
  $("#grocery-count").textContent = String(remaining);
  $("#grocery-count").hidden = remaining === 0;
  setCountBadge("#grocery-tab-count", remaining);
  setCountBadge("#stock-tab-count", state.stockDraft.length);
  setCountBadge("#needs-tab-count", state.customDraft.length);
}

function renderSummary() {
  const { counts, grocery_plan: grocery } = state.snapshot;
  const cards = [
    [counts.ingredients, t(state.language, "ingredients")],
    [counts.dishes, t(state.language, "dishes")],
    [counts.menu, t(state.language, "meals")],
    [grocery.items.length, t(state.language, "grocery_items")],
  ];
  $("#summary-cards").innerHTML = cards.map(([value, label]) =>
    `<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`,
  ).join("");
}

function itemOptions(selected, excluded = "") {
  const groups = [
    ["dish", t(state.language, "dishes")],
    ["ingredient", t(state.language, "ingredients")],
  ];
  return groups.map(([kind, label]) => {
    const rows = state.snapshot.item_options
      .filter((item) => item.kind === kind && item.key !== excluded)
      .map((item) => `<option value="${escapeHtml(item.key)}" ${item.key === selected ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
      .join("");
    return `<optgroup label="${escapeHtml(label)}">${rows}</optgroup>`;
  }).join("");
}

function peopleEditor(row) {
  const names = new Map(state.snapshot.people.map((person) => [person.key, person.name]));
  const selected = new Set(row.people);
  const chips = row.people.map((key) => `
    <span class="person-chip">
      ${escapeHtml(names.get(key) || key)}
      <button type="button" class="remove-person" data-person-key="${escapeHtml(key)}" ${row.people.length === 1 ? "disabled" : ""} aria-label="${escapeHtml(t(state.language, "remove_person"))}">×</button>
    </span>
  `).join("");
  const remaining = state.snapshot.people.filter((person) => !selected.has(person.key));
  const add = remaining.length ? `
    <label class="person-add" title="${escapeHtml(t(state.language, "add_person"))}">
      <span>+</span>
      <select class="person-add-select" aria-label="${escapeHtml(t(state.language, "add_person"))}">
        <option value="">+</option>
        ${remaining.map((person) => `<option value="${escapeHtml(person.key)}">${escapeHtml(person.name)}</option>`).join("")}
      </select>
    </label>
  ` : "";
  return `<div class="people-editor">${chips}${add}</div>`;
}

function openConfirmation({ title, message, confirmLabel, action }) {
  state.pendingConfirmation = action;
  $("#confirm-dialog-title").textContent = title;
  $("#confirm-dialog-message").textContent = message;
  $("#confirm-dialog-accept").textContent = confirmLabel;
  const dialog = $("#confirm-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  $("#confirm-dialog-cancel").focus();
}

function closeConfirmation() {
  state.pendingConfirmation = null;
  const dialog = $("#confirm-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function openMealReplacement(index) {
  const row = state.draft[index];
  if (!row) return;
  const current = state.snapshot.item_options.find((item) => item.key === row.item_key);
  state.pendingReplacementIndex = index;
  $("#meal-replace-context").textContent =
    `${current?.name || row.item_key} · ${row.day} · ${row.meal}`;
  $("#meal-replace-select").innerHTML = itemOptions("", row.item_key);
  const search = enhanceSearchableSelect(
    $("#meal-replace-select"),
    t(state.language, "search_items"),
  );
  const dialog = $("#meal-replace-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  search?.focus();
}

function closeMealReplacement() {
  state.pendingReplacementIndex = null;
  const dialog = $("#meal-replace-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function renderMenu() {
  state.draft = mergeCompatibleMenuRows(state.draft);
  const profileSelect = $("#profile-select");
  const peopleNames = new Map(state.snapshot.people.map((person) => [person.key, person.name]));
  const itemNames = new Map(state.snapshot.item_options.map((item) => [item.key, item.name]));
  const dishes = new Map(state.snapshot.dishes.map((dish) => [dish.key, dish]));
  profileSelect.innerHTML = state.snapshot.people
    .filter((person) => person.kcal_target != null)
    .map((person) => `<option value="${escapeHtml(person.key)}" ${person.key === state.snapshot.profile ? "selected" : ""}>${escapeHtml(person.name)}</option>`)
    .join("");
  $("#show-selected-only").checked = state.menuSelectedOnly;
  $("#empty-menu").disabled = state.draft.length === 0;
  const cells = new Map();
  state.draft.forEach((row, index) => {
    if (
      state.menuSelectedOnly
      && state.snapshot.profile
      && !row.people.includes(state.snapshot.profile)
    ) return;
    const key = `${row.meal}|${row.day}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ row, index });
  });
  const nutrition = new Map(state.snapshot.daily_nutrition.map((row) => [row.day, row.nutrients]));
  let html = `<thead><tr><th>${t(state.language, "meal")}</th>${state.snapshot.days.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}</tr></thead><tbody>`;
  for (const meal of state.snapshot.meals) {
    html += `<tr><td>${escapeHtml(meal)}</td>`;
    for (const day of state.snapshot.days) {
      const entries = cells.get(`${meal}|${day}`) || [];
      html += `<td data-menu-drop-day="${escapeHtml(day)}" data-menu-drop-meal="${escapeHtml(meal)}"><div class="menu-cell">
        <div class="menu-cell-entries">${entries.map(({ row, index }) => {
          const name = itemNames.get(row.item_key) || row.item_key;
          const dish = dishes.get(row.item_key);
          const detailsKey = dish?.key || row.item_key;
          const title = `<button type="button" class="menu-entry-dish" data-dish-key="${escapeHtml(encodeURIComponent(detailsKey))}" data-menu-index="${index}">${escapeHtml(name)}</button>`;
          return `<div class="menu-entry" draggable="true" data-menu-drag-index="${index}" title="${escapeHtml(t(state.language, "drag_to_move"))}">
              <button type="button" class="menu-entry-delete" data-index="${index}" title="${escapeHtml(t(state.language, "remove_menu_item"))}" aria-label="${escapeHtml(t(state.language, "remove_menu_item"))}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
              </button>
              <div>
                ${title}
                <span>${formatNumber(row.quantity)} ${escapeHtml(row.quantity_unit)} · ${escapeHtml(row.people.map((key) => peopleNames.get(key) || key).join(", "))}</span>
              </div>
            </div>`;
        }).join("")}</div>
        <div class="menu-drop-placeholder" aria-hidden="true">${escapeHtml(t(state.language, "drop_here"))}</div>
        <button type="button" class="menu-cell-add" data-day="${escapeHtml(day)}" data-meal="${escapeHtml(meal)}" aria-label="${escapeHtml(t(state.language, "add_menu_item"))}">
          <span aria-hidden="true">+</span>
        </button>
      </div></td>`;
    }
    html += "</tr>";
  }
  html += `<tr class="nutrition-row"><td>${t(state.language, "total_person")}</td>`;
  for (const day of state.snapshot.days) {
    const value = nutrition.get(day) || {};
    html += `<td><strong>${formatNumber(value.kcal, 0)} kcal</strong><span>${formatNumber(value.protein_g)} g P · ${formatNumber(value.carbs_g)} g G<br>${formatNumber(value.fat_g)} g L · ${formatNumber(value.fiber_g)} g F</span></td>`;
  }
  html += "</tr></tbody>";
  $("#weekly-menu").innerHTML = html;
}

function openDishDetails(dishKey, menuIndex) {
  const dish = state.snapshot.dishes.find((candidate) => candidate.key === dishKey);
  const row = Number.isInteger(menuIndex) ? state.draft[menuIndex] : null;
  const item = state.snapshot.item_options.find((candidate) => candidate.key === dishKey);
  if (!dish && !row) return;
  state.dishDetailsMenuIndex = row ? menuIndex : null;
  state.dishDetailsDishKey = dish?.key || null;
  state.dishDetailsOriginal = null;
  state.dishDetailsItemUnit = item?.measure_unit || "unit";
  state.dishDetailsScheduling = false;
  const peopleNames = new Map(state.snapshot.people.map((person) => [person.key, person.name]));
  const context = row
    ? [
      `${row.day} · ${row.meal}`,
      `${formatNumber(row.quantity)} ${row.quantity_unit}`,
      row.people.map((key) => peopleNames.get(key) || key).join(", "),
    ].filter(Boolean).join(" · ")
    : "";

  $("#dish-details-title").textContent = dish?.name || item?.name || dishKey;
  $("#dish-details-context").textContent = context;
  $("#dish-details-menu-note").textContent = row?.notes || "";
  $("#dish-details-menu-note").hidden = !row?.notes;
  $("#dish-menu-editor").hidden = !row;
  $("#dish-details-save").hidden = !row;
  $("#dish-details-schedule-cancel").hidden = true;
  $("#dish-details-schedule").hidden = Boolean(row) || !dish;
  $("#dish-details-edit").hidden = Boolean(row) || !dish;
  if (row) {
    $("#dish-menu-editor-title").textContent = t(state.language, "edit_menu_item");
    $("#dish-menu-editor-intro").textContent = t(state.language, "edit_menu_intro");
    $("#dish-details-save").textContent = t(state.language, "save_changes");
    $("#dish-menu-day").innerHTML = state.snapshot.days
      .map((day) => `<option value="${escapeHtml(day)}">${escapeHtml(day)}</option>`)
      .join("");
    $("#dish-menu-day").value = row.day;
    $("#dish-menu-meal").innerHTML = state.snapshot.meals
      .map((meal) => `<option value="${escapeHtml(meal)}">${escapeHtml(meal)}</option>`)
      .join("");
    $("#dish-menu-meal").value = row.meal;
    $("#dish-menu-quantity").value = formatInputNumber(row.quantity);
    $("#dish-menu-notes").value = row.notes || "";
    $("#dish-menu-unit").value = ["portion", "g", "unit"].includes(row.quantity_unit)
      ? row.quantity_unit
      : "portion";
    updateDishMenuUnitValue();
    $("#dish-menu-people").innerHTML = state.snapshot.people.map((person) => `
      <label class="dialog-person">
        <input type="checkbox" value="${escapeHtml(person.key)}" ${row.people.includes(person.key) ? "checked" : ""}>
        <span>${escapeHtml(person.name)}</span>
      </label>
    `).join("");
    $("#dish-menu-people-error").hidden = true;
    state.dishDetailsOriginal = dishMenuEditorSignature();
    updateDishMenuSaveState();
  }
  $("#dish-details-metrics").hidden = !dish;
  $("#dish-details-ingredients-section").hidden = !dish;
  if (dish) {
    const nutrients = dish.per_serving;
    const metrics = [
      [formatNumber(dish.servings), t(state.language, "servings")],
      [formatNumber(nutrients.kcal, 0), `kcal · ${t(state.language, "per_serving")}`],
      [`${formatNumber(nutrients.grams, 0)} g`, t(state.language, "per_serving")],
      [`${formatNumber(nutrients.protein_g)} g`, t(state.language, "protein")],
      [`${formatNumber(nutrients.carbs_g)} g`, t(state.language, "carbs")],
      [`${formatNumber(nutrients.fat_g)} g`, t(state.language, "fat")],
      [`${formatNumber(nutrients.fiber_g)} g`, t(state.language, "fiber")],
      [formatMoney(nutrients.cost), `${t(state.language, "cost")} · ${t(state.language, "per_serving")}`],
    ];
    if (dish.nutri_score) {
      metrics.splice(2, 0, [
        dish.nutri_score,
        "Nutri-Score",
      ]);
    }
    $("#dish-details-metrics").innerHTML = metrics.map(([value, label]) => `
      <div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>
    `).join("");
    $("#dish-details-nutri-status").textContent = dishNutriScoreDetail(dish);
    $("#dish-details-ingredients").innerHTML = dish.components.map((component) => `
      <li>
        <button class="dish-details-ingredient" type="button" data-dish-ingredient-details="${escapeHtml(encodeURIComponent(component.key))}">
          <span>
            <strong>${escapeHtml(component.name)}</strong>
            ${component.source_quantity ? `<small>${escapeHtml(component.source_quantity)}</small>` : ""}
          </span>
          <span>${formatNumber(component.quantity)} ${escapeHtml(component.quantity_unit)} · ${escapeHtml(t(state.language, "per_serving"))}</span>
        </button>
      </li>
    `).join("");
  }
  $("#dish-details-nutri-status").hidden = !dish;

  const sourceSection = $("#dish-details-source-section");
  const sourceNotes = dish?.source_notes || [];
  sourceSection.hidden = !dish || (!dish.source && !sourceNotes.length);
  $("#dish-details-source").textContent = dish?.source || "";
  $("#dish-details-source").hidden = !dish?.source;
  $("#dish-details-notes").innerHTML = sourceNotes
    .map((note) => `<p>${escapeHtml(note)}</p>`)
    .join("");

  const recipeUrl = externalHttpUrl(dish?.recipe_url);
  $("#dish-details-recipe").hidden = !dish;
  const recipeLink = $("#dish-details-recipe-link");
  const recipeUrlLabel = $("#dish-details-url");
  recipeLink.hidden = !recipeUrl;
  recipeUrlLabel.hidden = !recipeUrl;
  if (recipeUrl) {
    recipeLink.href = recipeUrl;
    recipeUrlLabel.textContent = recipeUrl.length > 58 ? `${recipeUrl.slice(0, 58)}…` : recipeUrl;
    recipeUrlLabel.title = recipeUrl;
  } else {
    recipeLink.removeAttribute("href");
    recipeUrlLabel.textContent = "";
    recipeUrlLabel.removeAttribute("title");
  }
  $("#dish-details-no-link").hidden = !dish || Boolean(recipeUrl);

  const dialog = $("#dish-details-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  $("#dish-details-close").focus();
}

function dishMenuEditorSignature() {
  return JSON.stringify({
    day: $("#dish-menu-day").value,
    meal: $("#dish-menu-meal").value,
    quantity: Number($("#dish-menu-quantity").value),
    unit: $("#dish-menu-unit").value,
    people: [...$("#dish-menu-people").querySelectorAll("input:checked")]
      .map((input) => input.value)
      .sort(),
    notes: $("#dish-menu-notes").value.trim(),
  });
}

function updateDishMenuSaveState() {
  const button = $("#dish-details-save");
  if (button.hidden) return;
  button.disabled = state.dishDetailsScheduling
    ? false
    : !state.dishDetailsOriginal || dishMenuEditorSignature() === state.dishDetailsOriginal;
}

function updateDishMenuUnitValue() {
  const label = $("#dish-menu-unit-value");
  const show = !$("#dish-menu-editor").hidden && $("#dish-menu-unit").value === "unit";
  label.hidden = !show;
  label.textContent = show
    ? translatedTemplate("selected_unit", {
      unit: state.dishDetailsItemUnit === "unit"
        ? t(state.language, "units")
        : state.dishDetailsItemUnit,
    })
    : "";
}

function closeDishDetails() {
  state.dishDetailsMenuIndex = null;
  state.dishDetailsDishKey = null;
  state.dishDetailsOriginal = null;
  state.dishDetailsScheduling = false;
  const dialog = $("#dish-details-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function openDishScheduleEditor() {
  const dish = state.snapshot.dishes
    .find((candidate) => candidate.key === state.dishDetailsDishKey);
  if (!dish) return;
  state.dishDetailsScheduling = true;
  $("#dish-menu-editor").hidden = false;
  $("#dish-menu-editor-title").textContent = t(state.language, "schedule_dish");
  $("#dish-menu-editor-intro").textContent = t(state.language, "schedule_dish_intro");
  $("#dish-menu-day").innerHTML = state.snapshot.days
    .map((day) => `<option value="${escapeHtml(day)}">${escapeHtml(day)}</option>`)
    .join("");
  $("#dish-menu-meal").innerHTML = state.snapshot.meals
    .map((meal) => `<option value="${escapeHtml(meal)}">${escapeHtml(meal)}</option>`)
    .join("");
  $("#dish-menu-quantity").value = "1";
  $("#dish-menu-notes").value = "";
  $("#dish-menu-unit").value = "portion";
  $("#dish-menu-people").innerHTML = state.snapshot.people.map((person, index) => {
    const selected = person.key === state.snapshot.profile
      || (!state.snapshot.profile && index === 0);
    return `
      <label class="dialog-person">
        <input type="checkbox" value="${escapeHtml(person.key)}" ${selected ? "checked" : ""}>
        <span>${escapeHtml(person.name)}</span>
      </label>`;
  }).join("");
  $("#dish-menu-people-error").hidden = true;
  $("#dish-details-schedule").hidden = true;
  $("#dish-details-schedule-cancel").hidden = false;
  $("#dish-details-save").hidden = false;
  $("#dish-details-save").disabled = false;
  $("#dish-details-save").textContent = t(state.language, "add_to_menu");
  updateDishMenuUnitValue();
  $("#dish-menu-editor").scrollIntoView({ behavior: "smooth", block: "nearest" });
  $("#dish-menu-day").focus();
}

function closeDishScheduleEditor() {
  state.dishDetailsScheduling = false;
  $("#dish-menu-editor").hidden = true;
  $("#dish-details-save").hidden = true;
  $("#dish-details-schedule-cancel").hidden = true;
  $("#dish-details-schedule").hidden = false;
}

function setMenuItemUnit() {
  const selected = state.snapshot.item_options.find((item) => item.key === $("#menu-item-select").value);
  $("#menu-item-unit").value = selected?.kind === "dish" ? "portion" : "g";
}

function openMenuItemDialog(day, meal) {
  state.menuCellDraft = { day, meal };
  $("#menu-item-context").textContent = `${day} · ${meal}`;
  $("#menu-item-select").innerHTML = itemOptions("");
  const firstDish = state.snapshot.item_options.find((item) => item.kind === "dish");
  $("#menu-item-select").value = firstDish?.key || state.snapshot.item_options[0]?.key || "";
  const search = enhanceSearchableSelect(
    $("#menu-item-select"),
    t(state.language, "search_items"),
  );
  $("#menu-item-quantity").value = "1";
  $("#menu-item-notes").value = "";
  $("#menu-item-people-error").hidden = true;
  $("#menu-item-people").innerHTML = state.snapshot.people.map((person) => `
    <label class="dialog-person">
      <input type="checkbox" value="${escapeHtml(person.key)}" ${person.key === state.snapshot.profile ? "checked" : ""}>
      <span>${escapeHtml(person.name)}</span>
    </label>
  `).join("");
  setMenuItemUnit();
  const dialog = $("#menu-item-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  search?.focus();
}

function closeMenuItemDialog() {
  state.menuCellDraft = null;
  const dialog = $("#menu-item-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

const extraNeedsFeature = createExtraNeedsFeature({
  state,
  select: $,
  translate: (key) => t(state.language, key),
  displayCategory,
  normalizeCategory: normalizedCategory,
  escapeHtml,
  formatInputNumber,
  formatMoney,
  setCountBadge,
  enhanceSearchableSelect,
  searchableSelectInput,
  openConfirmation,
  setBusy,
  send,
});
const customGroceryPayload = extraNeedsFeature.payload;
const renderCustomGrocery = extraNeedsFeature.render;
const scheduleCustomGroceryUpdate = extraNeedsFeature.scheduleUpdate;

const stockFeature = createStockFeature({
  state,
  select: $,
  translate: (key) => t(state.language, key),
  displayCategory,
  escapeHtml,
  formatInputNumber,
  formatMoney,
  setCountBadge,
  enhanceSearchableSelect,
  openConfirmation,
  setBusy,
  send,
});
const stockPayload = stockFeature.payload;
const addStockQuantity = stockFeature.addQuantity;
const renderStock = stockFeature.render;
const scheduleStockUpdate = stockFeature.scheduleUpdate;

const familyFeature = createFamilyFeature({
  state,
  select: $,
  selectAll: $$,
  translate: (key) => t(state.language, key),
  translatedTemplate,
  escapeHtml,
  formatNumber,
  openConfirmation,
  send,
});
const closeFamilyDialog = familyFeature.close;
const renderFamily = familyFeature.render;

const catalogueFeature = createCatalogueFeature({
  state,
  select: $,
  selectAll: $$,
  translate: (key) => t(state.language, key),
  translatedTemplate,
  escapeHtml,
  formatInputNumber,
  formatMoney,
  formatNumber,
  displayCategory,
  normalizedCategory,
  optionalInputNumber,
  customIngredientKey: (...args) => dishEditorFeature.customIngredientKey(...args),
  ingredientNutriScoreMissing,
  setCountBadge,
  openConfirmation,
  openDetails: (...args) => itemDetailsFeature.openCatalogue(...args),
  send,
});
const closeItemEditor = catalogueFeature.closeEditor;
const openItemEditor = catalogueFeature.openEditor;
const renderItemsCatalogue = catalogueFeature.render;

const itemDetailsFeature = createItemDetailsFeature({
  state,
  select: $,
  storage: localStorage,
  translate: (key) => t(state.language, key),
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
  renderItemsCatalogue: (...args) => catalogueFeature.render(...args),
  openItemEditor: (...args) => catalogueFeature.openEditor(...args),
});
const closeGroceryDetails = itemDetailsFeature.close;
const openCatalogueItemDetails = itemDetailsFeature.openCatalogue;
const openGroceryDetails = itemDetailsFeature.openGrocery;

const groceryFeature = createGroceryFeature({
  state,
  select: $,
  translate: (key) => t(state.language, key),
  escapeHtml,
  formatMoney,
  setCountBadge,
  storage: localStorage,
  send,
  stockPayload,
  extraNeedsPayload: customGroceryPayload,
  openDetails: openGroceryDetails,
});
const renderGrocery = groceryFeature.render;

const dishesFeature = createDishesFeature({
  state,
  select: $,
  selectAll: $$,
  translate: (key) => t(state.language, key),
  escapeHtml,
  formatMoney,
  formatNumber,
  translatedTemplate,
  ingredientNutriScoreMissing,
  dishNutriScoreDetail,
  openDetails: openDishDetails,
});
const configureDishRanges = dishesFeature.configureRanges;
const renderDishes = dishesFeature.render;

const dishEditorFeature = createDishEditorFeature({
  state,
  select: $,
  selectAll: $$,
  documentRef: document,
  translate: (key) => t(state.language, key),
  escapeHtml,
  formatInputNumber,
  enhanceSearchableSelect,
  setSearchableSelectHidden,
  dishNutriScoreDetail,
  send,
});
const closeNewDishDialog = dishEditorFeature.close;
const openDishForm = dishEditorFeature.open;

const autoMenuFeature = createAutoMenuFeature({
  state,
  select: $,
  selectAll: $$,
  storage: localStorage,
  translate: (key) => t(state.language, key),
  escapeHtml,
  formatInputNumber,
  formatMoney,
  formatNumber,
  stockPayload,
  send,
  applyProposal: (rows) => {
    state.draft.push(...rows);
    setMenuMode("manual");
    renderMenu();
    scheduleMenuUpdate();
  },
});
const renderAutoMenu = autoMenuFeature.render;
const renderAutoMenuResult = autoMenuFeature.renderResult;

function scheduleMenuUpdate() {
  clearTimeout(state.editTimer);
  state.draft = mergeCompatibleMenuRows(state.draft);
  state.autoMenuProposal = null;
  state.autoMenuSignature = "";
  renderAutoMenu();
  setBusy(true);
  state.editTimer = setTimeout(() => {
    send("replace-menu", { rows: state.draft });
  }, 350);
}

function persistDraft() {
  if (!state.snapshot) return;
  localStorage.setItem("homealacarte-menu", JSON.stringify(state.snapshot.planner));
  localStorage.setItem("homealacarte-language", state.language);
  const sources = state.serializedData
    ? [{ path: "homealacarte_data.json", content: state.serializedData }]
    : state.importedSources;
  savePrivateState({
    version: DATA_SCHEMA_VERSION,
    language: state.language,
    people: state.snapshot.people,
    menu: state.snapshot.planner,
    stock: state.snapshot.stock,
    customGrocery: state.snapshot.custom_grocery,
    sources,
  }).catch((error) => console.warn("Unable to persist private state", error));
}

function storageStatusKey(statusName) {
  return {
    local: "sync_local",
    "signed-out": "sync_signed_out",
    connecting: "sync_connecting",
    saving: "sync_saving",
    synced: "sync_synced",
    offline: "sync_offline",
    conflict: "sync_conflict",
    error: "sync_error",
  }[statusName] || "sync_local";
}

function storageStatusDetailKey(statusName) {
  return {
    local: "sync_local_detail",
    "signed-out": "sync_signed_out_detail",
    connecting: "sync_connecting_detail",
    saving: "sync_saving_detail",
    synced: "sync_synced_detail",
    offline: "sync_offline_detail",
    conflict: "sync_conflict_detail",
    error: "sync_error_detail",
  }[statusName] || "sync_local_detail";
}

function displayedStorageStatus(status = state.storageStatus || getStorageStatus()) {
  if (!state.lastError) return status;
  return {
    ...status,
    state: "error",
    message: localizeError(state.lastError.message, state.lastError.code),
  };
}

function renderStorageStatus(status = getStorageStatus()) {
  state.storageStatus = status;
  const displayed = displayedStorageStatus(status);
  const label = t(state.language, storageStatusKey(displayed.state));
  const source = $("#source-status");
  if (!source) return;
  renderHeaderStatus();
  $(".account-current-status").className = `account-current-status sync-${displayed.state}`;
  $("#account-status-label").textContent = label;
  $("#account-status-detail").textContent = displayed.message === "confirmation_required"
    ? t(state.language, "confirmation_required")
    : displayed.message || t(state.language, storageStatusDetailKey(displayed.state));
  const signedIn = Boolean(status.email) && status.state !== "signed-out";
  $("#account-signed-out").hidden = signedIn;
  $("#account-signed-in").hidden = !signedIn;
  $("#account-email-label").textContent = status.email || "";
  $("#account-conflict").hidden = status.state !== "conflict";
  const privacySignedIn = Boolean(status.email) && status.state !== "signed-out";
  $("#privacy-request-signed-out").hidden = privacySignedIn;
  $("#privacy-request-signed-in").hidden = !privacySignedIn;
  if (!privacySignedIn) {
    state.privacyRequests = [];
    state.privacyRequestsUserId = "";
  }
  if (state.activeTab === "data") renderDataOverview();
}

function privacyRequestTypeLabel(requestType) {
  return t(state.language, `privacy_type_${requestType}`);
}

function privacyRequestStatusLabel(status) {
  return t(state.language, `privacy_status_${status}`);
}

function renderPrivacyRequestList() {
  const list = $("#privacy-request-list");
  list.replaceChildren();
  if (!state.privacyRequests.length) {
    const empty = document.createElement("p");
    empty.className = "privacy-request-empty";
    empty.textContent = t(state.language, "privacy_request_none");
    list.append(empty);
    return;
  }
  state.privacyRequests.forEach((request) => {
    const row = document.createElement("article");
    row.className = "privacy-request-row";
    const heading = document.createElement("strong");
    heading.textContent = privacyRequestTypeLabel(request.request_type);
    const date = document.createElement("time");
    date.dateTime = request.created_at;
    date.textContent = formatDateTime(request.created_at);
    const status = document.createElement("span");
    status.className = `privacy-request-status ${String(request.status).replaceAll("_", "-")}`;
    status.textContent = privacyRequestStatusLabel(request.status);
    const message = document.createElement("p");
    message.textContent = request.message;
    row.append(heading, date, status, message);
    if (request.response_message) {
      const response = document.createElement("p");
      response.className = "privacy-request-response";
      response.textContent = translatedTemplate("privacy_request_response", {
        response: request.response_message,
      });
      row.append(response);
    }
    list.append(row);
  });
}

async function refreshPrivacyRequests(force = false) {
  const userId = state.storageStatus?.email && state.storageStatus.state !== "signed-out"
    ? (await getStorageDiagnostics()).userId
    : "";
  if (!userId) {
    state.privacyRequests = [];
    state.privacyRequestsUserId = "";
    renderPrivacyRequestList();
    return;
  }
  if (!force && state.privacyRequestsUserId === userId) {
    renderPrivacyRequestList();
    return;
  }
  if (state.privacyRequestsLoading) return;
  state.privacyRequestsLoading = true;
  try {
    state.privacyRequests = await loadPrivacyRequests();
    state.privacyRequestsUserId = userId;
    renderPrivacyRequestList();
  } catch (error) {
    const feedback = $("#privacy-request-feedback");
    feedback.classList.add("error");
    feedback.textContent = localizeError(error?.message || String(error), error?.code);
  } finally {
    state.privacyRequestsLoading = false;
  }
}

async function renderDataOverview() {
  if (!$("#data-overview-title")) return;
  try {
    const diagnostics = await getStorageDiagnostics();
    $("#data-account-email").textContent = diagnostics.email || t(state.language, "not_signed_in");
    $("#data-account-id").textContent = diagnostics.userId || "—";
    $("#data-local-size").textContent = formatBytes(diagnostics.localBytes);
    $("#data-local-date").textContent = diagnostics.localUpdatedAt
      ? translatedTemplate("updated_at", { date: formatDateTime(diagnostics.localUpdatedAt) })
      : t(state.language, "no_saved_copy");
    $("#data-online-size").textContent = diagnostics.remoteError
      ? t(state.language, "unavailable")
      : diagnostics.email
        ? formatBytes(diagnostics.remoteBytes)
        : t(state.language, "not_signed_in");
    $("#data-online-date").textContent = diagnostics.remoteError
      || (diagnostics.remoteUpdatedAt
        ? translatedTemplate("updated_at", { date: formatDateTime(diagnostics.remoteUpdatedAt) })
        : t(state.language, "no_online_copy"));
    const controllerLink = $("#about-controller-contact");
    controllerLink.textContent = diagnostics.controllerName
      || t(state.language, "controller_not_configured");
    const contactUrl = externalHttpUrl(diagnostics.privacyContact);
    if (contactUrl) {
      controllerLink.href = contactUrl;
    } else if (diagnostics.privacyContact.includes("@")) {
      controllerLink.href = `mailto:${diagnostics.privacyContact}`;
    } else {
      controllerLink.removeAttribute("href");
    }
    await refreshPrivacyRequests();
  } catch (error) {
    $("#data-online-size").textContent = t(state.language, "unavailable");
    $("#data-online-date").textContent = localizeError(error?.message || String(error));
  }
}

function renderHeaderStatus() {
  const source = $("#source-status");
  if (!source) return;
  if (state.engineBusy) {
    source.className = "source-badge sync-saving engine-busy";
    $("#source-label").textContent = state.engineMessage || t(state.language, "loading");
    return;
  }
  const status = displayedStorageStatus();
  source.className = `source-badge sync-${status.state}`;
  $("#source-label").textContent = state.lastError
    ? t(state.language, "data_error")
    : t(state.language, storageStatusKey(status.state));
}

function openAccountSection() {
  switchTab("data");
  renderStorageStatus(state.storageStatus);
  $("#account-message").textContent = "";
  requestAnimationFrame(() => {
    $("#account-section").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#account-section").focus({ preventScroll: true });
  });
}

function openAboutDialog() {
  renderDataOverview();
  const dialog = $("#about-dialog");
  if (!dialog.open) dialog.showModal();
}

function closeAboutDialog() {
  $("#about-dialog").close();
}

function enableBackdropDismissal(selector, closeDialog) {
  const dialog = $(selector);
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const clickedOutsideWindow = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    if (clickedOutsideWindow) closeDialog();
  });
}

function setAccountBusy(busy) {
  $$("#account-section button, #account-section input").forEach((control) => {
    control.disabled = busy;
  });
}

function accountError(error) {
  $("#account-message").textContent = translatedTemplate("auth_failed", {
    message: localizeError(error?.message || String(error)),
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === tab));
  history.replaceState(null, "", `#${tab}`);
  if (tab === "data") renderDataOverview();
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-tab]");
  if (nav) {
    event.preventDefault();
    switchTab(nav.dataset.tab);
  }
  const groceryMode = event.target.closest("[data-grocery-mode]");
  if (groceryMode) {
    setGroceryMode(groceryMode.dataset.groceryMode);
    localStorage.setItem("homealacarte-grocery-mode", state.groceryMode);
  }
});
$("#color-my-life").addEventListener("click", randomizeColorTheme);
$$('[data-menu-mode]').forEach((button) => button.addEventListener("click", () => {
  setMenuMode(button.dataset.menuMode);
}));
$("#profile-select").addEventListener("change", (event) => send("set-profile", { profile: event.target.value }));
$("#show-selected-only").addEventListener("change", (event) => {
  state.menuSelectedOnly = event.target.checked;
  localStorage.setItem("homealacarte-menu-selected-only", String(state.menuSelectedOnly));
  renderMenu();
});
$("#empty-menu").addEventListener("click", () => {
  if (!state.draft.length) return;
  openConfirmation({
    title: t(state.language, "empty_menu_confirm_title"),
    message: t(state.language, "empty_menu_confirm_message"),
    confirmLabel: t(state.language, "empty_menu"),
    action: () => {
      state.draft = [];
      renderMenu();
      scheduleMenuUpdate();
    },
  });
});
$("#weekly-menu").addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".menu-entry-delete");
  if (deleteButton) {
    state.draft.splice(Number(deleteButton.dataset.index), 1);
    renderMenu();
    scheduleMenuUpdate();
    return;
  }
  const dishButton = event.target.closest(".menu-entry-dish");
  if (dishButton) {
    openDishDetails(
      decodeURIComponent(dishButton.dataset.dishKey),
      Number(dishButton.dataset.menuIndex),
    );
    return;
  }
  const addButton = event.target.closest(".menu-cell-add");
  if (addButton) openMenuItemDialog(addButton.dataset.day, addButton.dataset.meal);
});
$("#weekly-menu").addEventListener("dragstart", (event) => {
  const entry = event.target.closest("[data-menu-drag-index]");
  if (!entry) return;
  state.draggedMenuIndex = Number(entry.dataset.menuDragIndex);
  entry.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", entry.dataset.menuDragIndex);
});
$("#weekly-menu").addEventListener("dragend", (event) => {
  event.target.closest("[data-menu-drag-index]")?.classList.remove("dragging");
  $$("#weekly-menu td.menu-drop-target").forEach((cell) => cell.classList.remove("menu-drop-target"));
  state.draggedMenuIndex = null;
});
$("#weekly-menu").addEventListener("dragover", (event) => {
  const cell = event.target.closest("[data-menu-drop-day]");
  if (!cell || state.draggedMenuIndex == null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  $$("#weekly-menu td.menu-drop-target").forEach((candidate) => {
    candidate.classList.remove("menu-drop-target");
  });
  cell.classList.add("menu-drop-target");
});
$("#weekly-menu").addEventListener("drop", (event) => {
  const cell = event.target.closest("[data-menu-drop-day]");
  const index = state.draggedMenuIndex ?? Number(event.dataTransfer.getData("text/plain"));
  const row = state.draft[index];
  if (!cell || !row) return;
  event.preventDefault();
  row.day = cell.dataset.menuDropDay;
  row.meal = cell.dataset.menuDropMeal;
  state.draggedMenuIndex = null;
  renderMenu();
  scheduleMenuUpdate();
});
$("#dish-details-close").addEventListener("click", closeDishDetails);
$("#dish-details-done").addEventListener("click", closeDishDetails);
$("#dish-details-ingredients").addEventListener("click", (event) => {
  const ingredient = event.target.closest("[data-dish-ingredient-details]");
  if (!ingredient) return;
  const key = decodeURIComponent(ingredient.dataset.dishIngredientDetails);
  closeDishDetails();
  openCatalogueItemDetails(key, "food");
});
$("#dish-details-dialog").addEventListener("close", () => {
  state.dishDetailsMenuIndex = null;
  state.dishDetailsDishKey = null;
  state.dishDetailsOriginal = null;
  state.dishDetailsScheduling = false;
});
$("#dish-menu-editor").addEventListener("input", updateDishMenuSaveState);
$("#dish-menu-editor").addEventListener("change", () => {
  updateDishMenuUnitValue();
  updateDishMenuSaveState();
});
$("#dish-details-edit").addEventListener("click", () => {
  const dish = state.snapshot.dishes.find((candidate) => candidate.key === state.dishDetailsDishKey);
  if (!dish) return;
  const dishCopy = structuredClone(dish);
  closeDishDetails();
  openDishForm(dishCopy);
});
$("#dish-details-schedule").addEventListener("click", openDishScheduleEditor);
$("#dish-details-schedule-cancel").addEventListener("click", closeDishScheduleEditor);
$("#dish-details-save").addEventListener("click", () => {
  const people = [...$("#dish-menu-people").querySelectorAll("input:checked")]
    .map((input) => input.value);
  const quantity = Number($("#dish-menu-quantity").value);
  if (!people.length) {
    $("#dish-menu-people-error").hidden = false;
    $("#dish-menu-people input").focus();
    return;
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    $("#dish-menu-quantity").focus();
    return;
  }
  if (state.dishDetailsScheduling) {
    const scheduledRow = buildScheduledDishRow({
      dishKey: state.dishDetailsDishKey,
      day: $("#dish-menu-day").value,
      meal: $("#dish-menu-meal").value,
      people,
      quantity,
      quantityUnit: $("#dish-menu-unit").value,
      notes: $("#dish-menu-notes").value.trim(),
    });
    state.draft.push(scheduledRow);
    closeDishDetails();
    renderMenu();
    scheduleMenuUpdate();
    return;
  }
  const row = state.draft[state.dishDetailsMenuIndex];
  if (!row) return;
  row.people = people;
  row.day = $("#dish-menu-day").value;
  row.meal = $("#dish-menu-meal").value;
  row.quantity = quantity;
  row.quantity_unit = $("#dish-menu-unit").value;
  row.notes = $("#dish-menu-notes").value.trim();
  closeDishDetails();
  renderMenu();
  scheduleMenuUpdate();
});
$("#menu-item-select").addEventListener("change", setMenuItemUnit);
$("#menu-item-close").addEventListener("click", closeMenuItemDialog);
$("#menu-item-cancel").addEventListener("click", closeMenuItemDialog);
$("#menu-item-dialog").addEventListener("close", () => {
  state.menuCellDraft = null;
});
$("#confirm-dialog-close").addEventListener("click", closeConfirmation);
$("#confirm-dialog-cancel").addEventListener("click", closeConfirmation);
$("#confirm-dialog").addEventListener("close", () => {
  state.pendingConfirmation = null;
});
$("#confirm-dialog-accept").addEventListener("click", async () => {
  const action = state.pendingConfirmation;
  closeConfirmation();
  if (!action) return;
  try {
    await action();
  } catch (error) {
    showError(error?.message || String(error));
  }
});
$("#meal-replace-close").addEventListener("click", closeMealReplacement);
$("#meal-replace-cancel").addEventListener("click", closeMealReplacement);
$("#meal-replace-dialog").addEventListener("close", () => {
  state.pendingReplacementIndex = null;
});
$("#meal-replace-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const index = state.pendingReplacementIndex;
  const row = state.draft[index];
  const replacementKey = $("#meal-replace-select").value;
  const current = state.snapshot.item_options.find((item) => item.key === row?.item_key);
  const replacement = state.snapshot.item_options.find((item) => item.key === replacementKey);
  if (!row || !replacement) return;
  row.item_key = replacement.key;
  if (current?.kind !== replacement.kind) {
    row.quantity = 1;
    row.quantity_unit = replacement.kind === "dish" ? "portion" : "g";
  }
  closeMealReplacement();
  renderMenu();
  scheduleMenuUpdate();
});
$("#menu-item-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.menuCellDraft) return;
  const people = [...$("#menu-item-people").querySelectorAll("input:checked")].map((input) => input.value);
  if (!people.length) {
    $("#menu-item-people-error").hidden = false;
    $("#menu-item-people input").focus();
    return;
  }
  state.draft.push({
    day: state.menuCellDraft.day,
    meal: state.menuCellDraft.meal,
    item_key: $("#menu-item-select").value,
    people,
    quantity: Number($("#menu-item-quantity").value),
    quantity_unit: $("#menu-item-unit").value,
    notes: $("#menu-item-notes").value.trim(),
  });
  closeMenuItemDialog();
  renderMenu();
  scheduleMenuUpdate();
});

function selectLanguage(language) {
  if (!translations[language] || language === state.language) return;
  state.language = language;
  localStorage.setItem("homealacarte-language", state.language);
  if (state.snapshot) render();
  else applyTranslations();
  if (state.lastError) showError(state.lastError.message, state.lastError.code);
  send("set-language", { language: state.language });
}

const languageSelect = $("#language-select");
languageSelect.addEventListener("input", (event) => selectLanguage(event.target.value));
languageSelect.addEventListener("change", (event) => selectLanguage(event.target.value));
$("#source-status").addEventListener("click", openAccountSection);
$("#about-open").addEventListener("click", openAboutDialog);
$("#about-data").addEventListener("click", openAboutDialog);
$("#about-close").addEventListener("click", closeAboutDialog);
$("#about-done").addEventListener("click", closeAboutDialog);
[
  ["#family-dialog", closeFamilyDialog],
  ["#menu-item-dialog", closeMenuItemDialog],
  ["#dish-details-dialog", closeDishDetails],
  ["#new-dish-dialog", closeNewDishDialog],
  ["#grocery-details-dialog", closeGroceryDetails],
  ["#confirm-dialog", closeConfirmation],
  ["#meal-replace-dialog", closeMealReplacement],
  ["#about-dialog", closeAboutDialog],
].forEach(([selector, closeDialog]) => enableBackdropDismissal(selector, closeDialog));
$("#account-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setAccountBusy(true);
  $("#account-message").textContent = "";
  try {
    await signIn($("#account-email").value.trim(), $("#account-password").value);
    location.reload();
  } catch (error) {
    accountError(error);
    setAccountBusy(false);
  }
});
$("#account-create").addEventListener("click", async () => {
  if (!$("#account-email").reportValidity() || !$("#account-password").reportValidity()) return;
  if (!$("#account-privacy-consent").checked) {
    $("#account-message").textContent = t(state.language, "privacy_consent_required");
    $("#account-privacy-consent").focus();
    return;
  }
  setAccountBusy(true);
  $("#account-message").textContent = "";
  try {
    const result = await signUp(
      $("#account-email").value.trim(),
      $("#account-password").value,
    );
    if (result.confirmationRequired) {
      $("#account-message").textContent = t(state.language, "confirmation_required");
      setAccountBusy(false);
    } else {
      location.reload();
    }
  } catch (error) {
    accountError(error);
    setAccountBusy(false);
  }
});
$("#account-sign-out").addEventListener("click", async () => {
  setAccountBusy(true);
  await signOut();
  location.reload();
});
$("#account-sync-now").addEventListener("click", async () => {
  setAccountBusy(true);
  try {
    await synchronizePrivateState();
  } catch (error) {
    accountError(error);
  } finally {
    setAccountBusy(false);
  }
});
$("#account-use-online").addEventListener("click", async () => {
  setAccountBusy(true);
  try {
    if (await resolveSyncConflict("remote")) location.reload();
  } catch (error) {
    accountError(error);
    setAccountBusy(false);
  }
});
$("#account-use-local").addEventListener("click", async () => {
  setAccountBusy(true);
  try {
    if (await resolveSyncConflict("local")) location.reload();
    else setAccountBusy(false);
  } catch (error) {
    accountError(error);
    setAccountBusy(false);
  }
});
$("#privacy-request-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = $("#privacy-request-submit");
  const feedback = $("#privacy-request-feedback");
  submit.disabled = true;
  feedback.classList.remove("error");
  feedback.textContent = t(state.language, "privacy_request_sending");
  try {
    await submitPrivacyRequest(
      $("#privacy-request-type").value,
      $("#privacy-request-message").value.trim(),
    );
    $("#privacy-request-message").value = "";
    feedback.textContent = t(state.language, "privacy_request_sent");
    state.privacyRequestsUserId = "";
    await refreshPrivacyRequests(true);
  } catch (error) {
    feedback.classList.add("error");
    feedback.textContent = localizeError(error?.message || String(error), error?.code);
  } finally {
    submit.disabled = false;
  }
});
async function downloadData() {
  if (state.lastError || !state.snapshot) {
    const stored = await getPrivateStateCopy();
    if (stored !== undefined) {
      const source = stored?.sources?.length === 1 ? stored.sources[0] : null;
      downloadText(
        source?.path?.toLowerCase().endsWith(".json") ? source.path : "homealacarte_private_state.json",
        typeof source?.content === "string" ? source.content : JSON.stringify(stored, null, 2),
      );
      return;
    }
  }
  clearTimeout(state.editTimer);
  clearTimeout(state.stockTimer);
  clearTimeout(state.customTimer);
  send("export-data", {
    kind: "consolidated",
    rows: state.draft,
    stock: stockPayload(),
    customGrocery: customGroceryPayload(),
  });
}

function clearClientPreferences() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
  state.language = "fr";
  state.groceryMode = "list";
  state.menuSelectedOnly = false;
  state.groceryHideStocked = false;
  state.colorTheme = 0;
  state.randomThemes = [];
  state.dishRangeSignature = "";
  state.source = "deleted";
  state.importedSources = null;
  state.serializedData = null;
  state.restorePeople = null;
  state.restoreMenu = null;
  state.restoreStock = null;
  state.restoreCustom = null;
  applyColorTheme(0);
  applyTranslations();
}

function emptyAllHouseholdData() {
  clearTimeout(state.editTimer);
  clearTimeout(state.stockTimer);
  clearTimeout(state.customTimer);
  const files = [{
    path: "homealacarte_empty_state.json",
    content: EMPTY_DATABASE_CONTENT,
  }];
  state.source = "empty";
  state.importedSources = files;
  state.serializedData = EMPTY_DATABASE_CONTENT;
  state.restorePeople = null;
  state.restoreMenu = null;
  state.restoreStock = null;
  state.restoreCustom = null;
  state.autoMenuProposal = null;
  localStorage.removeItem("homealacarte-menu");
  switchTab("data");
  const requestId = send("load-files", {
    files,
    language: state.language,
    source: "empty",
  });
  state.pendingDataAction = { requestId, messageKey: "empty_data_success" };
}

function confirmHouseholdDataReset() {
  const onlineAccount = Boolean(state.storageStatus?.email)
    && state.storageStatus.state !== "signed-out";
  openConfirmation({
    title: t(state.language, "empty_data_confirm_title"),
    message: t(
      state.language,
      onlineAccount ? "empty_data_confirm_online" : "empty_data_confirm_local",
    ),
    confirmLabel: t(state.language, "empty_data"),
    action: emptyAllHouseholdData,
  });
}

async function deleteAllPrivateData() {
  const result = await deletePrivateData();
  clearClientPreferences();
  switchTab("data");
  const message = $("#data-action-message");
  message.classList.remove("warning");
  message.textContent = t(
    state.language,
    result.accountDeleted ? "delete_data_success_online" : "delete_data_success_local",
  );
  send("load-bundled", {
    manifestUrl: "./demo-data-manifest.json",
    language: state.language,
  });
}

function confirmPrivateDataDeletion() {
  const onlineAccount = Boolean(state.storageStatus?.email)
    && state.storageStatus.state !== "signed-out";
  openConfirmation({
    title: t(state.language, "delete_data_confirm_title"),
    message: t(
      state.language,
      onlineAccount ? "delete_data_confirm_online" : "delete_data_confirm_local",
    ),
    confirmLabel: t(state.language, "reset_data"),
    action: deleteAllPrivateData,
  });
}

$("#export-data").addEventListener("click", () => {
  downloadData().catch((error) => showError(error?.message || String(error)));
});
$("#about-download-data").addEventListener("click", () => {
  closeAboutDialog();
  downloadData().catch((error) => showError(error?.message || String(error)));
});
$("#about-edit-data").addEventListener("click", () => {
  closeAboutDialog();
  switchTab("family");
});
$("#about-request-erasure").addEventListener("click", () => {
  closeAboutDialog();
  switchTab("data");
  confirmPrivateDataDeletion();
});
$("#download-pdf").addEventListener("click", () => {
  clearTimeout(state.editTimer);
  clearTimeout(state.stockTimer);
  clearTimeout(state.customTimer);
  send("generate-pdf", {
    language: state.language,
    rows: state.draft,
    stock: stockPayload(),
    customGrocery: customGroceryPayload(),
    excludedIds: [],
  });
});
$("#import-json").addEventListener("click", () => $("#json-input").click());
$("#json-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (file?.name.toLowerCase().endsWith(".json")) {
    const files = [{ path: file.name, content: await file.text() }];
    state.importedSources = files;
    state.restorePeople = null;
    state.restoreMenu = null;
    state.restoreStock = null;
    state.restoreCustom = null;
    savePrivateState({
      version: DATA_SCHEMA_VERSION,
      language: state.language,
      sources: files,
      people: null,
      menu: null,
      stock: null,
      customGrocery: null,
    })
      .catch((error) => console.warn("Unable to persist imported files", error));
    send("load-files", { files, language: state.language });
  }
  event.target.value = "";
});
$("#reset-data").addEventListener("click", confirmPrivateDataDeletion);
$("#empty-data").addEventListener("click", confirmHouseholdDataReset);

stockFeature.mount();
extraNeedsFeature.mount();
groceryFeature.mount();
dishEditorFeature.mount();
catalogueFeature.mount();
familyFeature.mount();
itemDetailsFeature.mount();
async function bootstrap() {
  applyColorTheme(state.colorTheme);
  applyTranslations();
  const requestedTab = location.hash.slice(1);
  if (["family", "menu", "grocery", "dishes", "items", "data"].includes(requestedTab)) switchTab(requestedTab);
  const saved = await loadPrivateState().catch(() => null);
  if ([...NUTRITION_MIGRATION_VERSIONS, DATA_SCHEMA_VERSION].includes(saved?.version)) {
    state.language = saved.language || state.language;
    state.importedSources = saved.sources || null;
    state.restorePeople = saved.version >= 4 ? (saved.people || null) : null;
    state.restoreMenu = saved.menu || null;
    state.restoreStock = saved.version >= 2 ? (saved.stock || null) : null;
    state.restoreCustom = saved.version >= 3 ? (saved.customGrocery || null) : null;
    const needsBundledDefaults = FOOD_RULE_MIGRATION_VERSIONS.includes(saved.version)
      || NUTRITION_MIGRATION_VERSIONS.includes(saved.version);
    const bundled = needsBundledDefaults
      ? await loadBundledDefaults().catch(() => ({ people: [], dishes: [], items: [] }))
      : { people: [], dishes: [], items: [] };
    if (FOOD_RULE_MIGRATION_VERSIONS.includes(saved.version)) {
      if (state.restorePeople) {
        state.restorePeople = mergeBundledFoodRules(state.restorePeople, bundled.people);
      }
      state.importedSources = mergeBundledDishClassifications(
        state.importedSources || [],
        bundled.dishes,
      );
    }
    if (INGREDIENT_MIGRATION_VERSIONS.includes(saved.version)) {
      state.importedSources = mergeDuplicateIngredient(state.importedSources || []);
    }
    if (NUTRITION_MIGRATION_VERSIONS.includes(saved.version)) {
      state.importedSources = mergeBundledIngredientNutrition(
        state.importedSources || [],
        bundled.items,
      );
    }
    applyTranslations();
  }
  if (state.importedSources?.length) {
    send("load-files", { files: state.importedSources, language: state.language, source: "saved" });
  } else {
    send("load-bundled", { manifestUrl: "./data-manifest.json", language: state.language });
  }
}

onStorageStatus(renderStorageStatus);
bootstrap();

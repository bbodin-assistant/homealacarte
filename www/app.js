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
import { createMenuFeature } from "./features/menu.js?v=homealacarte-77";
import { createDataAccountFeature } from "./features/data-account.js?v=homealacarte-77";
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
  openMealReplacement: (...args) => menuFeature.openMealReplacement(...args),
  renderMenu: (...args) => menuFeature.render(...args),
  scheduleMenuUpdate: (...args) => scheduleMenuUpdate(...args),
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
  openDetails: (...args) => menuFeature.openDishDetails(...args),
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

const menuFeature = createMenuFeature({
  state,
  select: $,
  selectAll: $$,
  storage: localStorage,
  translate: (key) => t(state.language, key),
  translatedTemplate,
  escapeHtml,
  externalHttpUrl,
  formatInputNumber,
  formatMoney,
  formatNumber,
  enhanceSearchableSelect,
  dishNutriScoreDetail,
  openConfirmation,
  openCatalogueItemDetails: (...args) => itemDetailsFeature.openCatalogue(...args),
  openDishForm,
  scheduleMenuUpdate: (...args) => scheduleMenuUpdate(...args),
  send,
  setMenuMode,
});
const closeDishDetails = menuFeature.closeDishDetails;
const closeMealReplacement = menuFeature.closeMealReplacement;
const closeMenuItemDialog = menuFeature.closeMenuItemDialog;
const openDishDetails = menuFeature.openDishDetails;
const openMealReplacement = menuFeature.openMealReplacement;
const renderMenu = menuFeature.render;

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

const dataAccountFeature = createDataAccountFeature({
  state,
  select: $,
  selectAll: $$,
  documentRef: document,
  storage: localStorage,
  translate: (key) => t(state.language, key),
  translatedTemplate,
  localizeError,
  externalHttpUrl,
  formatBytes,
  formatDateTime,
  getStorageStatus,
  getStorageDiagnostics,
  getPrivateStateCopy,
  loadPrivacyRequests,
  deletePrivateData,
  resolveSyncConflict,
  savePrivateState,
  signIn,
  signOut,
  signUp,
  submitPrivacyRequest,
  synchronizePrivateState,
  downloadText,
  stockPayload,
  customGroceryPayload,
  send,
  showError,
  openConfirmation,
  switchTab,
  applyColorTheme,
  applyTranslations,
  reloadPage: () => location.reload(),
  storagePrefix: STORAGE_PREFIX,
  dataSchemaVersion: DATA_SCHEMA_VERSION,
  emptyDatabaseContent: EMPTY_DATABASE_CONTENT,
});
const closeAboutDialog = dataAccountFeature.closeAboutDialog;
const openAccountSection = dataAccountFeature.openAccountSection;
const renderDataOverview = dataAccountFeature.renderDataOverview;
const renderHeaderStatus = dataAccountFeature.renderHeaderStatus;
const renderStorageStatus = dataAccountFeature.renderStorageStatus;

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
stockFeature.mount();
extraNeedsFeature.mount();
groceryFeature.mount();
dishEditorFeature.mount();
catalogueFeature.mount();
familyFeature.mount();
itemDetailsFeature.mount();
menuFeature.mount();
dataAccountFeature.mount();
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

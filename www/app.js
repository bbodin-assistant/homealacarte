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
import { createWorkerResponseHandler } from "./core/worker-responses.js?v=homealacarte-77";
import { bootstrapApplication } from "./core/bootstrap.js?v=homealacarte-77";
import { createShellFeature } from "./features/shell.js?v=homealacarte-77";

document.documentElement.dataset.appModuleLoaded = "true";

const STORAGE_PREFIX = "homealacarte-";
const DATA_SCHEMA_VERSION = 10;
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

const handleWorkerMessage = createWorkerResponseHandler({
  state,
  select: $,
  translate: (key) => t(state.language, key),
  setBusy,
  showError,
  clearError,
  downloadText,
  downloadBytes,
  buildZip,
  documentRef: document,
  urlApi: URL,
  BlobClass: Blob,
  persistDraft: (...args) => persistDraft(...args),
  render: (...args) => render(...args),
  renderAutoMenuResult: (...args) => renderAutoMenuResult(...args),
  send: (...args) => workerClient.send(...args),
});

const workerClient = createWorkerClient({
  worker,
  state,
  setBusy,
  handleMessage: handleWorkerMessage,
  handleError: showError,
});
const send = workerClient.send;

const shellFeature = createShellFeature({
  state,
  select: $,
  selectAll: $$,
  documentRef: document,
  historyRef: history,
  storage: localStorage,
  translate: (key) => t(state.language, key),
  hasLanguage: (language) => Boolean(translations[language]),
  randomizeColorTheme,
  renderStorageStatus: (...args) => dataAccountFeature.renderStorageStatus(...args),
  renderDataOverview: (...args) => dataAccountFeature.renderDataOverview(...args),
  configureDishRanges: (...args) => dishesFeature.configureRanges(...args),
  renderFamily: (...args) => familyFeature.render(...args),
  renderMenu: (...args) => menuFeature.render(...args),
  renderAutoMenu: (...args) => autoMenuFeature.render(...args),
  renderGrocery: (...args) => groceryFeature.render(...args),
  renderStock: (...args) => stockFeature.render(...args),
  renderCustomGrocery: (...args) => extraNeedsFeature.render(...args),
  renderDishes: (...args) => dishesFeature.render(...args),
  renderItemsCatalogue: (...args) => catalogueFeature.render(...args),
  send,
  showError,
  dialogClosers: [
    ["#family-dialog", (...args) => familyFeature.close(...args)],
    ["#menu-item-dialog", (...args) => menuFeature.closeMenuItemDialog(...args)],
    ["#dish-details-dialog", (...args) => menuFeature.closeDishDetails(...args)],
    ["#new-dish-dialog", (...args) => dishEditorFeature.close(...args)],
    ["#grocery-details-dialog", (...args) => itemDetailsFeature.close(...args)],
    ["#confirm-dialog", (...args) => shellFeature.closeConfirmation(...args)],
    ["#meal-replace-dialog", (...args) => menuFeature.closeMealReplacement(...args)],
    ["#about-dialog", (...args) => dataAccountFeature.closeAboutDialog(...args)],
  ],
});
const applyTranslations = shellFeature.applyTranslations;
const openConfirmation = shellFeature.openConfirmation;
const render = shellFeature.render;
const setCountBadge = shellFeature.setCountBadge;
const setMenuMode = shellFeature.setMenuMode;
const switchTab = shellFeature.switchTab;

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

stockFeature.mount();
extraNeedsFeature.mount();
groceryFeature.mount();
dishEditorFeature.mount();
catalogueFeature.mount();
familyFeature.mount();
itemDetailsFeature.mount();
menuFeature.mount();
dataAccountFeature.mount();
shellFeature.mount();

onStorageStatus(renderStorageStatus);
bootstrapApplication({
  state,
  requestedTab: location.hash.slice(1),
  loadPrivateState,
  applyColorTheme,
  applyTranslations,
  switchTab,
  send,
});

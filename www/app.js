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
menuFeature.mount();
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

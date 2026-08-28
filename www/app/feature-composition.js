import { mergeCompatibleMenuRows } from "../features/menu/rows.js?v=homealacarte-81";
import { createSearchableSelect } from "../core/searchable-select.js?v=homealacarte-77";
import { createStockFeature } from "../features/stock.js?v=homealacarte-77";
import { createExtraNeedsFeature } from "../features/extra-needs.js?v=homealacarte-77";
import { createGroceryFeature } from "../features/grocery.js?v=homealacarte-80";
import { createDishesFeature } from "../features/dishes.js?v=homealacarte-103";
import { createAutoMenuFeature } from "../features/auto-menu.js?v=homealacarte-82";
import { createItemDetailsFeature } from "../features/item-details.js?v=homealacarte-100";
import { createDishEditorFeature } from "../features/dish-editor.js?v=homealacarte-80";
import { createCatalogueFeature } from "../features/catalogue.js?v=homealacarte-103";
import { createFamilyFeature } from "../features/family.js?v=homealacarte-101";
import { createMenuFeature } from "../features/menu.js?v=homealacarte-103";
import { createDataAccountFeature } from "../features/data-account.js?v=homealacarte-99";
import { createShellFeature } from "../features/shell.js?v=homealacarte-91";

export function createFeatureComposition({
  state,
  select,
  selectAll,
  documentRef,
  historyRef,
  locationRef,
  storage,
  translate,
  translations,
  randomizeColorTheme,
  applyColorTheme,
  displayCategory,
  normalizedCategory,
  escapeHtml,
  externalHttpUrl,
  formatInputNumber,
  options,
  optionalInputNumber,
  formatBytes,
  formatDateTime,
  formatMoney,
  formatNumber,
  translatedTemplate,
  ingredientNutriScoreMissing,
  dishNutriScoreDetail,
  downloadText,
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
  storagePrefix,
  dataSchemaVersion,
  emptyDatabaseContent,
  setBusy,
  send,
  showError,
  localizeError,
}) {
  const $ = select;
  const $$ = selectAll;
  const document = documentRef;
  const history = historyRef;
  const location = locationRef;
  const localStorage = storage;
  const locales = Object.keys(translations);
  const t = (_language, key) => translate(key);
  const searchableSelect = createSearchableSelect({
    getLanguage: () => state.language,
    translate,
    escapeHtml,
  });
  const enhanceSearchableSelect = searchableSelect.enhance;
  const searchableSelectInput = searchableSelect.inputFor;
  const setSearchableSelectHidden = searchableSelect.setHidden;

  const shellFeature = createShellFeature({
    state,
    select: $,
    selectAll: $$,
    documentRef: document,
    historyRef: history,
    storage: localStorage,
    translate: (key) => t(state.language, key),
    hasLanguage: (language) => Boolean(translations[language]),
    locales,
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
    formatInputNumber,
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
    locales,
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
    locales,
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
    storagePrefix,
    emptyDatabaseContent,
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
    localStorage.setItem("homealacarte-language", state.language);
    const sources = state.serializedData
      ? [{ path: "homealacarte_data.json", content: state.serializedData }]
      : state.importedSources;
    savePrivateState({
      version: dataSchemaVersion,
      language: state.language,
      people: state.snapshot.people,
      menu: state.snapshot.planner,
      stock: state.snapshot.stock,
      customGrocery: state.snapshot.custom_grocery,
      sources,
    }).catch((error) => console.warn("Unable to persist private state", error));
  }

  function mount() {
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
  }

  return {
    applyTranslations,
    mount,
    persistDraft,
    render,
    renderAutoMenuResult,
    renderHeaderStatus,
    renderStorageStatus,
    switchTab,
  };
}

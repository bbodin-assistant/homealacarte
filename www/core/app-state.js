function storedJson(storage, key, fallback = null) {
  try {
    return JSON.parse(storage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export function createAppState(storage, getStorageStatus, defaultLanguage = "") {
  const autoMenu = storedJson(storage, "homealacarte-auto-menu-options", {});
  const autoMenuNumber = (key, fallback) => {
    const value = Number(autoMenu[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    language: storage.getItem("homealacarte-language") || defaultLanguage,
    snapshot: null,
    familyDraft: [],
    familyEditKey: null,
    familyOriginal: "",
    draft: [],
    stockDraft: [],
    customDraft: [],
    activeTab: "family",
    itemCatalogueTab: storage.getItem("homealacarte-item-catalogue-tab") === "other"
      ? "other"
      : "food",
    groceryMode: storage.getItem("homealacarte-grocery-mode") || "list",
    menuMode: storage.getItem("homealacarte-menu-mode") || "manual",
    menuSelectedOnly: storage.getItem("homealacarte-menu-selected-only") === "true",
    menuWeekOffset: 0,
    groceryHideStocked: storage.getItem("homealacarte-grocery-hide-stocked") === "true",
    colorTheme: Number(storage.getItem("homealacarte-color-theme") || 0),
    randomThemes: storedJson(storage, "homealacarte-random-themes", []),
    dishRangeSignature: "",
    source: "bundled",
    requestId: 0,
    latestRequest: 0,
    editTimer: null,
    stockTimer: null,
    customTimer: null,
    importedSources: null,
    serializedData: null,
    storageStatus: getStorageStatus(),
    privacyRequests: [],
    privacyRequestsUserId: "",
    privacyRequestsLoading: false,
    restorePeople: null,
    restoreMenu: null,
    restoreStock: null,
    restoreCustom: null,
    menuCellDraft: null,
    pendingConfirmation: null,
    pendingReplacementIndex: null,
    pendingMissingValue: null,
    dishDetailsMenuIndex: null,
    dishDetailsDishKey: null,
    dishDetailsOriginal: null,
    dishDetailsItemUnit: "unit",
    dishDetailsScheduling: false,
    dishFormKey: null,
    dishFormOriginal: "",
    ingredientSelectedKey: null,
    itemEditorCreating: false,
    ingredientOriginal: "",
    householdItemOriginal: "",
    draggedMenuIndex: null,
    autoMenuSignature: "",
    autoMenuAvailability: {},
    autoMenuSlots: {},
    autoMenuCandidates: {},
    autoMenuOptions: {
      kcalThreshold: autoMenuNumber("kcalThreshold", 150),
      minPortions: autoMenuNumber("minPortions", 0.5),
      maxPortions: autoMenuNumber("maxPortions", 2),
      portionStep: autoMenuNumber("portionStep", 0.25),
      samePortionForEveryone: autoMenu.samePortionForEveryone === true,
    },
    autoMenuProposal: null,
    engineBusy: false,
    engineMessage: "",
    lastError: null,
    pendingDataAction: null,
  };
}

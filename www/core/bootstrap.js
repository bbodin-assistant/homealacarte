import {
  loadBundledDefaults,
  mergeBundledDishClassifications,
  mergeBundledIngredientNutrition,
  mergeDuplicateIngredient,
  mergeBundledFoodRules,
  mergeBundledFoodRuleDependencies,
  mergeBundledFoodRulesInSources,
} from "./profile-rules.js?v=homealacarte-78";

const DATA_SCHEMA_VERSION = 12;
const ROW_SYNC_MIGRATION_VERSIONS = [10];
const FOOD_RULE_MIGRATION_VERSIONS = [6, 7, 11];
const INGREDIENT_MIGRATION_VERSIONS = [6, 7, 8];
const NUTRITION_MIGRATION_VERSIONS = [6, 7, 8, 9];
const APPLICATION_TABS = ["family", "menu", "grocery", "dishes", "items", "data"];

export function applySynchronizedPrivateState({
  state,
  saved,
  applyTranslations,
  send,
  source = "synchronized",
}) {
  if (saved?.version !== DATA_SCHEMA_VERSION || !saved.sources?.length) return false;
  state.language = saved.language || state.language;
  state.importedSources = saved.sources;
  state.restorePeople = null;
  state.restoreMenu = null;
  state.restoreStock = null;
  state.restoreCustom = null;
  applyTranslations();
  const requestId = send("load-files", {
    files: saved.sources,
    language: state.language,
    source,
  });
  state.nonPersistingRequestIds ||= new Set();
  state.nonPersistingRequestIds.add(requestId);
  return true;
}

export async function bootstrapApplication({
  state,
  requestedTab,
  loadPrivateState,
  applyColorTheme,
  applyTranslations,
  switchTab,
  send,
}) {
  applyColorTheme(state.colorTheme);
  applyTranslations();
  if (APPLICATION_TABS.includes(requestedTab)) switchTab(requestedTab);

  const saved = await loadPrivateState().catch(() => null);
  if (applySynchronizedPrivateState({
    state,
    saved,
    applyTranslations,
    send,
    source: "saved",
  })) return;
  if ([...NUTRITION_MIGRATION_VERSIONS, ...ROW_SYNC_MIGRATION_VERSIONS,
    ...FOOD_RULE_MIGRATION_VERSIONS, DATA_SCHEMA_VERSION]
    .includes(saved?.version)) {
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
      state.importedSources = mergeBundledFoodRuleDependencies(
        state.importedSources || [],
        bundled.people,
        bundled.dishes,
        bundled.items,
      );
      if (state.restorePeople) {
        state.restorePeople = mergeBundledFoodRules(state.restorePeople, bundled.people);
      }
      state.importedSources = mergeBundledFoodRulesInSources(
        state.importedSources || [],
        bundled.people,
      );
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
    send("load-files", {
      files: state.importedSources,
      language: state.language,
      source: "saved",
    });
  } else {
    send("load-bundled", {
      manifestUrl: "./data-manifest.json",
      language: state.language,
    });
  }
}

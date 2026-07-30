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
} from "./storage.js?v=homealacarte-51";
import { t, translations } from "./translations.js?v=homealacarte-51";
import {
  catalogItemsForGrocery,
  combinedPriceHistory,
  menuUsageContext,
  priceChartGeometry,
} from "./item-details.js?v=homealacarte-51";
import { matchesSelectedNutriScores } from "./dish-filters.js?v=homealacarte-51";
import { buildScheduledDishRow } from "./dish-scheduling.js?v=homealacarte-51";
import {
  catalogueCategories,
  filterCatalogueItems,
} from "./catalogue-filters.js?v=homealacarte-51";

document.documentElement.dataset.appModuleLoaded = "true";

const STORAGE_PREFIX = "homealacarte-";
const DATA_SCHEMA_VERSION = 6;
function storedJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

const worker = new Worker("./worker.js?v=homealacarte-51", { type: "module" });
const state = {
  language: localStorage.getItem("homealacarte-language") || "fr",
  snapshot: null,
  familyDraft: [],
  familyEditKey: null,
  familyOriginal: "",
  draft: [],
  stockDraft: [],
  customDraft: [],
  activeTab: "family",
  itemCatalogueTab: localStorage.getItem("homealacarte-item-catalogue-tab") === "other"
    ? "other"
    : "food",
  groceryMode: localStorage.getItem("homealacarte-grocery-mode") || "list",
  menuSelectedOnly: localStorage.getItem("homealacarte-menu-selected-only") === "true",
  groceryHideStocked: localStorage.getItem("homealacarte-grocery-hide-stocked") === "true",
  colorTheme: Number(localStorage.getItem("homealacarte-color-theme") || 0),
  randomThemes: storedJson("homealacarte-random-themes", []),
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
  engineBusy: false,
  engineMessage: "",
  lastError: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const formatNumber = (value, digits = 1) => new Intl.NumberFormat(
  state.language === "fr" ? "fr-FR" : "en-GB",
  { maximumFractionDigits: digits },
).format(value || 0);
const formatMoney = (value) => new Intl.NumberFormat(
  state.language === "fr" ? "fr-FR" : "en-GB",
  { style: "currency", currency: "EUR" },
).format(value || 0);
const formatInputNumber = (value) => Math.round((Number(value) || 0) * 10_000) / 10_000;
const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (!bytes) return `0 ${t(state.language, "bytes")}`;
  const units = ["bytes", "kilobytes", "megabytes"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${formatNumber(bytes / (1024 ** index), index ? 1 : 0)} ${t(state.language, units[index])}`;
};
const formatDateTime = (value) => {
  if (!value) return t(state.language, "never");
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? t(state.language, "unknown")
    : new Intl.DateTimeFormat(state.language === "fr" ? "fr-FR" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
};
const displayCategory = (value) => String(value || "").replaceAll("::", " › ");
const normalizedCategory = (value) => String(value || "").replace(/\s*›\s*/g, "::");
const translatedTemplate = (key, values = {}) => Object.entries(values).reduce(
  (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
  t(state.language, key),
);
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

const COLOR_THEMES = [
  {
    paper: "#f7f4ed", surface: "#fffdf8", surfaceStrong: "#ffffff",
    ink: "#2f2b27", muted: "#746e66", line: "#e5dfd4", lineStrong: "#d6cdbf",
    accent: "#b45e46", accentDark: "#8e4533", accentSoft: "#f3dfd8",
    green: "#557763", greenSoft: "#e2ece5", gold: "#c38a39",
  },
  {
    paper: "#eef6f8", surface: "#fbfeff", surfaceStrong: "#ffffff",
    ink: "#17343c", muted: "#5e7780", line: "#d4e4e8", lineStrong: "#bfd4d9",
    accent: "#167d91", accentDark: "#0d5b6c", accentSoft: "#d4edf2",
    green: "#6c7f3f", greenSoft: "#e7edd8", gold: "#d69035",
  },
  {
    paper: "#f6f1fa", surface: "#fefbff", surfaceStrong: "#ffffff",
    ink: "#34283c", muted: "#786a80", line: "#e6dbea", lineStrong: "#d6c7dc",
    accent: "#7c4d9e", accentDark: "#5f347e", accentSoft: "#eadcf2",
    green: "#477d70", greenSoft: "#dcedea", gold: "#c28a34",
  },
  {
    paper: "#f8f6e9", surface: "#fffef8", surfaceStrong: "#ffffff",
    ink: "#333225", muted: "#76725d", line: "#e7e1c6", lineStrong: "#d8d0aa",
    accent: "#d46a1f", accentDark: "#a94b0c", accentSoft: "#f8e1ce",
    green: "#54813d", greenSoft: "#e3efd9", gold: "#c79416",
  },
  {
    paper: "#faf1f4", surface: "#fffafd", surfaceStrong: "#ffffff",
    ink: "#3d2630", muted: "#806b73", line: "#ead9df", lineStrong: "#d9c3cb",
    accent: "#b33967", accentDark: "#8a244b", accentSoft: "#f2d8e2",
    green: "#477966", greenSoft: "#dcebe5", gold: "#bd8536",
  },
  {
    paper: "#eef5ef", surface: "#fbfefb", surfaceStrong: "#ffffff",
    ink: "#26362b", muted: "#68786d", line: "#d8e4da", lineStrong: "#c3d3c6",
    accent: "#39745a", accentDark: "#285841", accentSoft: "#d7e9df",
    green: "#8a6b35", greenSoft: "#eee5d3", gold: "#c27b32",
  },
];

function applyColorTheme(index) {
  const numericIndex = Number(index);
  const safeIndex = Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < 12
    ? numericIndex
    : 0;
  while (state.randomThemes.length < 6) state.randomThemes.push(vividRandomTheme());
  if (state.randomThemes.length > 6) state.randomThemes = state.randomThemes.slice(0, 6);
  localStorage.setItem("homealacarte-random-themes", JSON.stringify(state.randomThemes));
  const theme = safeIndex < COLOR_THEMES.length
    ? COLOR_THEMES[safeIndex]
    : state.randomThemes[safeIndex - COLOR_THEMES.length];
  const root = document.documentElement.style;
  Object.entries(theme).forEach(([key, value]) => {
    const property = `--${key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`;
    root.setProperty(property, value);
  });
  state.colorTheme = safeIndex;
}

function vividRandomTheme() {
  const hue = Math.floor(Math.random() * 360);
  const secondary = (hue + 110 + Math.floor(Math.random() * 70)) % 360;
  const tertiary = (hue + 225 + Math.floor(Math.random() * 45)) % 360;
  const lightBackground = Math.random() > 0.22;
  if (lightBackground) {
    return {
      paper: `hsl(${hue} 88% 72%)`,
      surface: `hsl(${secondary} 92% 90%)`,
      surfaceStrong: `hsl(${tertiary} 95% 86%)`,
      ink: `hsl(${tertiary} 82% 12%)`,
      muted: `hsl(${secondary} 68% 25%)`,
      line: `hsl(${hue} 72% 43%)`,
      lineStrong: `hsl(${tertiary} 76% 35%)`,
      accent: `hsl(${secondary} 92% 40%)`,
      accentDark: `hsl(${secondary} 95% 23%)`,
      accentSoft: `hsl(${secondary} 95% 78%)`,
      green: `hsl(${tertiary} 82% 31%)`,
      greenSoft: `hsl(${tertiary} 82% 78%)`,
      gold: `hsl(${(hue + 45) % 360} 96% 43%)`,
    };
  }
  return {
    paper: `hsl(${hue} 72% 13%)`,
    surface: `hsl(${secondary} 66% 20%)`,
    surfaceStrong: `hsl(${tertiary} 72% 25%)`,
    ink: `hsl(${(hue + 55) % 360} 96% 88%)`,
    muted: `hsl(${secondary} 78% 77%)`,
    line: `hsl(${tertiary} 72% 48%)`,
    lineStrong: `hsl(${secondary} 82% 59%)`,
    accent: `hsl(${secondary} 96% 64%)`,
    accentDark: `hsl(${secondary} 98% 83%)`,
    accentSoft: `hsl(${secondary} 75% 31%)`,
    green: `hsl(${tertiary} 92% 68%)`,
    greenSoft: `hsl(${tertiary} 65% 30%)`,
    gold: `hsl(${(hue + 45) % 360} 100% 68%)`,
  };
}

function randomizeColorTheme() {
  const next = (Number(state.colorTheme) + 1) % 12;
  localStorage.setItem("homealacarte-color-theme", String(next));
  applyColorTheme(next);
}

function send(type, payload = {}) {
  const requestId = ++state.requestId;
  state.latestRequest = requestId;
  worker.postMessage({ requestId, type, ...payload });
  setBusy(true);
  return requestId;
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
  panel.hidden = false;
  setBusy(false);
}

function clearError() {
  state.lastError = null;
  $("#error-panel").hidden = true;
  renderStorageStatus(state.storageStatus);
}

worker.onmessage = async ({ data }) => {
  if (data.requestId < state.latestRequest && data.type !== "status") return;
  if (typeof data.serializedData === "string") state.serializedData = data.serializedData;
  if (data.type === "status") {
    setBusy(true, data.code ? t(state.language, data.code) : data.message);
    return;
  }
  if (data.type === "error") {
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
  }
};

worker.onerror = (event) => {
  event.preventDefault();
  showError(event.message, "worker_error");
};

worker.onmessageerror = () => {
  showError("", "worker_error");
};

function downloadText(filename, content) {
  downloadBytes(
    filename,
    new TextEncoder().encode(content),
    "application/json;charset=utf-8",
  );
}

function downloadBytes(filename, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function zipHeader(size) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function joinBytes(parts) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function buildZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const file of files) {
    const path = String(file.path || "").replaceAll("\\", "/").replace(/^\/+/, "");
    if (!path || path.split("/").includes("..")) throw new Error(`Invalid ZIP path: ${file.path}`);
    const name = encoder.encode(path);
    const content = encoder.encode(file.content);
    const checksum = crc32(content);

    const local = zipHeader(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint16(10, 0, true);
    local.view.setUint16(12, 33, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, content.length, true);
    local.view.setUint32(22, content.length, true);
    local.view.setUint16(26, name.length, true);
    local.view.setUint16(28, 0, true);
    localParts.push(local.bytes, name, content);

    const central = zipHeader(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint16(12, 0, true);
    central.view.setUint16(14, 33, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, content.length, true);
    central.view.setUint32(24, content.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint16(30, 0, true);
    central.view.setUint16(32, 0, true);
    central.view.setUint16(34, 0, true);
    central.view.setUint16(36, 0, true);
    central.view.setUint32(38, 0, true);
    central.view.setUint32(42, localOffset, true);
    centralParts.push(central.bytes, name);

    localOffset += local.bytes.length + name.length + content.length;
  }

  const centralDirectory = joinBytes(centralParts);
  const end = zipHeader(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(4, 0, true);
  end.view.setUint16(6, 0, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralDirectory.length, true);
  end.view.setUint32(16, localOffset, true);
  end.view.setUint16(20, 0, true);
  return joinBytes([...localParts, centralDirectory, end.bytes]);
}

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
  if (!$("#custom-add-name").value) {
    $("#custom-add-category").value = t(state.language, "other");
    $("#custom-add-measure-unit").value = t(state.language, "units");
  }
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

function render() {
  if (!state.snapshot) return;
  applyTranslations();
  setGroceryMode(state.groceryMode);
  renderFamily();
  renderMenu();
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

function priceHistoryFormPayload(selector) {
  return [...$(selector).querySelectorAll(".item-price-history-row")].map((row) => {
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
        <span class="sr-only">${escapeHtml(t(state.language, "observation_date"))}</span>
        <input type="date" value="${escapeHtml(observation.date || "")}" data-price-observation-date>
      </label>
      <label class="item-price-history-price">
        <span class="sr-only">${escapeHtml(t(state.language, "observed_price"))}</span>
        <input type="number" min="0" step="0.0001" value="${escapeHtml(observation.price ?? "")}" data-price-observation-price required>
      </label>
      <label class="item-price-history-description">
        <span class="sr-only">${escapeHtml(t(state.language, "observation_description"))}</span>
        <input value="${escapeHtml(observation.description || "")}" data-price-observation-description>
      </label>
      <button class="icon-button remove-price-observation" type="button" aria-label="${escapeHtml(t(state.language, "remove_price_observation"))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
      </button>
    </div>`;
}

function updatePriceHistoryEmptyState(selector) {
  const list = $(selector);
  const empty = list.querySelector(".item-price-history-empty");
  if (list.querySelector(".item-price-history-row")) {
    empty?.remove();
  } else if (!empty) {
    list.innerHTML = `<p class="item-price-history-empty">${escapeHtml(t(state.language, "no_price_observations"))}</p>`;
  }
}

function renderPriceHistoryForm(selector, history = []) {
  $(selector).innerHTML = history.map(priceHistoryRowMarkup).join("");
  updatePriceHistoryEmptyState(selector);
}

function addPriceHistoryFormRow(selector) {
  const list = $(selector);
  list.querySelector(".item-price-history-empty")?.remove();
  list.insertAdjacentHTML("beforeend", priceHistoryRowMarkup());
  list.querySelector(".item-price-history-row:last-child [data-price-observation-date]").focus();
}

function ingredientFormPayload() {
  const existing = state.snapshot.ingredients
    .find((ingredient) => ingredient.key === state.ingredientSelectedKey);
  if (!existing && !state.itemEditorCreating) return null;
  const name = $("#ingredient-name").value.trim();
  return {
    key: existing?.key || customIngredientKey(name),
    name,
    custom: existing ? Boolean(existing.custom) : true,
    incomplete: $("#ingredient-incomplete").checked,
    grams: Number($("#ingredient-grams").value),
    kcal: Number($("#ingredient-kcal").value),
    protein_g: Number($("#ingredient-protein").value),
    carbs_g: Number($("#ingredient-carbs").value),
    fat_g: Number($("#ingredient-fat").value),
    fiber_g: Number($("#ingredient-fiber").value),
    sugars_g: optionalInputNumber("#ingredient-sugars"),
    saturated_fat_g: optionalInputNumber("#ingredient-saturated-fat"),
    salt_g: optionalInputNumber("#ingredient-salt"),
    fruit_vegetable_legume_percent: optionalInputNumber("#ingredient-fvl-percent"),
    category: normalizedCategory($("#ingredient-category").value.trim()),
    source: $("#ingredient-source").value.trim(),
    url: $("#ingredient-url").value.trim(),
    price_per_kg: Number($("#ingredient-price").value),
    price_source: $("#ingredient-price-source").value.trim(),
    price_checked_at: $("#ingredient-price-checked-at").value,
    measure_unit: $("#ingredient-measure-unit").value.trim(),
    grams_per_measure_unit: Number($("#ingredient-grams-per-unit").value),
    purchase_unit: $("#ingredient-purchase-unit").value.trim(),
    purchase_quantity_grams: Number($("#ingredient-purchase-grams").value),
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
  $("#ingredient-save").disabled = !ingredientFormIsValid(payload)
    || ingredientFormSignature() === state.ingredientOriginal;
}

function updateIngredientPurchasePrice() {
  const pricePerKg = Number($("#ingredient-price").value);
  const purchaseGrams = Number($("#ingredient-purchase-grams").value);
  const calculated = pricePerKg * purchaseGrams / 1000;
  $("#ingredient-purchase-price").value = Number.isFinite(calculated)
    ? formatMoney(calculated)
    : "";
}

function populateIngredientForm(key) {
  const ingredient = state.snapshot.ingredients.find((item) => item.key === key);
  if (!ingredient) return;
  state.ingredientSelectedKey = ingredient.key;
  state.itemEditorCreating = false;
  $("#ingredient-delete").hidden = false;
  $("#ingredient-save").textContent = t(state.language, "save_changes");
  $("#ingredient-editor-name").textContent = ingredient.name;
  $("#ingredient-name").value = ingredient.name;
  $("#ingredient-category").value = displayCategory(ingredient.category);
  $("#ingredient-measure-unit").value = ingredient.measure_unit;
  $("#ingredient-grams-per-unit").value = formatInputNumber(ingredient.grams_per_measure_unit);
  $("#ingredient-grams").value = formatInputNumber(ingredient.grams);
  $("#ingredient-kcal").value = formatInputNumber(ingredient.kcal);
  $("#ingredient-protein").value = formatInputNumber(ingredient.protein_g);
  $("#ingredient-carbs").value = formatInputNumber(ingredient.carbs_g);
  $("#ingredient-fat").value = formatInputNumber(ingredient.fat_g);
  $("#ingredient-fiber").value = formatInputNumber(ingredient.fiber_g);
  $("#ingredient-sugars").value = ingredient.sugars_g == null ? "" : formatInputNumber(ingredient.sugars_g);
  $("#ingredient-saturated-fat").value = ingredient.saturated_fat_g == null ? "" : formatInputNumber(ingredient.saturated_fat_g);
  $("#ingredient-salt").value = ingredient.salt_g == null ? "" : formatInputNumber(ingredient.salt_g);
  $("#ingredient-fvl-percent").value = ingredient.fruit_vegetable_legume_percent == null
    ? ""
    : formatInputNumber(ingredient.fruit_vegetable_legume_percent);
  $("#ingredient-price").value = formatInputNumber(ingredient.price_per_kg);
  $("#ingredient-price-source").value = ingredient.price_source || "";
  $("#ingredient-price-checked-at").value = ingredient.price_checked_at || "";
  $("#ingredient-purchase-unit").value = ingredient.purchase_unit;
  $("#ingredient-purchase-grams").value = formatInputNumber(ingredient.purchase_quantity_grams);
  $("#ingredient-source").value = ingredient.source;
  $("#ingredient-url").value = ingredient.url;
  $("#ingredient-incomplete").checked = Boolean(ingredient.incomplete);
  renderPriceHistoryForm("#ingredient-price-history-list", ingredient.price_history);
  updateIngredientPurchasePrice();
  const status = $("#ingredient-completeness");
  status.className = `ingredient-completeness ${ingredient.incomplete ? "incomplete" : "complete"}`;
  status.textContent = t(
    state.language,
    ingredient.incomplete ? "ingredient_incomplete" : "ingredient_complete",
  );
  $("#ingredient-form-message").textContent = "";
  state.ingredientOriginal = ingredientFormSignature();
  updateIngredientSaveState();
}

function householdItemFormPayload() {
  const existing = (state.snapshot.household_items || [])
    .find((item) => item.key === state.ingredientSelectedKey);
  if (!existing && !state.itemEditorCreating) return null;
  const name = $("#household-item-name").value.trim();
  const lastingDays = $("#household-item-lasting-days").value;
  return {
    key: existing?.key || customIngredientKey(name),
    name,
    category: normalizedCategory($("#household-item-category").value.trim()),
    purchase_unit: $("#household-item-purchase-unit").value.trim(),
    purchase_quantity: Number($("#household-item-purchase-quantity").value),
    estimated_price: Number($("#household-item-price").value),
    measure_unit: $("#household-item-measure-unit").value.trim(),
    last_bought_at: $("#household-item-last-bought").value,
    lasting_days: lastingDays === "" ? null : Number(lastingDays),
    notes: $("#household-item-notes").value.trim(),
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
  $("#household-item-save").disabled = !householdItemFormIsValid(item)
    || householdItemFormSignature() === state.householdItemOriginal;
}

function populateHouseholdItemForm(key) {
  const item = (state.snapshot.household_items || []).find((candidate) => candidate.key === key);
  if (!item) return;
  state.ingredientSelectedKey = item.key;
  state.itemEditorCreating = false;
  $("#household-item-delete").hidden = false;
  $("#household-item-save").textContent = t(state.language, "save_changes");
  $("#household-item-editor-name").textContent = item.name;
  $("#household-item-name").value = item.name;
  $("#household-item-category").value = displayCategory(item.category);
  $("#household-item-measure-unit").value = item.measure_unit;
  $("#household-item-purchase-unit").value = item.purchase_unit;
  $("#household-item-purchase-quantity").value = formatInputNumber(item.purchase_quantity);
  $("#household-item-price").value = formatInputNumber(item.estimated_price);
  $("#household-item-last-bought").value = item.last_bought_at || "";
  $("#household-item-lasting-days").value = item.lasting_days ?? "";
  $("#household-item-notes").value = item.notes || "";
  renderPriceHistoryForm("#household-item-price-history-list", item.price_history);
  $("#household-item-form-message").textContent = "";
  state.householdItemOriginal = householdItemFormSignature();
  updateHouseholdItemSaveState();
}

function closeItemEditor() {
  state.ingredientSelectedKey = null;
  state.itemEditorCreating = false;
  state.ingredientOriginal = "";
  state.householdItemOriginal = "";
  $("#ingredient-form").hidden = true;
  $("#household-item-form").hidden = true;
  $("#add-catalogue-item").hidden = false;
  $("#item-filter-panel").hidden = false;
  $("#item-catalogue").hidden = false;
}

function openItemEditor(key, kind) {
  state.itemEditorCreating = false;
  $("#add-catalogue-item").hidden = true;
  $("#item-filter-panel").hidden = true;
  $("#item-catalogue").hidden = true;
  const food = kind === "food";
  $("#ingredient-form").hidden = !food;
  $("#household-item-form").hidden = food;
  if (food) populateIngredientForm(key);
  else populateHouseholdItemForm(key);
}

function openNewCatalogueItem() {
  state.ingredientSelectedKey = null;
  state.itemEditorCreating = true;
  $("#add-catalogue-item").hidden = true;
  $("#item-filter-panel").hidden = true;
  $("#item-catalogue").hidden = true;
  const food = state.itemCatalogueTab === "food";
  $("#ingredient-form").hidden = !food;
  $("#household-item-form").hidden = food;
  const selectedCategory = displayCategory($("#item-category-filter").value);
  if (food) {
    $("#ingredient-editor-name").textContent = t(state.language, "new_food_item");
    $("#ingredient-delete").hidden = true;
    $("#ingredient-save").textContent = t(state.language, "add_catalogue_item");
    $("#ingredient-name").value = "";
    $("#ingredient-category").value = selectedCategory;
    $("#ingredient-measure-unit").value = "g";
    $("#ingredient-grams-per-unit").value = "1";
    $("#ingredient-grams").value = "100";
    $("#ingredient-kcal").value = "0";
    $("#ingredient-protein").value = "0";
    $("#ingredient-carbs").value = "0";
    $("#ingredient-fat").value = "0";
    $("#ingredient-fiber").value = "0";
    $("#ingredient-sugars").value = "";
    $("#ingredient-saturated-fat").value = "";
    $("#ingredient-salt").value = "";
    $("#ingredient-fvl-percent").value = "";
    $("#ingredient-price").value = "0";
    $("#ingredient-price-source").value = "";
    $("#ingredient-price-checked-at").value = "";
    $("#ingredient-purchase-unit").value = "1 kg";
    $("#ingredient-purchase-grams").value = "1000";
    $("#ingredient-source").value = "";
    $("#ingredient-url").value = "";
    $("#ingredient-incomplete").checked = true;
    renderPriceHistoryForm("#ingredient-price-history-list");
    $("#ingredient-completeness").className = "ingredient-completeness incomplete";
    $("#ingredient-completeness").textContent = t(state.language, "ingredient_incomplete");
    $("#ingredient-form-message").textContent = "";
    state.ingredientOriginal = "";
    updateIngredientSaveState();
    $("#ingredient-name").focus();
    return;
  }
  $("#household-item-editor-name").textContent = t(state.language, "new_general_item");
  $("#household-item-delete").hidden = true;
  $("#household-item-save").textContent = t(state.language, "add_catalogue_item");
  $("#household-item-name").value = "";
  $("#household-item-category").value = selectedCategory || t(state.language, "other");
  $("#household-item-measure-unit").value = t(state.language, "units");
  $("#household-item-purchase-unit").value = t(state.language, "units");
  $("#household-item-purchase-quantity").value = "1";
  $("#household-item-price").value = "0";
  $("#household-item-last-bought").value = "";
  $("#household-item-lasting-days").value = "";
  $("#household-item-notes").value = "";
  renderPriceHistoryForm("#household-item-price-history-list");
  $("#household-item-form-message").textContent = "";
  state.householdItemOriginal = "";
  updateHouseholdItemSaveState();
  $("#household-item-name").focus();
}

function configureItemCategoryFilter(items) {
  const select = $("#item-category-filter");
  const categories = catalogueCategories(items);
  const selected = categories.includes(select.value) ? select.value : "";
  select.innerHTML = `
    <option value="">${escapeHtml(t(state.language, "all_categories"))}</option>
    ${categories.map((category) =>
    `<option value="${escapeHtml(category)}">${escapeHtml(displayCategory(category))}</option>`)
    .join("")}`;
  select.value = selected;
  return selected;
}

function renderItemsCatalogue() {
  const ingredients = state.snapshot.ingredients || [];
  const householdItems = state.snapshot.household_items || [];
  const incompleteCount = ingredients.filter((ingredient) => ingredient.incomplete).length;
  setCountBadge("#ingredient-incomplete-count", incompleteCount);
  $("#add-catalogue-item-label").textContent = t(
    state.language,
    state.itemCatalogueTab === "food" ? "add_food_item" : "add_general_item",
  );
  const catalogueRows = state.itemCatalogueTab === "food"
    ? ingredients.map((item) => ({ ...item, item_kind: "food" }))
    : householdItems.map((item) => ({
      ...item,
      item_kind: "general",
      incomplete: false,
    }));
  const selectedCategory = configureItemCategoryFilter(catalogueRows);
  const rows = filterCatalogueItems(catalogueRows, {
    name: $("#item-search").value,
    category: selectedCategory,
  })
    .sort((left, right) => left.name.localeCompare(right.name, state.language));
  $("#item-catalogue").innerHTML = `
    <div class="item-catalogue-tabs" role="tablist" aria-label="${escapeHtml(t(state.language, "item_type"))}">
      <button class="item-catalogue-tab${state.itemCatalogueTab === "food" ? " active" : ""}" type="button" role="tab" aria-selected="${state.itemCatalogueTab === "food"}" data-item-catalogue-tab="food">
        <span>${escapeHtml(t(state.language, "food_items_tab"))}</span>
        <span class="item-catalogue-tab-count">${ingredients.length}</span>
      </button>
      <button class="item-catalogue-tab${state.itemCatalogueTab === "other" ? " active" : ""}" type="button" role="tab" aria-selected="${state.itemCatalogueTab === "other"}" data-item-catalogue-tab="other">
        <span>${escapeHtml(t(state.language, "other_items_tab"))}</span>
        <span class="item-catalogue-tab-count">${householdItems.length}</span>
      </button>
    </div>
    <div class="item-catalogue-head">
      <span>${escapeHtml(t(state.language, "name"))}</span>
      <span>${escapeHtml(t(state.language, "item_type"))}</span>
      <span>${escapeHtml(t(state.language, "category"))}</span>
      <span></span>
    </div>
    ${rows.map((item) => `
      <div class="item-catalogue-row" role="button" tabindex="0" data-item-details="${escapeHtml(encodeURIComponent(item.key))}" data-item-kind="${item.item_kind}" aria-label="${escapeHtml(`${t(state.language, "details")}: ${item.name}`)}">
        <strong class="item-catalogue-name">
          <span>${item.incomplete ? "⚠ " : ""}${escapeHtml(item.name)}</span>
          ${item.item_kind === "food" && ingredientNutriScoreMissing(item)
            ? `<small>${escapeHtml(translatedTemplate("nutri_score_values_missing", { count: ingredientNutriScoreMissing(item) }))}</small>`
            : ""}
        </strong>
        <span class="item-type-badge">${escapeHtml(t(state.language, item.item_kind === "food" ? "food_item" : "general_item"))}</span>
        <span>${escapeHtml(displayCategory(item.category))}</span>
        <span class="item-catalogue-actions">
          <button class="button ghost compact" type="button" data-item-edit="${escapeHtml(encodeURIComponent(item.key))}" data-item-kind="${item.item_kind}" aria-label="${escapeHtml(`${t(state.language, "edit")}: ${item.name}`)}">${escapeHtml(t(state.language, "edit"))}</button>
          <button class="icon-button" type="button" data-item-delete="${escapeHtml(encodeURIComponent(item.key))}" data-item-name="${escapeHtml(item.name)}" aria-label="${escapeHtml(`${t(state.language, "delete")}: ${item.name}`)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
          </button>
        </span>
      </div>
    `).join("") || `<p class="item-catalogue-empty">${escapeHtml(t(state.language, catalogueRows.length ? "no_matching_items" : state.itemCatalogueTab === "food" ? "no_food_items" : "no_other_items"))}</p>`}
  `;
  if (!$("#ingredient-form").hidden && state.ingredientSelectedKey) {
    const exists = ingredients.some((item) => item.key === state.ingredientSelectedKey);
    if (exists) populateIngredientForm(state.ingredientSelectedKey);
    else closeItemEditor();
  } else if (!$("#household-item-form").hidden && state.ingredientSelectedKey) {
    const exists = (state.snapshot.household_items || [])
      .some((item) => item.key === state.ingredientSelectedKey);
    if (exists) populateHouseholdItemForm(state.ingredientSelectedKey);
    else closeItemEditor();
  }
}

function requestItemDeletion(key, name) {
  openConfirmation({
    title: translatedTemplate("delete_item_title", { name }),
    message: t(state.language, "delete_item_message"),
    confirmLabel: t(state.language, "delete"),
    action: () => {
      closeItemEditor();
      send("delete-item", { key });
    },
  });
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function externalHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function options(values, selected) {
  return values.map((value) =>
    `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`,
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

function familyMemberIcon(kind) {
  if (kind === "child") {
    return `<svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="36" r="20"/>
      <path d="M31 105V78c0-18 13-29 29-29s29 11 29 29v27M45 67l15 12 15-12M43 105V87M77 105V87"/>
      <path d="M48 33c4-8 18-10 25-2"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="29" r="22"/>
    <path d="M24 108V78c0-19 16-33 36-33s36 14 36 33v30M40 108V76M80 108V76"/>
    <path d="M48 48l12 20 12-20"/>
  </svg>`;
}

function renderFamily() {
  const members = state.familyDraft;
  const cards = members.map((person) => {
    const kind = person.kind === "child" ? "child" : "adult";
    const target = person.kcal_target == null
      ? t(state.language, "no_calorie_target")
      : `${formatNumber(person.kcal_target, 0)} kcal`;
    return `<article
      class="family-card ${kind}"
      data-family-edit="${escapeHtml(encodeURIComponent(person.key))}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(`${t(state.language, "edit_family_member")}: ${person.name}`)}"
    >
      <button
        class="family-remove"
        type="button"
        data-family-remove="${escapeHtml(encodeURIComponent(person.key))}"
        title="${escapeHtml(t(state.language, "remove_family_member"))}"
        aria-label="${escapeHtml(`${t(state.language, "remove_family_member")}: ${person.name}`)}"
        ${members.length === 1 ? "disabled" : ""}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
      </button>
      <div class="family-avatar">${familyMemberIcon(kind)}</div>
      <span class="family-kind">${escapeHtml(t(state.language, kind))}</span>
      <h2>${escapeHtml(person.name)}</h2>
      ${person.description ? `<p class="family-description">${escapeHtml(person.description)}</p>` : ""}
      <p class="family-target"><strong>${escapeHtml(target)}</strong><span>${escapeHtml(t(state.language, "daily_target"))}</span></p>
    </article>`;
  }).join("");
  $("#family-grid").innerHTML = `${cards}
    <button id="family-add-card" class="family-add-card" type="button">
      <span aria-hidden="true">+</span>
      <strong>${escapeHtml(t(state.language, "add_family_member"))}</strong>
      <small>${escapeHtml(t(state.language, "adult_or_child"))}</small>
    </button>`;
}

function familyMemberKey(name) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "member";
  const existing = new Set(state.familyDraft.map((person) => person.key));
  let key = base;
  let suffix = 2;
  while (existing.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

function newDishKey(name) {
  const base = `dish_${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "recipe"}`;
  const existing = new Set(state.snapshot.item_options.map((item) => item.key));
  let key = base;
  let suffix = 2;
  while (existing.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

function customIngredientKey(name, reserved = new Set()) {
  const base = `item_${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "custom"}`;
  const existing = new Set([
    ...state.snapshot.item_options.map((item) => item.key),
    ...reserved,
  ]);
  let key = base;
  let suffix = 2;
  while (existing.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

function ingredientOptions(selectedKey = "") {
  return state.snapshot.item_options
    .filter((item) => item.kind === "ingredient")
    .map((item) => `
      <option value="${escapeHtml(item.key)}" ${item.key === selectedKey ? "selected" : ""}>
        ${escapeHtml(item.name)}
      </option>
    `).join("");
}

function setNewDishComponentUnit(row) {
  if (row.dataset.componentMode === "custom") return;
  const item = state.snapshot.item_options.find(
    (option) => option.key === row.querySelector("[data-component-item]").value,
  );
  const select = row.querySelector("[data-component-unit]");
  const current = select.value;
  const measureUnit = item?.measure_unit || "unit";
  select.innerHTML = `<option value="g">g</option>${measureUnit === "g"
    ? ""
    : `<option value="${escapeHtml(measureUnit)}">${escapeHtml(measureUnit)}</option>`}`;
  select.value = [...select.options].some((option) => option.value === current)
    ? current
    : measureUnit;
}

function setDishComponentMode(row, mode) {
  const custom = mode === "custom";
  row.dataset.componentMode = custom ? "custom" : "catalogue";
  row.querySelector("[data-component-custom-toggle]").checked = custom;
  row.querySelector("[data-component-item]").hidden = custom;
  row.querySelector("[data-component-custom-name]").hidden = !custom;
  row.querySelector("[data-component-unit]").hidden = custom;
  row.querySelector("[data-component-custom-unit]").hidden = !custom;
  if (!custom) setNewDishComponentUnit(row);
  updateDishFormSaveState();
}

function addNewDishComponent(component = null, servings = 1) {
  const first = state.snapshot.item_options.find((item) => item.kind === "ingredient");
  if (!first) return;
  const selectedKey = component?.key || first.key;
  const quantity = component
    ? Number(component.quantity) * Number(servings)
    : 1;
  const row = document.createElement("div");
  row.className = "new-dish-component-row";
  row.dataset.componentMode = "catalogue";
  row.innerHTML = `
    <div class="dish-component-item-cell">
      <select data-component-item required aria-label="${escapeHtml(t(state.language, "ingredient"))}">${ingredientOptions(selectedKey)}</select>
      <input data-component-custom-name aria-label="${escapeHtml(t(state.language, "custom_ingredient_name"))}" placeholder="${escapeHtml(t(state.language, "custom_ingredient_name"))}" autocomplete="off" hidden>
    </div>
    <label class="dish-component-custom-toggle">
      <input data-component-custom-toggle type="checkbox">
      <span>${escapeHtml(t(state.language, "custom_item"))}</span>
    </label>
    <input data-component-quantity type="number" min="0.01" step="0.01" value="${formatInputNumber(quantity)}" required aria-label="${escapeHtml(t(state.language, "quantity"))}">
    <div class="dish-component-unit-cell">
      <select data-component-unit required></select>
      <input data-component-custom-unit placeholder="${escapeHtml(t(state.language, "unit_name"))}" aria-label="${escapeHtml(t(state.language, "unit_name"))}" autocomplete="off" hidden>
    </div>
    <button class="icon-button remove-dish-component" type="button" title="${escapeHtml(t(state.language, "remove_ingredient"))}" aria-label="${escapeHtml(t(state.language, "remove_ingredient"))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
    </button>
  `;
  $("#new-dish-component-list").append(row);
  setNewDishComponentUnit(row);
  if (component?.quantity_unit) {
    const unit = row.querySelector("[data-component-unit]");
    if ([...unit.options].some((option) => option.value === component.quantity_unit)) {
      unit.value = component.quantity_unit;
    }
  }
  updateDishFormSaveState();
}

function dishFormSignature() {
  return JSON.stringify({
    name: $("#new-dish-name").value.trim(),
    servings: Number($("#new-dish-servings").value),
    recipe_url: $("#new-dish-url").value.trim(),
    source: $("#new-dish-source").value.trim(),
    nutri_score: $("#new-dish-nutri-score").value,
    notes: $("#new-dish-notes").value.trim(),
    components: $$("#new-dish-component-list .new-dish-component-row").map((row) => ({
      mode: row.dataset.componentMode,
      item_key: row.querySelector("[data-component-item]").value,
      custom_name: row.querySelector("[data-component-custom-name]").value.trim(),
      quantity: Number(row.querySelector("[data-component-quantity]").value),
      quantity_unit: row.querySelector("[data-component-unit]").value,
      custom_unit: row.querySelector("[data-component-custom-unit]").value.trim(),
    })),
  });
}

function dishFormIsValid() {
  const servings = Number($("#new-dish-servings").value);
  const rows = $$("#new-dish-component-list .new-dish-component-row");
  return Boolean($("#new-dish-name").value.trim())
    && Number.isFinite(servings)
    && servings > 0
    && rows.length > 0
    && rows.every((row) => {
      const quantity = Number(row.querySelector("[data-component-quantity]").value);
      const custom = row.dataset.componentMode === "custom";
      return Boolean(custom
        ? row.querySelector("[data-component-custom-name]").value.trim()
          && row.querySelector("[data-component-custom-unit]").value.trim()
        : row.querySelector("[data-component-item]").value)
        && Number.isFinite(quantity)
        && quantity > 0
        && Boolean(custom || row.querySelector("[data-component-unit]").value);
    });
}

function updateDishFormSaveState() {
  const button = $("#new-dish-save");
  if (!button) return;
  const unchanged = Boolean(state.dishFormKey)
    && dishFormSignature() === state.dishFormOriginal;
  button.disabled = !dishFormIsValid() || unchanged;
}

function openDishForm(dish = null) {
  $("#new-dish-form").reset();
  state.dishFormKey = dish?.key || null;
  $("#new-dish-title").textContent = t(state.language, dish ? "edit_dish" : "new_dish");
  $("#new-dish-intro").textContent = t(
    state.language,
    dish ? "edit_dish_intro" : "new_dish_intro",
  );
  $("#new-dish-save").textContent = t(state.language, dish ? "save_changes" : "save_dish");
  $("#new-dish-name").value = dish?.name || "";
  $("#new-dish-servings").value = formatInputNumber(dish?.servings || 4);
  $("#new-dish-url").value = dish?.recipe_url || "";
  $("#new-dish-source").value = dish?.source || "";
  $("#new-dish-nutri-score").value = dish?.nutri_score_manual || "";
  $("#new-dish-nutri-status").textContent = dish
    ? dishNutriScoreDetail(dish)
    : t(state.language, "nutri_score_field_help");
  $("#new-dish-notes").value = (dish?.source_notes || []).join("\n");
  $("#new-dish-error").textContent = "";
  $("#new-dish-component-list").innerHTML = "";
  if (dish?.components?.length) {
    dish.components.forEach((component) => addNewDishComponent(component, dish.servings));
  } else {
    addNewDishComponent();
  }
  state.dishFormOriginal = dishFormSignature();
  updateDishFormSaveState();
  const dialog = $("#new-dish-dialog");
  if (!dialog.open) dialog.showModal();
  $("#new-dish-name").focus();
}

function openNewDishDialog() {
  openDishForm();
}

function closeNewDishDialog() {
  state.dishFormKey = null;
  state.dishFormOriginal = "";
  $("#new-dish-dialog").close();
}

function familyFormSignature() {
  return JSON.stringify({
    name: $("#family-member-name").value.trim(),
    kind: $("#family-form input[name='family-kind']:checked")?.value || "adult",
    kcal_target: $("#family-member-kcal").value === ""
      ? null
      : Number($("#family-member-kcal").value),
    description: $("#family-member-description").value.trim(),
  });
}

function updateFamilyFormSaveState() {
  const name = $("#family-member-name").value.trim();
  const kcalValue = $("#family-member-kcal").value;
  const kcalTarget = kcalValue === "" ? null : Number(kcalValue);
  const valid = Boolean(name)
    && (kcalTarget == null || (Number.isFinite(kcalTarget) && kcalTarget > 0));
  const unchanged = Boolean(state.familyEditKey)
    && familyFormSignature() === state.familyOriginal;
  $("#family-dialog-submit").disabled = !valid || unchanged;
}

function openFamilyDialog(person = null) {
  $("#family-form").reset();
  state.familyEditKey = person?.key || null;
  const editing = Boolean(person);
  const eyebrow = $("#family-dialog-eyebrow");
  const title = $("#family-dialog-title");
  const intro = $("#family-dialog-intro");
  const submit = $("#family-dialog-submit");
  eyebrow.dataset.i18n = editing ? "edit_family_member" : "new_family_member";
  title.dataset.i18n = editing ? "edit_family_member" : "add_family_member";
  intro.dataset.i18n = editing ? "edit_family_intro" : "family_dialog_intro";
  submit.dataset.i18n = editing ? "save_changes" : "validate";
  eyebrow.textContent = t(state.language, eyebrow.dataset.i18n);
  title.textContent = t(state.language, title.dataset.i18n);
  intro.textContent = t(state.language, intro.dataset.i18n);
  submit.textContent = t(state.language, submit.dataset.i18n);
  $("#family-member-name").value = person?.name || "";
  const kind = person?.kind === "child" ? "child" : "adult";
  $(`#family-form input[name="family-kind"][value="${kind}"]`).checked = true;
  $("#family-member-kcal").value = person?.kcal_target ?? "";
  $("#family-member-description").value = person?.description || "";
  state.familyOriginal = editing ? familyFormSignature() : "";
  updateFamilyFormSaveState();
  const dialog = $("#family-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  $("#family-member-name").focus();
}

function closeFamilyDialog() {
  state.familyEditKey = null;
  state.familyOriginal = "";
  const dialog = $("#family-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
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
  const dialog = $("#meal-replace-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  $("#meal-replace-select").focus();
}

function closeMealReplacement() {
  state.pendingReplacementIndex = null;
  const dialog = $("#meal-replace-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function renderMenu() {
  const profileSelect = $("#profile-select");
  const peopleNames = new Map(state.snapshot.people.map((person) => [person.key, person.name]));
  const itemNames = new Map(state.snapshot.item_options.map((item) => [item.key, item.name]));
  const dishes = new Map(state.snapshot.dishes.map((dish) => [dish.key, dish]));
  profileSelect.innerHTML = state.snapshot.people
    .filter((person) => person.kcal_target != null)
    .map((person) => `<option value="${escapeHtml(person.key)}" ${person.key === state.snapshot.profile ? "selected" : ""}>${escapeHtml(person.name)}</option>`)
    .join("");
  $("#show-selected-only").checked = state.menuSelectedOnly;
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
  $("#menu-item-select").focus();
}

function closeMenuItemDialog() {
  state.menuCellDraft = null;
  const dialog = $("#menu-item-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function groceryItemUsage(item) {
  const dishKeys = new Set(
    state.snapshot.dishes
      .filter((dish) => dish.components.some((component) => component.name === item.name))
      .map((dish) => dish.key),
  );
  const directIngredientKeys = new Set(
    state.snapshot.item_options
      .filter((option) => option.kind === "ingredient" && option.name === item.name)
      .map((option) => option.key),
  );
  const itemNames = new Map(state.snapshot.item_options.map((option) => [option.key, option.name]));
  return state.draft
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => dishKeys.has(row.item_key) || directIngredientKeys.has(row.item_key))
    .map(({ row, index }) => ({
      index,
      name: itemNames.get(row.item_key) || row.item_key,
      context: menuUsageContext(row, state.snapshot.people),
      direct: directIngredientKeys.has(row.item_key),
    }));
}

function detailValue(value, suffix = "") {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return null;
  return `${formatNumber(value, 2)}${suffix}`;
}

function detailFields(rows) {
  return `<dl class="item-detail-fields">${rows.map(([label, value, raw = false]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      ${value == null || value === ""
        ? `<dd class="item-detail-missing"><span aria-hidden="true">!</span>${escapeHtml(t(state.language, "not_available"))}</dd>`
        : `<dd>${raw ? value : escapeHtml(value)}</dd>`}
    </div>
  `).join("")}</dl>`;
}

function priceHistoryMarkup(items) {
  const history = combinedPriceHistory(items);
  const chart = priceChartGeometry(history);
  if (!history.length) {
    return `<p class="grocery-usage-empty">${escapeHtml(t(state.language, "no_price_history"))}</p>`;
  }
  const dateLabel = (value) => value || t(state.language, "unknown");
  return `
    <div class="price-history-chart">
      <svg viewBox="0 0 640 220" role="img" aria-label="${escapeHtml(t(state.language, "price_history_chart"))}">
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
          <small>${escapeHtml(row.description || t(state.language, "not_available"))}</small>
        </li>
      `).join("")}
    </ol>`;
}

function itemInformationMarkup(items, groceryItem) {
  const item = items[0];
  if (!item) {
    return `<p class="grocery-usage-empty">${escapeHtml(t(state.language, "item_details_unavailable"))}</p>`;
  }
  const food = Object.hasOwn(item, "kcal");
  const sourceUrl = externalHttpUrl(item.url);
  const groceryFields = groceryItem ? detailFields([
    [t(state.language, "total_need"), groceryItem.needed_quantity_text],
    [t(state.language, "in_stock"), groceryItem.stock_quantity_text || formatNumber(0)],
    [t(state.language, "buy"), groceryItem.purchase_quantity_text || t(state.language, "stock_enough")],
    [t(state.language, "estimated_total"), formatMoney(groceryItem.estimated_purchase_price)],
  ]) : "";
  const identity = detailFields([
    [t(state.language, "item_identifier"), item.key],
    [t(state.language, "item_type"), t(state.language, food ? "food_item" : "general_item")],
    [t(state.language, "category"), displayCategory(item.category)],
    [t(state.language, "measure_unit_name"), item.measure_unit],
    [t(state.language, "description_status"), food
      ? t(state.language, item.incomplete ? "ingredient_incomplete" : "ingredient_complete")
      : t(state.language, "ingredient_complete")],
  ]);
  const nutrition = food ? detailFields([
    [t(state.language, "nutrition_reference_grams"), detailValue(item.grams, " g")],
    [t(state.language, "kcal_for_reference"), detailValue(item.kcal)],
    [t(state.language, "protein_grams"), detailValue(item.protein_g, " g")],
    [t(state.language, "carbs_grams"), detailValue(item.carbs_g, " g")],
    [t(state.language, "fat_grams"), detailValue(item.fat_g, " g")],
    [t(state.language, "fiber_grams"), detailValue(item.fiber_g, " g")],
    [t(state.language, "sugars_grams"), detailValue(item.sugars_g, " g")],
    [t(state.language, "saturated_fat_grams"), detailValue(item.saturated_fat_g, " g")],
    [t(state.language, "salt_grams"), detailValue(item.salt_g, " g")],
    [t(state.language, "fruit_vegetable_legume_percent"), detailValue(item.fruit_vegetable_legume_percent, " %")],
  ]) : "";
  const source = food ? detailFields([
    [t(state.language, "source"), item.source],
    [t(state.language, "source_url"), sourceUrl
      ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>`
      : item.url ? escapeHtml(item.url) : null, true],
  ]) : "";
  const purchase = food ? detailFields([
    [t(state.language, "grams_per_unit"), detailValue(item.grams_per_measure_unit, " g")],
    [t(state.language, "purchase_unit"), item.purchase_unit],
    [t(state.language, "purchase_quantity_grams"), detailValue(item.purchase_quantity_grams, " g")],
    [t(state.language, "price_per_kg"), formatMoney(item.price_per_kg)],
    [t(state.language, "estimated_purchase_price"), formatMoney(item.price_per_kg * item.purchase_quantity_grams / 1000)],
    [t(state.language, "price_checked_at"), item.price_checked_at],
    [t(state.language, "price_source"), item.price_source],
  ]) : detailFields([
    [t(state.language, "purchase_unit"), item.purchase_unit],
    [t(state.language, "purchase_quantity"), detailValue(item.purchase_quantity)],
    [t(state.language, "unit_price"), formatMoney(item.estimated_price)],
    [t(state.language, "last_bought_at"), item.last_bought_at],
    [t(state.language, "lasting_days"), detailValue(item.lasting_days)],
    [t(state.language, "notes"), item.notes],
  ]);
  return `
    ${groceryItem ? `<section><h3>${escapeHtml(t(state.language, "grocery_list"))}</h3>${groceryFields}</section>` : ""}
    <section><h3>${escapeHtml(t(state.language, "item_identity_title"))}</h3>${identity}</section>
    ${food ? `<section><h3>${escapeHtml(t(state.language, "ingredient_nutrition_title"))}</h3>${nutrition}</section>` : ""}
    ${food ? `<section><h3>${escapeHtml(t(state.language, "ingredient_sources_title"))}</h3>${source}</section>` : ""}
    <section><h3>${escapeHtml(t(state.language, "ingredient_purchase_title"))}</h3>${purchase}</section>
    <section class="price-history-section">
      <h3>${escapeHtml(t(state.language, "price_history"))}</h3>
      ${priceHistoryMarkup(items)}
    </section>`;
}

function openItemDetails(items, groceryItem = null) {
  const item = items[0];
  if (!item && !groceryItem) return;
  const usageItem = groceryItem || item;
  const usages = groceryItemUsage(usageItem);
  $("#grocery-details-title").textContent = item?.name || groceryItem.name;
  $("#grocery-details-information").innerHTML = itemInformationMarkup(items, groceryItem);
  const editButton = $("#grocery-details-edit");
  editButton.hidden = !item;
  editButton.dataset.itemKey = item ? encodeURIComponent(item.key) : "";
  editButton.dataset.itemKind = item
    ? (Object.hasOwn(item, "kcal") ? "food" : "general")
    : "";
  $("#grocery-details-list").innerHTML = usages.map((usage) => `
      <article class="grocery-usage ${usage.direct ? "direct" : ""}">
        <strong>${escapeHtml(usage.name)}</strong>
        <small>${escapeHtml(usage.context)}${usage.direct ? ` · ${escapeHtml(t(state.language, "direct_menu_use"))}` : ""}</small>
        <div class="grocery-usage-actions">
          <button class="button danger" type="button" data-grocery-meal-delete="${usage.index}">${escapeHtml(t(state.language, "delete"))}</button>
          <button class="button ghost" type="button" data-grocery-meal-replace="${usage.index}">${escapeHtml(t(state.language, "replace"))}</button>
        </div>
      </article>
    `).join("") || `<p class="grocery-usage-empty">${escapeHtml(t(state.language, "no_linked_dishes"))}</p>`;
  $("#grocery-details-usages").hidden = !usages.length;
  const dialog = $("#grocery-details-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  $("#grocery-details-close").focus();
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
  const dialog = $("#grocery-details-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function renderGrocery() {
  const grocery = state.snapshot.grocery_plan;
  $("#grocery-hide-stocked").checked = state.groceryHideStocked;
  const categories = grocery.categories
    .map((category) => ({
      ...category,
      subcategories: category.subcategories
        .map((subcategory) => ({
          ...subcategory,
          items: subcategory.items.filter((item) =>
            !state.groceryHideStocked || !item.stock_sufficient
          ),
        }))
        .filter((subcategory) => subcategory.items.length),
    }))
    .filter((category) => category.subcategories.length);
  $("#grocery-grid").innerHTML = categories.map((category) => `
    <article class="grocery-category">
      <h2>${escapeHtml(category.name)}</h2>
      ${category.subcategories.map((subcategory) => `
        <section class="grocery-subcategory">
          ${subcategory.name ? `<h3>${escapeHtml(subcategory.name)}</h3>` : ""}
          ${subcategory.items.map((item) => {
            const checked = item.stock_sufficient;
            const partial = !checked && Number(item.stock_quantity) > 0;
            const purchase = item.stock_sufficient
              ? t(state.language, "stock_enough")
              : partial
                ? `${t(state.language, "in_stock")}: ${escapeHtml(item.stock_quantity_text)} / ${escapeHtml(item.needed_quantity_text)} · ${t(state.language, "buy")}: ${escapeHtml(item.purchase_quantity_text)}`
                : `${t(state.language, "buy")}: ${escapeHtml(item.purchase_quantity_text)}`;
            const stockStatus = checked
              ? `<span class="stock-status enough">${escapeHtml(t(state.language, "stock_enough"))}</span>`
              : partial
                ? `<span class="stock-status partial">${escapeHtml(t(state.language, "stock_partial"))}: ${escapeHtml(item.stock_quantity_text)}</span>`
                : "";
            return `<div class="grocery-item ${checked ? "checked stock-covered" : ""} ${partial ? "stock-partial" : ""}" tabindex="0" data-grocery-details="${escapeHtml(encodeURIComponent(item.id))}" aria-label="${escapeHtml(`${t(state.language, "details")}: ${item.name}`)}">
              <span class="grocery-item-check">
                <input type="checkbox" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(`${t(state.language, checked ? "remove_stock" : "add_stock")}: ${item.name}`)}" ${checked ? "checked" : ""}>
                <span><strong>${escapeHtml(item.name)}</strong><small>${t(state.language, "total_need")}: ${escapeHtml(item.needed_quantity_text)} · ${purchase}</small></span>
              </span>
              <span class="grocery-item-end">
                ${stockStatus}
                ${checked ? "" : `<span class="price">${formatMoney(item.estimated_purchase_price)}</span>`}
              </span>
            </div>`;
          }).join("")}
        </section>
      `).join("")}
    </article>
  `).join("") || `<p class="grocery-empty">${escapeHtml(t(state.language, "empty"))}</p>`;
  updateGroceryProgress();
}

function customGroceryPayload() {
  return state.customDraft.map((item) => ({
    key: item.key,
    name: item.name,
    category: normalizedCategory(item.category),
    quantity: Number(item.quantity),
    measure_unit: item.measure_unit,
    purchase_unit: item.purchase_unit,
    purchase_quantity: Number(item.purchase_quantity),
    estimated_price: Number(item.estimated_price),
    custom: Boolean(item.custom),
  }));
}

function renderCustomGrocery() {
  setCountBadge("#needs-tab-count", state.customDraft.length);
  $("#empty-extra-needs").disabled = state.customDraft.length === 0;
  const activeKeys = new Set(state.customDraft.map((item) => item.key));
  $("#custom-add-existing").innerHTML = (state.snapshot.household_options || [])
    .filter((item) => !activeKeys.has(item.key))
    .map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.name)} · ${escapeHtml(displayCategory(item.category))}</option>`)
    .join("");
  const rows = state.customDraft.map((item) => `
    <div class="custom-row" data-custom-key="${escapeHtml(item.key)}">
      <strong class="custom-row-name">
        ${escapeHtml(item.name)}
        <small class="item-origin ${item.custom ? "custom" : "catalogue"}">${escapeHtml(t(state.language, item.custom ? "custom_item" : "catalogue_item"))}</small>
      </strong>
      <span class="custom-category">${escapeHtml(displayCategory(item.category))}</span>
      <input class="custom-quantity" data-custom-field="quantity" type="number" min="0.01" step="0.01" value="${formatInputNumber(item.quantity)}" aria-label="${escapeHtml(t(state.language, "quantity"))}">
      <span class="custom-unit">${escapeHtml(item.measure_unit)}</span>
      <span class="custom-price">${escapeHtml(formatMoney(item.estimated_price))}</span>
      <button class="icon-button remove-custom" type="button" title="${escapeHtml(t(state.language, "remove_custom_grocery"))}" aria-label="${escapeHtml(t(state.language, "remove_custom_grocery"))}">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
      </button>
    </div>
  `).join("") || `<p class="stock-empty">${t(state.language, "empty")}</p>`;
  $("#custom-list").innerHTML = `
    <div class="custom-head">
      <span>${t(state.language, "name")}</span>
      <span>${t(state.language, "category")}</span>
      <span>${t(state.language, "quantity")}</span>
      <span>${t(state.language, "unit")}</span>
      <span>${t(state.language, "unit_price")}</span>
      <span></span>
    </div>
    ${rows}
  `;
  setExtraNeedMode($("input[name='extra-add-mode']:checked")?.value || "existing");
}

function populateHouseholdFields() {
  const option = (state.snapshot.household_options || [])
    .find((item) => item.key === $("#custom-add-existing").value);
  if (!option) return;
  $("#custom-add-category").value = displayCategory(option.category);
  $("#custom-add-measure-unit").value = option.measure_unit;
  $("#custom-add-price").value = formatInputNumber(option.estimated_price);
}

function setExtraNeedMode(mode) {
  const custom = mode === "custom";
  $("#custom-existing-field").hidden = custom;
  $("#custom-name-field").hidden = !custom;
  $("#custom-category-field").hidden = !custom;
  $("#custom-add-name").required = custom;
  $("#custom-add-existing").required = !custom;
  $("#custom-add-category").readOnly = !custom;
  $("#custom-add-measure-unit").readOnly = !custom;
  $("#custom-add-price").readOnly = !custom;
  if (custom) {
    $("#custom-add-category").value = t(state.language, "other");
    $("#custom-add-measure-unit").value = t(state.language, "units");
    $("#custom-add-price").value = "0";
  } else {
    populateHouseholdFields();
  }
}

function stockPayload() {
  return state.stockDraft.map(({ item_key, quantity, quantity_unit, household }) => ({
    item_key,
    quantity: Number(quantity),
    quantity_unit,
    household: Boolean(household),
  }));
}

function renderStock() {
  setCountBadge("#stock-tab-count", state.stockDraft.length);
  $("#empty-stock").disabled = state.stockDraft.length === 0;
  $("#stock-list").innerHTML = state.stockDraft.map((item) => `
    <div class="stock-row" data-stock-key="${escapeHtml(item.item_key)}" data-stock-household="${item.household ? "true" : "false"}">
      <strong class="stock-row-name">
        <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <small>${escapeHtml(displayCategory(item.category))}</small>
      </strong>
      <input class="stock-control" data-stock-field="quantity" type="number" min="0" step="0.01" value="${formatInputNumber(item.quantity)}">
      <select class="stock-control" data-stock-field="quantity_unit">
        ${item.household
          ? `<option value="unit">${escapeHtml(item.measure_unit)}</option>`
          : `<option value="g" ${item.quantity_unit === "g" ? "selected" : ""}>g</option>
            ${item.measure_unit !== "g" ? `<option value="unit" ${item.quantity_unit === "unit" ? "selected" : ""}>${escapeHtml(item.measure_unit)}</option>` : ""}`}
      </select>
      <button class="icon-button remove-stock" type="button" title="${escapeHtml(t(state.language, "remove_stock"))}" aria-label="${escapeHtml(t(state.language, "remove_stock"))}">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
      </button>
    </div>
  `).join("") || `<p class="stock-empty">${t(state.language, "empty")}</p>`;

  $("#stock-add-item").innerHTML = (state.snapshot.stock_options || [])
    .map((item) => `<option value="${escapeHtml(item.item_key)}">${escapeHtml(item.name)} · ${escapeHtml(displayCategory(item.category))}</option>`)
    .join("");
  setStockAddUnit();
  $("#stock-add-form").querySelector("button").disabled = !$("#stock-add-item").value;
}

function setStockAddUnit() {
  const option = (state.snapshot?.stock_options || [])
    .find((item) => item.item_key === $("#stock-add-item").value);
  if (!option) {
    $("#stock-add-unit").innerHTML = "";
    return;
  }
  $("#stock-add-unit").innerHTML = option.household
    ? `<option value="unit">${escapeHtml(option.measure_unit)}</option>`
    : `<option value="g">g</option>${option.measure_unit === "g"
      ? ""
      : `<option value="unit">${escapeHtml(option.measure_unit)}</option>`}`;
  const current = state.stockDraft.find((item) => item.item_key === option.item_key);
  $("#stock-add-unit").value = current?.quantity_unit || option.quantity_unit;
}

function updateGroceryProgress() {
  const items = state.snapshot?.grocery_plan.items || [];
  const total = items.length;
  const checked = items.filter((item) => item.stock_sufficient).length;
  const remainingTotal = items
    .filter((item) => !item.stock_sufficient)
    .reduce((sum, item) => sum + item.estimated_purchase_price, 0);
  $("#grocery-total").textContent = formatMoney(remainingTotal);
  $("#grocery-progress-label").textContent = `${checked} / ${total}`;
  $("#grocery-progress-bar").style.width = `${total ? checked / total * 100 : 0}%`;
  setCountBadge("#grocery-tab-count", total - checked);
  $("#grocery-count").textContent = String(total - checked);
  $("#grocery-count").hidden = total === checked;
}

function renderNutriScoreAudit() {
  const ingredients = state.snapshot.ingredients || [];
  const dishes = state.snapshot.dishes || [];
  const readyIngredients = ingredients
    .filter((ingredient) => ingredientNutriScoreMissing(ingredient) === 0).length;
  const readyDishes = dishes.filter((dish) => dish.nutri_score_computed).length;
  const missingValues = ingredients
    .reduce((total, ingredient) => total + ingredientNutriScoreMissing(ingredient), 0);
  $("#nutri-score-audit").innerHTML = `
    <strong>${escapeHtml(t(state.language, "nutri_score_audit_title"))}</strong>
    <span>${escapeHtml(translatedTemplate("nutri_score_audit_summary", {
      readyIngredients,
      totalIngredients: ingredients.length,
      readyDishes,
      totalDishes: dishes.length,
      missingValues,
    }))}</span>
  `;
}

function renderDishes() {
  renderNutriScoreAudit();
  const search = $("#dish-search").value.toLowerCase().trim();
  const minimumCost = Number($("#dish-cost-min").value);
  const maximumCost = Number($("#dish-cost-max").value);
  const minimumKcal = Number($("#dish-kcal-min").value);
  const maximumKcal = Number($("#dish-kcal-max").value);
  const selectedNutriScores = new Set(
    $$("[data-dish-nutri-score]:checked").map((input) => input.value),
  );
  $("#dish-cost-output").textContent =
    `${formatMoney(minimumCost)} – ${formatMoney(maximumCost)}`;
  $("#dish-kcal-output").textContent =
    `${formatNumber(minimumKcal, 0)} – ${formatNumber(maximumKcal, 0)} kcal`;
  updateDualRangeTrack("cost");
  updateDualRangeTrack("kcal");
  const dishes = state.snapshot.dishes.filter((dish) => {
    const matchesSearch = !search
      || `${dish.name} ${dish.key}`.toLowerCase().includes(search);
    return matchesSearch
      && matchesSelectedNutriScores(dish, selectedNutriScores)
      && dish.per_serving.cost >= minimumCost
      && dish.per_serving.cost <= maximumCost
      && dish.per_serving.kcal >= minimumKcal
      && dish.per_serving.kcal <= maximumKcal;
  });
  $("#dish-grid").innerHTML = dishes.map((dish) => `
    <article class="dish-card">
      <button class="dish-card-open" type="button" data-dish-key="${escapeHtml(encodeURIComponent(dish.key))}">
        <div class="dish-title"><h2>${escapeHtml(dish.name)}</h2></div>
        <div class="dish-metrics">
          <div><strong>${formatNumber(dish.per_serving.kcal, 0)}</strong><span>kcal · ${escapeHtml(t(state.language, "per_serving"))}</span></div>
          ${dish.nutri_score
            ? `<div class="nutri-score metric-${escapeHtml(dish.nutri_score.toLowerCase())}" title="${escapeHtml(dishNutriScoreDetail(dish))}"><strong>${escapeHtml(dish.nutri_score)}</strong><span>Nutri-Score${dish.nutri_score_computed ? " · auto" : ""}</span></div>`
            : `<div class="nutri-score-missing" title="${escapeHtml(dishNutriScoreDetail(dish))}"><strong>—</strong><span>${escapeHtml(translatedTemplate("nutri_score_values_missing", { count: dish.nutri_score_missing_values }))}</span></div>`}
          <div><strong>${formatMoney(dish.per_serving.cost)}</strong><span>${escapeHtml(t(state.language, "cost"))} · ${escapeHtml(t(state.language, "per_serving"))}</span></div>
        </div>
      </button>
    </article>
  `).join("") || `<p>${t(state.language, "empty")}</p>`;
}

function configureDishRanges() {
  const maximumCost = Math.max(
    0.01,
    ...state.snapshot.dishes.map((dish) => Math.ceil(Number(dish.per_serving.cost || 0) * 100) / 100),
  );
  const maximumKcal = Math.max(
    1,
    ...state.snapshot.dishes.map((dish) => Math.ceil(Number(dish.per_serving.kcal || 0))),
  );
  const signature = `${maximumCost}|${maximumKcal}`;
  if (state.dishRangeSignature === signature) return;
  state.dishRangeSignature = signature;
  [
    ["cost", maximumCost],
    ["kcal", maximumKcal],
  ].forEach(([pair, maximum]) => {
    const minimumControl = $(`#dish-${pair}-min`);
    const maximumControl = $(`#dish-${pair}-max`);
    minimumControl.max = String(maximum);
    maximumControl.max = String(maximum);
    minimumControl.value = "0";
    maximumControl.value = String(maximum);
    updateDualRangeTrack(pair);
  });
}

function updateDualRangeTrack(pair) {
  const minimum = $(`#dish-${pair}-min`);
  const maximum = $(`#dish-${pair}-max`);
  const track = $(`[data-dual-range="${pair}"]`);
  if (!minimum || !maximum || !track) return;
  const range = Number(maximum.max) - Number(minimum.min);
  const start = range ? (Number(minimum.value) - Number(minimum.min)) / range * 100 : 0;
  const end = range ? (Number(maximum.value) - Number(minimum.min)) / range * 100 : 100;
  track.style.setProperty("--range-start", `${start}%`);
  track.style.setProperty("--range-end", `${end}%`);
}

function updateDishRange(changedControl) {
  const pair = changedControl?.id?.includes("kcal") ? "kcal" : "cost";
  const minimum = $(`#dish-${pair}-min`);
  const maximum = $(`#dish-${pair}-max`);
  if (Number(minimum.value) > Number(maximum.value)) {
    if (changedControl === minimum) maximum.value = minimum.value;
    else minimum.value = maximum.value;
  }
  updateDualRangeTrack(pair);
  renderDishes();
}

function scheduleMenuUpdate() {
  clearTimeout(state.editTimer);
  setBusy(true);
  state.editTimer = setTimeout(() => {
    send("replace-menu", { rows: state.draft });
  }, 350);
}

function scheduleStockUpdate() {
  clearTimeout(state.stockTimer);
  setBusy(true);
  state.stockTimer = setTimeout(() => {
    send("replace-stock", { rows: stockPayload() });
  }, 350);
}

function scheduleCustomGroceryUpdate() {
  clearTimeout(state.customTimer);
  setBusy(true);
  state.customTimer = setTimeout(() => {
    send("replace-custom-grocery", { rows: customGroceryPayload() });
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
$(".dish-filter-panel").addEventListener("input", (event) => {
  if (event.target.matches("input[type='range']")) updateDishRange(event.target);
  else if (event.target.matches("input")) renderDishes();
});
$("#dish-clear-filters").addEventListener("click", () => {
  $("#dish-search").value = "";
  $("#dish-cost-min").value = "0";
  $("#dish-cost-max").value = $("#dish-cost-max").max;
  $("#dish-kcal-min").value = "0";
  $("#dish-kcal-max").value = $("#dish-kcal-max").max;
  $$("[data-dish-nutri-score]").forEach((input) => {
    input.checked = false;
  });
  updateDishRange($("#dish-cost-min"));
  updateDualRangeTrack("kcal");
});
$("#item-filter-panel").addEventListener("input", (event) => {
  if (event.target.matches("#item-search")) renderItemsCatalogue();
});
$("#item-filter-panel").addEventListener("change", (event) => {
  if (event.target.matches("#item-category-filter")) renderItemsCatalogue();
});
$("#item-clear-filters").addEventListener("click", () => {
  $("#item-search").value = "";
  $("#item-category-filter").value = "";
  renderItemsCatalogue();
  $("#item-search").focus();
});
$("#color-my-life").addEventListener("click", randomizeColorTheme);
$("#add-dish").addEventListener("click", openNewDishDialog);
$("#new-dish-close").addEventListener("click", closeNewDishDialog);
$("#new-dish-cancel").addEventListener("click", closeNewDishDialog);
$("#new-dish-add-component").addEventListener("click", () => addNewDishComponent());
$("#new-dish-form").addEventListener("input", updateDishFormSaveState);
$("#new-dish-form").addEventListener("change", updateDishFormSaveState);
$("#new-dish-component-list").addEventListener("change", (event) => {
  const row = event.target.closest(".new-dish-component-row");
  if (row && event.target.matches("[data-component-item]")) setNewDishComponentUnit(row);
  if (row && event.target.matches("[data-component-custom-toggle]")) {
    setDishComponentMode(row, event.target.checked ? "custom" : "catalogue");
  }
  updateDishFormSaveState();
});
$("#new-dish-component-list").addEventListener("click", (event) => {
  const remove = event.target.closest(".remove-dish-component");
  if (!remove) return;
  remove.closest(".new-dish-component-row").remove();
  updateDishFormSaveState();
});
$("#new-dish-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#new-dish-name").value.trim();
  const servings = Number($("#new-dish-servings").value);
  if (!dishFormIsValid()) {
    $("#new-dish-error").textContent = t(state.language, "new_dish_invalid");
    return;
  }
  const reservedKeys = new Set();
  const customIngredients = [];
  const components = $$("#new-dish-component-list .new-dish-component-row").map((row) => {
    const quantity = Number(row.querySelector("[data-component-quantity]").value);
    const custom = row.dataset.componentMode === "custom";
    const customName = row.querySelector("[data-component-custom-name]").value.trim();
    const quantityUnit = custom
      ? row.querySelector("[data-component-custom-unit]").value.trim()
      : row.querySelector("[data-component-unit]").value;
    const itemKey = custom
      ? customIngredientKey(customName, reservedKeys)
      : row.querySelector("[data-component-item]").value;
    if (custom) {
      reservedKeys.add(itemKey);
      customIngredients.push({
        key: itemKey,
        name: customName,
        custom: true,
        incomplete: true,
        grams: 100,
        kcal: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugars_g: null,
        saturated_fat_g: null,
        salt_g: null,
        fruit_vegetable_legume_percent: null,
        category: "",
        source: "",
        url: "",
        price_per_kg: 0,
        price_source: "",
        price_checked_at: "",
        measure_unit: quantityUnit,
        grams_per_measure_unit: 1,
        purchase_unit: quantityUnit,
        purchase_quantity_grams: 1,
      });
    }
    return {
      item_key: itemKey,
      quantity,
      quantity_unit: quantityUnit,
      source_quantity: `${formatInputNumber(quantity)} ${quantityUnit}`,
    };
  });
  if (!name || !Number.isFinite(servings) || servings <= 0
    || !components.length
    || components.some((component) => !Number.isFinite(component.quantity) || component.quantity <= 0)) {
    $("#new-dish-error").textContent = t(state.language, "new_dish_invalid");
    return;
  }
  const dishKey = state.dishFormKey || newDishKey(name);
  send("save-dish", {
    dish: {
      key: dishKey,
      name,
      servings,
      recipe_url: $("#new-dish-url").value.trim(),
      source: $("#new-dish-source").value.trim(),
      nutri_score: $("#new-dish-nutri-score").value,
      source_notes: $("#new-dish-notes").value
        .split(/\n+/)
        .map((note) => note.trim())
        .filter(Boolean),
      components,
    },
    customIngredients,
    replacing: Boolean(state.dishFormKey),
  });
  closeNewDishDialog();
});
$("#dish-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-dish-key]");
  if (button) openDishDetails(decodeURIComponent(button.dataset.dishKey), Number.NaN);
});
$("#add-catalogue-item").addEventListener("click", openNewCatalogueItem);
$("#item-catalogue").addEventListener("click", (event) => {
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
    openCatalogueItemDetails(
      decodeURIComponent(details.dataset.itemDetails),
      details.dataset.itemKind,
    );
  }
});
$("#item-catalogue").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.target.closest("button")) return;
  const details = event.target.closest("[data-item-details]");
  if (!details) return;
  event.preventDefault();
  openCatalogueItemDetails(
    decodeURIComponent(details.dataset.itemDetails),
    details.dataset.itemKind,
  );
});
$$(".item-editor-back").forEach((button) => button.addEventListener("click", closeItemEditor));
$("#ingredient-form").addEventListener("input", updateIngredientSaveState);
$("#ingredient-form").addEventListener("change", updateIngredientSaveState);
$("#ingredient-price-history-add").addEventListener("click", () => {
  addPriceHistoryFormRow("#ingredient-price-history-list");
  updateIngredientSaveState();
});
$("#ingredient-price-history-list").addEventListener("click", (event) => {
  const remove = event.target.closest(".remove-price-observation");
  if (!remove) return;
  remove.closest(".item-price-history-row").remove();
  updatePriceHistoryEmptyState("#ingredient-price-history-list");
  updateIngredientSaveState();
});
$("#ingredient-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const ingredient = ingredientFormPayload();
  if (!ingredientFormIsValid(ingredient)) {
    $("#ingredient-form-message").textContent = t(state.language, "ingredient_invalid");
    return;
  }
  const creating = state.itemEditorCreating;
  if (creating) {
    state.ingredientSelectedKey = ingredient.key;
  }
  send(creating ? "add-ingredient" : "replace-ingredient", { ingredient });
});
$("#ingredient-delete").addEventListener("click", () => {
  const ingredient = state.snapshot.ingredients
    .find((item) => item.key === state.ingredientSelectedKey);
  if (ingredient) requestItemDeletion(ingredient.key, ingredient.name);
});
$("#household-item-form").addEventListener("input", updateHouseholdItemSaveState);
$("#household-item-form").addEventListener("change", updateHouseholdItemSaveState);
$("#household-item-price-history-add").addEventListener("click", () => {
  addPriceHistoryFormRow("#household-item-price-history-list");
  updateHouseholdItemSaveState();
});
$("#household-item-price-history-list").addEventListener("click", (event) => {
  const remove = event.target.closest(".remove-price-observation");
  if (!remove) return;
  remove.closest(".item-price-history-row").remove();
  updatePriceHistoryEmptyState("#household-item-price-history-list");
  updateHouseholdItemSaveState();
});
$("#household-item-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const item = householdItemFormPayload();
  if (!householdItemFormIsValid(item)) {
    $("#household-item-form-message").textContent = t(state.language, "item_invalid");
    return;
  }
  const creating = state.itemEditorCreating;
  if (creating) {
    state.ingredientSelectedKey = item.key;
  }
  send(creating ? "add-household-item" : "replace-household-item", { item });
});
$("#household-item-delete").addEventListener("click", () => {
  const item = (state.snapshot.household_items || [])
    .find((candidate) => candidate.key === state.ingredientSelectedKey);
  if (item) requestItemDeletion(item.key, item.name);
});
$("#family-grid").addEventListener("click", (event) => {
  if (event.target.closest("#family-add-card")) {
    openFamilyDialog();
    return;
  }
  const removeButton = event.target.closest("[data-family-remove]");
  if (removeButton) {
    if (state.familyDraft.length <= 1) return;
    const key = decodeURIComponent(removeButton.dataset.familyRemove);
    const person = state.familyDraft.find((candidate) => candidate.key === key);
    if (!person) return;
    openConfirmation({
      title: translatedTemplate("remove_family_confirm_title", { name: person.name }),
      message: t(state.language, "remove_family_confirm_message"),
      confirmLabel: t(state.language, "delete"),
      action: () => {
        state.familyDraft = state.familyDraft.filter((candidate) => candidate.key !== key);
        renderFamily();
        send("replace-people", { rows: state.familyDraft });
      },
    });
    return;
  }
  const editCard = event.target.closest("[data-family-edit]");
  if (!editCard) return;
  const key = decodeURIComponent(editCard.dataset.familyEdit);
  const person = state.familyDraft.find((candidate) => candidate.key === key);
  if (person) openFamilyDialog(person);
});
$("#family-grid").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.target.closest("[data-family-remove]")) return;
  const editCard = event.target.closest("[data-family-edit]");
  if (!editCard) return;
  event.preventDefault();
  editCard.click();
});
$("#family-dialog-close").addEventListener("click", closeFamilyDialog);
$("#family-dialog-cancel").addEventListener("click", closeFamilyDialog);
$("#family-form").addEventListener("input", updateFamilyFormSaveState);
$("#family-form").addEventListener("change", updateFamilyFormSaveState);
$("#family-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#family-member-name").value.trim();
  const kcalValue = $("#family-member-kcal").value;
  const kcalTarget = kcalValue === "" ? null : Number(kcalValue);
  if (!name || (kcalTarget != null && (!Number.isFinite(kcalTarget) || kcalTarget <= 0))) return;
  const editingKey = state.familyEditKey;
  const person = {
    key: editingKey || familyMemberKey(name),
    name,
    kind: $("#family-form input[name='family-kind']:checked")?.value || "adult",
    kcal_target: kcalTarget,
    description: $("#family-member-description").value.trim(),
  };
  const existingIndex = state.familyDraft.findIndex((candidate) => candidate.key === editingKey);
  if (editingKey && existingIndex >= 0) state.familyDraft[existingIndex] = person;
  else state.familyDraft.push(person);
  closeFamilyDialog();
  renderFamily();
  send("replace-people", { rows: state.familyDraft });
});
$("#profile-select").addEventListener("change", (event) => send("set-profile", { profile: event.target.value }));
$("#show-selected-only").addEventListener("change", (event) => {
  state.menuSelectedOnly = event.target.checked;
  localStorage.setItem("homealacarte-menu-selected-only", String(state.menuSelectedOnly));
  renderMenu();
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

$("#empty-stock").addEventListener("click", () => {
  if (!state.stockDraft.length) return;
  openConfirmation({
    title: t(state.language, "empty_stock_confirm_title"),
    message: t(state.language, "empty_stock_confirm_message"),
    confirmLabel: t(state.language, "empty_stock"),
    action: () => {
      state.stockDraft = [];
      renderStock();
      scheduleStockUpdate();
    },
  });
});

$("#empty-extra-needs").addEventListener("click", () => {
  if (!state.customDraft.length) return;
  openConfirmation({
    title: t(state.language, "empty_extra_needs_confirm_title"),
    message: t(state.language, "empty_extra_needs_confirm_message"),
    confirmLabel: t(state.language, "empty_extra_needs"),
    action: () => {
      state.customDraft = [];
      renderCustomGrocery();
      scheduleCustomGroceryUpdate();
    },
  });
});

$("#stock-list").addEventListener("input", (event) => {
  const control = event.target.closest("[data-stock-field]");
  const row = event.target.closest("[data-stock-key]");
  if (!control || !row) return;
  const household = row.dataset.stockHousehold === "true";
  const target = state.stockDraft.find((item) =>
    item.item_key === row.dataset.stockKey && Boolean(item.household) === household
  );
  if (!target) return;
  if (control.dataset.stockField === "quantity") {
    target.quantity = Number(control.value);
  } else {
    const nextUnit = control.value;
    const previousUnit = target.quantity_unit;
    const gramsPerUnit = Number(target.grams_per_measure_unit || 1);
    if (previousUnit !== nextUnit && gramsPerUnit > 0) {
      if (previousUnit === "unit" && nextUnit === "g") {
        target.quantity = Number(target.quantity) * gramsPerUnit;
      } else if (previousUnit === "g" && nextUnit === "unit") {
        target.quantity = Number(target.quantity) / gramsPerUnit;
      }
    }
    target.quantity_unit = nextUnit;
    renderStock();
  }
  scheduleStockUpdate();
});

$("#stock-list").addEventListener("click", (event) => {
  const button = event.target.closest(".remove-stock");
  const row = event.target.closest("[data-stock-key]");
  if (!button || !row) return;
  const household = row.dataset.stockHousehold === "true";
  state.stockDraft = state.stockDraft.filter((item) =>
    item.item_key !== row.dataset.stockKey || Boolean(item.household) !== household
  );
  renderStock();
  scheduleStockUpdate();
});

$("#stock-add-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const itemKey = $("#stock-add-item").value;
  const quantity = Number($("#stock-add-quantity").value);
  if (!itemKey || !Number.isFinite(quantity) || quantity <= 0) return;
  const option = (state.snapshot.stock_options || [])
    .find((item) => item.item_key === itemKey);
  if (!option) return;
  const quantityUnit = $("#stock-add-unit").value;
  const current = state.stockDraft.find((item) =>
    item.item_key === itemKey
      && item.quantity_unit === quantityUnit
      && Boolean(item.household) === Boolean(option.household)
  );
  if (current) {
    current.quantity = Number(current.quantity) + quantity;
  } else {
    state.stockDraft.push({
      item_key: itemKey,
      name: option.name,
      category: option.category,
      quantity,
      quantity_unit: quantityUnit,
      measure_unit: option.measure_unit,
      grams_per_measure_unit: Number(option.grams_per_measure_unit || 1),
      household: Boolean(option.household),
    });
  }
  $("#stock-add-quantity").value = "";
  renderStock();
  scheduleStockUpdate();
});
$("#stock-add-item").addEventListener("change", setStockAddUnit);

$("#custom-list").addEventListener("input", (event) => {
  const control = event.target.closest("[data-custom-field]");
  const row = event.target.closest("[data-custom-key]");
  if (!control || !row) return;
  const target = state.customDraft.find((item) => item.key === row.dataset.customKey);
  if (!target) return;
  target.quantity = Number(control.value);
  scheduleCustomGroceryUpdate();
});

$("#custom-list").addEventListener("click", (event) => {
  const button = event.target.closest(".remove-custom");
  const row = event.target.closest("[data-custom-key]");
  if (!button || !row) return;
  state.customDraft = state.customDraft.filter((item) => item.key !== row.dataset.customKey);
  renderCustomGrocery();
  scheduleCustomGroceryUpdate();
});

$("input[name='extra-add-mode'][value='existing']").addEventListener("change", (event) => {
  if (event.target.checked) setExtraNeedMode("existing");
});
$("input[name='extra-add-mode'][value='custom']").addEventListener("change", (event) => {
  if (event.target.checked) setExtraNeedMode("custom");
});
$("#custom-add-existing").addEventListener("change", populateHouseholdFields);
$("#custom-add-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const custom = $("input[name='extra-add-mode']:checked").value === "custom";
  const option = custom
    ? null
    : (state.snapshot.household_options || [])
      .find((item) => item.key === $("#custom-add-existing").value);
  const name = custom ? $("#custom-add-name").value.trim() : option?.name || "";
  const category = normalizedCategory($("#custom-add-category").value.trim());
  const quantity = Number($("#custom-add-quantity").value);
  const measureUnit = $("#custom-add-measure-unit").value.trim();
  const estimatedPrice = Number($("#custom-add-price").value);
  if (!name || !category || !measureUnit || quantity <= 0 || estimatedPrice < 0) return;
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  if (option && state.customDraft.some((item) => item.key === option.key)) return;
  state.customDraft.push({
    key: option?.key || `custom_${suffix.replaceAll("-", "_").replace(".", "_")}`,
    name,
    category,
    quantity,
    measure_unit: measureUnit,
    purchase_unit: option?.purchase_unit || measureUnit,
    purchase_quantity: option?.purchase_quantity || 1,
    estimated_price: estimatedPrice,
    custom,
  });
  $("#custom-add-name").value = "";
  $("#custom-add-quantity").value = "1";
  renderCustomGrocery();
  setExtraNeedMode(custom ? "custom" : "existing");
  scheduleCustomGroceryUpdate();
});
$("#grocery-hide-stocked").addEventListener("change", (event) => {
  state.groceryHideStocked = event.target.checked;
  localStorage.setItem("homealacarte-grocery-hide-stocked", String(state.groceryHideStocked));
  renderGrocery();
});
$("#grocery-grid").addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-id]");
  if (!checkbox) return;
  checkbox.closest(".grocery-item").classList.toggle("checked", checkbox.checked);
  clearTimeout(state.editTimer);
  clearTimeout(state.stockTimer);
  clearTimeout(state.customTimer);
  send("set-grocery-stock", {
    itemIds: [checkbox.dataset.id],
    stocked: checkbox.checked,
    rows: state.draft,
    stock: stockPayload(),
    customGrocery: customGroceryPayload(),
  });
});
$("#grocery-grid").addEventListener("click", (event) => {
  if (event.target.closest("input[data-id]")) return;
  const item = event.target.closest("[data-grocery-details]");
  if (item) openGroceryDetails(decodeURIComponent(item.dataset.groceryDetails));
});
$("#grocery-grid").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.target.closest("input[data-id]")) return;
  const item = event.target.closest("[data-grocery-details]");
  if (!item) return;
  event.preventDefault();
  openGroceryDetails(decodeURIComponent(item.dataset.groceryDetails));
});
$("#grocery-details-list").addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-grocery-meal-delete]");
  if (deleteButton) {
    const index = Number(deleteButton.dataset.groceryMealDelete);
    const row = state.draft[index];
    if (!row) return;
    const item = state.snapshot.item_options.find((option) => option.key === row.item_key);
    closeGroceryDetails();
    openConfirmation({
      title: t(state.language, "delete_meal_confirm_title"),
      message: translatedTemplate("delete_meal_confirm_message", {
        name: item?.name || row.item_key,
        context: `${row.day} · ${row.meal}`,
      }),
      confirmLabel: t(state.language, "delete"),
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
$("#grocery-details-close").addEventListener("click", closeGroceryDetails);
$("#grocery-details-done").addEventListener("click", closeGroceryDetails);
$("#grocery-details-edit").addEventListener("click", (event) => {
  const button = event.currentTarget;
  if (!button.dataset.itemKey || !button.dataset.itemKind) return;
  const kind = button.dataset.itemKind;
  const key = decodeURIComponent(button.dataset.itemKey);
  closeGroceryDetails();
  state.itemCatalogueTab = kind === "food" ? "food" : "other";
  localStorage.setItem("homealacarte-item-catalogue-tab", state.itemCatalogueTab);
  switchTab("items");
  renderItemsCatalogue();
  openItemEditor(key, kind);
});

async function bootstrap() {
  applyColorTheme(state.colorTheme);
  applyTranslations();
  const requestedTab = location.hash.slice(1);
  if (["family", "menu", "grocery", "dishes", "items", "data"].includes(requestedTab)) switchTab(requestedTab);
  const saved = await loadPrivateState().catch(() => null);
  if (saved?.version === DATA_SCHEMA_VERSION) {
    state.language = saved.language || state.language;
    state.importedSources = saved.sources || null;
    state.restorePeople = saved.version >= 4 ? (saved.people || null) : null;
    state.restoreMenu = saved.menu || null;
    state.restoreStock = saved.version >= 2 ? (saved.stock || null) : null;
    state.restoreCustom = saved.version >= 3 ? (saved.customGrocery || null) : null;
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

function parseDocument(serializedData) {
  if (!serializedData) return null;
  try {
    const parsed = JSON.parse(serializedData);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function isLanguageTag(value) {
  const parts = String(value || "").trim().split("-");
  if (!/^[A-Za-z]{2}$/.test(parts[0] || "")) return false;
  return parts.slice(1).every((part) => /^[A-Za-z0-9]{2,8}$/.test(part));
}

function localePrimary(value) {
  return String(value || "").trim().toLowerCase().split("-")[0];
}

function exactLocaleKey(values, locale) {
  const target = String(locale || "").trim();
  return Object.keys(values || {}).find((key) => key.localeCompare(target, undefined, {
    sensitivity: "accent",
  }) === 0 || key.toLowerCase() === target.toLowerCase());
}

function uniqueLocales(locales = []) {
  const seen = new Set();
  return locales
    .map((locale) => String(locale || "").trim())
    .filter((locale) => {
      const normalized = locale.toLowerCase();
      if (!isLanguageTag(locale) || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function localizedObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([locale, entry]) => isLanguageTag(locale) && typeof entry === "string")
      .map(([locale, entry]) => [locale, entry.trim()]),
  );
}

export function localeLabel(locale, displayLocale = locale) {
  const code = String(locale || "").trim();
  if (!code) return "";
  try {
    const label = new Intl.DisplayNames([displayLocale], { type: "language" }).of(code);
    return label ? `${label} · ${code.toUpperCase()}` : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function localizedNameValues(
  serializedData,
  section,
  key,
  fallbackName = "",
  supportedLocales = [],
) {
  const document = parseDocument(serializedData);
  const row = document?.[section]?.find?.((candidate) => candidate?.key === key);
  const value = row?.name;
  const existing = localizedObject(value);
  const locales = uniqueLocales([...supportedLocales, ...Object.keys(existing)]);
  if (typeof value === "string") {
    const neutral = value.trim();
    return Object.fromEntries(locales.map((locale) => [locale, neutral]));
  }
  if (Object.keys(existing).length) {
    const result = { ...existing };
    for (const locale of locales) {
      if (!exactLocaleKey(result, locale)) result[locale] = "";
    }
    return result;
  }
  const neutral = String(fallbackName || "").trim();
  return Object.fromEntries(locales.map((locale) => [locale, neutral]));
}

export function localizedFormValues(container) {
  return Object.fromEntries(
    [...container.querySelectorAll("[data-locale]")]
      .map((input) => [input.dataset.locale, input.value.trim()])
      .filter(([locale]) => isLanguageTag(locale)),
  );
}

export function renderLocalizedInputs(
  container,
  supportedLocales,
  values = {},
  displayLocale = "en",
) {
  const locales = uniqueLocales([...supportedLocales, ...Object.keys(values)]);
  const documentRef = container.ownerDocument;
  const fields = locales.map((locale) => {
    const label = documentRef.createElement("label");
    label.className = "dialog-field localized-name-field";
    const caption = documentRef.createElement("span");
    caption.textContent = localeLabel(locale, displayLocale);
    const input = documentRef.createElement("input");
    input.autocomplete = "off";
    input.dataset.locale = locale;
    input.lang = locale;
    const key = exactLocaleKey(values, locale);
    input.value = key ? String(values[key] || "") : "";
    label.append(caption, input);
    return label;
  });
  container.replaceChildren(...fields);
  return locales;
}

function normalizedLocalizedEntries(values = {}) {
  return Object.entries(values)
    .map(([locale, value]) => [String(locale || "").trim(), String(value || "").trim()])
    .filter(([locale]) => isLanguageTag(locale));
}

export function normalizeLocalizedName(values = {}) {
  const entries = normalizedLocalizedEntries(values).filter(([, value]) => value);
  if (!entries.length) return "";
  const distinctValues = new Set(entries.map(([, value]) => value));
  if (distinctValues.size === 1) return entries[0][1];
  return Object.fromEntries(entries);
}

function localizedMatch(values, locale) {
  const requested = String(locale || "").trim();
  if (!requested) return "";
  const exact = exactLocaleKey(values, requested);
  if (exact && values[exact]) return values[exact];
  const primary = localePrimary(requested);
  const exactPrimary = exactLocaleKey(values, primary);
  if (exactPrimary && values[exactPrimary]) return values[exactPrimary];
  const regional = Object.entries(values)
    .find(([key, value]) => localePrimary(key) === primary && value);
  return regional?.[1] || "";
}

export function displayLocalizedName(values = {}, language = "en", fallbackLocales = []) {
  const normalized = Object.fromEntries(
    normalizedLocalizedEntries(values).filter(([, value]) => value),
  );
  return localizedMatch(normalized, language)
    || uniqueLocales(fallbackLocales)
      .map((locale) => localizedMatch(normalized, locale))
      .find(Boolean)
    || Object.values(normalized).find(Boolean)
    || "";
}

function mergeLocalizedName(existing, values) {
  const requested = normalizedLocalizedEntries(values);
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    return normalizeLocalizedName(Object.fromEntries(requested));
  }

  const next = { ...existing };
  for (const [locale, value] of requested) {
    const currentKey = exactLocaleKey(next, locale);
    if (value) next[currentKey || locale] = value;
    else if (currentKey) delete next[currentKey];
  }
  return normalizeLocalizedName(next);
}

export function normalizeOriginCountry(value) {
  return String(value || "").trim().toUpperCase();
}

export function validOriginCountry(value) {
  const code = String(value || "").trim();
  return !code || /^[A-Za-z]{2}$/.test(code);
}

export function countryFlag(code) {
  const normalized = normalizeOriginCountry(code);
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return String.fromCodePoint(...[...normalized].map((character) => 127397 + character.charCodeAt(0)));
}

export function patchConsolidatedRecord(serializedData, section, key, changes = {}) {
  const document = parseDocument(serializedData);
  if (!document) throw new Error("Cannot update localized data: invalid consolidated document");
  const rows = document[section];
  if (!Array.isArray(rows)) throw new Error(`Cannot update localized data: missing ${section}`);
  const row = rows.find((candidate) => candidate?.key === key);
  if (!row) throw new Error(`Cannot update localized data: unknown ${section} key ${key}`);

  if (changes.name_i18n) {
    const name = mergeLocalizedName(row.name, changes.name_i18n);
    if (!name || (typeof name === "object" && !Object.keys(name).length)) {
      throw new Error("Cannot update localized data: name is empty");
    }
    row.name = name;
  }
  if (Object.hasOwn(changes, "origin_country")) {
    const originCountry = normalizeOriginCountry(changes.origin_country);
    if (!validOriginCountry(originCountry)) {
      throw new Error("Cannot update localized data: invalid origin country");
    }
    if (originCountry) row.origin_country = originCountry;
    else delete row.origin_country;
  }

  return `${JSON.stringify(document, null, 2)}\n`;
}

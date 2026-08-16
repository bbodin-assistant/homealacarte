function parseDocument(serializedData) {
  if (!serializedData) return null;
  try {
    const parsed = JSON.parse(serializedData);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function localizedLanguageValue(value, language) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const exact = Object.entries(value)
    .find(([key, entry]) => key.toLowerCase() === language && typeof entry === "string");
  if (exact) return exact[1];
  const regional = Object.entries(value)
    .find(([key, entry]) => key.toLowerCase().startsWith(`${language}-`) && typeof entry === "string");
  return regional?.[1] || "";
}

function normalizedLanguageValues(values = {}) {
  return {
    en: String(values.en || "").trim(),
    fr: String(values.fr || "").trim(),
  };
}

function mergeLocalizedName(existing, values) {
  const requested = normalizedLanguageValues(values);
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    return normalizeLocalizedName(requested);
  }

  const current = {
    en: localizedLanguageValue(existing, "en").trim(),
    fr: localizedLanguageValue(existing, "fr").trim(),
  };
  if (requested.en === current.en && requested.fr === current.fr) return existing;

  const next = { ...existing };
  for (const language of ["en", "fr"]) {
    if (requested[language] === current[language]) continue;
    const exactKey = Object.keys(next)
      .find((candidate) => candidate.toLowerCase() === language);
    if (requested[language]) {
      next[exactKey || language] = requested[language];
    } else {
      Object.keys(next)
        .filter((candidate) => {
          const normalized = candidate.toLowerCase();
          return normalized === language || normalized.startsWith(`${language}-`);
        })
        .forEach((candidate) => delete next[candidate]);
    }
  }
  return next;
}

export function localizedNameValues(
  serializedData,
  section,
  key,
  fallbackName = "",
) {
  const document = parseDocument(serializedData);
  const row = document?.[section]?.find?.((candidate) => candidate?.key === key);
  const value = row?.name;
  if (typeof value === "string") {
    const neutral = value.trim();
    return { en: neutral, fr: neutral };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      en: localizedLanguageValue(value, "en").trim(),
      fr: localizedLanguageValue(value, "fr").trim(),
    };
  }
  const neutral = String(fallbackName || "").trim();
  return { en: neutral, fr: neutral };
}

export function normalizeLocalizedName(values = {}) {
  const { en, fr } = normalizedLanguageValues(values);
  if (en && fr && en === fr) return en;
  if (en && fr) return { en, fr };
  if (en) return { en };
  if (fr) return { fr };
  return "";
}

export function displayLocalizedName(values = {}, language = "en") {
  const primary = String(language || "en").toLowerCase().split("-")[0];
  const { en, fr } = normalizedLanguageValues(values);
  return primary === "fr" ? fr || en : en || fr;
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

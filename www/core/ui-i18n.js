function localeEntries(translations) {
  return Object.entries(translations || {})
    .filter(([locale, table]) => locale && table && typeof table === "object");
}

function primaryLocale(locale) {
  return String(locale || "").trim().toLowerCase().split("-")[0];
}

export function availableLocales(translations) {
  return localeEntries(translations).map(([locale]) => locale);
}

export function defaultLocale(translations) {
  return availableLocales(translations)[0] || "";
}

export function translationTable(translations, language) {
  const entries = localeEntries(translations);
  const requested = String(language || "").trim().toLowerCase();
  const primary = primaryLocale(requested);
  return entries.find(([locale]) => locale.toLowerCase() === requested)?.[1]
    || entries.find(([locale]) => primaryLocale(locale) === primary)?.[1]
    || entries[0]?.[1]
    || null;
}

export function translate(translations, language, key) {
  const selected = translationTable(translations, language);
  if (selected?.[key]) return selected[key];
  return localeEntries(translations)
    .map(([, table]) => table?.[key])
    .find(Boolean)
    || key;
}

export function hasTranslation(translations, language, key) {
  return Boolean(
    translationTable(translations, language)?.[key]
    || localeEntries(translations).some(([, table]) => table?.[key]),
  );
}

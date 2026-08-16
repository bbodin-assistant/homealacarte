import assert from "node:assert/strict";
import {
  availableLocales,
  defaultLocale,
  hasTranslation,
  translate,
  translationTable,
} from "../www/core/ui-i18n.js";

const catalogue = {
  pt: { greeting: "Olá", common: "Comum" },
  es: { greeting: "Hola", spanishOnly: "Solo" },
  "zh-CN": { greeting: "你好" },
};

assert.deepEqual(availableLocales(catalogue), ["pt", "es", "zh-CN"]);
assert.equal(defaultLocale(catalogue), "pt");
assert.equal(translationTable(catalogue, "es-MX"), catalogue.es);
assert.equal(translationTable(catalogue, "zh-CN"), catalogue["zh-CN"]);
assert.equal(translationTable(catalogue, "de-DE"), catalogue.pt);
assert.equal(translate(catalogue, "es-MX", "greeting"), "Hola");
assert.equal(translate(catalogue, "es-MX", "common"), "Comum");
assert.equal(translate(catalogue, "de-DE", "greeting"), "Olá");
assert.equal(translate(catalogue, "de-DE", "missing"), "missing");
assert.equal(hasTranslation(catalogue, "es-MX", "spanishOnly"), true);
assert.equal(hasTranslation(catalogue, "de-DE", "spanishOnly"), true);

console.log("UI localization resolves arbitrary exact, base, and fallback locales without named-language branches.");

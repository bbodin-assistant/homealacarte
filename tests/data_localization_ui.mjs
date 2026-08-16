import assert from "node:assert/strict";
import {
  countryFlag,
  displayLocalizedName,
  isLanguageTag,
  localizedNameValues,
  normalizeLocalizedName,
  patchConsolidatedRecord,
  validOriginCountry,
} from "../www/core/data-localization.js";

const locales = ["en", "fr", "es", "zh-CN"];
const source = JSON.stringify({
  items: [
    { key: "tomato", name: { en: "Tomato", fr: "Tomate", es: "Tomate" } },
    { key: "salt", name: "Salt" },
  ],
  dishes: [
    {
      key: "toast",
      name: {
        "en-GB": "Cheese toast",
        "fr-FR": "Tartine au fromage",
        es: "Tostada",
      },
      origin_country: "FR",
    },
  ],
});

assert.equal(isLanguageTag("es"), true);
assert.equal(isLanguageTag("zh-CN"), true);
assert.equal(isLanguageTag("cn"), true);
assert.equal(isLanguageTag("english"), false);

assert.deepEqual(
  localizedNameValues(source, "items", "tomato", "", locales),
  { en: "Tomato", fr: "Tomate", es: "Tomate", "zh-CN": "" },
);
assert.deepEqual(
  localizedNameValues(source, "items", "salt", "", locales),
  { en: "Salt", fr: "Salt", es: "Salt", "zh-CN": "Salt" },
);
const toastNames = localizedNameValues(source, "dishes", "toast", "", locales);
assert.equal(toastNames["en-GB"], "Cheese toast");
assert.equal(toastNames["fr-FR"], "Tartine au fromage");
assert.equal(toastNames.es, "Tostada");
assert.equal(toastNames["zh-CN"], "");

assert.equal(
  displayLocalizedName({ en: "Toast", fr: "Tartine", es: "Tostada" }, "es", locales),
  "Tostada",
);
assert.equal(
  displayLocalizedName({ en: "Toast", fr: "Tartine" }, "zh-CN", locales),
  "Toast",
);
assert.deepEqual(normalizeLocalizedName({ en: "Toast", fr: "Tartine", es: "Tostada" }), {
  en: "Toast",
  fr: "Tartine",
  es: "Tostada",
});
assert.equal(normalizeLocalizedName({ en: "Same", fr: "Same", es: "Same" }), "Same");
assert.equal(countryFlag("fr"), "🇫🇷");
assert.equal(countryFlag("France"), "");
assert.equal(validOriginCountry("JP"), true);
assert.equal(validOriginCountry("J"), false);

const unchanged = JSON.parse(patchConsolidatedRecord(source, "dishes", "toast", {
  name_i18n: toastNames,
  origin_country: "fr",
}));
assert.deepEqual(unchanged.dishes[0].name, {
  "en-GB": "Cheese toast",
  "fr-FR": "Tartine au fromage",
  es: "Tostada",
});
assert.equal(unchanged.dishes[0].origin_country, "FR");

const editedNames = { ...toastNames, es: "Tostada de queso", "zh-CN": "奶酪吐司" };
const edited = JSON.parse(patchConsolidatedRecord(source, "dishes", "toast", {
  name_i18n: editedNames,
  origin_country: "ch",
}));
assert.deepEqual(edited.dishes[0].name, {
  "en-GB": "Cheese toast",
  "fr-FR": "Tartine au fromage",
  es: "Tostada de queso",
  "zh-CN": "奶酪吐司",
});
assert.equal(edited.dishes[0].origin_country, "CH");

const clearedOrigin = JSON.parse(patchConsolidatedRecord(source, "dishes", "toast", {
  name_i18n: toastNames,
  origin_country: "",
}));
assert.equal(Object.hasOwn(clearedOrigin.dishes[0], "origin_country"), false);

console.log("Localized editor helpers accept arbitrary locale tags without dropping existing variants.");

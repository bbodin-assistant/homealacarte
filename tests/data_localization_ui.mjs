import assert from "node:assert/strict";
import {
  countryFlag,
  displayLocalizedName,
  localizedNameValues,
  normalizeLocalizedName,
  patchConsolidatedRecord,
  validOriginCountry,
} from "../www/core/data-localization.js";

const source = JSON.stringify({
  items: [
    { key: "tomato", name: { en: "Tomato", fr: "Tomate" } },
    { key: "salt", name: "Salt" },
  ],
  dishes: [
    {
      key: "toast",
      name: { "en-GB": "Cheese toast", "fr-FR": "Tartine au fromage", es: "Tostada" },
      origin_country: "FR",
    },
  ],
});

assert.deepEqual(
  localizedNameValues(source, "items", "tomato"),
  { en: "Tomato", fr: "Tomate" },
);
assert.deepEqual(
  localizedNameValues(source, "items", "salt"),
  { en: "Salt", fr: "Salt" },
);
assert.deepEqual(
  localizedNameValues(source, "dishes", "toast"),
  { en: "Cheese toast", fr: "Tartine au fromage" },
);
assert.equal(displayLocalizedName({ en: "Toast", fr: "Tartine" }, "fr"), "Tartine");
assert.equal(displayLocalizedName({ en: "Toast", fr: "" }, "fr"), "Toast");
assert.deepEqual(normalizeLocalizedName({ en: "Toast", fr: "Tartine" }), {
  en: "Toast",
  fr: "Tartine",
});
assert.equal(normalizeLocalizedName({ en: "Same", fr: "Same" }), "Same");
assert.equal(countryFlag("fr"), "🇫🇷");
assert.equal(countryFlag("France"), "");
assert.equal(validOriginCountry("JP"), true);
assert.equal(validOriginCountry("J"), false);

const unchanged = JSON.parse(patchConsolidatedRecord(source, "dishes", "toast", {
  name_i18n: { en: "Cheese toast", fr: "Tartine au fromage" },
  origin_country: "fr",
}));
assert.deepEqual(unchanged.dishes[0].name, {
  "en-GB": "Cheese toast",
  "fr-FR": "Tartine au fromage",
  es: "Tostada",
});
assert.equal(unchanged.dishes[0].origin_country, "FR");

const edited = JSON.parse(patchConsolidatedRecord(source, "dishes", "toast", {
  name_i18n: { en: "Grilled cheese toast", fr: "Tartine au fromage" },
  origin_country: "ch",
}));
assert.deepEqual(edited.dishes[0].name, {
  "en-GB": "Cheese toast",
  "fr-FR": "Tartine au fromage",
  es: "Tostada",
  en: "Grilled cheese toast",
});
assert.equal(edited.dishes[0].origin_country, "CH");

const clearedOrigin = JSON.parse(patchConsolidatedRecord(source, "dishes", "toast", {
  name_i18n: { en: "Cheese toast", fr: "Tartine au fromage" },
  origin_country: "",
}));
assert.equal(Object.hasOwn(clearedOrigin.dishes[0], "origin_country"), false);

console.log("Localized editor helpers preserve language variants and normalize dish origin metadata.");

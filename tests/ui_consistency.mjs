import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CALENDAR_DATE_SELECTOR,
  calendarDateKeyAction,
  catalogueFilterCounts,
  installFamilyFormatCompatibility,
  prepareCalendarDateInput,
  selectedCatalogueMatchLabel,
} from "../www/features/ui-consistency.js";

assert.equal(calendarDateKeyAction("Tab"), "allow");
assert.equal(calendarDateKeyAction("Enter"), "picker");
assert.equal(calendarDateKeyAction(" "), "picker");
assert.equal(calendarDateKeyAction("1"), "block");
assert.match(CALENDAR_DATE_SELECTOR, /ingredient-price-checked-at/);
assert.match(CALENDAR_DATE_SELECTOR, /household-item-last-bought/);
assert.match(CALENDAR_DATE_SELECTOR, /data-price-observation-date/);

const dateAttributes = new Map();
const removedDateAttributes = new Set();
const fakeDateInput = {
  type: "text",
  dataset: {},
  matches: () => true,
  removeAttribute: (name) => removedDateAttributes.add(name),
  setAttribute: (name, value) => dateAttributes.set(name, value),
};
assert.equal(prepareCalendarDateInput(fakeDateInput), true);
assert.equal(fakeDateInput.type, "date");
assert.equal(fakeDateInput.dataset.calendarOnlyDate, "true");
assert.equal(dateAttributes.get("inputmode"), "none");
assert.ok(removedDateAttributes.has("placeholder"));
assert.ok(removedDateAttributes.has("data-i18n-placeholder"));

const snapshot = {
  ingredients: [
    {
      name: "Apple",
      category: "Fruit",
      incomplete: false,
      sugars_g: 10,
      saturated_fat_g: 0,
      salt_g: 0,
      fruit_vegetable_legume_percent: 100,
    },
    {
      name: "Carrot",
      category: "Vegetable",
      incomplete: true,
      sugars_g: 5,
      saturated_fat_g: 0,
      salt_g: 0,
      fruit_vegetable_legume_percent: 100,
    },
  ],
  household_items: [{ name: "Soap", category: "Household" }],
};
assert.deepEqual(catalogueFilterCounts(snapshot, { name: "ar" }), {
  all: 1,
  food: 1,
  other: 0,
});
assert.deepEqual(catalogueFilterCounts(snapshot, { category: "Household" }), {
  all: 1,
  food: 0,
  other: 1,
});
assert.deepEqual(catalogueFilterCounts(snapshot, { incomplete: true }), {
  all: 1,
  food: 1,
  other: 0,
});

assert.equal(selectedCatalogueMatchLabel({
  value: "sunflower-oil",
  selectedOptions: [{ textContent: "Huile de tournesol" }],
}), "Huile de tournesol");

const compatibilityGlobal = {};
const formatInputNumber = (value) => String(value);
assert.equal(installFamilyFormatCompatibility(formatInputNumber, compatibilityGlobal), true);
assert.equal(compatibilityGlobal.formatInputNumber, formatInputNumber);

const [app, family, groceryView, catalogueFeature, priceHistoryEditor, uiConsistency] = await Promise.all([
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/family.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/grocery.html", import.meta.url), "utf8"),
  readFile(new URL("../www/features/catalogue.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/catalogue/price-history.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/ui-consistency.js", import.meta.url), "utf8"),
]);
assert.match(app, /installUiConsistency/);
assert.match(app, /ui-consistency\.js\?v=homealacarte-1/);
assert.match(family, /formatInputNumber\(quantity\)/);
assert.match(groceryView, /id="purchase-add-date" type="date"/);
assert.match(groceryView, /id="purchase-batch-date" type="date"/);
assert.match(catalogueFeature, /createPriceHistoryEditor/);
assert.match(priceHistoryEditor, /data-price-observation-date/);
assert.match(uiConsistency, /data-auto-availability-select-all/);
assert.match(uiConsistency, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
assert.match(uiConsistency, /#item-category-filter, #item-incomplete-filter/);
assert.match(uiConsistency, /beforeinput/);
assert.match(uiConsistency, /dish-country-filter\[open\].*dish-allergen-filter\[open\]/s);

console.log("UI consistency safeguards cover calendar-only dates, purchase matches, availability helpers, family editing, and live catalogue counts.");

#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

function localizedValues(value) {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).filter((entry) => typeof entry === "string");
  }
  return [];
}

function cleanNumber(value) {
  return Number(Number(value).toFixed(6));
}

function isGramUnit(value) {
  const gramUnits = new Set(["g", "gram", "grams", "gramme", "grammes"]);
  const values = localizedValues(value);
  return values.length > 0 && values.every((entry) => gramUnits.has(entry.trim().toLowerCase()));
}

function normalizedUnit(value) {
  return String(value || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/s$/, "");
}

function purchasedGrams(item, purchase) {
  const quantity = Number(purchase?.quantity);
  const unit = normalizedUnit(purchase?.unit);
  const gramsPerMeasure = Number(item.grams_per_measure_unit);
  if (!(quantity > 0) || !(gramsPerMeasure > 0)) return Number.NaN;
  if (["g", "gram", "gramme"].includes(unit)) return quantity;
  if (["kg", "kilogram", "kilogramme"].includes(unit)) return quantity * 1000;
  const volumeInMl = { ml: 1, cl: 10, l: 1000 };
  const measureUnits = localizedValues(item.measure_unit).map(normalizedUnit);
  if (volumeInMl[unit]) {
    const measureUnit = measureUnits.find((candidate) => volumeInMl[candidate]);
    if (measureUnit) return quantity * volumeInMl[unit] / volumeInMl[measureUnit] * gramsPerMeasure;
  }
  if (measureUnits.includes(unit)) return quantity * gramsPerMeasure;
  return Number.NaN;
}

function packageGrams(item) {
  return item.purchase_quantity_unit === "g"
    ? Number(item.purchase_quantity)
    : Number(item.purchase_quantity) * Number(item.grams_per_measure_unit);
}

function purchaseCapacityKind(item, gramsPerPackage) {
  const labels = localizedValues(item.purchase_unit).map((value) => value.toLowerCase());
  if (labels.some((value) => /\d(?:[\d., ]*)\s*(?:ml|cl|l|litres?)\b/.test(value))) {
    return "volume";
  }
  const measureUnits = localizedValues(item.measure_unit).map(normalizedUnit);
  if (measureUnits.some((value) => ["ml", "cl", "l"].includes(value))) return "volume";
  if (isGramUnit(item.measure_unit)) return "weight";
  const measureCount = gramsPerPackage / Number(item.grams_per_measure_unit);
  const roundedCount = Math.round(measureCount);
  const labelNamesCount = roundedCount >= 1
    && Math.abs(measureCount - roundedCount) < 0.000001
    && labels.some((value) => new RegExp(`(?:^|[^0-9])${roundedCount}(?:[^0-9]|$)`).test(value));
  if (labelNamesCount) return "measure";
  if (labels.some((value) => /\d(?:[\d., ]*)\s*(?:kg|kilogrammes?|g|grammes?)\b/.test(value))) {
    return "weight";
  }
  return "measure";
}

function withObservationBasis(observation, priceBasis) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    throw new Error("price_history entries must be objects");
  }
  const migrated = {};
  for (const [key, value] of Object.entries(observation)) {
    migrated[key] = value;
    if (key === "price") migrated.price_basis = observation.price_basis ?? priceBasis;
  }
  if (!("price" in observation)) throw new Error("price_history entry is missing price");
  return migrated;
}

function migrateObject(object, location) {
  const food = Object.hasOwn(object, "price_per_kg");
  const alreadyMigratedFood = Object.hasOwn(object, "price") && Object.hasOwn(object, "price_basis");
  const household = !food && !alreadyMigratedFood && Object.hasOwn(object, "estimated_price");
  const currentPrice = Number(object.price_per_kg ?? object.price);
  const currentDate = String(object.price_checked_at || "").trim();
  if (food && !Object.hasOwn(object, "purchase_quantity_grams")) {
    throw new Error(`${location}: food item is missing purchase_quantity_grams`);
  }

  let purchaseQuantity;
  let purchaseQuantityUnit;
  if (food) {
    const grams = Number(object.purchase_quantity_grams);
    const gramsPerMeasure = Number(object.grams_per_measure_unit);
    if (!(grams > 0) || !(gramsPerMeasure > 0)) {
      throw new Error(`${location}: invalid purchase quantity conversion`);
    }
    if (isGramUnit(object.measure_unit)) {
      purchaseQuantity = grams;
      purchaseQuantityUnit = "g";
    } else {
      purchaseQuantity = grams / gramsPerMeasure;
      purchaseQuantityUnit = structuredClone(object.measure_unit);
    }
  }

  const result = {};
  for (const [key, rawValue] of Object.entries(object)) {
    if (key === "price_per_kg") {
      result.price = rawValue;
      result.price_basis = "kg";
      continue;
    }
    if (key === "purchase_quantity_grams") {
      result.purchase_quantity = purchaseQuantity;
      result.purchase_quantity_unit = purchaseQuantityUnit;
      continue;
    }
    if (key === "price_history" && Array.isArray(rawValue)) {
      const basis = food || alreadyMigratedFood ? (object.price_basis ?? "kg") : "purchase_unit";
      result.price_history = rawValue.map((entry) => withObservationBasis(entry, basis));
      continue;
    }
    result[key] = migrateValue(rawValue, `${location}.${key}`);
  }
  if (food || alreadyMigratedFood) {
    const gramsPerPackage = packageGrams(result);
    if (purchaseCapacityKind(result, gramsPerPackage) === "weight") {
      result.purchase_quantity = cleanNumber(gramsPerPackage);
      result.purchase_quantity_unit = "g";
    } else {
      result.purchase_quantity = cleanNumber(gramsPerPackage / Number(result.grams_per_measure_unit));
      result.purchase_quantity_unit = structuredClone(result.measure_unit);
    }
    for (const observation of result.price_history || []) {
      const boughtGrams = purchasedGrams(result, observation.purchase);
      const packages = boughtGrams / gramsPerPackage;
      const wholePackages = Math.round(packages);
      if (!(wholePackages >= 1) || Math.abs(packages - wholePackages) >= 0.000001) continue;
      const matchesCurrent = String(observation.date || "").trim() === currentDate
        && Math.abs(Number(observation.price) - currentPrice) < 0.000001;
      observation.price = cleanNumber(Number(observation.purchase.total_paid) / wholePackages);
      observation.price_basis = "purchase_unit";
      if (matchesCurrent) {
        result.price = observation.price;
        result.price_basis = observation.price_basis;
      }
    }
  }
  if (household && Array.isArray(object.price_history) && !result.price_history) {
    result.price_history = object.price_history.map((entry) => withObservationBasis(entry, "purchase_unit"));
  }
  return result;
}

function migrateValue(value, location) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => migrateValue(entry, `${location}[${index}]`));
  }
  if (value && typeof value === "object") return migrateObject(value, location);
  return value;
}

for (const path of process.argv.slice(2)) {
  const source = await readFile(path, "utf8");
  const document = JSON.parse(source);
  const migrated = migrateValue(document, path);
  await writeFile(path, `${JSON.stringify(migrated, null, 2)}\n`);
}

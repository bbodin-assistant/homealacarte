function slug(value, fallback = "custom") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
}

function uniqueAiKey(prefix, name, existingKeys, reserved = new Set()) {
  const base = `${prefix}_${slug(name)}`;
  const occupied = new Set([...(existingKeys || []), ...reserved]);
  let key = base;
  let suffix = 2;
  while (occupied.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedUnit(value) {
  const unit = normalizeName(value).replace(/\s+/g, " ");
  const aliases = new Map([
    ["grams", "g"], ["gram", "g"], ["gramme", "g"], ["grammes", "g"],
    ["pieces", "piece"], ["pcs", "piece"], ["pc", "piece"],
    ["units", "unit"], ["unites", "unit"], ["unite", "unit"],
    ["bottles", "bottle"], ["bouteilles", "bottle"], ["bouteille", "bottle"],
    ["rolls", "roll"], ["rouleaux", "roll"], ["rouleau", "roll"],
    ["packs", "pack"], ["paquets", "pack"], ["paquet", "pack"],
    ["boxes", "box"], ["boites", "box"], ["boite", "box"],
    ["jars", "jar"], ["pots", "jar"], ["pot", "jar"],
    ["cans", "can"], ["boites de conserve", "can"],
  ]);
  return aliases.get(unit) || unit.replace(/s$/, "");
}

function unitMatches(left, right) {
  return normalizedUnit(left) === normalizedUnit(right);
}

function isGramUnit(value) {
  return normalizedUnit(value) === "g";
}

function isGenericCountUnit(value) {
  return ["unit", "piece", "item"].includes(normalizedUnit(value));
}

function optionKind(option) {
  return option?.household ? "household" : "food";
}

function householdUnitCompatible(itemUnit, measureUnit) {
  return unitMatches(itemUnit, measureUnit) || isGenericCountUnit(itemUnit);
}

function text(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function exactOptionByName(options, generated) {
  const target = normalizeName(generated.name);
  const matches = (options || []).filter((option) =>
    normalizeName(option.name) === target && optionKind(option) === generated.kind);
  return matches.length === 1 ? matches[0] : null;
}

function requestedOption(options, generated, keyField) {
  const requestedKey = text(generated.existing_key, 160);
  let option = requestedKey
    ? (options || []).find((candidate) => candidate[keyField] === requestedKey)
    : null;
  if (requestedKey && !option) {
    const error = new Error("ai_unknown_item");
    error.detail = requestedKey;
    throw error;
  }
  if (option && optionKind(option) !== generated.kind) option = null;
  if (!option) option = exactOptionByName(options, generated);
  return option;
}

function existingKeys(snapshot) {
  return new Set([
    ...(snapshot?.ingredients || []).map((item) => item.key),
    ...(snapshot?.household_items || []).map((item) => item.key),
  ]);
}

function safeGeneratedItem(generated) {
  const name = text(generated?.name, 160);
  const kind = String(generated?.kind || "");
  const quantity = Number(generated?.quantity);
  const gramsQuantity = Number(generated?.grams_quantity);
  const unit = text(generated?.unit, 60);
  if (!name || !["food", "household"].includes(kind)
    || !Number.isFinite(quantity) || quantity <= 0 || !unit
    || !Number.isFinite(gramsQuantity) || gramsQuantity < 0) {
    throw new Error("ai_invalid_item_list");
  }
  return {
    ...generated,
    name,
    kind,
    quantity,
    grams_quantity: gramsQuantity,
    unit,
    note: text(generated.note, 400),
  };
}

export function itemOptionsForAi(snapshot, mode) {
  if (mode === "stock") return snapshot?.stock_options || [];
  const householdKeys = new Set((snapshot?.household_items || []).map((item) => item.key));
  const ingredientByKey = new Map((snapshot?.ingredients || []).map((item) => [item.key, item]));
  return (snapshot?.household_options || []).map((option) => ({
    ...option,
    household: householdKeys.has(option.key),
    grams_per_measure_unit: ingredientByKey.get(option.key)?.grams_per_measure_unit || 1,
  }));
}

function addStockRow(rows, option, quantity, quantityUnit, notes = "") {
  const household = Boolean(option.household);
  const unit = household ? "unit" : quantityUnit;
  const gramsPerUnit = Number(option.grams_per_measure_unit || 1);
  const current = rows.find((row) => row.item_key === option.item_key
    && Boolean(row.household) === household);
  if (!current) {
    rows.push({
      item_key: option.item_key,
      quantity,
      quantity_unit: unit,
      notes: notes || "",
      household,
    });
    return;
  }
  let amount = quantity;
  if (!household && current.quantity_unit !== unit) {
    amount = unit === "unit"
      ? quantity * gramsPerUnit
      : quantity / gramsPerUnit;
  }
  current.quantity = Number(current.quantity) + amount;
  if (notes) current.notes = notes;
}

function stockQuantityForOption(item, option) {
  if (option.household) {
    if (householdUnitCompatible(item.unit, option.measure_unit)) {
      return { quantity: item.quantity, quantityUnit: "unit" };
    }
    const error = new Error("ai_unsupported_quantity");
    error.ingredient = item.name;
    throw error;
  }
  if (unitMatches(item.unit, option.measure_unit)) {
    return {
      quantity: item.quantity,
      quantityUnit: isGramUnit(option.measure_unit) ? "g" : "unit",
    };
  }
  if (isGramUnit(item.unit)) return { quantity: item.quantity, quantityUnit: "g" };
  if (item.grams_quantity > 0) return { quantity: item.grams_quantity, quantityUnit: "g" };
  const error = new Error("ai_unsupported_quantity");
  error.ingredient = item.name;
  throw error;
}

function customIngredient(key, item) {
  const grams = isGramUnit(item.unit) ? item.quantity : item.grams_quantity;
  if (!Number.isFinite(grams) || grams <= 0) {
    const error = new Error("ai_unsupported_quantity");
    error.ingredient = item.name;
    throw error;
  }
  return {
    key,
    name: item.name,
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
    source: "AI stock import; nutritional values require review",
    url: "",
    price: 0,
    price_basis: "kg",
    price_source: "",
    price_checked_at: "",
    price_history: [],
    measure_unit: "g",
    grams_per_measure_unit: 1,
    purchase_unit: "100 g",
    purchase_quantity: 100,
    purchase_quantity_unit: "g",
  };
}

function customHouseholdItem(key, item) {
  const measureUnit = text(item.unit, 60) || "unit";
  return {
    key,
    name: item.name,
    category: "Other",
    purchase_unit: measureUnit,
    purchase_quantity: 1,
    estimated_price: 0,
    price_history: [],
    measure_unit: measureUnit,
    last_bought_at: "",
    lasting_days: null,
    notes: item.note || "",
    custom: true,
  };
}

export function buildAiStockPayload(generatedItems, snapshot, stockDraft = []) {
  if (!snapshot) throw new Error("ai_data_not_ready");
  const options = snapshot.stock_options || [];
  const rows = (stockDraft || []).map((row) => ({
    item_key: row.item_key,
    quantity: Number(row.quantity),
    quantity_unit: row.quantity_unit,
    notes: row.notes || "",
    household: Boolean(row.household),
  }));
  const keys = existingKeys(snapshot);
  const reserved = new Set();
  const customByName = new Map();
  const customIngredients = [];
  const customHouseholdItems = [];

  for (const raw of generatedItems || []) {
    const item = safeGeneratedItem(raw);
    const option = requestedOption(options, item, "item_key");
    if (option) {
      const resolved = stockQuantityForOption(item, option);
      addStockRow(rows, option, resolved.quantity, resolved.quantityUnit, item.note);
      continue;
    }

    const nameKey = `${item.kind}\u0000${normalizeName(item.name)}\u0000${normalizedUnit(item.unit)}`;
    let itemKey = customByName.get(nameKey);
    if (!itemKey) {
      itemKey = uniqueAiKey("item", item.name, keys, reserved);
      reserved.add(itemKey);
      customByName.set(nameKey, itemKey);
      if (item.kind === "household") customHouseholdItems.push(customHouseholdItem(itemKey, item));
      else customIngredients.push(customIngredient(itemKey, item));
    }

    if (item.kind === "household") {
      addStockRow(rows, {
        item_key: itemKey,
        household: true,
        grams_per_measure_unit: 1,
      }, item.quantity, "unit", item.note);
    } else {
      const grams = isGramUnit(item.unit) ? item.quantity : item.grams_quantity;
      addStockRow(rows, {
        item_key: itemKey,
        household: false,
        grams_per_measure_unit: 1,
      }, grams, "g", item.note);
    }
  }

  return { rows, customIngredients, customHouseholdItems };
}

function needQuantityForOption(item, option, snapshot) {
  if (option.household) {
    if (householdUnitCompatible(item.unit, option.measure_unit)) return item.quantity;
    const error = new Error("ai_unsupported_quantity");
    error.ingredient = item.name;
    throw error;
  }
  if (unitMatches(item.unit, option.measure_unit)) return item.quantity;
  const grams = isGramUnit(item.unit) ? item.quantity : item.grams_quantity;
  if (!Number.isFinite(grams) || grams <= 0) {
    const error = new Error("ai_unsupported_quantity");
    error.ingredient = item.name;
    throw error;
  }
  if (isGramUnit(option.measure_unit)) return grams;
  const ingredient = (snapshot?.ingredients || []).find((entry) => entry.key === option.key);
  const gramsPerUnit = Number(ingredient?.grams_per_measure_unit || 0);
  if (gramsPerUnit > 0) return grams / gramsPerUnit;
  return grams;
}

function mergeNeed(rows, row) {
  const current = rows.find((entry) => entry.key === row.key);
  if (!current) {
    rows.push(row);
    return;
  }
  if (unitMatches(current.measure_unit, row.measure_unit)) {
    current.quantity = Number(current.quantity) + Number(row.quantity);
    if (row.notes) current.notes = row.notes;
    return;
  }
  rows.push(row);
}

export function buildAiExtraNeedsRows(generatedItems, snapshot, customDraft = []) {
  if (!snapshot) throw new Error("ai_data_not_ready");
  const options = itemOptionsForAi(snapshot, "needs");
  const rows = structuredClone(customDraft || []);
  const keys = new Set([...existingKeys(snapshot), ...rows.map((row) => row.key)]);
  const reserved = new Set();
  const customByName = new Map();

  for (const raw of generatedItems || []) {
    const item = safeGeneratedItem(raw);
    const option = requestedOption(options, item, "key");
    if (option) {
      const quantity = needQuantityForOption(item, option, snapshot);
      mergeNeed(rows, {
        key: option.key,
        name: option.name,
        category: option.category,
        quantity,
        measure_unit: option.measure_unit,
        purchase_unit: option.purchase_unit || option.measure_unit,
        purchase_quantity: Number(option.purchase_quantity || 1),
        estimated_price: Number(option.estimated_price || 0),
        notes: item.note || option.notes || "",
        custom: Boolean(option.custom),
      });
      continue;
    }

    const unit = text(item.unit, 60) || "unit";
    const nameKey = `${normalizeName(item.name)}\u0000${normalizedUnit(unit)}`;
    let key = customByName.get(nameKey);
    if (!key) {
      const existingCustom = rows.find((row) => row.custom
        && normalizeName(row.name) === normalizeName(item.name)
        && unitMatches(row.measure_unit, unit));
      key = existingCustom?.key;
    }
    if (!key) {
      key = uniqueAiKey("custom", item.name, keys, reserved);
      reserved.add(key);
      customByName.set(nameKey, key);
    }
    mergeNeed(rows, {
      key,
      name: item.name,
      category: "Other",
      quantity: item.quantity,
      measure_unit: unit,
      purchase_unit: unit,
      purchase_quantity: 1,
      estimated_price: 0,
      notes: item.note,
      custom: true,
    });
  }
  return rows;
}

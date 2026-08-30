import { purchasedFoodPrice } from "./purchase-pricing.js?v=homealacarte-110";
const PURCHASE_DESCRIPTION_PREFIX = "Purchase · ";
function text(value, maxLength = 200) { return String(value || "").trim().slice(0, maxLength); }
function plainNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)).toString() : "";
}
function decimal(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/[€$£]/g, "")
    .replace(/\b(?:eur|euro|euros)\b/gi, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  return Number(normalized);
}
function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function normalizeUnit(value) {
  const unit = normalizeName(value).replace(/\s+/g, " ");
  const aliases = new Map([
    ["gram", "g"], ["grams", "g"], ["gramme", "g"], ["grammes", "g"],
    ["kilogram", "kg"], ["kilograms", "kg"], ["kilogramme", "kg"], ["kilogrammes", "kg"],
    ["kilo", "kg"], ["kilos", "kg"],
    ["units", "unit"], ["unite", "unit"], ["unites", "unit"],
    ["pieces", "piece"], ["piece", "piece"], ["pcs", "piece"], ["pc", "piece"],
    ["bottles", "bottle"], ["bouteille", "bottle"], ["bouteilles", "bottle"], ["flacon", "bottle"], ["flacons", "bottle"],
    ["rolls", "roll"], ["rouleau", "roll"], ["rouleaux", "roll"],
    ["packs", "pack"], ["paquet", "pack"], ["paquets", "pack"],
    ["boxes", "box"], ["boite", "box"], ["boites", "box"],
    ["jars", "jar"], ["pot", "jar"], ["pots", "jar"],
    ["cans", "can"], ["canettes", "can"], ["canette", "can"],
    ["slices", "slice"], ["tranche", "slice"], ["tranches", "slice"],
    ["bags", "bag"], ["sachet", "bag"], ["sachets", "bag"],
    ["loaves", "loaf"], ["loaf", "loaf"], ["pain", "loaf"], ["pains", "loaf"],
  ]);
  return aliases.get(unit) || unit.replace(/s$/, "");
}
function kindFromText(value) {
  const kind = normalizeName(value);
  if (!kind) return "";
  if (["food", "aliment", "aliments", "ingredient", "ingredients", "nourriture"].includes(kind)) return "food";
  if (["household", "house", "home", "maison", "foyer", "menage"].includes(kind)) return "household";
  return null;
}
function optionKind(option) { return option?.household ? "household" : "food"; }
function isFoodItem(item) { return Object.hasOwn(item || {}, "kcal"); }
function stockItemKey(row) { return String(row?.item_key || row?.key || "").trim(); }
function uniqueItemKey(name, items, reserved = new Set()) {
  const slug = normalizeName(name).replace(/\s+/g, "_") || "item";
  const occupied = new Set([...(items || []).map((item) => String(item?.key || "")), ...reserved]);
  const base = `purchase_${slug}`;
  let key = base;
  let suffix = 2;
  while (occupied.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}
export function parsePurchaseDescription(description) {
  const source = String(description || "").trim();
  if (!source.startsWith(PURCHASE_DESCRIPTION_PREFIX)) return null;
  const fields = source.slice(PURCHASE_DESCRIPTION_PREFIX.length).split(" · ");
  const quantityField = fields.find((field) => field.startsWith("qty="));
  const totalField = fields.find((field) => field.startsWith("total="));
  if (!quantityField || !totalField) return null;
  const quantityMatch = quantityField.slice(4).match(/^([+-]?[0-9]+(?:\.[0-9]+)?)\s+(.+)$/);
  const totalMatch = totalField.slice(6).match(/^([+-]?[0-9]+(?:\.[0-9]+)?)\s+EUR$/i);
  if (!quantityMatch || !totalMatch) return null;
  const quantity = Number(quantityMatch[1]);
  const totalPrice = Number(totalMatch[1]);
  if (!Number.isFinite(quantity) || !Number.isFinite(totalPrice)) return null;
  return {
    quantity,
    unit: quantityMatch[2],
    totalPrice,
    store: fields.find((field) => field.startsWith("store="))?.slice(6) || "",
    purchaseId: fields.find((field) => field.startsWith("id="))?.slice(3) || "",
  };
}
export function purchaseDetails(observation) {
  const purchase = observation?.purchase;
  const quantity = Number(purchase?.quantity);
  const totalPrice = Number(purchase?.total_paid);
  const unit = text(purchase?.unit, 60);
  if (Number.isFinite(quantity) && quantity > 0
    && Number.isFinite(totalPrice) && totalPrice >= 0 && unit) {
    return {
      quantity,
      unit,
      totalPrice,
      store: text(purchase.store, 160),
      purchaseId: text(purchase.purchase_id, 120),
    };
  }
  return parsePurchaseDescription(observation?.description);
}
function validObservation(observation) {
  const date = text(observation?.date, 40);
  const price = Number(observation?.price);
  return Boolean(date) || (Number.isFinite(price) && price > 0);
}
export function collectPurchaseHistory(snapshot) {
  const rows = [];
  let sequence = 0;
  const add = (item, household) => {
    for (const observation of item?.price_history || []) {
      if (!validObservation(observation)) continue;
      const price = Number(observation.price);
      if (!Number.isFinite(price) || price < 0) continue;
      rows.push({
        sequence: sequence += 1,
        itemKey: item.key,
        itemName: item.name,
        household,
        purchaseUnit: household || observation.price_basis === "purchase_unit"
          ? item.purchase_unit
          : "kg",
        date: text(observation.date, 40),
        price,
        description: String(observation.description || ""),
        purchase: purchaseDetails(observation),
      });
    }
  };
  (snapshot?.ingredients || []).forEach((item) => add(item, false));
  (snapshot?.household_items || []).forEach((item) => add(item, true));
  return rows.sort((left, right) => (
    right.date.localeCompare(left.date)
    || right.sequence - left.sequence
    || String(left.itemName).localeCompare(String(right.itemName))
  ));
}
function validatePurchase(purchase) {
  const date = text(purchase?.date, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("purchase_invalid_date");
  const lines = Array.isArray(purchase?.lines) ? purchase.lines : [];
  if (!lines.length) throw new Error("purchase_empty");
  if (lines.length > 200) throw new Error("purchase_too_many_lines");
  return {
    date,
    store: text(purchase.store, 160),
    purchaseId: text(purchase.purchase_id, 120) || `purchase-${date}-${Date.now().toString(36)}`,
    lines,
  };
}
function validateLine(raw, index) {
  const quantity = Number(raw?.quantity);
  const totalPrice = Number(raw?.total_price);
  const quantityUnit = String(raw?.quantity_unit || "").trim();
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`purchase_invalid_quantity:${index + 1}`);
  }
  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    throw new Error(`purchase_invalid_price:${index + 1}`);
  }
  if (!["g", "unit"].includes(quantityUnit)) {
    throw new Error(`purchase_invalid_unit:${index + 1}`);
  }
  return {
    itemKey: text(raw.item_key, 160),
    newItem: raw.new_item || null,
    quantity,
    quantityUnit,
    displayUnit: text(raw.display_unit, 60) || (quantityUnit === "g" ? "g" : "unit"),
    totalPrice,
  };
}
function createNewItem(document, line, index, reserved) {
  const kind = String(line.newItem?.kind || "");
  const name = text(line.newItem?.name, 160);
  if (!name || !["food", "household"].includes(kind)) {
    throw new Error(`purchase_invalid_new_item:${index + 1}`);
  }
  const key = text(line.newItem?.key, 160)
    || uniqueItemKey(name, document.items, reserved);
  if ((document.items || []).some((item) => item.key === key) || reserved.has(key)) {
    throw new Error(`purchase_duplicate_item_key:${index + 1}`);
  }
  reserved.add(key);
  if (kind === "food") {
    if (line.quantityUnit !== "g") throw new Error(`purchase_new_food_requires_grams:${index + 1}`);
    const grams = line.quantity;
    return {
      key,
      name,
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
      source: "Purchase import; nutritional values require review",
      url: "",
      price: 0,
      price_basis: "kg",
      price_source: "",
      price_checked_at: "",
      price_history: [],
      measure_unit: "g",
      grams_per_measure_unit: 1,
      purchase_unit: `${plainNumber(grams)} g`,
      purchase_quantity: grams,
      purchase_quantity_unit: "g",
    };
  }
  const measureUnit = text(line.newItem?.measure_unit, 60) || line.displayUnit || "unit";
  return {
    key,
    name,
    category: "Other",
    purchase_unit: line.quantity === 1
      ? measureUnit
      : `${plainNumber(line.quantity)} ${measureUnit}`,
    purchase_quantity: line.quantity,
    estimated_price: 0,
    price_history: [],
    measure_unit: measureUnit,
    last_bought_at: "",
    lasting_days: null,
    notes: "",
    custom: true,
  };
}
function addObservation(item, observation) {
  if (!Array.isArray(item.price_history)) item.price_history = [];
  item.price_history.push(observation);
}
function updateStock(document, item, line, purchasedGrams = 0) {
  if (!Array.isArray(document.stock)) document.stock = [];
  let row = document.stock.find((candidate) => stockItemKey(candidate) === item.key);
  if (isFoodItem(item)) {
    const gramsPerUnit = Number(item.grams_per_measure_unit || 0);
    const hasUnitConversion = Number.isFinite(gramsPerUnit) && gramsPerUnit > 0;
    if (!hasUnitConversion && (line.quantityUnit !== "g" || row?.quantity_unit === "unit")) throw new Error(`purchase_invalid_item_conversion:${item.key}`);
    if (!row) {
      document.stock.push({
        item_key: item.key,
        quantity: line.quantityUnit === "unit" && item.measure_unit !== "g"
          ? line.quantity
          : purchasedGrams,
        quantity_unit: line.quantityUnit === "unit" && item.measure_unit !== "g" ? "unit" : "g",
      });
      return;
    }
    const currentQuantity = Number(row.quantity);
    if (!Number.isFinite(currentQuantity) || currentQuantity < 0) {
      throw new Error(`purchase_invalid_existing_stock:${item.key}`);
    }
    const currentGrams = row.quantity_unit === "unit"
      ? currentQuantity * gramsPerUnit
      : currentQuantity;
    const nextGrams = currentGrams + purchasedGrams;
    if (row.quantity_unit === "unit" && item.measure_unit !== "g") {
      row.quantity = nextGrams / gramsPerUnit;
      row.quantity_unit = "unit";
    } else {
      row.quantity = nextGrams;
      row.quantity_unit = "g";
    }
    return;
  }
  if (line.quantityUnit !== "unit") throw new Error(`purchase_household_requires_units:${item.key}`);
  if (!row) {
    document.stock.push({
      item_key: item.key,
      quantity: line.quantity,
      quantity_unit: "unit",
    });
    return;
  }
  const currentQuantity = Number(row.quantity);
  if (!Number.isFinite(currentQuantity) || currentQuantity < 0 || row.quantity_unit !== "unit") {
    throw new Error(`purchase_invalid_existing_stock:${item.key}`);
  }
  row.quantity = currentQuantity + line.quantity;
}
export function applyPurchaseToDocument(sourceDocument, rawPurchase) {
  const purchase = validatePurchase(rawPurchase);
  const document = structuredClone(sourceDocument || {});
  if (!Array.isArray(document.items)) throw new Error("purchase_items_missing");
  const reserved = new Set();
  const originalKeys = new Set(document.items.map((item) => item.key));
  purchase.lines.forEach((rawLine, index) => {
    const line = validateLine(rawLine, index);
    let item = line.itemKey
      ? document.items.find((candidate) => candidate.key === line.itemKey)
      : null;
    if (line.itemKey && !item) throw new Error(`purchase_unknown_item:${index + 1}`);
    if (!item) {
      item = createNewItem(document, line, index, reserved);
      document.items.push(item);
    } else if (!originalKeys.has(item.key)) {
      throw new Error(`purchase_duplicate_item_key:${index + 1}`);
    }
    const purchaseDetails = {
      quantity: line.quantity,
      unit: line.displayUnit,
      total_paid: line.totalPrice,
      store: purchase.store,
      purchase_id: `${purchase.purchaseId}-${index + 1}`,
    };
    const description = purchase.store || "Purchase";
    if (isFoodItem(item)) {
      const gramsPerUnit = Number(item.grams_per_measure_unit || 0);
      const hasUnitConversion = Number.isFinite(gramsPerUnit) && gramsPerUnit > 0;
      if (line.quantityUnit !== "g" && !hasUnitConversion) throw new Error(`purchase_invalid_item_conversion:${index + 1}`);
      const grams = line.quantityUnit === "g"
        ? line.quantity
        : line.quantity * gramsPerUnit;
      if (!Number.isFinite(grams) || grams <= 0) throw new Error(`purchase_invalid_quantity:${index + 1}`);
      const pricing = hasUnitConversion
        ? purchasedFoodPrice(item, grams, line.totalPrice)
        : { price: line.totalPrice / grams * 1000, priceBasis: "kg" };
      if (!pricing || !Number.isFinite(pricing.price)) throw new Error(`purchase_invalid_item_conversion:${index + 1}`);
      const { price, priceBasis } = pricing;
      item.price = price;
      item.price_basis = priceBasis;
      item.price_checked_at = purchase.date;
      item.price_source = purchase.store || "Purchase";
      addObservation(item, {
        date: purchase.date,
        price,
        price_basis: priceBasis,
        description,
        purchase: purchaseDetails,
      });
      updateStock(document, item, line, grams);
      return;
    }
    if (line.quantityUnit !== "unit") {
      throw new Error(`purchase_household_requires_units:${index + 1}`);
    }
    const purchaseQuantity = Number(item.purchase_quantity || 0);
    if (!Number.isFinite(purchaseQuantity) || purchaseQuantity <= 0) {
      throw new Error(`purchase_invalid_item_conversion:${index + 1}`);
    }
    const packages = line.quantity / purchaseQuantity;
    const unitPrice = line.totalPrice / packages;
    item.estimated_price = unitPrice;
    item.last_bought_at = purchase.date;
    addObservation(item, {
      date: purchase.date,
      price: unitPrice,
      price_basis: "purchase_unit",
      description,
      purchase: purchaseDetails,
    });
    updateStock(document, item, line);
  });
  return document;
}
function exactOption(options, name, kind = "") {
  const target = normalizeName(name);
  const matches = (options || []).filter((option) => (
    normalizeName(option.name) === target
    && (!kind || optionKind(option) === kind)
  ));
  return matches.length === 1 ? matches[0] : null;
}
function resolveExistingQuantity(option, rawQuantity, rawUnit, lineNumber) {
  const quantity = decimal(rawQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Line ${lineNumber}: quantity must be positive.`);
  }
  const unit = normalizeUnit(rawUnit);
  if (!unit) throw new Error(`Line ${lineNumber}: unit is required.`);
  if (option.household) {
    const measureUnit = normalizeUnit(option.measure_unit);
    if (["g", "kg"].includes(unit) || (unit !== "unit" && unit !== measureUnit)) {
      throw new Error(`Line ${lineNumber}: unit "${rawUnit}" does not match ${option.name} (${option.measure_unit}).`);
    }
    return {
      quantity,
      quantity_unit: "unit",
      display_unit: String(option.measure_unit || rawUnit || "unit"),
    };
  }
  if (unit === "kg") {
    return { quantity: quantity * 1000, quantity_unit: "g", display_unit: "g" };
  }
  if (unit === "g") return { quantity, quantity_unit: "g", display_unit: "g" };
  const measureUnit = normalizeUnit(option.measure_unit);
  const volumeFactors = { ml: 1, cl: 10, l: 1000 };
  if (volumeFactors[unit] && volumeFactors[measureUnit]) {
    return {
      quantity: quantity * volumeFactors[unit] / volumeFactors[measureUnit],
      quantity_unit: "unit",
      display_unit: String(option.measure_unit),
    };
  }
  if (unit === "unit" || unit === measureUnit) {
    return {
      quantity,
      quantity_unit: "unit",
      display_unit: String(option.measure_unit || "unit"),
    };
  }
  throw new Error(
    `Line ${lineNumber}: unit "${rawUnit}" does not match ${option.name} (${option.measure_unit} or g).`,
  );
}
function resolveNewQuantity(kind, rawQuantity, rawUnit, lineNumber) {
  const quantity = decimal(rawQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Line ${lineNumber}: quantity must be positive.`);
  }
  const unit = normalizeUnit(rawUnit);
  if (!unit) throw new Error(`Line ${lineNumber}: unit is required.`);
  if (kind === "food") {
    if (unit === "kg") {
      return { quantity: quantity * 1000, quantity_unit: "g", display_unit: "g" };
    }
    if (unit === "g") return { quantity, quantity_unit: "g", display_unit: "g" };
    throw new Error(`Line ${lineNumber}: a new food item needs an explicit g or kg quantity.`);
  }
  if (["g", "kg"].includes(unit)) {
    throw new Error(`Line ${lineNumber}: a new household item needs a count unit.`);
  }
  return {
    quantity,
    quantity_unit: "unit",
    display_unit: text(rawUnit, 60) || "unit",
  };
}
function batchColumns(line) {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  if (line.includes("|")) return line.split("|");
  return null;
}
function looksLikeHeader(columns) {
  const first = normalizeName(columns?.[0]);
  const second = normalizeName(columns?.[1]);
  return ["name", "nom", "item", "article"].includes(first)
    && ["quantity", "quantite", "qty"].includes(second);
}
export function parsePurchaseBatch(listText, snapshot) {
  const sourceLines = String(listText || "").split(/\r?\n/);
  const options = snapshot?.stock_options || [];
  const existingKeys = new Set([
    ...(snapshot?.ingredients || []).map((item) => item.key),
    ...(snapshot?.household_items || []).map((item) => item.key),
  ]);
  const reserved = new Set();
  const result = [];
  sourceLines.forEach((source, index) => {
    if (!source.trim()) return;
    const lineNumber = index + 1;
    const columns = batchColumns(source);
    if (!columns) {
      throw new Error(`Line ${lineNumber}: separate name, quantity, unit and total price with ;, | or a tab.`);
    }
    const values = columns.map((value) => value.trim());
    if (!result.length && looksLikeHeader(values)) return;
    if (values.length < 4 || values.length > 5) {
      throw new Error(`Line ${lineNumber}: expected 4 or 5 columns.`);
    }
    const [name, rawQuantity, rawUnit, rawPrice, rawKind = ""] = values;
    if (!name) throw new Error(`Line ${lineNumber}: item name is required.`);
    const parsedKind = kindFromText(rawKind);
    if (parsedKind === null) {
      throw new Error(`Line ${lineNumber}: kind must be food or household.`);
    }
    const option = exactOption(options, name, parsedKind || "");
    const totalPrice = decimal(rawPrice);
    if (!Number.isFinite(totalPrice) || totalPrice < 0) {
      throw new Error(`Line ${lineNumber}: total price must be zero or positive.`);
    }
    if (option) {
      const quantity = resolveExistingQuantity(option, rawQuantity, rawUnit, lineNumber);
      result.push({
        item_key: option.item_key,
        ...quantity,
        total_price: totalPrice,
      });
      return;
    }
    if (!parsedKind) {
      throw new Error(`Line ${lineNumber}: "${name}" is not an exact catalogue match; add food or household as column 5.`);
    }
    const quantity = resolveNewQuantity(parsedKind, rawQuantity, rawUnit, lineNumber);
    const key = uniqueItemKey(name, [
      ...[...existingKeys].map((existing) => ({ key: existing })),
    ], reserved);
    reserved.add(key);
    result.push({
      ...quantity,
      total_price: totalPrice,
      new_item: {
        key,
        name: text(name, 160),
        kind: parsedKind,
        measure_unit: parsedKind === "household" ? quantity.display_unit : "g",
      },
    });
  });
  if (!result.length) throw new Error("No purchase lines found.");
  if (result.length > 200) throw new Error("At most 200 purchase lines can be added at once.");
  return result;
}

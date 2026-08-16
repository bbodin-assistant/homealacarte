export const DATA_ENTITY_TYPES = [
  "items",
  "dishes",
  "people",
  "menu",
  "stock",
  "extra_needs",
];

const APP_ENTITY_TYPE = "app";
const APP_ENTITY_ID = "settings";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function emptyDocument() {
  return Object.fromEntries(DATA_ENTITY_TYPES.map((type) => [type, []]));
}

function parseSources(sources) {
  const document = emptyDocument();
  for (const source of sources || []) {
    const parsed = JSON.parse(String(source?.content || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${source?.path || "data"}: top level must be an object`);
    }
    for (const type of DATA_ENTITY_TYPES) {
      if (parsed[type] == null) continue;
      if (!Array.isArray(parsed[type])) {
        throw new Error(`${source?.path || "data"}.${type} must be an array`);
      }
      document[type].push(...parsed[type].map(clone));
    }
  }
  return document;
}

function legacyExtraNeeds(rows) {
  return (rows || []).map((row) => ({
    item_key: row.item_key || row.key,
    quantity: row.quantity,
    quantity_unit: row.quantity_unit || row.measure_unit || "unit",
    ...(String(row.notes || "").trim() ? { notes: String(row.notes).trim() } : {}),
  }));
}

export function privateStateDocument(value) {
  if (!value || typeof value !== "object") throw new Error("Private state must be an object");
  const document = value.document ? clone(value.document) : parseSources(value.sources || []);
  for (const type of DATA_ENTITY_TYPES) {
    if (!Array.isArray(document[type])) document[type] = [];
  }
  const canonicalSource = Boolean(value.document)
    || (value.sources?.length === 1 && value.sources[0]?.path === "homealacarte_data.json");
  if (!canonicalSource && Array.isArray(value.people)) document.people = clone(value.people);
  if (!canonicalSource && Array.isArray(value.menu)) document.menu = clone(value.menu);
  if (!canonicalSource && Array.isArray(value.stock)) {
    document.stock = value.stock.map((row) => ({
      item_key: row.item_key,
      quantity: row.quantity,
      quantity_unit: row.quantity_unit,
      ...(String(row.notes || "").trim() ? { notes: String(row.notes).trim() } : {}),
    }));
  }
  if (!canonicalSource && Array.isArray(value.customGrocery)) {
    document.extra_needs = legacyExtraNeeds(value.customGrocery);
  }
  return document;
}

function fallbackMenuId(row, position) {
  const source = JSON.stringify([row, position]);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `menu_${(hash >>> 0).toString(16).padStart(8, "0")}_${position}`;
}

function entityId(type, payload, position) {
  if (type === "menu") return String(payload.id || fallbackMenuId(payload, position));
  if (type === "stock" || type === "extra_needs") return String(payload.item_key || "");
  return String(payload.key || "");
}

export function recordKey(entityType, entityIdValue) {
  return `${entityType}\u0000${entityIdValue}`;
}

export function privateStateToRecords(value) {
  const document = privateStateDocument(value);
  const records = [{
    recordKey: recordKey(APP_ENTITY_TYPE, APP_ENTITY_ID),
    entityType: APP_ENTITY_TYPE,
    entityId: APP_ENTITY_ID,
    position: 0,
    payload: {
      version: Number(value.version || 11),
      language: String(value.language || ""),
    },
    version: 0,
  }];
  for (const type of DATA_ENTITY_TYPES) {
    const seen = new Set();
    document[type].forEach((source, position) => {
      const payload = clone(source);
      const id = entityId(type, payload, position);
      if (!id) throw new Error(`${type}[${position}] has no synchronization identity`);
      if (seen.has(id)) throw new Error(`${type} has duplicate synchronization identity: ${id}`);
      seen.add(id);
      if (type === "menu") payload.id = id;
      records.push({
        recordKey: recordKey(type, id),
        entityType: type,
        entityId: id,
        position,
        payload,
        version: 0,
      });
    });
  }
  return records;
}

export function normalizeRemoteRecord(row) {
  const entityType = row.entityType || row.entity_type;
  const entityId = row.entityId || row.entity_id;
  return {
    recordKey: recordKey(entityType, entityId),
    entityType,
    entityId,
    position: Number(row.position || 0),
    payload: clone(row.payload),
    version: Number(row.version || row.record_version || 0),
  };
}

export function recordsToPrivateState(sourceRecords) {
  const records = sourceRecords.map(normalizeRemoteRecord);
  const settings = records.find((row) => row.entityType === APP_ENTITY_TYPE)?.payload || {};
  const document = emptyDocument();
  for (const type of DATA_ENTITY_TYPES) {
    document[type] = records
      .filter((row) => row.entityType === type)
      .sort((left, right) => left.position - right.position || left.entityId.localeCompare(right.entityId))
      .map((row) => clone(row.payload));
  }
  return {
    version: Number(settings.version || 11),
    language: String(settings.language || ""),
    sources: [{
      path: "homealacarte_data.json",
      content: `${JSON.stringify(document, null, 2)}\n`,
    }],
    people: null,
    menu: null,
    stock: null,
    customGrocery: null,
  };
}

export function sameRecordContent(left, right) {
  return left.position === right.position
    && JSON.stringify(left.payload) === JSON.stringify(right.payload);
}

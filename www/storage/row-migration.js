const DATA_ENTITY_TYPES = ["items", "dishes", "people", "menu", "stock", "extra_needs"];

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizeLegacyRow(row) {
  return {
    entityType: row.entityType || row.entity_type,
    entityId: String(row.entityId || row.entity_id || ""),
    position: Number(row.position || 0),
    payload: clone(row.payload),
  };
}

export function legacyRowsToPrivateState(sourceRows) {
  const rows = sourceRows.map(normalizeLegacyRow);
  const settings = rows.find((row) => row.entityType === "app")?.payload || {};
  const document = Object.fromEntries(DATA_ENTITY_TYPES.map((type) => [
    type,
    rows
      .filter((row) => row.entityType === type)
      .sort((left, right) => (
        left.position - right.position || left.entityId.localeCompare(right.entityId)
      ))
      .map((row) => {
        const payload = clone(row.payload);
        if (type === "menu") delete payload.id;
        return payload;
      }),
  ]));
  return {
    version: Number(settings.version || 12),
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

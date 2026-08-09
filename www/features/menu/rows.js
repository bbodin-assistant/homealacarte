function mergeKey(row) {
  return JSON.stringify([
    String(row.day || ""),
    String(row.meal || ""),
    String(row.item_key || ""),
    Number(row.quantity),
    String(row.quantity_unit || ""),
    String(row.notes || "").trim(),
  ]);
}

export function mergeCompatibleMenuRows(rows) {
  const merged = [];
  const candidatesByKey = new Map();

  for (const sourceRow of rows || []) {
    const row = {
      ...sourceRow,
      people: [...(sourceRow.people || [])],
    };
    const key = mergeKey(row);
    const people = new Set(row.people);
    const candidates = candidatesByKey.get(key) || [];
    const targetIndex = candidates.find((index) =>
      merged[index].people.every((person) => !people.has(person)));

    if (targetIndex == null) {
      candidates.push(merged.length);
      candidatesByKey.set(key, candidates);
      merged.push(row);
      continue;
    }

    merged[targetIndex].people.push(...row.people);
  }

  return merged;
}

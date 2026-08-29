function clone(value) {
  return value == null ? value : structuredClone(value);
}

function stripMenuRowIds(rows) {
  let changed = false;
  const normalized = (rows || []).map((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source) || !("id" in source)) {
      return source;
    }
    const row = { ...source };
    delete row.id;
    changed = true;
    return row;
  });
  return { changed, rows: normalized };
}

function stripDocumentMenuIds(document) {
  if (!document || typeof document !== "object" || !Array.isArray(document.menu)) {
    return { changed: false, document };
  }
  const menu = stripMenuRowIds(document.menu);
  return menu.changed
    ? { changed: true, document: { ...document, menu: menu.rows } }
    : { changed: false, document };
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalJsonValue(value[key])]),
  );
}

export function normalizePrivateState(value) {
  if (!value || typeof value !== "object") return value;
  const normalized = clone(value);
  if (Array.isArray(normalized.menu)) {
    normalized.menu = stripMenuRowIds(normalized.menu).rows;
  }
  if (normalized.document) {
    normalized.document = stripDocumentMenuIds(normalized.document).document;
  }
  if (Array.isArray(normalized.sources)) {
    normalized.sources = normalized.sources.map((source) => {
      try {
        const parsed = JSON.parse(String(source?.content || ""));
        const result = stripDocumentMenuIds(parsed);
        const content = `${JSON.stringify(canonicalJsonValue(result.document), null, 2)}\n`;
        if (!result.changed && content === source.content) return source;
        return {
          ...source,
          content,
        };
      } catch {
        return source;
      }
    });
  }
  return normalized;
}

export function sameJsonValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index] && sameJsonValue(left[key], right[key])
    ));
}

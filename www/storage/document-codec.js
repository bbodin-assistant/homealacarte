function clone(value) {
  return value == null ? value : structuredClone(value);
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
  if (Array.isArray(normalized.sources)) {
    normalized.sources = normalized.sources.map((source) => {
      try {
        const parsed = JSON.parse(String(source?.content || ""));
        const content = `${JSON.stringify(canonicalJsonValue(parsed), null, 2)}\n`;
        if (content === source.content) return source;
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

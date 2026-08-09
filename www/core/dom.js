export function createDom(documentRef) {
  const select = (selector) => documentRef.querySelector(selector);
  const selectAll = (selector) => [...documentRef.querySelectorAll(selector)];
  const optionalInputNumber = (selector) => {
    const value = select(selector).value;
    return value === "" ? null : Number(value);
  };
  return { select, selectAll, optionalInputNumber };
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

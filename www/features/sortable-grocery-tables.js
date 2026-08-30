function locale() {
  return document.documentElement.lang || navigator.language || undefined;
}

export function sortableNumber(value) {
  const raw = String(value ?? "").trim().replace(/\s|\u00a0|\u202f/g, "");
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = cleaned.replaceAll(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    normalized = cleaned.replace(",", ".");
  }
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function nextSort(currentKey, currentDirection, key) {
  if (currentKey === key) {
    return { key, direction: currentDirection === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}

export function sortRecords(rows = [], {
  key,
  direction = "asc",
  valueFor,
  locale: requestedLocale,
  tieBreaker,
} = {}) {
  const multiplier = direction === "desc" ? -1 : 1;
  const collator = new Intl.Collator(requestedLocale || undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return [...rows].sort((left, right) => {
    const leftValue = valueFor(left, key);
    const rightValue = valueFor(right, key);
    const comparison = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : collator.compare(String(leftValue ?? ""), String(rightValue ?? ""));
    if (comparison) return comparison * multiplier;
    if (typeof tieBreaker === "function") {
      return collator.compare(String(tieBreaker(left) ?? ""), String(tieBreaker(right) ?? ""));
    }
    return 0;
  });
}

function baseLabel(control) {
  return control.textContent.replace(/[\s\u00a0]*[↑↓]\s*$/, "").trim();
}

function updateHeaderControls(header, attribute, sortState) {
  header.querySelectorAll(`[${attribute}]`).forEach((control) => {
    const label = baseLabel(control);
    const key = control.getAttribute(attribute);
    const active = sortState.key === key;
    const indicator = active ? (sortState.direction === "desc" ? " ↓" : " ↑") : "";
    control.textContent = `${label}${indicator}`;
    control.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function replaceHeaderChildren(header, keys, attribute) {
  [...header.children].forEach((child, index) => {
    const key = keys[index];
    if (!key || child.matches(`[${attribute}]`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = child.id;
    button.setAttribute(attribute, key);
    button.textContent = child.textContent.trim();
    child.replaceWith(button);
  });
}

function extraNeedValue(row, key) {
  if (key === "quantity") return sortableNumber(row.querySelector(".custom-quantity")?.value);
  if (key === "price") return sortableNumber(row.querySelector(".custom-price")?.textContent);
  if (key === "category") return row.querySelector(".custom-category")?.textContent.trim() || "";
  if (key === "unit") return row.querySelector(".custom-unit")?.textContent.trim() || "";
  if (key === "notes") return row.querySelector(".custom-notes")?.value.trim() || "";
  const name = row.querySelector(".custom-row-name");
  const origin = name?.querySelector(".item-origin")?.textContent || "";
  return (name?.textContent || "").replace(origin, "").trim();
}

function purchaseValue(row, key) {
  const children = row.children;
  if (key === "quantity") return sortableNumber(children[1]?.textContent);
  if (key === "paid") return sortableNumber(children[2]?.textContent);
  if (key === "price") return sortableNumber(children[3]?.textContent);
  if (key === "source") return children[4]?.textContent.trim() || "";
  return children[0]?.textContent.trim() || "";
}

function applyExtraNeedSort(list, sortState) {
  const header = list.querySelector(".custom-head");
  if (!header) return;
  replaceHeaderChildren(
    header,
    ["name", "category", "quantity", "unit", "price", "notes"],
    "data-extra-needs-sort",
  );
  updateHeaderControls(header, "data-extra-needs-sort", sortState);
  const rows = [...list.querySelectorAll(":scope > .custom-row")];
  if (!rows.length) return;
  const sorted = sortRecords(rows, {
    key: sortState.key,
    direction: sortState.direction,
    locale: locale(),
    valueFor: extraNeedValue,
    tieBreaker: (row) => extraNeedValue(row, "name"),
  });
  if (sorted.every((row, index) => row === rows[index])) return;
  sorted.forEach((row) => list.append(row));
}

function applyPurchaseSort(list, header, sortState) {
  if (!header) return;
  header.removeAttribute("aria-hidden");
  replaceHeaderChildren(
    header,
    ["item", "quantity", "paid", "price", "source"],
    "data-purchase-history-sort",
  );
  updateHeaderControls(header, "data-purchase-history-sort", sortState);
  if (!sortState.key) return;
  list.querySelectorAll(":scope > .purchase-date-group").forEach((group) => {
    const rows = [...group.querySelectorAll(":scope > .purchase-history-row")];
    const sorted = sortRecords(rows, {
      key: sortState.key,
      direction: sortState.direction,
      locale: locale(),
      valueFor: purchaseValue,
      tieBreaker: (row) => purchaseValue(row, "item"),
    });
    if (sorted.every((row, index) => row === rows[index])) return;
    sorted.forEach((row) => group.append(row));
  });
}

function installStyles() {
  if (document.querySelector("#sortable-grocery-table-styles")) return;
  const style = document.createElement("style");
  style.id = "sortable-grocery-table-styles";
  style.textContent = `
    .custom-head button,.purchase-history-head button{justify-self:start;padding:0;color:inherit;background:none;border:0;cursor:pointer;font:inherit;letter-spacing:inherit;text-align:left;text-transform:inherit}
    .custom-head button:hover,.custom-head button:focus-visible,.purchase-history-head button:hover,.purchase-history-head button:focus-visible{color:var(--ink);outline:none}
  `;
  document.head.append(style);
}

export function installSortableGroceryTables(documentRef = document) {
  installStyles();
  const extraState = { key: "name", direction: "asc" };
  const purchaseState = { key: null, direction: "asc" };
  const extraList = documentRef.querySelector("#custom-list");
  const purchaseList = documentRef.querySelector("#purchase-list");
  const purchaseHeader = documentRef.querySelector(".purchase-history-head");

  const refreshExtra = () => extraList && applyExtraNeedSort(extraList, extraState);
  const refreshPurchases = () => purchaseList
    && applyPurchaseSort(purchaseList, purchaseHeader, purchaseState);

  if (extraList) {
    new MutationObserver(() => queueMicrotask(refreshExtra))
      .observe(extraList, { childList: true, subtree: true });
  }
  if (purchaseList) {
    new MutationObserver(() => queueMicrotask(refreshPurchases))
      .observe(purchaseList, { childList: true, subtree: true });
  }

  documentRef.addEventListener("click", (event) => {
    const extraSort = event.target.closest?.("[data-extra-needs-sort]");
    if (extraSort) {
      Object.assign(extraState, nextSort(extraState.key, extraState.direction, extraSort.dataset.extraNeedsSort));
      refreshExtra();
      return;
    }
    const purchaseSort = event.target.closest?.("[data-purchase-history-sort]");
    if (purchaseSort) {
      Object.assign(purchaseState, nextSort(purchaseState.key, purchaseState.direction, purchaseSort.dataset.purchaseHistorySort));
      refreshPurchases();
    }
  });

  refreshExtra();
  refreshPurchases();
}

if (typeof document !== "undefined") {
  installSortableGroceryTables(document);
}

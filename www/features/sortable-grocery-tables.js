function locale(documentRef = document) {
  return documentRef.documentElement.lang || globalThis.navigator?.language || undefined;
}

export const DEFAULT_PURCHASE_SORT = Object.freeze({ key: null, direction: "asc" });

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
  if (currentKey !== key) return { key, direction: "asc" };
  if (currentDirection === "asc") return { key, direction: "desc" };
  return { key: null, direction: "asc" };
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
    const text = `${label}${indicator}`;
    if (control.textContent !== text) control.textContent = text;
    control.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function replaceHeaderChildren(documentRef, header, keys, attribute) {
  [...header.children].forEach((child, index) => {
    const key = keys[index];
    if (!key || child.matches(`[${attribute}]`)) return;
    const button = documentRef.createElement("button");
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

function applyExtraNeedSort(documentRef, list, sortState, defaultOrder) {
  const header = list.querySelector(".custom-head");
  if (!header) return;
  replaceHeaderChildren(
    documentRef,
    header,
    ["name", "category", "quantity", "unit", "price", "notes"],
    "data-extra-needs-sort",
  );
  updateHeaderControls(header, "data-extra-needs-sort", sortState);
  const rows = [...list.querySelectorAll(":scope > .custom-row")];
  if (!rows.length) return;
  const sorted = sortState.key
    ? sortRecords(rows, {
      key: sortState.key,
      direction: sortState.direction,
      locale: locale(documentRef),
      valueFor: extraNeedValue,
      tieBreaker: (row) => extraNeedValue(row, "name"),
    })
    : [...rows].sort((left, right) =>
      (defaultOrder.get(left) ?? 0) - (defaultOrder.get(right) ?? 0));
  if (sorted.every((row, index) => row === rows[index])) return;
  sorted.forEach((row) => list.append(row));
}

function capturePurchaseDefaultLayout(list) {
  const rows = [...list.querySelectorAll(".purchase-history-row")];
  if (rows.length && !list.querySelector(":scope > .purchase-date-group")) return null;
  return {
    roots: [...list.children],
    rows: rows.map((row) => ({ row, parent: row.parentElement })),
  };
}

function restorePurchaseDefaultLayout(list, layout) {
  if (!layout) return;
  layout.rows.forEach(({ row, parent }) => parent?.append(row));
  list.replaceChildren(...layout.roots);
}

function applyPurchaseSort(documentRef, list, header, sortState, defaultLayout) {
  if (!header) return;
  header.removeAttribute("aria-hidden");
  replaceHeaderChildren(
    documentRef,
    header,
    ["item", "quantity", "paid", "price", "source"],
    "data-purchase-history-sort",
  );
  updateHeaderControls(header, "data-purchase-history-sort", sortState);
  if (!sortState.key) {
    restorePurchaseDefaultLayout(list, defaultLayout);
    return;
  }

  const rows = [...list.querySelectorAll(".purchase-history-row")];
  if (!rows.length) return;
  const sorted = sortRecords(rows, {
    key: sortState.key,
    direction: sortState.direction,
    locale: locale(documentRef),
    valueFor: purchaseValue,
    tieBreaker: (row) => purchaseValue(row, "item"),
  });
  const current = [...list.children];
  const alreadyFlatAndSorted = current.length === sorted.length
    && sorted.every((row, index) => row === current[index]);
  if (alreadyFlatAndSorted) return;
  list.replaceChildren(...sorted);
}

function purchaseLayoutCopy(documentRef) {
  const language = String(locale(documentRef) || "en").toLowerCase();
  if (language.startsWith("fr")) {
    return {
      addWithAi: "Ajouter avec AI",
      close: "Fermer",
    };
  }
  return {
    addWithAi: "Add with AI",
    close: "Close",
  };
}

function updatePurchaseLayoutLanguage(documentRef) {
  const copy = purchaseLayoutCopy(documentRef);
  const open = documentRef.querySelector("#purchase-batch-open [data-purchase-ai-label]");
  if (open) open.textContent = copy.addWithAi;
  const close = documentRef.querySelector("#purchase-batch-close");
  if (close) {
    close.setAttribute("aria-label", copy.close);
    close.title = copy.close;
  }
}

function installPurchaseLayout(documentRef) {
  const purchases = documentRef.querySelector('[data-grocery-panel="purchases"]');
  const entryGrid = purchases?.querySelector(".purchase-entry-grid");
  const historyPanel = purchases?.querySelector(".purchase-history-panel");
  const singleForm = purchases?.querySelector("#purchase-add-form");
  const batchForm = purchases?.querySelector("#purchase-batch-form");
  const batchTitle = purchases?.querySelector("#purchase-batch-title");
  const batchIntro = purchases?.querySelector("#purchase-batch-intro");
  if (!purchases || !entryGrid || !historyPanel || !singleForm || !batchForm || !batchTitle || !batchIntro) return;
  if (documentRef.querySelector("#purchase-batch-dialog")) {
    updatePurchaseLayoutLanguage(documentRef);
    return;
  }

  const historyHeading = historyPanel.querySelector(".purchase-section-heading");
  singleForm.classList.add("purchase-add-inline");
  historyPanel.insertBefore(singleForm, historyHeading || historyPanel.firstChild);
  entryGrid.hidden = true;

  const pageHeading = purchases.querySelector(".page-heading");
  let actions = pageHeading?.querySelector(".page-actions");
  if (pageHeading && !actions) {
    actions = documentRef.createElement("div");
    actions.className = "page-actions";
    pageHeading.append(actions);
  }
  const open = documentRef.createElement("button");
  open.id = "purchase-batch-open";
  open.className = "button primary purchase-ai-button";
  open.type = "button";
  open.innerHTML = '<span class="purchase-ai-icon" aria-hidden="true">✦</span><span data-purchase-ai-label></span>';
  actions?.append(open);

  const dialog = documentRef.createElement("dialog");
  dialog.id = "purchase-batch-dialog";
  dialog.className = "menu-item-dialog purchase-batch-dialog";
  dialog.setAttribute("aria-labelledby", "purchase-batch-title");

  const shell = documentRef.createElement("div");
  shell.className = "purchase-batch-dialog-shell";
  const heading = documentRef.createElement("div");
  heading.className = "menu-dialog-heading purchase-batch-dialog-heading";
  const headingText = documentRef.createElement("div");
  headingText.append(batchTitle, batchIntro);
  const close = documentRef.createElement("button");
  close.id = "purchase-batch-close";
  close.className = "dialog-close";
  close.type = "button";
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  heading.append(headingText, close);
  shell.append(heading, batchForm);
  dialog.append(shell);
  documentRef.body.append(dialog);

  open.addEventListener("click", () => {
    const error = documentRef.querySelector("#purchase-batch-error");
    if (error) error.textContent = "";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  batchForm.addEventListener("submit", () => {
    queueMicrotask(() => {
      const error = documentRef.querySelector("#purchase-batch-error");
      if (!error?.textContent.trim() && dialog.open) dialog.close();
    });
  });

  updatePurchaseLayoutLanguage(documentRef);
  new MutationObserver(() => updatePurchaseLayoutLanguage(documentRef))
    .observe(documentRef.documentElement, { attributes: true, attributeFilter: ["lang"] });
  documentRef.querySelector("#language-select")?.addEventListener("change", () => {
    queueMicrotask(() => updatePurchaseLayoutLanguage(documentRef));
  });
}

function installStyles(documentRef) {
  if (documentRef.querySelector("#sortable-grocery-table-styles")) return;
  const style = documentRef.createElement("style");
  style.id = "sortable-grocery-table-styles";
  style.textContent = `
    .custom-head button,.purchase-history-head button{justify-self:start;padding:0;color:inherit;background:none;border:0;cursor:pointer;font:inherit;letter-spacing:inherit;text-align:left;text-transform:inherit}
    .custom-head button:hover,.custom-head button:focus-visible,.purchase-history-head button:hover,.purchase-history-head button:focus-visible{color:var(--ink);outline:none}
    [data-grocery-panel="purchases"] .purchase-history-panel{overflow:hidden}
    [data-grocery-panel="purchases"] .purchase-history-panel>.purchase-add-inline{display:grid;grid-template-columns:minmax(180px,1.45fr) minmax(145px,1fr) 92px 92px 112px 130px minmax(140px,.9fr) auto;gap:10px;align-items:end;padding:14px;background:#f8f5ef;border-bottom:1px solid var(--line)}
    [data-grocery-panel="purchases"] .purchase-history-panel>.purchase-add-inline label{display:grid;gap:5px;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
    [data-grocery-panel="purchases"] .purchase-history-panel>.purchase-add-inline button{align-self:end;white-space:nowrap}
    [data-grocery-panel="purchases"] .purchase-history-panel>.purchase-section-heading{padding:13px 16px}
    .purchase-ai-button{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
    .purchase-ai-icon{font-size:14px;line-height:1}
    .purchase-batch-dialog{width:min(720px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 24px));padding:0;overflow:auto}
    .purchase-batch-dialog-shell{display:grid;min-width:0;background:var(--surface)}
    .purchase-batch-dialog-heading h2{margin:0;font-family:Georgia,serif;font-size:21px;font-weight:500}
    .purchase-batch-dialog-heading p{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.45}
    .purchase-batch-dialog .purchase-batch-form{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:18px}
    .purchase-batch-dialog .purchase-batch-form textarea{min-height:190px}
    @media(max-width:1180px){[data-grocery-panel="purchases"] .purchase-history-panel>.purchase-add-inline{grid-template-columns:minmax(180px,1.4fr) minmax(130px,1fr) 90px 90px 110px 130px}.purchase-add-inline #purchase-add-store,.purchase-add-inline #purchase-add-submit{grid-column:auto}.purchase-add-inline>label:nth-last-of-type(1){grid-column:1/-2}.purchase-add-inline>#purchase-add-submit{grid-column:-2/-1}}
    @media(max-width:760px){[data-grocery-panel="purchases"] .purchase-history-panel>.purchase-add-inline{grid-template-columns:1fr 1fr}.purchase-add-inline>label,.purchase-add-inline>button{grid-column:auto}.purchase-add-inline>label:first-child,.purchase-add-inline>#purchase-new-name-field,.purchase-add-inline>label:nth-last-of-type(1),.purchase-add-inline>#purchase-add-submit{grid-column:1/-1}.purchase-batch-dialog .purchase-batch-form{grid-template-columns:1fr}}
  `;
  documentRef.head.append(style);
}

export function installSortableGroceryTables(documentRef = document) {
  installStyles(documentRef);
  installPurchaseLayout(documentRef);
  const extraState = { key: null, direction: "asc" };
  const purchaseState = { ...DEFAULT_PURCHASE_SORT };
  const extraList = documentRef.querySelector("#custom-list");
  const purchaseList = documentRef.querySelector("#purchase-list");
  const purchaseHeader = documentRef.querySelector(".purchase-history-head");
  const extraDefaultOrder = new WeakMap();
  let extraDefaultSequence = 0;
  let purchaseDefaultLayout = null;

  const captureExtraDefaultOrder = () => {
    if (!extraList) return;
    [...extraList.querySelectorAll(":scope > .custom-row")].forEach((row) => {
      if (extraDefaultOrder.has(row)) return;
      extraDefaultOrder.set(row, extraDefaultSequence);
      extraDefaultSequence += 1;
    });
  };
  const capturePurchaseLayout = () => {
    if (!purchaseList) return;
    const layout = capturePurchaseDefaultLayout(purchaseList);
    if (layout) purchaseDefaultLayout = layout;
  };
  const refreshExtra = () => {
    captureExtraDefaultOrder();
    if (extraList) applyExtraNeedSort(documentRef, extraList, extraState, extraDefaultOrder);
  };
  const refreshPurchases = () => {
    capturePurchaseLayout();
    if (purchaseList) {
      applyPurchaseSort(documentRef, purchaseList, purchaseHeader, purchaseState, purchaseDefaultLayout);
    }
  };

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

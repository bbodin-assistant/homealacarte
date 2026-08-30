import { estimatedStockValue } from "../core/stock-availability.js?v=homealacarte-110";

function localDate() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function stockPayload(rows = []) {
  return rows.map(({ item_key, quantity, quantity_unit, notes, added_at, household }) => ({
    item_key,
    quantity: Number(quantity),
    quantity_unit,
    notes: notes || "",
    added_at: added_at || "",
    household: Boolean(household),
  }));
}

export function addStockQuantity(state, itemKey, quantity, quantityUnit, notes = "") {
  const option = (state.snapshot?.stock_options || [])
    .find((item) => item.item_key === itemKey);
  const amount = Number(quantity);
  if (!option || !Number.isFinite(amount) || amount <= 0) return false;
  const household = Boolean(option.household);
  const unit = household ? "unit" : quantityUnit;
  const gramsPerUnit = Number(option.grams_per_measure_unit || 1);
  const current = state.stockDraft.find((item) => item.item_key === itemKey
    && Boolean(item.household) === household);
  if (current) {
    let amountInCurrentUnit = amount;
    if (!household && unit !== current.quantity_unit) {
      amountInCurrentUnit = unit === "unit"
        ? amount * gramsPerUnit
        : amount / gramsPerUnit;
    }
    current.quantity = Number(current.quantity) + amountInCurrentUnit;
    if (notes) current.notes = notes;
    if (!current.added_at) current.added_at = localDate();
  } else {
    state.stockDraft.push({
      item_key: itemKey,
      name: option.name,
      category: option.category,
      quantity: amount,
      quantity_unit: unit,
      measure_unit: option.measure_unit,
      grams_per_measure_unit: gramsPerUnit,
      notes,
      added_at: localDate(),
      household,
    });
  }
  return true;
}

export function updateStockItem(item, field, value) {
  if (field === "quantity") {
    item.quantity = Number(value);
    return false;
  }
  if (field === "quantity_unit") {
    const nextUnit = value;
    const previousUnit = item.quantity_unit;
    const gramsPerUnit = Number(item.grams_per_measure_unit || 1);
    if (previousUnit !== nextUnit && gramsPerUnit > 0) {
      if (previousUnit === "unit" && nextUnit === "g") {
        item.quantity = Number(item.quantity) * gramsPerUnit;
      } else if (previousUnit === "g" && nextUnit === "unit") {
        item.quantity = Number(item.quantity) / gramsPerUnit;
      }
    }
    item.quantity_unit = nextUnit;
    return true;
  }
  item.notes = value;
  return false;
}

export function nextStockSort(currentKey, currentDirection, key) {
  if (currentKey !== key) return { key, direction: "asc" };
  if (currentDirection === "asc") return { key, direction: "desc" };
  return { key: null, direction: "asc" };
}

export function sortStockRows(rows = [], { key = null, direction = "asc", locale } = {}) {
  if (!key) return [...rows];
  const multiplier = direction === "desc" ? -1 : 1;
  const collator = new Intl.Collator(locale || undefined, { numeric: true, sensitivity: "base" });
  const value = (row) => {
    if (key === "quantity") return Number(row.quantity) || 0;
    if (key === "added_at") return String(row.added_at || "");
    if (key === "category") return String(row.category || "");
    return String(row.name || "");
  };
  return [...rows].sort((left, right) => {
    const leftValue = value(left);
    const rightValue = value(right);
    if (key === "added_at") {
      if (!leftValue && rightValue) return 1;
      if (leftValue && !rightValue) return -1;
    }
    const comparison = typeof leftValue === "number"
      ? leftValue - rightValue
      : collator.compare(leftValue, rightValue);
    if (comparison) return comparison * multiplier;
    return collator.compare(String(left.name || ""), String(right.name || ""));
  });
}

export function groupStockRowsByCategory(rows = [], {
  labelFor = (row) => row.category,
  locale,
} = {}) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.category || "");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: String(labelFor(row) || key),
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }
  const collator = new Intl.Collator(locale || undefined, { numeric: true, sensitivity: "base" });
  return [...groups.values()].sort((left, right) => collator.compare(left.label, right.label));
}

function sortIndicator(activeKey, direction, key) {
  if (activeKey !== key) return "";
  return direction === "desc" ? " ↓" : " ↑";
}

function installStockCategoryGroupStyles(documentRef = globalThis.document) {
  if (!documentRef || documentRef.querySelector("#stock-category-group-styles")) return;
  const style = documentRef.createElement("style");
  style.id = "stock-category-group-styles";
  style.textContent = `
    .stock-category-group{border-bottom:1px solid var(--line)}
    .stock-category-group:last-child{border-bottom:0}
    .stock-category-heading{position:sticky;top:33px;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:8px 12px;color:var(--ink);background:#e9e3d8;border-bottom:1px solid var(--line);font-size:10px;font-weight:800}
    .stock-category-heading>span:last-child{min-width:22px;padding:2px 6px;color:var(--muted);background:var(--surface);border-radius:999px;text-align:center}
    .stock-category-group .stock-row:last-child{border-bottom:0}
  `;
  documentRef.head.append(style);
}

export function createStockFeature({
  state,
  select,
  translate,
  displayCategory,
  escapeHtml,
  formatInputNumber,
  formatMoney,
  setCountBadge,
  enhanceSearchableSelect,
  openConfirmation,
  setBusy,
  send,
}) {
  installStockCategoryGroupStyles();
  let mounted = false;
  let sortKey = null;
  let sortDirection = "asc";

  function payload() {
    return stockPayload(state.stockDraft);
  }

  function updateValue() {
    const total = estimatedStockValue(
      state.stockDraft,
      state.snapshot?.ingredients,
      state.snapshot?.household_items,
    );
    select("#stock-total").textContent = formatMoney(total);
  }

  function updateAddButton() {
    const button = select("#stock-add-form")?.querySelector('button[type="submit"]');
    if (button) button.disabled = !select("#stock-add-item")?.value;
  }

  function setAddUnit() {
    const option = (state.snapshot?.stock_options || [])
      .find((item) => item.item_key === select("#stock-add-item").value);
    if (!option) {
      select("#stock-add-unit").innerHTML = "";
      updateAddButton();
      return;
    }
    select("#stock-add-unit").innerHTML = option.household
      ? `<option value="unit">${escapeHtml(option.measure_unit)}</option>`
      : `<option value="g">g</option>${option.measure_unit === "g"
        ? ""
        : `<option value="unit">${escapeHtml(option.measure_unit)}</option>`}`;
    const current = state.stockDraft.find((item) => item.item_key === option.item_key);
    select("#stock-add-unit").value = current?.quantity_unit || option.quantity_unit;
    updateAddButton();
  }

  function render() {
    updateValue();
    setCountBadge("#stock-tab-count", state.stockDraft.length);
    select("#empty-stock").disabled = state.stockDraft.length === 0;
    const query = select("#stock-search").value.trim().toLocaleLowerCase(state.language);
    const visibleItems = sortStockRows(state.stockDraft.filter((item) => !query
      || `${item.name} ${displayCategory(item.category)} ${item.notes || ""} ${item.added_at || ""}`
        .toLocaleLowerCase(state.language).includes(query)), {
      key: sortKey,
      direction: sortDirection,
      locale: state.language,
    });
    const dateFormat = new Intl.DateTimeFormat(state.language || undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const countFormat = new Intl.NumberFormat(state.language || undefined);
    const rowMarkup = (item) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(item.added_at || "")
        ? dateFormat.format(new Date(`${item.added_at}T00:00:00Z`))
        : item.added_at || "";
      return `
      <div class="stock-row" data-stock-key="${escapeHtml(item.item_key)}" data-stock-household="${item.household ? "true" : "false"}">
        <strong class="stock-row-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
        <span class="stock-category" title="${escapeHtml(displayCategory(item.category))}">${escapeHtml(displayCategory(item.category))}</span>
        ${date
          ? `<time class="stock-added-at" datetime="${escapeHtml(item.added_at)}">${escapeHtml(date)}</time>`
          : `<span class="stock-added-at missing">—</span>`}
        <input class="stock-control" data-stock-field="quantity" type="number" min="0" step="any" value="${formatInputNumber(item.quantity)}" aria-label="${escapeHtml(translate("quantity"))}">
        <select class="stock-control" data-stock-field="quantity_unit" aria-label="${escapeHtml(translate("unit"))}">
          ${item.household
            ? `<option value="unit">${escapeHtml(item.measure_unit)}</option>`
            : `<option value="g" ${item.quantity_unit === "g" ? "selected" : ""}>g</option>
              ${item.measure_unit !== "g" ? `<option value="unit" ${item.quantity_unit === "unit" ? "selected" : ""}>${escapeHtml(item.measure_unit)}</option>` : ""}`}
        </select>
        <input class="stock-control stock-notes" data-stock-field="notes" value="${escapeHtml(item.notes || "")}" aria-label="${escapeHtml(translate("notes"))}" placeholder="${escapeHtml(translate("stock_notes_placeholder"))}">
        <button class="icon-button remove-stock" type="button" title="${escapeHtml(translate("remove_stock"))}" aria-label="${escapeHtml(translate("remove_stock"))}">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
        </button>
      </div>`;
    };
    const rows = !visibleItems.length
      ? `<p class="stock-empty">${escapeHtml(translate(query ? "no_matching_items" : "empty"))}</p>`
      : sortKey
        ? visibleItems.map(rowMarkup).join("")
        : groupStockRowsByCategory(visibleItems, {
          labelFor: (item) => displayCategory(item.category) || translate("other"),
          locale: state.language,
        }).map((group) => `
          <section class="stock-category-group" data-stock-category="${escapeHtml(group.key)}">
            <h3 class="stock-category-heading">
              <span>${escapeHtml(group.label)}</span>
              <span>${escapeHtml(countFormat.format(group.rows.length))}</span>
            </h3>
            ${group.rows.map(rowMarkup).join("")}
          </section>
        `).join("");
    select("#stock-list").innerHTML = `
      <div class="stock-head">
        <button type="button" data-stock-sort="name">${escapeHtml(translate("name"))}${sortIndicator(sortKey, sortDirection, "name")}</button>
        <button type="button" data-stock-sort="category">${escapeHtml(translate("category"))}${sortIndicator(sortKey, sortDirection, "category")}</button>
        <button type="button" data-stock-sort="added_at">${escapeHtml(translate("date"))}${sortIndicator(sortKey, sortDirection, "added_at")}</button>
        <button type="button" data-stock-sort="quantity">${escapeHtml(translate("quantity"))}${sortIndicator(sortKey, sortDirection, "quantity")}</button>
        <span>${escapeHtml(translate("unit"))}</span>
        <span>${escapeHtml(translate("notes"))}</span>
        <span></span>
      </div>
      ${rows}
    `;

    select("#stock-add-item").innerHTML = `<option value=""></option>${(state.snapshot?.stock_options || [])
      .map((item) => `<option value="${escapeHtml(item.item_key)}">${escapeHtml(item.name)} · ${escapeHtml(displayCategory(item.category))}</option>`)
      .join("")}`;
    enhanceSearchableSelect(
      select("#stock-add-item"),
      translate("type_item_to_select"),
      true,
    );
    setAddUnit();
  }

  function scheduleUpdate() {
    clearTimeout(state.stockTimer);
    setBusy(true);
    state.stockTimer = setTimeout(() => {
      send("replace-stock", { rows: payload() });
    }, 350);
  }

  function addQuantity(itemKey, quantity, quantityUnit, notes = "") {
    return addStockQuantity(state, itemKey, quantity, quantityUnit, notes);
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    select("#empty-stock").addEventListener("click", () => {
      if (!state.stockDraft.length) return;
      openConfirmation({
        title: translate("empty_stock_confirm_title"),
        message: translate("empty_stock_confirm_message"),
        confirmLabel: translate("empty_stock"),
        action: () => {
          state.stockDraft = [];
          render();
          scheduleUpdate();
        },
      });
    });

    select("#stock-list").addEventListener("input", (event) => {
      const control = event.target.closest("[data-stock-field]");
      const row = event.target.closest("[data-stock-key]");
      if (!control || !row) return;
      const household = row.dataset.stockHousehold === "true";
      const target = state.stockDraft.find((item) =>
        item.item_key === row.dataset.stockKey && Boolean(item.household) === household
      );
      if (!target) return;
      const needsRender = updateStockItem(target, control.dataset.stockField, control.value);
      if (needsRender) render();
      else updateValue();
      scheduleUpdate();
    });

    select("#stock-list").addEventListener("click", (event) => {
      const sort = event.target.closest("[data-stock-sort]");
      if (sort) {
        const next = nextStockSort(sortKey, sortDirection, sort.dataset.stockSort);
        sortKey = next.key;
        sortDirection = next.direction;
        render();
        return;
      }
      const button = event.target.closest(".remove-stock");
      const row = event.target.closest("[data-stock-key]");
      if (!button || !row) return;
      const household = row.dataset.stockHousehold === "true";
      state.stockDraft = state.stockDraft.filter((item) =>
        item.item_key !== row.dataset.stockKey || Boolean(item.household) !== household
      );
      render();
      scheduleUpdate();
    });

    select("#stock-add-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const itemKey = select("#stock-add-item").value;
      const quantity = Number(select("#stock-add-quantity").value);
      if (!itemKey || !Number.isFinite(quantity) || quantity <= 0) return;
      const quantityUnit = select("#stock-add-unit").value;
      if (!addQuantity(
        itemKey,
        quantity,
        quantityUnit,
        select("#stock-add-notes").value.trim(),
      )) return;
      select("#stock-add-quantity").value = "";
      select("#stock-add-notes").value = "";
      render();
      scheduleUpdate();
    });
    select("#stock-add-item").addEventListener("change", setAddUnit);
    select("#stock-search").addEventListener("input", render);
  }

  return {
    addQuantity,
    mount,
    payload,
    render,
    scheduleUpdate,
  };
}

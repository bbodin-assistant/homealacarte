export function extraNeedsPayload(rows = [], normalizeCategory = (value) => value) {
  return rows.map((item) => ({
    key: item.key,
    name: item.name,
    category: normalizeCategory(item.category),
    quantity: Number(item.quantity),
    measure_unit: item.measure_unit,
    purchase_unit: item.purchase_unit,
    purchase_quantity: Number(item.purchase_quantity),
    estimated_price: Number(item.estimated_price),
    notes: item.notes || "",
    custom: Boolean(item.custom),
  }));
}

export function buildExtraNeed({
  option,
  name,
  category,
  quantity,
  measureUnit,
  estimatedPrice,
  notes,
  suffix,
}) {
  const amount = Number(quantity);
  const price = Number(estimatedPrice);
  if (!name || !category || !measureUnit || !Number.isFinite(amount) || amount <= 0
    || !Number.isFinite(price) || price < 0) return null;
  return {
    key: option?.key || `custom_${suffix.replaceAll("-", "_").replace(".", "_")}`,
    name,
    category,
    quantity: amount,
    measure_unit: measureUnit,
    purchase_unit: option?.purchase_unit || measureUnit,
    purchase_quantity: Number(option?.purchase_quantity || 1),
    estimated_price: price,
    notes,
    custom: !option,
  };
}

export function createExtraNeedsFeature({
  state,
  select,
  translate,
  displayCategory,
  normalizeCategory,
  escapeHtml,
  formatInputNumber,
  formatMoney,
  setCountBadge,
  enhanceSearchableSelect,
  searchableSelectInput,
  openConfirmation,
  setBusy,
  send,
}) {
  let mounted = false;

  function payload() {
    return extraNeedsPayload(state.customDraft, normalizeCategory);
  }

  function updateSelection() {
    const option = (state.snapshot?.household_options || [])
      .find((item) => item.key === select("#custom-add-existing").value);
    const form = select("#custom-add-form");
    const wasCatalogue = form.dataset.catalogMatch === "true";
    const catalogue = Boolean(option);
    form.dataset.catalogMatch = String(catalogue);
    select("#custom-add-category").readOnly = catalogue;
    select("#custom-add-measure-unit").readOnly = catalogue;
    select("#custom-add-price").readOnly = catalogue;
    if (option) {
      select("#custom-add-category").value = displayCategory(option.category);
      select("#custom-add-measure-unit").value = option.measure_unit;
      select("#custom-add-price").value = formatInputNumber(option.estimated_price);
      select("#custom-add-notes").value = option.notes || "";
    } else if (wasCatalogue || !select("#custom-add-category").value) {
      select("#custom-add-category").value = translate("other");
      select("#custom-add-measure-unit").value = translate("units");
      select("#custom-add-price").value = "0";
      select("#custom-add-notes").value = "";
    }
  }

  function render() {
    setCountBadge("#needs-tab-count", state.customDraft.length);
    select("#empty-extra-needs").disabled = state.customDraft.length === 0;
    const activeKeys = new Set(state.customDraft.map((item) => item.key));
    select("#custom-add-existing").innerHTML = `<option value=""></option>${(state.snapshot?.household_options || [])
      .filter((item) => !activeKeys.has(item.key))
      .map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.name)} · ${escapeHtml(displayCategory(item.category))}</option>`)
      .join("")}`;
    const query = select("#needs-search").value.trim().toLocaleLowerCase(state.language);
    const visibleItems = state.customDraft.filter((item) => !query
      || `${item.name} ${displayCategory(item.category)} ${item.notes || ""}`
        .toLocaleLowerCase(state.language).includes(query));
    const rows = visibleItems.map((item) => `
      <div class="custom-row" data-custom-key="${escapeHtml(item.key)}">
        <strong class="custom-row-name">
          ${escapeHtml(item.name)}
          <small class="item-origin ${item.custom ? "custom" : "catalogue"}">${escapeHtml(translate(item.custom ? "custom_item" : "catalogue_item"))}</small>
        </strong>
        <span class="custom-category">${escapeHtml(displayCategory(item.category))}</span>
        <input class="custom-quantity" data-custom-field="quantity" type="number" min="0.000000001" step="any" value="${formatInputNumber(item.quantity)}" aria-label="${escapeHtml(translate("quantity"))}">
        <span class="custom-unit">${escapeHtml(item.measure_unit)}</span>
        <span class="custom-price">${escapeHtml(formatMoney(item.estimated_price))}</span>
        <input class="custom-notes" data-custom-field="notes" value="${escapeHtml(item.notes || "")}" aria-label="${escapeHtml(translate("notes"))}" placeholder="${escapeHtml(translate("need_notes_placeholder"))}">
        <button class="icon-button remove-custom" type="button" title="${escapeHtml(translate("remove_custom_grocery"))}" aria-label="${escapeHtml(translate("remove_custom_grocery"))}">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
        </button>
      </div>
    `).join("") || `<p class="stock-empty">${escapeHtml(translate(query ? "no_matching_items" : "empty"))}</p>`;
    select("#custom-list").innerHTML = `
      <div class="custom-head">
        <span>${translate("name")}</span>
        <span>${translate("category")}</span>
        <span>${translate("quantity")}</span>
        <span>${translate("unit")}</span>
        <span>${translate("unit_price")}</span>
        <span>${translate("notes")}</span>
        <span></span>
      </div>
      ${rows}
    `;
    enhanceSearchableSelect(
      select("#custom-add-existing"),
      translate("type_or_create_item"),
      true,
      true,
    );
    updateSelection();
  }

  function scheduleUpdate() {
    clearTimeout(state.customTimer);
    setBusy(true);
    state.customTimer = setTimeout(() => {
      send("replace-custom-grocery", { rows: payload() });
    }, 350);
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    select("#empty-extra-needs").addEventListener("click", () => {
      if (!state.customDraft.length) return;
      openConfirmation({
        title: translate("empty_extra_needs_confirm_title"),
        message: translate("empty_extra_needs_confirm_message"),
        confirmLabel: translate("empty_extra_needs"),
        action: () => {
          state.customDraft = [];
          render();
          scheduleUpdate();
        },
      });
    });

    select("#custom-list").addEventListener("input", (event) => {
      const control = event.target.closest("[data-custom-field]");
      const row = event.target.closest("[data-custom-key]");
      if (!control || !row) return;
      const target = state.customDraft.find((item) => item.key === row.dataset.customKey);
      if (!target) return;
      if (control.dataset.customField === "quantity") target.quantity = Number(control.value);
      else target.notes = control.value;
      scheduleUpdate();
    });

    select("#custom-list").addEventListener("click", (event) => {
      const button = event.target.closest(".remove-custom");
      const row = event.target.closest("[data-custom-key]");
      if (!button || !row) return;
      state.customDraft = state.customDraft.filter((item) => item.key !== row.dataset.customKey);
      render();
      scheduleUpdate();
    });

    select("#custom-add-existing").addEventListener("change", updateSelection);
    select("#needs-search").addEventListener("input", render);
    select("#custom-add-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const option = (state.snapshot?.household_options || [])
        .find((item) => item.key === select("#custom-add-existing").value);
      const name = option?.name
        || searchableSelectInput(select("#custom-add-existing"))?.value.trim()
        || "";
      const item = buildExtraNeed({
        option,
        name,
        category: normalizeCategory(select("#custom-add-category").value.trim()),
        quantity: select("#custom-add-quantity").value,
        measureUnit: select("#custom-add-measure-unit").value.trim(),
        estimatedPrice: select("#custom-add-price").value,
        notes: select("#custom-add-notes").value.trim(),
        suffix: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      });
      if (!item || option && state.customDraft.some((row) => row.key === option.key)) return;
      state.customDraft.push(item);
      select("#custom-add-quantity").value = "1";
      select("#custom-add-notes").value = "";
      select("#custom-add-form").dataset.catalogMatch = "true";
      render();
      scheduleUpdate();
    });
  }

  return {
    mount,
    payload,
    render,
    scheduleUpdate,
    updateSelection,
  };
}

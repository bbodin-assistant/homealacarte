import {
  countryFlag,
  displayLocalizedName,
  localizedFormValues,
  localizedNameValues,
  normalizeOriginCountry,
  renderLocalizedInputs,
  validOriginCountry,
} from "../core/data-localization.js?v=homealacarte-80";

export function createDishEditorFeature({
  state,
  select,
  selectAll,
  documentRef,
  translate,
  locales,
  escapeHtml,
  formatInputNumber,
  enhanceSearchableSelect,
  setSearchableSelectHidden,
  dishNutriScoreDetail,
  send,
}) {
function newDishKey(name) {
  const base = `dish_${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "recipe"}`;
  const existing = new Set(state.snapshot.item_options.map((item) => item.key));
  let key = base;
  let suffix = 2;
  while (existing.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

function customIngredientKey(name, reserved = new Set()) {
  const base = `item_${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "custom"}`;
  const existing = new Set([
    ...state.snapshot.item_options.map((item) => item.key),
    ...reserved,
  ]);
  let key = base;
  let suffix = 2;
  while (existing.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

function ingredientOptions(selectedKey = "") {
  return state.snapshot.item_options
    .filter((item) => item.kind === "ingredient")
    .map((item) => `
      <option value="${escapeHtml(item.key)}" ${item.key === selectedKey ? "selected" : ""}>
        ${escapeHtml(item.name)}
      </option>
    `).join("");
}

function dishNameValues() {
  return localizedFormValues(select("#new-dish-name-fields"));
}

function focusCurrentDishName() {
  const inputs = [...select("#new-dish-name-fields").querySelectorAll("[data-locale]")];
  const language = String(state.language || "").toLowerCase();
  const primary = language.split("-")[0];
  const input = inputs.find((candidate) => candidate.dataset.locale.toLowerCase() === language)
    || inputs.find((candidate) => candidate.dataset.locale.toLowerCase().split("-")[0] === primary)
    || inputs[0];
  input?.focus();
}

function updateOriginCountryPreview() {
  const input = select("#new-dish-origin-country");
  const preview = select("#new-dish-origin-flag");
  const code = input.value.trim();
  preview.textContent = validOriginCountry(code) ? countryFlag(code) : "";
  input.setCustomValidity(validOriginCountry(code) ? "" : "ISO 3166-1 alpha-2");
}

function setNewDishComponentUnit(row) {
  if (row.dataset.componentMode === "custom") return;
  const item = state.snapshot.item_options.find(
    (option) => option.key === row.querySelector("[data-component-item]").value,
  );
  const select = row.querySelector("[data-component-unit]");
  const current = select.value;
  const measureUnit = item?.measure_unit || "unit";
  select.innerHTML = `<option value="g">g</option>${measureUnit === "g"
    ? ""
    : `<option value="${escapeHtml(measureUnit)}">${escapeHtml(measureUnit)}</option>`}`;
  select.value = [...select.options].some((option) => option.value === current)
    ? current
    : measureUnit;
}

function setDishComponentMode(row, mode) {
  const custom = mode === "custom";
  row.dataset.componentMode = custom ? "custom" : "catalogue";
  row.querySelector("[data-component-custom-toggle]").checked = custom;
  setSearchableSelectHidden(row.querySelector("[data-component-item]"), custom);
  row.querySelector("[data-component-custom-name]").hidden = !custom;
  row.querySelector("[data-component-unit]").hidden = custom;
  row.querySelector("[data-component-custom-unit]").hidden = !custom;
  if (!custom) setNewDishComponentUnit(row);
  updateDishFormSaveState();
}

function dishSourceNoteMarkup(note = "") {
  return `
    <div class="dish-source-note-row">
      <textarea rows="3" data-dish-source-note aria-label="${escapeHtml(translate("recipe_note"))}">${escapeHtml(note)}</textarea>
      <button class="icon-button remove-dish-source-note" type="button" aria-label="${escapeHtml(translate("remove_recipe_note"))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
      </button>
    </div>`;
}

function dishSourceNotesPayload() {
  return selectAll("#new-dish-notes-list [data-dish-source-note]")
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function renderDishSourceNotes(notes = []) {
  const rows = notes.length ? notes : [""];
  select("#new-dish-notes-list").innerHTML = rows.map(dishSourceNoteMarkup).join("");
}

function addDishSourceNote() {
  select("#new-dish-notes-list").insertAdjacentHTML("beforeend", dishSourceNoteMarkup());
  select("#new-dish-notes-list .dish-source-note-row:last-child textarea").focus();
}

function addNewDishComponent(component = null, servings = 1) {
  const first = state.snapshot.item_options.find((item) => item.kind === "ingredient");
  if (!first) return;
  const selectedKey = component?.key || first.key;
  const quantity = component
    ? Number(component.quantity) * Number(servings)
    : 1;
  const row = documentRef.createElement("div");
  row.className = "new-dish-component-row";
  row.dataset.componentMode = "catalogue";
  row.innerHTML = `
    <div class="dish-component-item-cell">
      <select data-component-item required aria-label="${escapeHtml(translate("ingredient"))}">${ingredientOptions(selectedKey)}</select>
      <input data-component-custom-name aria-label="${escapeHtml(translate("custom_ingredient_name"))}" placeholder="${escapeHtml(translate("custom_ingredient_name"))}" autocomplete="off" hidden>
    </div>
    <label class="dish-component-custom-toggle">
      <input data-component-custom-toggle type="checkbox">
      <span>${escapeHtml(translate("custom_item"))}</span>
    </label>
    <input data-component-quantity type="number" min="0.000000001" step="any" value="${formatInputNumber(quantity)}" required aria-label="${escapeHtml(translate("quantity"))}">
    <div class="dish-component-unit-cell">
      <select data-component-unit required></select>
      <input data-component-custom-unit placeholder="${escapeHtml(translate("unit_name"))}" aria-label="${escapeHtml(translate("unit_name"))}" autocomplete="off" hidden>
    </div>
    <button class="icon-button remove-dish-component" type="button" title="${escapeHtml(translate("remove_ingredient"))}" aria-label="${escapeHtml(translate("remove_ingredient"))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
    </button>
    <label class="dish-component-source-quantity">
      <span>${escapeHtml(translate("component_source_quantity"))}</span>
      <input data-component-source-quantity value="${escapeHtml(component?.source_quantity || "")}" placeholder="${escapeHtml(translate("component_source_quantity_placeholder"))}">
    </label>
  `;
  select("#new-dish-component-list").append(row);
  enhanceSearchableSelect(
    row.querySelector("[data-component-item]"),
    translate("search_items"),
  );
  setNewDishComponentUnit(row);
  if (component?.quantity_unit) {
    const unit = row.querySelector("[data-component-unit]");
    if ([...unit.options].some((option) => option.value === component.quantity_unit)) {
      unit.value = component.quantity_unit;
    }
  }
  updateDishFormSaveState();
}

function dishFormSignature() {
  return JSON.stringify({
    name_i18n: dishNameValues(),
    origin_country: normalizeOriginCountry(select("#new-dish-origin-country").value),
    servings: Number(select("#new-dish-servings").value),
    recipe_url: select("#new-dish-url").value.trim(),
    source: select("#new-dish-source").value.trim(),
    nutri_score: select("#new-dish-nutri-score").value,
    auto_menu_main: select("#new-dish-auto-menu-main").checked,
    grocery_exempt: select("#new-dish-grocery-exempt").checked,
    source_notes: dishSourceNotesPayload(),
    components: selectAll("#new-dish-component-list .new-dish-component-row").map((row) => ({
      mode: row.dataset.componentMode,
      item_key: row.querySelector("[data-component-item]").value,
      custom_name: row.querySelector("[data-component-custom-name]").value.trim(),
      quantity: Number(row.querySelector("[data-component-quantity]").value),
      quantity_unit: row.querySelector("[data-component-unit]").value,
      custom_unit: row.querySelector("[data-component-custom-unit]").value.trim(),
      source_quantity: row.querySelector("[data-component-source-quantity]").value.trim(),
    })),
  });
}

function dishFormIsValid() {
  const servings = Number(select("#new-dish-servings").value);
  const rows = selectAll("#new-dish-component-list .new-dish-component-row");
  return Boolean(displayLocalizedName(dishNameValues(), state.language, locales))
    && validOriginCountry(select("#new-dish-origin-country").value)
    && Number.isFinite(servings)
    && servings > 0
    && rows.length > 0
    && rows.every((row) => {
      const quantity = Number(row.querySelector("[data-component-quantity]").value);
      const custom = row.dataset.componentMode === "custom";
      return Boolean(custom
        ? row.querySelector("[data-component-custom-name]").value.trim()
          && row.querySelector("[data-component-custom-unit]").value.trim()
        : row.querySelector("[data-component-item]").value)
        && Number.isFinite(quantity)
        && quantity > 0
        && Boolean(custom || row.querySelector("[data-component-unit]").value);
    });
}

function updateDishFormSaveState() {
  const button = select("#new-dish-save");
  if (!button) return;
  updateOriginCountryPreview();
  const unchanged = Boolean(state.dishFormKey)
    && dishFormSignature() === state.dishFormOriginal;
  button.disabled = !dishFormIsValid() || unchanged;
}

function openDishForm(dish = null) {
  select("#new-dish-form").reset();
  state.dishFormKey = dish?.key || null;
  select("#new-dish-title").textContent = translate(dish ? "edit_dish" : "new_dish");
  select("#new-dish-intro").textContent = translate(
    dish ? "edit_dish_intro" : "new_dish_intro",
  );
  select("#new-dish-save").textContent = translate(dish ? "save_changes" : "save_dish");
  const names = localizedNameValues(
    state.serializedData,
    "dishes",
    dish?.key,
    dish?.name || "",
    locales,
  );
  renderLocalizedInputs(select("#new-dish-name-fields"), locales, names, state.language);
  select("#new-dish-origin-country").value = dish?.origin_country || "";
  select("#new-dish-servings").value = formatInputNumber(dish?.servings || 4);
  select("#new-dish-url").value = dish?.recipe_url || "";
  select("#new-dish-source").value = dish?.source || "";
  select("#new-dish-nutri-score").value = dish?.nutri_score_manual || "";
  select("#new-dish-auto-menu-main").checked = dish?.auto_menu_main !== false;
  select("#new-dish-grocery-exempt").checked = dish?.grocery_exempt === true;
  select("#new-dish-nutri-status").textContent = dish
    ? dishNutriScoreDetail(dish)
    : translate("nutri_score_field_help");
  renderDishSourceNotes(dish?.source_notes || []);
  select("#new-dish-error").textContent = "";
  select("#new-dish-component-list").innerHTML = "";
  if (dish?.components?.length) {
    dish.components.forEach((component) => addNewDishComponent(component, dish.servings));
  } else {
    addNewDishComponent();
  }
  updateOriginCountryPreview();
  state.dishFormOriginal = dishFormSignature();
  updateDishFormSaveState();
  const dialog = select("#new-dish-dialog");
  if (!dialog.open) dialog.showModal();
  focusCurrentDishName();
}

function openNewDishDialog() {
  openDishForm();
}

function closeNewDishDialog() {
  state.dishFormKey = null;
  state.dishFormOriginal = "";
  select("#new-dish-dialog").close();
}

  function mount() {
select("#add-dish").addEventListener("click", openNewDishDialog);
select("#new-dish-close").addEventListener("click", closeNewDishDialog);
select("#new-dish-cancel").addEventListener("click", closeNewDishDialog);
select("#new-dish-add-component").addEventListener("click", () => addNewDishComponent());
select("#new-dish-add-note").addEventListener("click", () => {
  addDishSourceNote();
  updateDishFormSaveState();
});
select("#new-dish-form").addEventListener("input", updateDishFormSaveState);
select("#new-dish-form").addEventListener("change", updateDishFormSaveState);
select("#new-dish-component-list").addEventListener("change", (event) => {
  const row = event.target.closest(".new-dish-component-row");
  if (row && event.target.matches("[data-component-item]")) setNewDishComponentUnit(row);
  if (row && event.target.matches("[data-component-custom-toggle]")) {
    setDishComponentMode(row, event.target.checked ? "custom" : "catalogue");
  }
  updateDishFormSaveState();
});
select("#new-dish-component-list").addEventListener("click", (event) => {
  const remove = event.target.closest(".remove-dish-component");
  if (!remove) return;
  remove.closest(".new-dish-component-row").remove();
  updateDishFormSaveState();
});
select("#new-dish-notes-list").addEventListener("click", (event) => {
  const remove = event.target.closest(".remove-dish-source-note");
  if (!remove) return;
  remove.closest(".dish-source-note-row").remove();
  if (!select("#new-dish-notes-list .dish-source-note-row")) renderDishSourceNotes();
  updateDishFormSaveState();
});
select("#new-dish-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const nameI18n = dishNameValues();
  const name = displayLocalizedName(nameI18n, state.language, locales);
  const servings = Number(select("#new-dish-servings").value);
  if (!dishFormIsValid()) {
    select("#new-dish-error").textContent = translate("new_dish_invalid");
    return;
  }
  const reservedKeys = new Set();
  const customIngredients = [];
  const components = selectAll("#new-dish-component-list .new-dish-component-row").map((row) => {
    const quantity = Number(row.querySelector("[data-component-quantity]").value);
    const custom = row.dataset.componentMode === "custom";
    const customName = row.querySelector("[data-component-custom-name]").value.trim();
    const quantityUnit = custom
      ? row.querySelector("[data-component-custom-unit]").value.trim()
      : row.querySelector("[data-component-unit]").value;
    const itemKey = custom
      ? customIngredientKey(customName, reservedKeys)
      : row.querySelector("[data-component-item]").value;
    if (custom) {
      reservedKeys.add(itemKey);
      customIngredients.push({
        key: itemKey,
        name: customName,
        custom: true,
        incomplete: true,
        grams: 100,
        kcal: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugars_g: null,
        saturated_fat_g: null,
        salt_g: null,
        fruit_vegetable_legume_percent: null,
        category: "",
        source: "",
        url: "",
        price: 0,
        price_basis: "kg",
        price_source: "",
        price_checked_at: "",
        measure_unit: quantityUnit,
        grams_per_measure_unit: 1,
        purchase_unit: quantityUnit,
        purchase_quantity: 1,
        purchase_quantity_unit: quantityUnit,
      });
    }
    return {
      item_key: itemKey,
      quantity,
      quantity_unit: quantityUnit,
      source_quantity: row.querySelector("[data-component-source-quantity]").value.trim()
        || `${formatInputNumber(quantity)} ${quantityUnit}`,
    };
  });
  if (!name || !Number.isFinite(servings) || servings <= 0
    || !components.length
    || components.some((component) => !Number.isFinite(component.quantity) || component.quantity <= 0)) {
    select("#new-dish-error").textContent = translate("new_dish_invalid");
    return;
  }
  const dishKey = state.dishFormKey || newDishKey(name);
  send("save-dish", {
    dish: {
      key: dishKey,
      name,
      name_i18n: nameI18n,
      origin_country: normalizeOriginCountry(select("#new-dish-origin-country").value),
      servings,
      recipe_url: select("#new-dish-url").value.trim(),
      source: select("#new-dish-source").value.trim(),
      nutri_score: select("#new-dish-nutri-score").value,
      auto_menu_main: select("#new-dish-auto-menu-main").checked,
      grocery_exempt: select("#new-dish-grocery-exempt").checked,
      source_notes: dishSourceNotesPayload(),
      components,
    },
    customIngredients,
    replacing: Boolean(state.dishFormKey),
  });
  closeNewDishDialog();
});
  }

  return {
    close: closeNewDishDialog,
    customIngredientKey,
    mount,
    open: openDishForm,
  };
}

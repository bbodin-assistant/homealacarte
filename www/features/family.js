export function foodRuleAcceptsItem(kind, itemKind) {
  if (kind === "allergy") return itemKind !== "dish";
  if (kind === "favorite") return itemKind === "dish";
  return true;
}

export const ALLERGEN_CODES = [
  "gluten", "wheat", "rye", "barley", "oat", "spelt", "crustacean", "mollusc", "egg", "fish",
  "peanut", "soy", "milk", "tree_nut", "almond", "hazelnut", "walnut", "cashew_nut",
  "pecan", "brazil_nut", "pistachio", "macadamia", "celery", "mustard", "lupin", "sesame", "sulfite",
];

export function createFamilyFeature({
  state,
  select,
  selectAll,
  translate,
  translatedTemplate,
  escapeHtml,
  formatInputNumber,
  formatNumber,
  openConfirmation,
  send,
}) {
function familyMemberIcon(kind) {
  if (kind === "child") {
    return `<svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="36" r="20"/>
      <path d="M31 105V78c0-18 13-29 29-29s29 11 29 29v27M45 67l15 12 15-12M43 105V87M77 105V87"/>
      <path d="M48 33c4-8 18-10 25-2"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="29" r="22"/>
    <path d="M24 108V78c0-19 16-33 36-33s36 14 36 33v30M40 108V76M80 108V76"/>
    <path d="M48 48l12 20 12-20"/>
  </svg>`;
}

function preferenceText(key) {
  const french = String(state.language || "").toLowerCase().startsWith("fr");
  const labels = french ? {
    allergy: "Allergie",
    favorite: "Plat favori",
    forbidden: "Interdit / ne jamais proposer",
    allergens: "Allergènes",
    sesame: "Sésame",
    peanut: "Arachides / cacahuètes",
    tree_nut: "Fruits à coque",
    gluten: "Gluten",
    wheat: "Blé",
    rye: "Seigle",
    barley: "Orge",
    oat: "Avoine",
    spelt: "Épeautre",
    crustacean: "Crustacés",
    mollusc: "Mollusques",
    egg: "Œufs",
    fish: "Poisson",
    soy: "Soja",
    milk: "Lait",
    almond: "Amandes",
    hazelnut: "Noisettes",
    walnut: "Noix",
    cashew_nut: "Noix de cajou",
    pecan: "Noix de pécan",
    brazil_nut: "Noix du Brésil",
    pistachio: "Pistaches",
    macadamia: "Noix de macadamia",
    celery: "Céleri",
    mustard: "Moutarde",
    lupin: "Lupin",
    sulfite: "Sulfites",
  } : {
    allergy: "Allergy",
    favorite: "Favorite dish",
    forbidden: "Forbidden / never propose",
    allergens: "Allergens",
    sesame: "Sesame",
    peanut: "Peanuts",
    tree_nut: "Tree nuts",
    gluten: "Gluten",
    wheat: "Wheat",
    rye: "Rye",
    barley: "Barley",
    oat: "Oats",
    spelt: "Spelt",
    crustacean: "Crustaceans",
    mollusc: "Molluscs",
    egg: "Eggs",
    fish: "Fish",
    soy: "Soy",
    milk: "Milk",
    almond: "Almonds",
    hazelnut: "Hazelnuts",
    walnut: "Walnuts",
    cashew_nut: "Cashews",
    pecan: "Pecans",
    brazil_nut: "Brazil nuts",
    pistachio: "Pistachios",
    macadamia: "Macadamia nuts",
    celery: "Celery",
    mustard: "Mustard",
    lupin: "Lupin",
    sulfite: "Sulfites",
  };
  return labels[key] || key;
}

function foodRuleAllergenOptions(selectedAllergens = []) {
  const selected = new Set(selectedAllergens);
  return ALLERGEN_CODES.map((code) => `
    <label class="food-rule-allergen">
      <input type="checkbox" value="${code}" ${selected.has(code) ? "checked" : ""}>
      <span>${escapeHtml(preferenceText(code))}</span>
    </label>`).join("");
}

function renderFamily() {
  const members = state.familyDraft;
  const cards = members.map((person) => {
    const kind = person.kind === "child" ? "child" : "adult";
    const target = person.kcal_target == null
      ? translate("no_calorie_target")
      : `${formatNumber(person.kcal_target, 0)} kcal`;
    return `<article
      class="family-card ${kind}"
      data-family-edit="${escapeHtml(encodeURIComponent(person.key))}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(`${translate("edit_family_member")}: ${person.name}`)}"
    >
      <button
        class="family-remove"
        type="button"
        data-family-remove="${escapeHtml(encodeURIComponent(person.key))}"
        title="${escapeHtml(translate("remove_family_member"))}"
        aria-label="${escapeHtml(`${translate("remove_family_member")}: ${person.name}`)}"
        ${members.length === 1 ? "disabled" : ""}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
      </button>
      <div class="family-avatar">${familyMemberIcon(kind)}</div>
      <span class="family-kind">${escapeHtml(translate(kind))}</span>
      <h2>${escapeHtml(person.name)}</h2>
      ${person.description ? `<p class="family-description">${escapeHtml(person.description)}</p>` : ""}
      ${(person.food_rules || []).length ? `<p class="family-rules-summary">${escapeHtml(translatedTemplate("structured_rules_count", { count: person.food_rules.length }))}</p>` : ""}
      <p class="family-target"><strong>${escapeHtml(target)}</strong><span>${escapeHtml(translate("daily_target"))}</span></p>
    </article>`;
  }).join("");
  select("#family-grid").innerHTML = `${cards}
    <button id="family-add-card" class="family-add-card" type="button">
      <span aria-hidden="true">+</span>
      <strong>${escapeHtml(translate("add_family_member"))}</strong>
      <small>${escapeHtml(translate("adult_or_child"))}</small>
    </button>`;
}

function familyMemberKey(name) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "member";
  const existing = new Set(state.familyDraft.map((person) => person.key));
  let key = base;
  let suffix = 2;
  while (existing.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

const FOOD_RULE_MEAL_CODES = [
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack_1",
  "afternoon_snack_2",
  "dinner",
  "anytime",
];

const FOOD_RULE_DAY_CODES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function foodRuleMealOptions(selectedMeal, includeAny = true) {
  const any = includeAny
    ? `<option value="any" ${selectedMeal === "any" ? "selected" : ""}>${escapeHtml(translate("any_meal"))}</option>`
    : "";
  return any + FOOD_RULE_MEAL_CODES.map((code, index) => `
    <option value="${code}" ${selectedMeal === code ? "selected" : ""}>
      ${escapeHtml(state.snapshot.meals[index] || code)}
    </option>`).join("");
}

function foodRuleItemOptions(selectedKeys = [], ruleKind = "routine") {
  const selected = new Set(selectedKeys);
  return state.snapshot.item_options.map((item) => `
    <label class="food-rule-choice" data-food-rule-item-kind="${escapeHtml(item.kind)}">
      <input type="checkbox" value="${escapeHtml(item.key)}" data-food-rule-item-kind="${escapeHtml(item.kind)}" ${selected.has(item.key) ? "checked" : ""}>
      <span>${escapeHtml(item.name)}</span>
    </label>`).join("");
}

function foodRuleSelectedItems(selectedKeys = []) {
  const selected = new Set(selectedKeys);
  return state.snapshot.item_options
    .filter((item) => selected.has(item.key))
    .map((item) => `
      <button class="food-rule-selected-item" type="button" data-food-rule-selected-item="${encodeURIComponent(item.key)}" aria-label="${escapeHtml(`${translate("delete")}: ${item.name}`)}">
        <span class="food-rule-selected-check" aria-hidden="true">✓</span>
        <span>${escapeHtml(item.name)}</span>
        <span class="food-rule-selected-remove" aria-hidden="true">×</span>
      </button>`).join("");
}

function foodRuleDayOptions(selectedDays = []) {
  const selected = new Set(selectedDays.length ? selectedDays : FOOD_RULE_DAY_CODES);
  return FOOD_RULE_DAY_CODES.map((code, index) => `
    <label class="food-rule-day">
      <input type="checkbox" value="${code}" ${selected.has(code) ? "checked" : ""}>
      <span>${escapeHtml(state.snapshot.days[index] || code)}</span>
    </label>`).join("");
}

function foodRuleMarkup(rule = {}) {
  const kind = ["routine", "never", "allergy", "favorite"].includes(rule.kind)
    ? rule.kind
    : "routine";
  const meal = rule.meal || (kind === "routine" ? "breakfast" : "any");
  const quantity = Number.isFinite(Number(rule.quantity)) ? Number(rule.quantity) : 1;
  const unit = ["portion", "g", "unit"].includes(rule.quantity_unit)
    ? rule.quantity_unit
    : "portion";
  return `<div class="family-food-rule ${kind === "routine" ? "" : "never-rule"}" data-food-rule>
    <label><span>${escapeHtml(translate("food_rule_type"))}</span>
      <select data-food-rule-kind>
        <option value="routine" ${kind === "routine" ? "selected" : ""}>${escapeHtml(translate("food_rule_routine"))}</option>
        <option value="never" ${kind === "never" ? "selected" : ""}>${escapeHtml(preferenceText("forbidden"))}</option>
        <option value="allergy" ${kind === "allergy" ? "selected" : ""}>${escapeHtml(preferenceText("allergy"))}</option>
        <option value="favorite" ${kind === "favorite" ? "selected" : ""}>${escapeHtml(preferenceText("favorite"))}</option>
      </select>
    </label>
    <label><span>${escapeHtml(translate("food_rule_meal"))}</span>
      <select data-food-rule-meal>${foodRuleMealOptions(meal)}</select>
    </label>
    <div class="food-rule-items-field"><span>${escapeHtml(translate("food_rule_choices"))}</span>
      <div class="food-rule-item-picker" data-food-rule-item-picker>
        <div class="food-rule-item-selection">
          <div class="food-rule-selected-items" data-food-rule-selected-items>${foodRuleSelectedItems(rule.item_keys)}</div>
          <input type="search" data-food-rule-item-search placeholder="${escapeHtml(translate("search_items"))}" aria-label="${escapeHtml(translate("search_items"))}" autocomplete="off" aria-expanded="false">
        </div>
        <div class="food-rule-item-results" data-food-rule-items role="group" hidden>
          ${foodRuleItemOptions(rule.item_keys, kind)}
          <p class="food-rule-items-empty" data-food-rule-items-empty hidden>${escapeHtml(translate("no_matching_items"))}</p>
        </div>
      </div>
    </div>
    <div class="food-rule-allergens-field" data-allergen-field>
      <span>${escapeHtml(preferenceText("allergens"))}</span>
      <div data-food-rule-allergens role="group">${foodRuleAllergenOptions(rule.allergens)}</div>
    </div>
    <label data-routine-field><span>${escapeHtml(translate("food_rule_quantity"))}</span>
      <input data-food-rule-quantity type="number" min="0.000000001" step="any" value="${escapeHtml(formatInputNumber(quantity))}">
    </label>
    <label data-routine-field><span>${escapeHtml(translate("food_rule_unit"))}</span>
      <select data-food-rule-unit>
        <option value="portion" ${unit === "portion" ? "selected" : ""}>portion</option>
        <option value="g" ${unit === "g" ? "selected" : ""}>g</option>
        <option value="unit" ${unit === "unit" ? "selected" : ""}>unit</option>
      </select>
    </label>
    <button class="icon-button remove-food-rule" type="button" aria-label="${escapeHtml(translate("delete"))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
    </button>
    <div class="food-rule-days-field" data-routine-field>
      <span>${escapeHtml(translate("food_rule_days"))}</span>
      <small>${escapeHtml(translate("food_rule_days_hint"))}</small>
      <div data-food-rule-days role="group">${foodRuleDayOptions(rule.days)}</div>
    </div>
  </div>`;
}

function renderFoodRuleSelectedItems(row) {
  const selectedKeys = [...row.querySelectorAll("[data-food-rule-items] input:checked")]
    .map((input) => input.value);
  row.querySelector("[data-food-rule-selected-items]").innerHTML = foodRuleSelectedItems(selectedKeys);
}

function setFoodRuleMode(row, pruneInvalid = false) {
  const kind = row.querySelector("[data-food-rule-kind]").value;
  const routine = kind === "routine";
  const globalPreference = kind === "allergy" || kind === "favorite";
  row.classList.toggle("never-rule", !routine);
  const meal = row.querySelector("[data-food-rule-meal]");
  meal.disabled = globalPreference;
  meal.querySelector('option[value="any"]').disabled = routine;
  if (routine && meal.value === "any") meal.value = "breakfast";
  if (globalPreference) meal.value = "any";
  row.querySelectorAll("[data-routine-field]").forEach((field) => {
    field.hidden = !routine;
  });
  row.querySelector("[data-allergen-field]").hidden = kind !== "allergy";
  if (pruneInvalid) {
    row.querySelectorAll("[data-food-rule-items] input:checked").forEach((input) => {
      if (!foodRuleAcceptsItem(kind, input.dataset.foodRuleItemKind)) input.checked = false;
    });
    renderFoodRuleSelectedItems(row);
  }
}

function renderFamilyFoodRules(rules = []) {
  const list = select("#family-food-rules-list");
  list.innerHTML = rules.length
    ? rules.map(foodRuleMarkup).join("")
    : `<p class="family-food-rules-empty">${escapeHtml(translate("no_food_rules"))}</p>`;
  selectAll("#family-food-rules-list [data-food-rule]").forEach((row) => setFoodRuleMode(row));
}

function filterFoodRuleItems(search) {
  const row = search.closest("[data-food-rule]");
  const results = row.querySelector("[data-food-rule-items]");
  const kind = row.querySelector("[data-food-rule-kind]").value;
  const query = search.value.trim().toLocaleLowerCase(state.language);
  let visibleChoices = 0;
  row.querySelectorAll(".food-rule-choice").forEach((choice) => {
    const matchesKind = foodRuleAcceptsItem(kind, choice.dataset.foodRuleItemKind);
    const matches = Boolean(query)
      && matchesKind
      && choice.textContent.toLocaleLowerCase(state.language).includes(query);
    choice.hidden = !matches;
    if (matches) visibleChoices += 1;
  });
  results.hidden = !query;
  row.querySelector("[data-food-rule-items-empty]").hidden = !query || visibleChoices > 0;
  search.setAttribute("aria-expanded", String(Boolean(query)));
}

function closeFoodRuleItems(row) {
  row.querySelector("[data-food-rule-items]").hidden = true;
  row.querySelector("[data-food-rule-item-search]").setAttribute("aria-expanded", "false");
}

function familyFoodRulesPayload() {
  return selectAll("#family-food-rules-list [data-food-rule]").map((row) => {
    const kind = row.querySelector("[data-food-rule-kind]").value;
    const selectedDays = [...row.querySelectorAll("[data-food-rule-days] input:checked")]
      .map((input) => input.value);
    return {
      kind,
      meal: kind === "allergy" || kind === "favorite"
        ? "any"
        : row.querySelector("[data-food-rule-meal]").value,
      item_keys: [...row.querySelectorAll("[data-food-rule-items] input:checked")]
        .map((input) => input.value),
      allergens: kind === "allergy"
        ? [...row.querySelectorAll("[data-food-rule-allergens] input:checked")]
          .map((input) => input.value)
        : [],
      days: kind !== "routine" || selectedDays.length === FOOD_RULE_DAY_CODES.length
        ? []
        : (selectedDays.length ? selectedDays : ["__no_day_selected__"]),
      quantity: kind === "routine"
        ? Number(row.querySelector("[data-food-rule-quantity]").value)
        : 1,
      quantity_unit: kind === "routine"
        ? row.querySelector("[data-food-rule-unit]").value
        : "portion",
    };
  });
}

function familyFoodRulesAreValid(rules = familyFoodRulesPayload()) {
  const itemKinds = new Map(state.snapshot.item_options.map((item) => [item.key, item.kind]));
  return rules.every((rule) => ["routine", "never", "allergy", "favorite"].includes(rule.kind)
    && (rule.item_keys.length > 0 || (rule.kind === "allergy" && rule.allergens.length > 0))
    && rule.item_keys.every((key) => foodRuleAcceptsItem(rule.kind, itemKinds.get(key)))
    && rule.allergens.every((allergen) => ALLERGEN_CODES.includes(allergen))
    && (rule.kind !== "routine" || (
      rule.meal !== "any"
      && rule.days.every((day) => FOOD_RULE_DAY_CODES.includes(day))
      && Number.isFinite(rule.quantity)
      && rule.quantity > 0
    )));
}

function familyFormSignature() {
  return JSON.stringify({
    name: select("#family-member-name").value.trim(),
    kind: select("#family-form input[name='family-kind']:checked")?.value || "adult",
    kcal_target: select("#family-member-kcal").value === ""
      ? null
      : Number(select("#family-member-kcal").value),
    description: select("#family-member-description").value.trim(),
    food_rules: familyFoodRulesPayload(),
  });
}

function updateFamilyFormSaveState() {
  const name = select("#family-member-name").value.trim();
  const kcalValue = select("#family-member-kcal").value;
  const kcalTarget = kcalValue === "" ? null : Number(kcalValue);
  const valid = Boolean(name)
    && (kcalTarget == null || (Number.isFinite(kcalTarget) && kcalTarget > 0))
    && familyFoodRulesAreValid();
  const unchanged = Boolean(state.familyEditKey)
    && familyFormSignature() === state.familyOriginal;
  select("#family-dialog-submit").disabled = !valid || unchanged;
}

function openFamilyDialog(person = null) {
  select("#family-form").reset();
  state.familyEditKey = person?.key || null;
  const editing = Boolean(person);
  const eyebrow = select("#family-dialog-eyebrow");
  const title = select("#family-dialog-title");
  const intro = select("#family-dialog-intro");
  const submit = select("#family-dialog-submit");
  eyebrow.dataset.i18n = editing ? "edit_family_member" : "new_family_member";
  title.dataset.i18n = editing ? "edit_family_member" : "add_family_member";
  intro.dataset.i18n = editing ? "edit_family_intro" : "family_dialog_intro";
  submit.dataset.i18n = editing ? "save_changes" : "validate";
  eyebrow.textContent = translate(eyebrow.dataset.i18n);
  title.textContent = translate(title.dataset.i18n);
  intro.textContent = translate(intro.dataset.i18n);
  submit.textContent = translate(submit.dataset.i18n);
  select("#family-member-name").value = person?.name || "";
  const kind = person?.kind === "child" ? "child" : "adult";
  select(`#family-form input[name="family-kind"][value="${kind}"]`).checked = true;
  select("#family-member-kcal").value = person?.kcal_target ?? "";
  select("#family-member-description").value = person?.description || "";
  renderFamilyFoodRules(person?.food_rules || []);
  state.familyOriginal = editing ? familyFormSignature() : "";
  updateFamilyFormSaveState();
  const dialog = select("#family-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  select("#family-member-name").focus();
}

function closeFamilyDialog() {
  state.familyEditKey = null;
  state.familyOriginal = "";
  const dialog = select("#family-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

  function mount() {
select("#family-grid").addEventListener("click", (event) => {
  if (event.target.closest("#family-add-card")) {
    openFamilyDialog();
    return;
  }
  const removeButton = event.target.closest("[data-family-remove]");
  if (removeButton) {
    if (state.familyDraft.length <= 1) return;
    const key = decodeURIComponent(removeButton.dataset.familyRemove);
    const person = state.familyDraft.find((candidate) => candidate.key === key);
    if (!person) return;
    openConfirmation({
      title: translatedTemplate("remove_family_confirm_title", { name: person.name }),
      message: translate("remove_family_confirm_message"),
      confirmLabel: translate("delete"),
      action: () => {
        state.familyDraft = state.familyDraft.filter((candidate) => candidate.key !== key);
        renderFamily();
        send("replace-people", { rows: state.familyDraft });
      },
    });
    return;
  }
  const editCard = event.target.closest("[data-family-edit]");
  if (!editCard) return;
  const key = decodeURIComponent(editCard.dataset.familyEdit);
  const person = state.familyDraft.find((candidate) => candidate.key === key);
  if (person) openFamilyDialog(person);
});
select("#family-grid").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.target.closest("[data-family-remove]")) return;
  const editCard = event.target.closest("[data-family-edit]");
  if (!editCard) return;
  event.preventDefault();
  editCard.click();
});
select("#family-dialog-close").addEventListener("click", closeFamilyDialog);
select("#family-dialog-cancel").addEventListener("click", closeFamilyDialog);
select("#family-food-rule-add").addEventListener("click", () => {
  const list = select("#family-food-rules-list");
  list.querySelector(".family-food-rules-empty")?.remove();
  list.insertAdjacentHTML("beforeend", foodRuleMarkup());
  const row = list.lastElementChild;
  setFoodRuleMode(row);
  updateFamilyFormSaveState();
  row.querySelector("[data-food-rule-kind]").focus();
});
select("#family-food-rules-list").addEventListener("click", (event) => {
  const selection = event.target.closest(".food-rule-item-selection");
  if (selection && !event.target.closest("[data-food-rule-selected-item], [data-food-rule-item-search]")) {
    selection.querySelector("[data-food-rule-item-search]").focus();
    return;
  }
  const selectedItem = event.target.closest("[data-food-rule-selected-item]");
  if (selectedItem) {
    const row = selectedItem.closest("[data-food-rule]");
    const key = decodeURIComponent(selectedItem.dataset.foodRuleSelectedItem);
    const checkbox = [...row.querySelectorAll("[data-food-rule-items] input")]
      .find((input) => input.value === key);
    if (checkbox) checkbox.checked = false;
    renderFoodRuleSelectedItems(row);
    updateFamilyFormSaveState();
    row.querySelector("[data-food-rule-item-search]").focus();
    return;
  }
  const remove = event.target.closest(".remove-food-rule");
  if (!remove) return;
  remove.closest("[data-food-rule]").remove();
  if (!select("#family-food-rules-list").children.length) renderFamilyFoodRules();
  updateFamilyFormSaveState();
});
select("#family-food-rules-list").addEventListener("change", (event) => {
  const row = event.target.closest("[data-food-rule]");
  if (row && event.target.matches("[data-food-rule-kind]")) {
    setFoodRuleMode(row, true);
    const search = row.querySelector("[data-food-rule-item-search]");
    if (search.value.trim()) filterFoodRuleItems(search);
  }
  if (row && event.target.matches("[data-food-rule-items] input")) {
    renderFoodRuleSelectedItems(row);
  }
  if (row && event.target.matches("[data-food-rule-days] input")
    && !row.querySelector("[data-food-rule-days] input:checked")) {
    event.target.checked = true;
  }
  updateFamilyFormSaveState();
});
select("#family-food-rules-list").addEventListener("input", (event) => {
  if (!event.target.matches("[data-food-rule-item-search]")) return;
  filterFoodRuleItems(event.target);
});
select("#family-food-rules-list").addEventListener("focusin", (event) => {
  if (event.target.matches("[data-food-rule-item-search]") && event.target.value.trim()) {
    filterFoodRuleItems(event.target);
  }
});
select("#family-food-rules-list").addEventListener("focusout", (event) => {
  const picker = event.target.closest("[data-food-rule-item-picker]");
  if (picker && !picker.contains(event.relatedTarget)) {
    closeFoodRuleItems(picker.closest("[data-food-rule]"));
  }
});
select("#family-food-rules-list").addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !event.target.closest("[data-food-rule-item-picker]")) return;
  const row = event.target.closest("[data-food-rule]");
  closeFoodRuleItems(row);
  row.querySelector("[data-food-rule-item-search]").focus();
});
select("#family-form").addEventListener("input", updateFamilyFormSaveState);
select("#family-form").addEventListener("change", updateFamilyFormSaveState);
select("#family-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = select("#family-member-name").value.trim();
  const kcalValue = select("#family-member-kcal").value;
  const kcalTarget = kcalValue === "" ? null : Number(kcalValue);
  const foodRules = familyFoodRulesPayload();
  if (!name
    || (kcalTarget != null && (!Number.isFinite(kcalTarget) || kcalTarget <= 0))
    || !familyFoodRulesAreValid(foodRules)) return;
  const editingKey = state.familyEditKey;
  const person = {
    key: editingKey || familyMemberKey(name),
    name,
    kind: select("#family-form input[name='family-kind']:checked")?.value || "adult",
    kcal_target: kcalTarget,
    description: select("#family-member-description").value.trim(),
    food_rules: foodRules,
  };
  const existingIndex = state.familyDraft.findIndex((candidate) => candidate.key === editingKey);
  if (editingKey && existingIndex >= 0) state.familyDraft[existingIndex] = person;
  else state.familyDraft.push(person);
  closeFamilyDialog();
  renderFamily();
  send("replace-people", { rows: state.familyDraft });
});
  }

  return {
    close: closeFamilyDialog,
    mount,
    render: renderFamily,
  };
}

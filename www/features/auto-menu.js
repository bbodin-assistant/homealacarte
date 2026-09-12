import { countryFlag } from "../core/data-localization.js?v=homealacarte-80";
import {
  dateMenuRowsForWeek,
  menuDateForDay,
  menuDateWindow,
  menuRowsForWeek,
  migrateUndatedMenuRows,
} from "./menu/week.js?v=homealacarte-114";

export const autoMenuSettingKey = (...parts) => JSON.stringify(parts);

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseAutoMenuDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return localIsoDate(date) === value ? date : null;
}

export function autoMenuDateWindow(days, startDate) {
  return menuDateWindow(days, 0, parseAutoMenuDate(startDate) || new Date());
}

export function buildAutoMenuRequest(options, availability, slots, candidateDishKeys) {
  const selectedSlots = new Set(slots.map((slot) => autoMenuSettingKey(slot.day, slot.meal)));
  const selectedDays = new Set(slots.map((slot) => slot.day));
  return {
    kcal_threshold: options.kcalThreshold,
    min_portions: options.minPortions,
    max_portions: options.maxPortions,
    portion_step: options.portionStep,
    same_portion_for_everyone: options.samePortionForEveryone,
    availability: availability.filter((entry) => entry.meal
      ? selectedSlots.has(autoMenuSettingKey(entry.day, entry.meal))
      : selectedDays.has(entry.day)),
    slots,
    candidate_dish_keys: candidateDishKeys,
  };
}

export function createAutoMenuFeature({
  state,
  select,
  selectAll,
  storage,
  translate,
  escapeHtml,
  formatInputNumber,
  formatMoney,
  formatNumber,
  stockPayload,
  send,
  applyProposal,
}) {
  const meals = () => [state.snapshot.meals[2], state.snapshot.meals[5]].filter(Boolean);

  function ensureStartDate() {
    if (!state.autoMenuStartDate) {
      const stored = storage.getItem("homealacarte-auto-menu-start-date");
      state.autoMenuStartDate = parseAutoMenuDate(stored) ? stored : localIsoDate();
    }
    return state.autoMenuStartDate;
  }

  function currentWeekContext() {
    const migration = migrateUndatedMenuRows(state.draft, state.snapshot.days);
    state.draft = migration.rows;
    const week = autoMenuDateWindow(state.snapshot.days, ensureStartDate());
    return { week, rows: menuRowsForWeek(state.draft, week) };
  }

  function setStartDate(value) {
    if (!parseAutoMenuDate(value) || value === ensureStartDate()) return;
    state.autoMenuStartDate = value;
    storage.setItem("homealacarte-auto-menu-start-date", value);
    state.autoMenuSignature = "";
    state.autoMenuProposal = null;
    render();
  }

  function shiftStartDate(days) {
    const date = parseAutoMenuDate(ensureStartDate()) || new Date();
    date.setDate(date.getDate() + days);
    setStartDate(localIsoDate(date));
  }

  function dishDisplayName(dish) {
    const flag = countryFlag(dish?.origin_country);
    return flag ? `${flag} ${dish.name}` : dish?.name || "";
  }

  function initializeSettings() {
    const people = state.snapshot.people;
    const { week, rows } = currentWeekContext();
    const generationMeals = meals();
    const signature = JSON.stringify([
      state.language,
      week.map((entry) => entry.date),
      people.map((person) => person.key),
      generationMeals,
    ]);
    if (state.autoMenuSignature === signature) return;
    state.autoMenuSignature = signature;
    state.autoMenuAvailability = {};
    state.autoMenuCandidates = {};
    state.autoMenuProposal = null;
    for (const person of people) {
      for (const { day } of week) {
        for (const meal of generationMeals) {
          const occupied = rows.some((row) => row.day === day && row.meal === meal);
          state.autoMenuAvailability[autoMenuSettingKey(person.key, day, meal)] =
            person.kcal_target != null && !occupied;
        }
      }
    }
    const used = new Set(rows.map((row) => row.item_key));
    for (const dish of state.snapshot.dishes) {
      state.autoMenuCandidates[dish.key] = !used.has(dish.key);
    }
  }

  function renderDishes() {
    const { rows } = currentWeekContext();
    const usedDishes = new Set(rows.map((row) => row.item_key));
    const query = select("#auto-dish-search").value
      .trim()
      .toLocaleLowerCase(state.language);
    const dishes = state.snapshot.dishes.filter((dish) => !query
      || `${dish.name} ${dish.nutri_score || ""}`
        .toLocaleLowerCase(state.language).includes(query));
    select("#auto-menu-dishes").innerHTML = dishes.map((dish) => {
      const used = usedDishes.has(dish.key);
      const mainMeal = dish.auto_menu_main !== false;
      const disabled = used || !mainMeal;
      const displayName = dishDisplayName(dish);
      const detail = mainMeal
        ? `${formatNumber(dish.per_serving.kcal, 0)} kcal · ${formatMoney(dish.per_serving.cost)}`
        : translate("not_main_meal");
      return `<label class="auto-menu-dish ${disabled ? "used" : ""}">
        <input type="checkbox" data-auto-dish-key="${escapeHtml(encodeURIComponent(dish.key))}" ${!disabled && state.autoMenuCandidates[dish.key] !== false ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <strong title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</strong>
        <small class="${mainMeal ? "" : "auto-menu-dish-ineligible"}" title="${escapeHtml(detail)}">${mainMeal ? escapeHtml(detail) : "×"}</small>
      </label>`;
    }).join("") || `<p class="auto-menu-dishes-empty">${escapeHtml(translate(query ? "no_matching_dishes" : "no_eligible_dishes"))}</p>`;
  }

  function proposalPreview(proposal, week, people, items) {
    const mealOrder = new Map((state.snapshot.meals || []).map((meal, index) => [meal, index]));
    return week.map(({ day, date }) => {
      const rows = proposal.rows
        .filter((row) => row.day === day)
        .sort((left, right) => (mealOrder.get(left.meal) ?? 999) - (mealOrder.get(right.meal) ?? 999));
      if (!rows.length) return "";
      return `<article class="auto-menu-proposal-day">
        <header><strong>${escapeHtml(day)}</strong><span>${escapeHtml(date)}</span></header>
        <div>${rows.map((row) => `<div class="auto-menu-proposal-meal">
          <span class="auto-menu-proposal-meal-name">${escapeHtml(row.meal)}</span>
          <strong>${escapeHtml(items.get(row.item_key) || row.item_key)}</strong>
          <small>${escapeHtml(`${formatNumber(row.quantity, 2)} ${row.quantity_unit} · ${row.people.map((key) => people.get(key) || key).join(", ")}`)}</small>
        </div>`).join("")}</div>
      </article>`;
    }).join("");
  }

  function calorieBars(rows, week, people) {
    return rows.map((row) => {
      const scale = Math.max(Number(row.target_kcal) || 0, Number(row.total_kcal) || 0, 1) * 1.08;
      const existing = Math.max(0, Number(row.existing_kcal) || 0);
      const generated = Math.max(0, Number(row.generated_kcal) || 0);
      const total = Math.max(0, Number(row.total_kcal) || 0);
      const target = Math.max(0, Number(row.target_kcal) || 0);
      const existingWidth = Math.min(100, existing / scale * 100);
      const generatedWidth = Math.min(100 - existingWidth, generated / scale * 100);
      const targetPosition = Math.min(100, target / scale * 100);
      const delta = total - target;
      const deltaLabel = `${delta > 0 ? "+" : ""}${formatNumber(delta, 0)} kcal`;
      const label = `${people.get(row.person_key) || row.person_key} · ${menuDateForDay(week, row.day)} · ${row.day}`;
      return `<div class="auto-menu-calorie-row">
        <div class="auto-menu-calorie-heading"><strong>${escapeHtml(label)}</strong><span>${formatNumber(total, 0)} / ${formatNumber(target, 0)} kcal · ${escapeHtml(deltaLabel)}</span></div>
        <div class="auto-menu-calorie-track" role="img" aria-label="${escapeHtml(`${label}: ${formatNumber(total, 0)} / ${formatNumber(target, 0)} kcal`)}">
          <i class="auto-menu-calorie-existing" style="width:${existingWidth.toFixed(2)}%"></i>
          <i class="auto-menu-calorie-generated" style="width:${generatedWidth.toFixed(2)}%"></i>
          <b class="auto-menu-calorie-target" style="left:${targetPosition.toFixed(2)}%"></b>
        </div>
        <div class="auto-menu-calorie-legend">
          <span><i class="is-existing"></i>${escapeHtml(translate("existing_kcal"))} ${formatNumber(existing, 0)}</span>
          <span><i class="is-generated"></i>${escapeHtml(translate("generated_kcal"))} ${formatNumber(generated, 0)}</span>
          <span><i class="is-target"></i>${escapeHtml(translate("target_kcal"))} ${formatNumber(target, 0)}</span>
        </div>
      </div>`;
    }).join("");
  }

  function renderResult() {
    const container = select("#auto-menu-result");
    const proposal = state.autoMenuProposal;
    if (!proposal) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    const { week } = currentWeekContext();
    const people = new Map(state.snapshot.people.map((person) => [person.key, person.name]));
    const dishes = new Map(state.snapshot.dishes.map((dish) => [dish.key, dish]));
    const items = new Map(state.snapshot.item_options.map((item) => [
      item.key,
      item.kind === "dish" && dishes.has(item.key)
        ? dishDisplayName(dishes.get(item.key))
        : item.name,
    ]));
    container.hidden = false;
    container.innerHTML = `
      <div class="auto-menu-result-summary">
        <div><span>${escapeHtml(translate("grocery_total_after_generation"))}</span><strong>${formatMoney(proposal.estimated_grocery_total)}</strong></div>
        <div><span>${escapeHtml(translate("additional_grocery_cost"))}</span><strong>${formatMoney(proposal.estimated_additional_cost)}</strong></div>
        <div><span>${escapeHtml(translate("generated_rows"))}</span><strong>${proposal.rows.length}</strong><small>${escapeHtml(translate(proposal.decomposed ? "solver_daily_optimized" : proposal.optimal ? "solver_optimal" : "solver_feasible"))}</small></div>
      </div>
      <section class="panel auto-menu-preview auto-menu-proposal">
        <div class="auto-menu-preview-heading"><h2>${escapeHtml(translate("generated_menu_preview"))}</h2><span>${escapeHtml(`${week[0]?.date || ""} → ${week.at(-1)?.date || ""}`)}</span></div>
        <div class="auto-menu-proposal-grid">${proposalPreview(proposal, week, people, items)}</div>
      </section>
      <section class="panel auto-menu-preview auto-menu-calories">
        <div class="auto-menu-preview-heading"><h2>${escapeHtml(translate("calorie_check"))}</h2><span>${escapeHtml(translate("target_kcal"))}</span></div>
        <div class="auto-menu-calorie-chart">${calorieBars(proposal.daily_results, week, people)}</div>
      </section>
      <div class="auto-menu-result-actions">
        <button id="auto-menu-discard" class="button ghost" type="button">${escapeHtml(translate("discard_preview"))}</button>
        <button id="auto-menu-apply" class="button primary" type="button">${escapeHtml(translate("apply_generated_menu"))}</button>
      </div>`;
  }

  function render() {
    initializeSettings();
    const people = state.snapshot.people;
    const { week, rows } = currentWeekContext();
    const generationMeals = meals();
    select("#auto-kcal-threshold").value = formatInputNumber(state.autoMenuOptions.kcalThreshold);
    select("#auto-min-portions").value = formatInputNumber(state.autoMenuOptions.minPortions);
    select("#auto-max-portions").value = formatInputNumber(state.autoMenuOptions.maxPortions);
    select("#auto-portion-step").value = formatInputNumber(state.autoMenuOptions.portionStep);
    select("#auto-same-portions").checked = state.autoMenuOptions.samePortionForEveryone;
    select("#auto-menu-start-date").value = ensureStartDate();

    select("#auto-menu-availability").innerHTML = `
      <table class="auto-menu-availability">
        <thead><tr><th>${escapeHtml(translate("people"))}</th>${week.map(({ day, date }) => `<th>${escapeHtml(day)}<br><small>${escapeHtml(date)}</small></th>`).join("")}</tr></thead>
        <tbody>${people.map((person) => `<tr>
          <td><strong>${escapeHtml(person.name)}</strong><span>${person.kcal_target == null ? escapeHtml(translate("excluded_without_calorie_target")) : `${formatNumber(person.kcal_target, 0)} kcal`}</span></td>
          ${week.map(({ day, date }) => `<td><div class="auto-menu-presence-stack">${generationMeals.map((meal) => {
            const occupied = rows.some((row) => row.day === day && row.meal === meal);
            const key = autoMenuSettingKey(person.key, day, meal);
            const disabled = person.kcal_target == null || occupied;
            const title = occupied ? translate("already_scheduled") : `${person.name} · ${day} · ${meal}`;
            return `<label class="auto-menu-presence-meal ${occupied ? "is-occupied" : ""}" title="${escapeHtml(title)}">
              <input type="checkbox" data-auto-availability-person="${escapeHtml(encodeURIComponent(person.key))}" data-auto-availability-day="${escapeHtml(encodeURIComponent(day))}" data-auto-availability-meal="${escapeHtml(encodeURIComponent(meal))}" data-auto-availability-date="${escapeHtml(date)}" ${!disabled && state.autoMenuAvailability[key] ? "checked" : ""} ${disabled ? "disabled" : ""} aria-label="${escapeHtml(`${person.name} · ${day} · ${meal}`)}">
              <span>${escapeHtml(meal)}</span>
            </label>`;
          }).join("")}</div></td>`).join("")}
        </tr>`).join("")}</tbody>
      </table>`;

    renderDishes();
    renderResult();
  }

  function clearProposal() {
    state.autoMenuProposal = null;
    renderResult();
  }

  select("#auto-menu-availability").addEventListener("change", (event) => {
    const input = event.target.closest("[data-auto-availability-person]");
    if (!input) return;
    const person = decodeURIComponent(input.dataset.autoAvailabilityPerson);
    const day = decodeURIComponent(input.dataset.autoAvailabilityDay);
    const meal = decodeURIComponent(input.dataset.autoAvailabilityMeal);
    state.autoMenuAvailability[autoMenuSettingKey(person, day, meal)] = input.checked;
    clearProposal();
  });
  select("#auto-menu-start-date").addEventListener("change", (event) => setStartDate(event.target.value));
  select("#auto-menu-date-controls").addEventListener("click", (event) => {
    const button = event.target.closest("[data-auto-date-shift]");
    if (!button) return;
    shiftStartDate(Number(button.dataset.autoDateShift));
  });
  select("#auto-dish-search").addEventListener("input", renderDishes);
  select("#auto-menu-dishes").addEventListener("change", (event) => {
    const input = event.target.closest("[data-auto-dish-key]");
    if (!input) return;
    state.autoMenuCandidates[decodeURIComponent(input.dataset.autoDishKey)] = input.checked;
    clearProposal();
  });
  select("#auto-dishes-all").addEventListener("click", () => {
    selectAll("#auto-menu-dishes input:not(:disabled)").forEach((input) => {
      input.checked = true;
      state.autoMenuCandidates[decodeURIComponent(input.dataset.autoDishKey)] = true;
    });
    clearProposal();
  });
  select("#auto-dishes-none").addEventListener("click", () => {
    selectAll("#auto-menu-dishes input:not(:disabled)").forEach((input) => {
      input.checked = false;
      state.autoMenuCandidates[decodeURIComponent(input.dataset.autoDishKey)] = false;
    });
    clearProposal();
  });
  select("#auto-menu-form").addEventListener("input", (event) => {
    if (!event.target.closest("#auto-kcal-threshold, #auto-min-portions, #auto-max-portions, #auto-portion-step, #auto-same-portions")) return;
    state.autoMenuOptions = {
      kcalThreshold: Number(select("#auto-kcal-threshold").value),
      minPortions: Number(select("#auto-min-portions").value),
      maxPortions: Number(select("#auto-max-portions").value),
      portionStep: Number(select("#auto-portion-step").value),
      samePortionForEveryone: select("#auto-same-portions").checked,
    };
    storage.setItem("homealacarte-auto-menu-options", JSON.stringify(state.autoMenuOptions));
    clearProposal();
  });
  select("#auto-menu-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const availability = selectAll("#auto-menu-availability input:checked").map((input) => ({
      person_key: decodeURIComponent(input.dataset.autoAvailabilityPerson),
      day: decodeURIComponent(input.dataset.autoAvailabilityDay),
      meal: decodeURIComponent(input.dataset.autoAvailabilityMeal),
      date: input.dataset.autoAvailabilityDate,
    }));
    const slots = [...new Map(availability.map((entry) => [
      autoMenuSettingKey(entry.day, entry.meal),
      { day: entry.day, meal: entry.meal },
    ])).values()];
    const candidateDishKeys = selectAll("#auto-menu-dishes input:checked").map((input) =>
      decodeURIComponent(input.dataset.autoDishKey));
    const { rows } = currentWeekContext();
    clearTimeout(state.editTimer);
    clearProposal();
    send("generate-menu", {
      rows: state.draft,
      generationRows: rows,
      stock: stockPayload(),
      request: buildAutoMenuRequest(
        state.autoMenuOptions,
        availability,
        slots,
        candidateDishKeys,
      ),
    });
  });
  select("#auto-menu-result").addEventListener("click", (event) => {
    if (event.target.closest("#auto-menu-discard")) {
      clearProposal();
      return;
    }
    if (!event.target.closest("#auto-menu-apply") || !state.autoMenuProposal) return;
    const { week } = currentWeekContext();
    const rows = dateMenuRowsForWeek(
      structuredClone(state.autoMenuProposal.rows),
      week,
    );
    const start = parseAutoMenuDate(ensureStartDate());
    const today = parseAutoMenuDate(localIsoDate());
    state.menuDayOffset = start && today
      ? Math.round((start.getTime() - today.getTime()) / 86400000)
      : 0;
    state.autoMenuProposal = null;
    applyProposal(rows);
  });

  return { render, renderResult };
}

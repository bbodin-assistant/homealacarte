import { countryFlag } from "../core/data-localization.js?v=homealacarte-80";
import {
  dateMenuRowsForWeek,
  menuDateForDay,
  menuRowsForWeek,
  menuWeek,
  migrateUndatedMenuRows,
} from "./menu/week.js?v=homealacarte-81";

export const autoMenuSettingKey = (...parts) => JSON.stringify(parts);

export function buildAutoMenuRequest(options, availability, slots, candidateDishKeys) {
  const selectedDays = new Set(slots.map((slot) => slot.day));
  return {
    kcal_threshold: options.kcalThreshold,
    min_portions: options.minPortions,
    max_portions: options.maxPortions,
    portion_step: options.portionStep,
    same_portion_for_everyone: options.samePortionForEveryone,
    availability: availability.filter((entry) => selectedDays.has(entry.day)),
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

  function currentWeekContext() {
    const migration = migrateUndatedMenuRows(state.draft, state.snapshot.days);
    state.draft = migration.rows;
    const week = menuWeek(state.snapshot.days, 0);
    return { week, rows: menuRowsForWeek(state.draft, week) };
  }

  function dishDisplayName(dish) {
    const flag = countryFlag(dish?.origin_country);
    return flag ? `${flag} ${dish.name}` : dish?.name || "";
  }

  function initializeSettings() {
    const people = state.snapshot.people;
    const { week, rows } = currentWeekContext();
    const signature = JSON.stringify([
      state.language,
      week.map((entry) => entry.date),
      people.map((person) => person.key),
    ]);
    if (state.autoMenuSignature === signature) return;
    state.autoMenuSignature = signature;
    state.autoMenuAvailability = {};
    state.autoMenuSlots = {};
    state.autoMenuCandidates = {};
    state.autoMenuProposal = null;
    const hasMenu = rows.length > 0;
    for (const person of people) {
      for (const { day } of week) {
        state.autoMenuAvailability[autoMenuSettingKey(person.key, day)] = !hasMenu
          || rows.some((row) => row.day === day && row.people.includes(person.key));
        if (person.kcal_target == null) {
          state.autoMenuAvailability[autoMenuSettingKey(person.key, day)] = false;
        }
      }
    }
    for (const { day } of week) {
      for (const meal of meals()) {
        state.autoMenuSlots[autoMenuSettingKey(day, meal)] = !rows
          .some((row) => row.day === day && row.meal === meal);
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
      return `<label class="auto-menu-dish ${disabled ? "used" : ""}">
        <input type="checkbox" data-auto-dish-key="${escapeHtml(encodeURIComponent(dish.key))}" ${!disabled && state.autoMenuCandidates[dish.key] !== false ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <strong title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</strong>
        <small>${mainMeal ? `${formatNumber(dish.per_serving.kcal, 0)} kcal · ${formatMoney(dish.per_serving.cost)}` : escapeHtml(translate("not_main_meal"))}</small>
      </label>`;
    }).join("") || `<p class="auto-menu-dishes-empty">${escapeHtml(translate(query ? "no_matching_dishes" : "no_eligible_dishes"))}</p>`;
  }

  function renderResult() {
    const container = select("#auto-menu-result");
    const proposal = state.autoMenuProposal;
    if (!proposal) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    const week = menuWeek(state.snapshot.days, 0);
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
      <section class="panel auto-menu-preview">
        <h2>${escapeHtml(translate("generated_menu_preview"))}</h2>
        <div class="auto-menu-preview-grid">${proposal.rows.map((row) => `
          <div class="auto-menu-preview-card">
            <strong>${escapeHtml(`${menuDateForDay(week, row.day)} · ${row.day} · ${row.meal}`)}</strong>
            <span>${escapeHtml(items.get(row.item_key) || row.item_key)} · ${formatNumber(row.quantity, 2)} ${escapeHtml(row.quantity_unit)}</span>
            <span>${escapeHtml(row.people.map((key) => people.get(key) || key).join(", "))}</span>
          </div>`).join("")}</div>
      </section>
      <section class="panel auto-menu-preview table-scroll">
        <h2>${escapeHtml(translate("calorie_check"))}</h2>
        <table class="auto-menu-daily"><thead><tr>
          <th>${escapeHtml(translate("people"))} · ${escapeHtml(translate("day"))}</th>
          <th>${escapeHtml(translate("existing_kcal"))}</th><th>${escapeHtml(translate("generated_kcal"))}</th>
          <th>${escapeHtml(translate("total_kcal"))}</th><th>${escapeHtml(translate("target_kcal"))}</th>
        </tr></thead><tbody>${proposal.daily_results.map((row) => `<tr>
          <td>${escapeHtml(`${people.get(row.person_key) || row.person_key} · ${menuDateForDay(week, row.day)} · ${row.day}`)}</td>
          <td>${formatNumber(row.existing_kcal, 0)}</td><td>${formatNumber(row.generated_kcal, 0)}</td>
          <td><strong>${formatNumber(row.total_kcal, 0)}</strong></td><td>${formatNumber(row.target_kcal, 0)}</td>
        </tr>`).join("")}</tbody></table>
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
    select("#auto-kcal-threshold").value = formatInputNumber(state.autoMenuOptions.kcalThreshold);
    select("#auto-min-portions").value = formatInputNumber(state.autoMenuOptions.minPortions);
    select("#auto-max-portions").value = formatInputNumber(state.autoMenuOptions.maxPortions);
    select("#auto-portion-step").value = formatInputNumber(state.autoMenuOptions.portionStep);
    select("#auto-same-portions").checked = state.autoMenuOptions.samePortionForEveryone;

    select("#auto-menu-availability").innerHTML = `
      <table class="auto-menu-availability">
        <thead><tr><th>${escapeHtml(translate("people"))}</th>${week.map(({ day, date }) => `<th>${escapeHtml(day)}<br><small>${escapeHtml(date)}</small></th>`).join("")}</tr></thead>
        <tbody>${people.map((person) => `<tr>
          <td><strong>${escapeHtml(person.name)}</strong><span>${person.kcal_target == null ? escapeHtml(translate("excluded_without_calorie_target")) : `${formatNumber(person.kcal_target, 0)} kcal`}</span></td>
          ${week.map(({ day, date }) => {
            const key = autoMenuSettingKey(person.key, day);
            return `<td><input type="checkbox" data-auto-availability-person="${escapeHtml(encodeURIComponent(person.key))}" data-auto-availability-day="${escapeHtml(encodeURIComponent(day))}" data-auto-availability-date="${escapeHtml(date)}" ${state.autoMenuAvailability[key] ? "checked" : ""} ${person.kcal_target == null ? "disabled" : ""} aria-label="${escapeHtml(`${person.name} · ${day}`)}"></td>`;
          }).join("")}
        </tr>`).join("")}</tbody>
      </table>`;

    select("#auto-menu-slots").innerHTML = week.map(({ day, date }) => `
      <div class="auto-menu-slot-day">
        <h3>${escapeHtml(day)}<br><small>${escapeHtml(date)}</small></h3>
        ${meals().map((meal) => {
          const occupied = rows.some((row) => row.day === day && row.meal === meal);
          const key = autoMenuSettingKey(day, meal);
          return `<label class="auto-menu-slot ${occupied ? "unavailable" : ""}">
            <input type="checkbox" data-auto-slot-day="${escapeHtml(encodeURIComponent(day))}" data-auto-slot-meal="${escapeHtml(encodeURIComponent(meal))}" ${!occupied && state.autoMenuSlots[key] ? "checked" : ""} ${occupied ? "disabled" : ""}>
            <span>${escapeHtml(meal)}${occupied ? ` · ${escapeHtml(translate("already_scheduled"))}` : ""}</span>
          </label>`;
        }).join("")}
      </div>`).join("");

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
    state.autoMenuAvailability[autoMenuSettingKey(person, day)] = input.checked;
    clearProposal();
  });
  select("#auto-menu-slots").addEventListener("change", (event) => {
    const input = event.target.closest("[data-auto-slot-day]");
    if (!input) return;
    const day = decodeURIComponent(input.dataset.autoSlotDay);
    const meal = decodeURIComponent(input.dataset.autoSlotMeal);
    state.autoMenuSlots[autoMenuSettingKey(day, meal)] = input.checked;
    clearProposal();
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
  select("#auto-menu-form").addEventListener("input", () => {
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
      date: input.dataset.autoAvailabilityDate,
    }));
    const slots = selectAll("#auto-menu-slots input:checked").map((input) => ({
      day: decodeURIComponent(input.dataset.autoSlotDay),
      meal: decodeURIComponent(input.dataset.autoSlotMeal),
    }));
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
    const rows = dateMenuRowsForWeek(
      structuredClone(state.autoMenuProposal.rows),
      menuWeek(state.snapshot.days, 0),
    );
    state.menuWeekOffset = 0;
    state.autoMenuProposal = null;
    applyProposal(rows);
  });

  return { render, renderResult };
}

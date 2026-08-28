import { countryFlag } from "../core/data-localization.js?v=homealacarte-80";
import { dishAllergenBadges } from "./dishes/allergen-display.js?v=homealacarte-103";
import { buildScheduledDishRow } from "./menu/scheduling.js?v=homealacarte-81";
import { mergeCompatibleMenuRows } from "./menu/rows.js?v=homealacarte-81";
import {
  menuDateForDay,
  menuNutritionByDate,
  menuRowsForWeek,
  menuWeek,
  migrateUndatedMenuRows,
} from "./menu/week.js?v=homealacarte-81";

export function createMenuFeature({
  state,
  select,
  selectAll,
  storage,
  translate,
  translatedTemplate,
  escapeHtml,
  externalHttpUrl,
  formatInputNumber,
  formatMoney,
  formatNumber,
  enhanceSearchableSelect,
  dishNutriScoreDetail,
  openConfirmation,
  openCatalogueItemDetails,
  openDishForm,
  scheduleMenuUpdate,
  send,
  setMenuMode,
}) {
  function visibleWeek() {
    return menuWeek(state.snapshot.days, state.menuWeekOffset);
  }

  function dayOptions(selected = "") {
    return visibleWeek()
      .map(({ day, date }) => `<option value="${escapeHtml(day)}" ${day === selected ? "selected" : ""}>${escapeHtml(`${day} · ${date}`)}</option>`)
      .join("");
  }

  function itemDisplayName(item) {
    if (!item) return "";
    if (item.kind !== "dish") return item.name;
    const dish = state.snapshot.dishes.find((candidate) => candidate.key === item.key);
    const flag = countryFlag(dish?.origin_country);
    return flag ? `${flag} ${item.name}` : item.name;
  }

  function itemOptions(selected, excluded = "") {
    const groups = [
      ["dish", translate("dishes")],
      ["ingredient", translate("ingredients")],
    ];
    return groups.map(([kind, label]) => {
      const rows = state.snapshot.item_options
        .filter((item) => item.kind === kind && item.key !== excluded)
        .map((item) => `<option value="${escapeHtml(item.key)}" ${item.key === selected ? "selected" : ""}>${escapeHtml(itemDisplayName(item))}</option>`)
        .join("");
      return `<optgroup label="${escapeHtml(label)}">${rows}</optgroup>`;
    }).join("");
  }

  function peopleEditor(row) {
    const names = new Map(state.snapshot.people.map((person) => [person.key, person.name]));
    const selected = new Set(row.people);
    const chips = row.people.map((key) => `
      <span class="person-chip">
        ${escapeHtml(names.get(key) || key)}
        <button type="button" class="remove-person" data-person-key="${escapeHtml(key)}" ${row.people.length === 1 ? "disabled" : ""} aria-label="${escapeHtml(translate("remove_person"))}">×</button>
      </span>
    `).join("");
    const remaining = state.snapshot.people.filter((person) => !selected.has(person.key));
    const add = remaining.length ? `
      <label class="person-add" title="${escapeHtml(translate("add_person"))}">
        <span>+</span>
        <select class="person-add-select" aria-label="${escapeHtml(translate("add_person"))}">
          <option value="">+</option>
          ${remaining.map((person) => `<option value="${escapeHtml(person.key)}">${escapeHtml(person.name)}</option>`).join("")}
        </select>
      </label>
    ` : "";
    return `<div class="people-editor">${chips}${add}</div>`;
  }

  function openMealReplacement(index) {
    const row = state.draft[index];
    if (!row) return;
    const current = state.snapshot.item_options.find((item) => item.key === row.item_key);
    state.pendingReplacementIndex = index;
    select("#meal-replace-context").textContent =
      `${itemDisplayName(current) || row.item_key} · ${row.date} · ${row.day} · ${row.meal}`;
    select("#meal-replace-select").innerHTML = itemOptions("", row.item_key);
    const search = enhanceSearchableSelect(
      select("#meal-replace-select"),
      translate("search_items"),
    );
    const dialog = select("#meal-replace-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    search?.focus();
  }

  function closeMealReplacement() {
    state.pendingReplacementIndex = null;
    const dialog = select("#meal-replace-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function renderMenu() {
    const migration = migrateUndatedMenuRows(state.draft, state.snapshot.days);
    state.draft = mergeCompatibleMenuRows(migration.rows);
    const week = visibleWeek();
    const weekDates = new Set(week.map((entry) => entry.date));
    const rows = menuRowsForWeek(state.draft, week);
    const profileSelect = select("#profile-select");
    const peopleNames = new Map(state.snapshot.people.map((person) => [person.key, person.name]));
    const itemNames = new Map(state.snapshot.item_options.map((item) => [item.key, itemDisplayName(item)]));
    const dishes = new Map(state.snapshot.dishes.map((dish) => [dish.key, dish]));
    profileSelect.innerHTML = state.snapshot.people
      .filter((person) => person.kcal_target != null)
      .map((person) => `<option value="${escapeHtml(person.key)}" ${person.key === state.snapshot.profile ? "selected" : ""}>${escapeHtml(person.name)}</option>`)
      .join("");
    select("#show-selected-only").checked = state.menuSelectedOnly;
    select("#empty-menu").disabled = rows.length === 0;
    select("#menu-week-range").textContent = week.length
      ? `${week[0].date} — ${week[week.length - 1].date}`
      : "";
    const cells = new Map();
    state.draft.forEach((row, index) => {
      if (!weekDates.has(row.date)) return;
      if (
        state.menuSelectedOnly
        && state.snapshot.profile
        && !row.people.includes(state.snapshot.profile)
      ) return;
      const key = `${row.meal}|${row.date}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ row, index });
    });
    const nutrition = menuNutritionByDate(state.snapshot, rows);
    let html = `<thead><tr><th>${translate("meal")}</th>${week.map(({ day, date }) => `<th>${escapeHtml(day)}<br><small>${escapeHtml(date)}</small></th>`).join("")}</tr></thead><tbody>`;
    for (const meal of state.snapshot.meals) {
      html += `<tr><td>${escapeHtml(meal)}</td>`;
      for (const { day, date } of week) {
        const entries = cells.get(`${meal}|${date}`) || [];
        html += `<td data-menu-drop-date="${escapeHtml(date)}" data-menu-drop-day="${escapeHtml(day)}" data-menu-drop-meal="${escapeHtml(meal)}"><div class="menu-cell">
          <div class="menu-cell-entries">${entries.map(({ row, index }) => {
            const name = itemNames.get(row.item_key) || row.item_key;
            const dish = dishes.get(row.item_key);
            const detailsKey = dish?.key || row.item_key;
            const title = `<button type="button" class="menu-entry-dish" data-dish-key="${escapeHtml(encodeURIComponent(detailsKey))}" data-menu-index="${index}">${escapeHtml(name)}</button>`;
            return `<div class="menu-entry" draggable="true" data-menu-drag-index="${index}" title="${escapeHtml(translate("drag_to_move"))}">
                <button type="button" class="menu-entry-delete" data-index="${index}" title="${escapeHtml(translate("remove_menu_item"))}" aria-label="${escapeHtml(translate("remove_menu_item"))}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
                </button>
                <div>
                  ${title}
                  <span>${formatNumber(row.quantity)} ${escapeHtml(row.quantity_unit)} · ${escapeHtml(row.people.map((key) => peopleNames.get(key) || key).join(", "))}</span>
                </div>
              </div>`;
          }).join("")}</div>
          <div class="menu-drop-placeholder" aria-hidden="true">${escapeHtml(translate("drop_here"))}</div>
          <button type="button" class="menu-cell-add" data-date="${escapeHtml(date)}" data-day="${escapeHtml(day)}" data-meal="${escapeHtml(meal)}" aria-label="${escapeHtml(translate("add_menu_item"))}">
            <span aria-hidden="true">+</span>
          </button>
        </div></td>`;
      }
      html += "</tr>";
    }
    html += `<tr class="nutrition-row"><td>${translate("total_person")}</td>`;
    for (const { date } of week) {
      const value = nutrition.get(date) || {};
      html += `<td><strong>${formatNumber(value.kcal, 0)} kcal</strong><span>${formatNumber(value.protein_g)} g P · ${formatNumber(value.carbs_g)} g G<br>${formatNumber(value.fat_g)} g L · ${formatNumber(value.fiber_g)} g F</span></td>`;
    }
    html += "</tr></tbody>";
    select("#weekly-menu").innerHTML = html;
    if (migration.changed) scheduleMenuUpdate();
  }

  function openDishDetails(dishKey, menuIndex) {
    const dish = state.snapshot.dishes.find((candidate) => candidate.key === dishKey);
    const row = Number.isInteger(menuIndex) ? state.draft[menuIndex] : null;
    const item = state.snapshot.item_options.find((candidate) => candidate.key === dishKey);
    if (!dish && !row) return;
    state.dishDetailsMenuIndex = row ? menuIndex : null;
    state.dishDetailsDishKey = dish?.key || null;
    state.dishDetailsOriginal = null;
    state.dishDetailsItemUnit = item?.measure_unit || "unit";
    state.dishDetailsScheduling = false;
    const peopleNames = new Map(state.snapshot.people.map((person) => [person.key, person.name]));
    const context = row
      ? [
        `${row.date} · ${row.day} · ${row.meal}`,
        `${formatNumber(row.quantity)} ${row.quantity_unit}`,
        row.people.map((key) => peopleNames.get(key) || key).join(", "),
      ].filter(Boolean).join(" · ")
      : "";

    const flag = countryFlag(dish?.origin_country);
    const detailName = dish?.name || item?.name || dishKey;
    select("#dish-details-title").textContent = flag ? `${flag} ${detailName}` : detailName;
    select("#dish-details-context").textContent = context;
    select("#dish-details-menu-note").textContent = row?.notes || "";
    select("#dish-details-menu-note").hidden = !row?.notes;
    select("#dish-menu-editor").hidden = !row;
    select("#dish-details-save").hidden = !row;
    select("#dish-details-schedule-cancel").hidden = true;
    select("#dish-details-schedule").hidden = Boolean(row) || !dish;
    select("#dish-details-edit").hidden = Boolean(row) || !dish;
    if (row) {
      select("#dish-menu-editor-title").textContent = translate("edit_menu_item");
      select("#dish-menu-editor-intro").textContent = translate("edit_menu_intro");
      select("#dish-details-save").textContent = translate("save_changes");
      select("#dish-menu-day").innerHTML = dayOptions(row.day);
      select("#dish-menu-day").value = row.day;
      select("#dish-menu-meal").innerHTML = state.snapshot.meals
        .map((meal) => `<option value="${escapeHtml(meal)}">${escapeHtml(meal)}</option>`)
        .join("");
      select("#dish-menu-meal").value = row.meal;
      select("#dish-menu-quantity").value = formatInputNumber(row.quantity);
      select("#dish-menu-notes").value = row.notes || "";
      select("#dish-menu-unit").value = ["portion", "g", "unit"].includes(row.quantity_unit)
        ? row.quantity_unit
        : "portion";
      updateDishMenuUnitValue();
      select("#dish-menu-people").innerHTML = state.snapshot.people.map((person) => `
        <label class="dialog-person">
          <input type="checkbox" value="${escapeHtml(person.key)}" ${row.people.includes(person.key) ? "checked" : ""}>
          <span>${escapeHtml(person.name)}</span>
        </label>
      `).join("");
      select("#dish-menu-people-error").hidden = true;
      state.dishDetailsOriginal = dishMenuEditorSignature();
      updateDishMenuSaveState();
    }
    const allergenBadges = dish
      ? dishAllergenBadges(dish, state.snapshot.people || [], state.language)
        .filter((badge) => badge.code)
      : [];
    select("#dish-details-allergens-section").hidden = allergenBadges.length === 0;
    select("#dish-details-allergens").innerHTML = allergenBadges.map((badge) => `
      <span class="dish-details-allergen${badge.householdWarning ? " household-warning" : ""}" title="${escapeHtml(badge.title)}">
        <span class="dish-details-allergen-icon" aria-hidden="true">${badge.icon}</span>
        <strong>${escapeHtml(badge.label)}</strong>
      </span>
    `).join("");

    select("#dish-details-metrics").hidden = !dish;
    select("#dish-details-ingredients-section").hidden = !dish;
    if (dish) {
      const nutrients = dish.per_serving;
      const metrics = [
        [formatNumber(dish.servings), translate("servings")],
        [formatNumber(nutrients.kcal, 0), `kcal · ${translate("per_serving")}`],
        [`${formatNumber(nutrients.grams, 0)} g`, translate("per_serving")],
        [`${formatNumber(nutrients.protein_g)} g`, translate("protein")],
        [`${formatNumber(nutrients.carbs_g)} g`, translate("carbs")],
        [`${formatNumber(nutrients.fat_g)} g`, translate("fat")],
        [`${formatNumber(nutrients.fiber_g)} g`, translate("fiber")],
        [formatMoney(nutrients.cost), `${translate("cost")} · ${translate("per_serving")}`],
      ];
      if (dish.nutri_score) {
        metrics.splice(2, 0, [
          dish.nutri_score,
          "Nutri-Score",
        ]);
      }
      select("#dish-details-metrics").innerHTML = metrics.map(([value, label]) => `
        <div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>
      `).join("");
      select("#dish-details-nutri-status").textContent = dishNutriScoreDetail(dish);
      select("#dish-details-ingredients").innerHTML = dish.components.map((component) => `
        <li>
          <button class="dish-details-ingredient" type="button" data-dish-ingredient-details="${escapeHtml(encodeURIComponent(component.key))}">
            <span>
              <strong>${escapeHtml(component.name)}</strong>
              ${component.source_quantity ? `<small>${escapeHtml(component.source_quantity)}</small>` : ""}
            </span>
            <span>${formatNumber(component.quantity)} ${escapeHtml(component.quantity_unit)} · ${escapeHtml(translate("per_serving"))}</span>
          </button>
        </li>
      `).join("");
    }
    select("#dish-details-nutri-status").hidden = !dish;

    const sourceSection = select("#dish-details-source-section");
    const sourceNotes = dish?.source_notes || [];
    sourceSection.hidden = !dish || (!dish.source && !sourceNotes.length);
    select("#dish-details-source").textContent = dish?.source || "";
    select("#dish-details-source").hidden = !dish?.source;
    select("#dish-details-notes").innerHTML = sourceNotes
      .map((note) => `<p>${escapeHtml(note)}</p>`)
      .join("");

    const recipeUrl = externalHttpUrl(dish?.recipe_url);
    select("#dish-details-recipe").hidden = !dish;
    const recipeLink = select("#dish-details-recipe-link");
    const recipeUrlLabel = select("#dish-details-url");
    recipeLink.hidden = !recipeUrl;
    recipeUrlLabel.hidden = !recipeUrl;
    if (recipeUrl) {
      recipeLink.href = recipeUrl;
      recipeUrlLabel.textContent = recipeUrl.length > 58 ? `${recipeUrl.slice(0, 58)}…` : recipeUrl;
      recipeUrlLabel.title = recipeUrl;
    } else {
      recipeLink.removeAttribute("href");
      recipeUrlLabel.textContent = "";
      recipeUrlLabel.removeAttribute("title");
    }
    select("#dish-details-no-link").hidden = !dish || Boolean(recipeUrl);

    const dialog = select("#dish-details-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    select("#dish-details-close").focus();
  }

  function dishMenuEditorSignature() {
    return JSON.stringify({
      day: select("#dish-menu-day").value,
      meal: select("#dish-menu-meal").value,
      quantity: Number(select("#dish-menu-quantity").value),
      unit: select("#dish-menu-unit").value,
      people: [...select("#dish-menu-people").querySelectorAll("input:checked")]
        .map((input) => input.value)
        .sort(),
      notes: select("#dish-menu-notes").value.trim(),
    });
  }

  function updateDishMenuSaveState() {
    const button = select("#dish-details-save");
    if (button.hidden) return;
    button.disabled = state.dishDetailsScheduling
      ? false
      : !state.dishDetailsOriginal || dishMenuEditorSignature() === state.dishDetailsOriginal;
  }

  function updateDishMenuUnitValue() {
    const label = select("#dish-menu-unit-value");
    const show = !select("#dish-menu-editor").hidden && select("#dish-menu-unit").value === "unit";
    label.hidden = !show;
    label.textContent = show
      ? translatedTemplate("selected_unit", {
        unit: state.dishDetailsItemUnit === "unit"
          ? translate("units")
          : state.dishDetailsItemUnit,
      })
      : "";
  }

  function closeDishDetails() {
    state.dishDetailsMenuIndex = null;
    state.dishDetailsDishKey = null;
    state.dishDetailsOriginal = null;
    state.dishDetailsScheduling = false;
    const dialog = select("#dish-details-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function openDishScheduleEditor() {
    const dish = state.snapshot.dishes
      .find((candidate) => candidate.key === state.dishDetailsDishKey);
    if (!dish) return;
    state.dishDetailsScheduling = true;
    select("#dish-menu-editor").hidden = false;
    select("#dish-menu-editor-title").textContent = translate("schedule_dish");
    select("#dish-menu-editor-intro").textContent = translate("schedule_dish_intro");
    select("#dish-menu-day").innerHTML = dayOptions();
    select("#dish-menu-meal").innerHTML = state.snapshot.meals
      .map((meal) => `<option value="${escapeHtml(meal)}">${escapeHtml(meal)}</option>`)
      .join("");
    select("#dish-menu-quantity").value = "1";
    select("#dish-menu-notes").value = "";
    select("#dish-menu-unit").value = "portion";
    select("#dish-menu-people").innerHTML = state.snapshot.people.map((person, index) => {
      const selected = person.key === state.snapshot.profile
        || (!state.snapshot.profile && index === 0);
      return `
        <label class="dialog-person">
          <input type="checkbox" value="${escapeHtml(person.key)}" ${selected ? "checked" : ""}>
          <span>${escapeHtml(person.name)}</span>
        </label>`;
    }).join("");
    select("#dish-menu-people-error").hidden = true;
    select("#dish-details-schedule").hidden = true;
    select("#dish-details-schedule-cancel").hidden = false;
    select("#dish-details-save").hidden = false;
    select("#dish-details-save").disabled = false;
    select("#dish-details-save").textContent = translate("add_to_menu");
    updateDishMenuUnitValue();
    select("#dish-menu-editor").scrollIntoView({ behavior: "smooth", block: "nearest" });
    select("#dish-menu-day").focus();
  }

  function closeDishScheduleEditor() {
    state.dishDetailsScheduling = false;
    select("#dish-menu-editor").hidden = true;
    select("#dish-details-save").hidden = true;
    select("#dish-details-schedule-cancel").hidden = true;
    select("#dish-details-schedule").hidden = false;
  }

  function setMenuItemUnit() {
    const selected = state.snapshot.item_options.find((item) => item.key === select("#menu-item-select").value);
    select("#menu-item-unit").value = selected?.kind === "dish" ? "portion" : "g";
  }

  function openMenuItemDialog(day, meal, date) {
    state.menuCellDraft = { date, day, meal };
    select("#menu-item-context").textContent = `${date} · ${day} · ${meal}`;
    select("#menu-item-select").innerHTML = itemOptions("");
    const firstDish = state.snapshot.item_options.find((item) => item.kind === "dish");
    select("#menu-item-select").value = firstDish?.key || state.snapshot.item_options[0]?.key || "";
    const search = enhanceSearchableSelect(
      select("#menu-item-select"),
      translate("search_items"),
    );
    select("#menu-item-quantity").value = "1";
    select("#menu-item-notes").value = "";
    select("#menu-item-people-error").hidden = true;
    select("#menu-item-people").innerHTML = state.snapshot.people.map((person) => `
      <label class="dialog-person">
        <input type="checkbox" value="${escapeHtml(person.key)}" ${person.key === state.snapshot.profile ? "checked" : ""}>
        <span>${escapeHtml(person.name)}</span>
      </label>
    `).join("");
    setMenuItemUnit();
    const dialog = select("#menu-item-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    search?.focus();
  }

  function closeMenuItemDialog() {
    state.menuCellDraft = null;
    const dialog = select("#menu-item-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function mount() {
  selectAll('[data-menu-mode]').forEach((button) => button.addEventListener("click", () => {
    setMenuMode(button.dataset.menuMode);
  }));
  select("#menu-previous-week").addEventListener("click", () => {
    state.menuWeekOffset -= 1;
    renderMenu();
  });
  select("#menu-next-week").addEventListener("click", () => {
    state.menuWeekOffset += 1;
    renderMenu();
  });
  select("#profile-select").addEventListener("change", (event) => send("set-profile", { profile: event.target.value }));
  select("#show-selected-only").addEventListener("change", (event) => {
    state.menuSelectedOnly = event.target.checked;
    storage.setItem("homealacarte-menu-selected-only", String(state.menuSelectedOnly));
    renderMenu();
  });
  select("#empty-menu").addEventListener("click", () => {
    const dates = new Set(visibleWeek().map((entry) => entry.date));
    if (!state.draft.some((row) => dates.has(row.date))) return;
    openConfirmation({
      title: translate("empty_menu_confirm_title"),
      message: translate("empty_menu_confirm_message"),
      confirmLabel: translate("empty_menu"),
      action: () => {
        state.draft = state.draft.filter((row) => !dates.has(row.date));
        renderMenu();
        scheduleMenuUpdate();
      },
    });
  });
  select("#weekly-menu").addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".menu-entry-delete");
    if (deleteButton) {
      state.draft.splice(Number(deleteButton.dataset.index), 1);
      renderMenu();
      scheduleMenuUpdate();
      return;
    }
    const dishButton = event.target.closest(".menu-entry-dish");
    if (dishButton) {
      openDishDetails(
        decodeURIComponent(dishButton.dataset.dishKey),
        Number(dishButton.dataset.menuIndex),
      );
      return;
    }
    const addButton = event.target.closest(".menu-cell-add");
    if (addButton) openMenuItemDialog(addButton.dataset.day, addButton.dataset.meal, addButton.dataset.date);
  });
  select("#weekly-menu").addEventListener("dragstart", (event) => {
    const entry = event.target.closest("[data-menu-drag-index]");
    if (!entry) return;
    state.draggedMenuIndex = Number(entry.dataset.menuDragIndex);
    entry.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.dataset.menuDragIndex);
  });
  select("#weekly-menu").addEventListener("dragend", (event) => {
    event.target.closest("[data-menu-drag-index]")?.classList.remove("dragging");
    selectAll("#weekly-menu td.menu-drop-target").forEach((cell) => cell.classList.remove("menu-drop-target"));
    state.draggedMenuIndex = null;
  });
  select("#weekly-menu").addEventListener("dragover", (event) => {
    const cell = event.target.closest("[data-menu-drop-day]");
    if (!cell || state.draggedMenuIndex == null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    selectAll("#weekly-menu td.menu-drop-target").forEach((candidate) => {
      candidate.classList.remove("menu-drop-target");
    });
    cell.classList.add("menu-drop-target");
  });
  select("#weekly-menu").addEventListener("drop", (event) => {
    const cell = event.target.closest("[data-menu-drop-day]");
    const index = state.draggedMenuIndex ?? Number(event.dataTransfer.getData("text/plain"));
    const row = state.draft[index];
    if (!cell || !row) return;
    event.preventDefault();
    row.date = cell.dataset.menuDropDate;
    row.day = cell.dataset.menuDropDay;
    row.meal = cell.dataset.menuDropMeal;
    state.draggedMenuIndex = null;
    renderMenu();
    scheduleMenuUpdate();
  });
  select("#dish-details-close").addEventListener("click", closeDishDetails);
  select("#dish-details-done").addEventListener("click", closeDishDetails);
  select("#dish-details-ingredients").addEventListener("click", (event) => {
    const ingredient = event.target.closest("[data-dish-ingredient-details]");
    if (!ingredient) return;
    const key = decodeURIComponent(ingredient.dataset.dishIngredientDetails);
    closeDishDetails();
    openCatalogueItemDetails(key, "food");
  });
  select("#dish-details-dialog").addEventListener("close", () => {
    state.dishDetailsMenuIndex = null;
    state.dishDetailsDishKey = null;
    state.dishDetailsOriginal = null;
    state.dishDetailsScheduling = false;
  });
  select("#dish-menu-editor").addEventListener("input", updateDishMenuSaveState);
  select("#dish-menu-editor").addEventListener("change", () => {
    updateDishMenuUnitValue();
    updateDishMenuSaveState();
  });
  select("#dish-details-edit").addEventListener("click", () => {
    const dish = state.snapshot.dishes.find((candidate) => candidate.key === state.dishDetailsDishKey);
    if (!dish) return;
    const dishCopy = structuredClone(dish);
    closeDishDetails();
    openDishForm(dishCopy);
  });
  select("#dish-details-schedule").addEventListener("click", openDishScheduleEditor);
  select("#dish-details-schedule-cancel").addEventListener("click", closeDishScheduleEditor);
  select("#dish-details-save").addEventListener("click", () => {
    const people = [...select("#dish-menu-people").querySelectorAll("input:checked")]
      .map((input) => input.value);
    const quantity = Number(select("#dish-menu-quantity").value);
    if (!people.length) {
      select("#dish-menu-people-error").hidden = false;
      select("#dish-menu-people input").focus();
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      select("#dish-menu-quantity").focus();
      return;
    }
    if (state.dishDetailsScheduling) {
      const day = select("#dish-menu-day").value;
      const scheduledRow = buildScheduledDishRow({
        dishKey: state.dishDetailsDishKey,
        date: menuDateForDay(visibleWeek(), day),
        day,
        meal: select("#dish-menu-meal").value,
        people,
        quantity,
        quantityUnit: select("#dish-menu-unit").value,
        notes: select("#dish-menu-notes").value.trim(),
      });
      state.draft.push(scheduledRow);
      closeDishDetails();
      renderMenu();
      scheduleMenuUpdate();
      return;
    }
    const row = state.draft[state.dishDetailsMenuIndex];
    if (!row) return;
    row.people = people;
    row.day = select("#dish-menu-day").value;
    row.date = menuDateForDay(visibleWeek(), row.day);
    row.meal = select("#dish-menu-meal").value;
    row.quantity = quantity;
    row.quantity_unit = select("#dish-menu-unit").value;
    row.notes = select("#dish-menu-notes").value.trim();
    closeDishDetails();
    renderMenu();
    scheduleMenuUpdate();
  });
  select("#menu-item-select").addEventListener("change", setMenuItemUnit);
  select("#menu-item-close").addEventListener("click", closeMenuItemDialog);
  select("#menu-item-cancel").addEventListener("click", closeMenuItemDialog);
  select("#menu-item-dialog").addEventListener("close", () => {
    state.menuCellDraft = null;
  });
  select("#meal-replace-close").addEventListener("click", closeMealReplacement);
  select("#meal-replace-cancel").addEventListener("click", closeMealReplacement);
  select("#meal-replace-dialog").addEventListener("close", () => {
    state.pendingReplacementIndex = null;
  });
  select("#meal-replace-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const index = state.pendingReplacementIndex;
    const row = state.draft[index];
    const replacementKey = select("#meal-replace-select").value;
    const current = state.snapshot.item_options.find((item) => item.key === row?.item_key);
    const replacement = state.snapshot.item_options.find((item) => item.key === replacementKey);
    if (!row || !replacement) return;
    row.item_key = replacement.key;
    if (current?.kind !== replacement.kind) {
      row.quantity = 1;
      row.quantity_unit = replacement.kind === "dish" ? "portion" : "g";
    }
    closeMealReplacement();
    renderMenu();
    scheduleMenuUpdate();
  });
  select("#menu-item-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.menuCellDraft) return;
    const people = [...select("#menu-item-people").querySelectorAll("input:checked")].map((input) => input.value);
    if (!people.length) {
      select("#menu-item-people-error").hidden = false;
      select("#menu-item-people input").focus();
      return;
    }
    state.draft.push({
      date: state.menuCellDraft.date,
      day: state.menuCellDraft.day,
      meal: state.menuCellDraft.meal,
      item_key: select("#menu-item-select").value,
      people,
      quantity: Number(select("#menu-item-quantity").value),
      quantity_unit: select("#menu-item-unit").value,
      notes: select("#menu-item-notes").value.trim(),
    });
    closeMenuItemDialog();
    renderMenu();
    scheduleMenuUpdate();
  });
  }

  return {
    closeDishDetails,
    closeMealReplacement,
    closeMenuItemDialog,
    mount,
    openDishDetails,
    openMealReplacement,
    render: renderMenu,
  };
}

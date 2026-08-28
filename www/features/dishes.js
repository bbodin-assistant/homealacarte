import { countryFlag } from "../core/data-localization.js?v=homealacarte-80";
import {
  allergenCodesOverlap,
  allergenIcon,
  allergenLabel,
} from "../core/allergens.js?v=homealacarte-100";
import { matchesSelectedNutriScores } from "./dishes/filters.js?v=homealacarte-77";
import { dishStockAvailability } from "../core/stock-availability.js?v=homealacarte-77";

export { allergenCodesOverlap, allergenIcon, countryFlag };

export function dishPreferenceBadges(dish, people = [], language = "en") {
  const components = new Map((dish.components || []).map((component) => [component.key, component]));
  const badges = [];
  const favoritePeople = [];
  const forbiddenPeople = [];
  const allergyBadges = new Map();

  for (const person of people || []) {
    for (const rule of person.food_rules || []) {
      if (rule.kind === "favorite" && (rule.item_keys || []).includes(dish.key)) {
        favoritePeople.push(person.name);
      }
      if (rule.kind === "never") {
        const matchesDish = (rule.item_keys || []).some((key) => key === dish.key || components.has(key));
        if (matchesDish) forbiddenPeople.push(person.name);
      }
      if (rule.kind === "allergy") {
        for (const key of rule.item_keys || []) {
          const component = components.get(key);
          if (!component) continue;
          const label = component.name || key;
          const entry = allergyBadges.get(key) || { icon: allergenIcon(`${key} ${label}`), label, people: [] };
          entry.people.push(person.name);
          allergyBadges.set(key, entry);
        }
        for (const allergen of rule.allergens || []) {
          const matches = [...components.values()]
            .filter((component) => (component.allergens || [])
              .some((ingredientAllergen) => allergenCodesOverlap(allergen, ingredientAllergen)));
          if (!matches.length) continue;
          const entry = allergyBadges.get(`allergen:${allergen}`) || {
            icon: allergenIcon(allergen),
            label: allergenLabel(allergen, language),
            people: [],
          };
          entry.people.push(person.name);
          allergyBadges.set(`allergen:${allergen}`, entry);
        }
      }
    }
  }

  if (favoritePeople.length) {
    badges.push({ kind: "favorite", icon: "❤️", title: `Favorite: ${favoritePeople.join(", ")}` });
  }
  if (forbiddenPeople.length) {
    badges.push({ kind: "forbidden", icon: "⛔", title: `Forbidden: ${[...new Set(forbiddenPeople)].join(", ")}` });
  }
  for (const allergy of allergyBadges.values()) {
    badges.push({
      kind: "allergy",
      icon: allergy.icon,
      title: `${allergy.label}: ${[...new Set(allergy.people)].join(", ")}`,
    });
  }
  return badges;
}

export function dishRangeMaximums(dishes) {
  return {
    cost: Math.max(
      0.01,
      ...dishes.map((dish) => Math.ceil(Number(dish.per_serving.cost || 0) * 100) / 100),
    ),
    kcal: Math.max(
      1,
      ...dishes.map((dish) => Math.ceil(Number(dish.per_serving.kcal || 0))),
    ),
  };
}

export function filterDishes(dishes, filters) {
  const search = filters.search.toLowerCase().trim();
  return dishes.filter((dish) => {
    const matchesSearch = !search
      || `${dish.name} ${dish.key}`.toLowerCase().includes(search);
    return matchesSearch
      && matchesSelectedNutriScores(dish, filters.nutriScores)
      && dish.per_serving.cost >= filters.minimumCost
      && dish.per_serving.cost <= filters.maximumCost
      && dish.per_serving.kcal >= filters.minimumKcal
      && dish.per_serving.kcal <= filters.maximumKcal;
  });
}

export function createDishesFeature({
  state,
  select,
  selectAll,
  translate,
  escapeHtml,
  formatMoney,
  formatNumber,
  translatedTemplate,
  ingredientNutriScoreMissing,
  dishNutriScoreDetail,
  openDetails,
}) {
  function updateRangeTrack(pair) {
    const minimum = select(`#dish-${pair}-min`);
    const maximum = select(`#dish-${pair}-max`);
    const track = select(`[data-dual-range="${pair}"]`);
    if (!minimum || !maximum || !track) return;
    const range = Number(maximum.max) - Number(minimum.min);
    const start = range ? (Number(minimum.value) - Number(minimum.min)) / range * 100 : 0;
    const end = range ? (Number(maximum.value) - Number(minimum.min)) / range * 100 : 100;
    track.style.setProperty("--range-start", `${start}%`);
    track.style.setProperty("--range-end", `${end}%`);
  }

  function renderAudit() {
    const ingredients = state.snapshot.ingredients || [];
    const dishes = state.snapshot.dishes || [];
    const readyIngredients = ingredients
      .filter((ingredient) => ingredientNutriScoreMissing(ingredient) === 0).length;
    const readyDishes = dishes.filter((dish) => dish.nutri_score_computed).length;
    const missingValues = ingredients
      .reduce((total, ingredient) => total + ingredientNutriScoreMissing(ingredient), 0);
    select("#nutri-score-audit").innerHTML = `
      <strong>${escapeHtml(translate("nutri_score_audit_title"))}</strong>
      <span>${escapeHtml(translatedTemplate("nutri_score_audit_summary", {
        readyIngredients,
        totalIngredients: ingredients.length,
        readyDishes,
        totalDishes: dishes.length,
        missingValues,
      }))}</span>
    `;
  }

  function render() {
    renderAudit();
    const filters = {
      search: select("#dish-search").value,
      minimumCost: Number(select("#dish-cost-min").value),
      maximumCost: Number(select("#dish-cost-max").value),
      minimumKcal: Number(select("#dish-kcal-min").value),
      maximumKcal: Number(select("#dish-kcal-max").value),
      nutriScores: new Set(
        selectAll("[data-dish-nutri-score]:checked").map((input) => input.value),
      ),
    };
    select("#dish-cost-output").textContent =
      `${formatMoney(filters.minimumCost)} – ${formatMoney(filters.maximumCost)}`;
    select("#dish-kcal-output").textContent =
      `${formatNumber(filters.minimumKcal, 0)} – ${formatNumber(filters.maximumKcal, 0)} kcal`;
    updateRangeTrack("cost");
    updateRangeTrack("kcal");
    const dishes = filterDishes(state.snapshot.dishes, filters);
    select("#dish-grid").innerHTML = dishes.map((dish) => {
      const availability = dishStockAvailability(dish, state.stockDraft);
      const portions = Math.floor(availability.portions * 10) / 10;
      const limitingIngredient = dish.components
        .find((component) => component.key === availability.limitingKey)?.name || "";
      const originFlag = countryFlag(dish.origin_country);
      const preferenceBadges = dishPreferenceBadges(dish, state.snapshot.people || [], state.language);
      const badgeMarkup = preferenceBadges.map((badge) =>
        `<span class="dish-preference-badge ${escapeHtml(badge.kind)}" title="${escapeHtml(badge.title)}" aria-label="${escapeHtml(badge.title)}">${badge.icon}</span>`).join("");
      return `
        <article class="dish-card${preferenceBadges.some((badge) => badge.kind === "allergy" || badge.kind === "forbidden") ? " preference-warning" : ""}">
          <button class="dish-card-open" type="button" data-dish-key="${escapeHtml(encodeURIComponent(dish.key))}">
            <div class="dish-title"><h2>${originFlag ? `<span class="dish-origin-flag" title="${escapeHtml(dish.origin_country)}" aria-hidden="true">${originFlag}</span> ` : ""}${escapeHtml(dish.name)}${badgeMarkup ? ` <span class="dish-preference-badges">${badgeMarkup}</span>` : ""}</h2></div>
            <div class="dish-metrics">
              <div><strong>${formatNumber(dish.per_serving.kcal, 0)}</strong><span>kcal · ${escapeHtml(translate("per_serving"))}</span></div>
              ${dish.nutri_score
                ? `<div class="nutri-score metric-${escapeHtml(dish.nutri_score.toLowerCase())}" title="${escapeHtml(dishNutriScoreDetail(dish))}"><strong>${escapeHtml(dish.nutri_score)}</strong><span>Nutri-Score${dish.nutri_score_computed ? " · auto" : ""}</span></div>`
                : `<div class="nutri-score-missing" title="${escapeHtml(dishNutriScoreDetail(dish))}"><strong>—</strong><span>${escapeHtml(translatedTemplate("nutri_score_values_missing", { count: dish.nutri_score_missing_values }))}</span></div>`}
              <div><strong>${formatMoney(dish.per_serving.cost)}</strong><span>${escapeHtml(translate("cost"))} · ${escapeHtml(translate("per_serving"))}</span></div>
            </div>
            <div class="dish-stock-availability ${portions > 0 ? "available" : "unavailable"}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M6 8l1 11h10l1-11M9 8V5h6v3"/></svg>
              <span>${escapeHtml(translatedTemplate("dish_stock_portions", { count: formatNumber(portions, 1) }))}</span>
              ${limitingIngredient ? `<small>${escapeHtml(translatedTemplate("limited_by", { item: limitingIngredient }))}</small>` : ""}
            </div>
          </button>
        </article>`;
    }).join("") || `<p>${translate("empty")}</p>`;
  }

  function configureRanges() {
    const maximums = dishRangeMaximums(state.snapshot.dishes);
    const signature = `${maximums.cost}|${maximums.kcal}`;
    if (state.dishRangeSignature === signature) return;
    state.dishRangeSignature = signature;
    Object.entries(maximums).forEach(([pair, maximum]) => {
      const minimumControl = select(`#dish-${pair}-min`);
      const maximumControl = select(`#dish-${pair}-max`);
      minimumControl.max = String(maximum);
      maximumControl.max = String(maximum);
      minimumControl.value = "0";
      maximumControl.value = String(maximum);
      updateRangeTrack(pair);
    });
  }

  function updateRange(changedControl) {
    const pair = changedControl?.id?.includes("kcal") ? "kcal" : "cost";
    const minimum = select(`#dish-${pair}-min`);
    const maximum = select(`#dish-${pair}-max`);
    if (Number(minimum.value) > Number(maximum.value)) {
      if (changedControl === minimum) maximum.value = minimum.value;
      else minimum.value = maximum.value;
    }
    updateRangeTrack(pair);
    render();
  }

  select(".dish-filter-panel").addEventListener("input", (event) => {
    if (event.target.matches("input[type='range']")) updateRange(event.target);
    else if (event.target.matches("input")) render();
  });
  select("#dish-clear-filters").addEventListener("click", () => {
    select("#dish-search").value = "";
    select("#dish-cost-min").value = "0";
    select("#dish-cost-max").value = select("#dish-cost-max").max;
    select("#dish-kcal-min").value = "0";
    select("#dish-kcal-max").value = select("#dish-kcal-max").max;
    selectAll("[data-dish-nutri-score]").forEach((input) => {
      input.checked = false;
    });
    updateRange(select("#dish-cost-min"));
    updateRangeTrack("kcal");
  });
  select("#dish-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-dish-key]");
    if (button) openDetails(decodeURIComponent(button.dataset.dishKey), Number.NaN);
  });

  return { configureRanges, render };
}

export function scaledDishComponentQuantity(component, portions) {
  const quantity = Number(component?.quantity);
  const multiplier = Number(portions);
  if (!Number.isFinite(quantity) || !Number.isFinite(multiplier) || multiplier <= 0) return 0;
  return quantity * multiplier;
}

export function preferredDishDetailPortions(state, dish) {
  const index = state?.dishDetailsMenuIndex;
  const row = Number.isInteger(index) ? state?.draft?.[index] : null;
  if (row?.item_key === dish?.key && row.quantity_unit === "portion") {
    const quantity = Number(row.quantity);
    if (Number.isFinite(quantity) && quantity > 0) return quantity;
  }
  const servings = Number(dish?.servings);
  return Number.isFinite(servings) && servings > 0 ? servings : 1;
}

export function createDetailRefinements({
  state,
  documentRef,
  translate,
  escapeHtml,
  formatMoney,
  formatNumber,
  dishNutriScoreDetail,
}) {
  const select = (selector) => documentRef.querySelector(selector);

  function installStyles() {
    if (documentRef.querySelector("link[data-detail-refinements]")) return;
    const link = documentRef.createElement("link");
    link.rel = "stylesheet";
    link.href = "./styles/detail-refinements.css?v=homealacarte-113";
    link.dataset.detailRefinements = "";
    documentRef.head.append(link);
  }

  function renderRecipeLink() {
    const recipeLink = select("#dish-details-recipe-link");
    const recipeUrlLabel = select("#dish-details-url");
    if (recipeUrlLabel) recipeUrlLabel.hidden = true;
    if (!recipeLink || recipeLink.hidden) return;
    const recipeUrl = recipeLink.getAttribute("href");
    if (!recipeUrl) return;

    const url = documentRef.createElement("span");
    url.className = "dish-details-recipe-url";
    url.textContent = recipeUrl;
    const arrow = documentRef.createElement("span");
    arrow.className = "dish-details-recipe-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    recipeLink.replaceChildren(url, arrow);
    recipeLink.title = recipeUrl;
    recipeLink.setAttribute("aria-label", `${translate("open_recipe")}: ${recipeUrl}`);
    recipeLink.removeAttribute("data-i18n");
  }

  function ensureHealthLayout() {
    const content = select("#dish-details-dialog .dish-details-content");
    const ingredients = select("#dish-details-ingredients-section");
    const allergens = select("#dish-details-allergens-section");
    let status = select("#dish-details-nutri-status");
    if (!content || !ingredients || !allergens || !status) return null;

    if (status.tagName === "P") {
      const replacement = documentRef.createElement("div");
      replacement.id = status.id;
      replacement.className = status.className;
      replacement.hidden = status.hidden;
      replacement.textContent = status.textContent;
      status.replaceWith(replacement);
      status = replacement;
    }

    let health = content.querySelector(".dish-details-health");
    if (!health) {
      health = documentRef.createElement("div");
      health.className = "dish-details-health";
      content.insertBefore(health, ingredients);
    }
    health.append(allergens, status);
    return { health, status, allergens };
  }

  function renderMetrics(dish) {
    const metrics = select("#dish-details-metrics");
    const nutrients = dish?.per_serving;
    if (!metrics || !nutrients) return;
    const rows = [
      [formatNumber(nutrients.kcal, 0), `kcal · ${translate("per_serving")}`],
      [`${formatNumber(nutrients.grams, 0)} g`, translate("per_serving")],
      [`${formatNumber(nutrients.protein_g)} g`, translate("protein")],
      [`${formatNumber(nutrients.carbs_g)} g`, translate("carbs")],
      [`${formatNumber(nutrients.fat_g)} g`, translate("fat")],
      [`${formatNumber(nutrients.fiber_g)} g`, translate("fiber")],
      [formatMoney(nutrients.cost), `${translate("cost")} · ${translate("per_serving")}`],
    ];
    metrics.innerHTML = rows.map(([value, label]) => `
      <div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>
    `).join("");
  }

  function renderHealth(dish) {
    const layout = ensureHealthLayout();
    if (!layout) return;
    const { health, status, allergens } = layout;
    if (!dish) {
      health.hidden = true;
      return;
    }

    const detail = dishNutriScoreDetail(dish);
    const letter = String(dish.nutri_score || "").toUpperCase();
    const scoreClass = /^[A-E]$/.test(letter) ? `metric-${letter.toLowerCase()}` : "metric-unknown";
    status.hidden = false;
    status.innerHTML = `
      <details class="dish-nutri-disclosure">
        <summary title="${escapeHtml(detail)}">
          <span class="dish-nutri-score-badge ${scoreClass}">${escapeHtml(letter || "—")}</span>
          <span>Nutri-Score</span>
          <span class="dish-nutri-info" aria-hidden="true">i</span>
        </summary>
        <p>${escapeHtml(detail)}</p>
      </details>`;
    health.hidden = status.hidden && allergens.hidden;
  }

  function renderIngredients(dish, portions) {
    const list = select("#dish-details-ingredients");
    if (!list || !dish) return;
    list.innerHTML = (dish.components || []).map((component) => `
      <li>
        <button class="dish-details-ingredient" type="button" data-dish-ingredient-details="${escapeHtml(encodeURIComponent(component.key))}">
          <span>
            <strong>${escapeHtml(component.name)}</strong>
            ${component.source_quantity ? `<small>${escapeHtml(component.source_quantity)}</small>` : ""}
          </span>
          <span data-dish-component-quantity>${formatNumber(scaledDishComponentQuantity(component, portions))} ${escapeHtml(component.quantity_unit)}</span>
        </button>
      </li>
    `).join("");
  }

  function configurePortions(dish) {
    const section = select("#dish-details-ingredients-section");
    if (!section || !dish) return;
    const title = section.querySelector("h3");
    if (!title) return;

    let heading = section.querySelector(".dish-ingredients-heading");
    if (!heading) {
      heading = documentRef.createElement("div");
      heading.className = "dish-ingredients-heading";
      title.parentNode.insertBefore(heading, title);
      heading.append(title);
    }

    let toolbar = heading.querySelector(".dish-portion-toolbar");
    if (!toolbar) {
      toolbar = documentRef.createElement("div");
      toolbar.className = "dish-portion-toolbar";
      heading.append(toolbar);
    }
    toolbar.innerHTML = `
      <label class="dish-portion-control">
        <span>${escapeHtml(translate("portions"))}</span>
        <input type="number" min="0.25" step="0.25" inputmode="decimal" data-dish-details-portions>
      </label>`;

    const input = toolbar.querySelector("[data-dish-details-portions]");
    const initialPortions = preferredDishDetailPortions(state, dish);
    input.value = String(initialPortions);
    renderIngredients(dish, initialPortions);
    input.addEventListener("input", () => {
      const portions = Number(input.value);
      if (!Number.isFinite(portions) || portions <= 0) return;
      renderIngredients(dish, portions);
    });
  }

  function apply() {
    renderRecipeLink();
    const dishKey = state?.dishDetailsDishKey;
    const dish = (state?.snapshot?.dishes || []).find((candidate) => candidate.key === dishKey);
    renderHealth(dish || null);
    if (!dish) return;
    renderMetrics(dish);
    configurePortions(dish);
  }

  function mount() {
    installStyles();
    const dialog = select("#dish-details-dialog");
    if (!dialog || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      if (dialog.hasAttribute("open")) apply();
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    if (dialog.hasAttribute("open")) apply();
  }

  return { mount };
}

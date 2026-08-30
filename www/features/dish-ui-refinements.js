export function nutriScoreAuditHasProblems(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  const numbers = [...value.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (numbers.length < 5) return true;
  const [readyIngredients, totalIngredients, readyDishes, totalDishes, missingValues] = numbers;
  return readyIngredients < totalIngredients
    || readyDishes < totalDishes
    || missingValues > 0;
}

export function updateNutriScoreAuditVisibility(documentRef = document) {
  const audit = documentRef.querySelector("#nutri-score-audit");
  if (!audit) return;
  audit.hidden = !nutriScoreAuditHasProblems(audit.textContent);
}

export function installDishUiRefinements(documentRef = document) {
  if (!documentRef.querySelector("style[data-dish-ui-refinements]")) {
    const style = documentRef.createElement("style");
    style.dataset.dishUiRefinements = "";
    style.textContent = `
      #dish-details-recipe-link {
        background: var(--accent) !important;
        border-color: var(--accent) !important;
      }
      #dish-details-recipe-link:hover,
      #dish-details-recipe-link:focus-visible {
        background: var(--accent-dark) !important;
        border-color: var(--accent-dark) !important;
      }
      .dish-details-health {
        align-items: center !important;
      }
      .dish-details-health > .nutri-score-detail,
      .dish-details-health #dish-details-allergens-section {
        align-self: center !important;
      }
      .dish-details-health #dish-details-allergens-section h3 {
        display: none !important;
      }
    `;
    documentRef.head.append(style);
  }

  documentRef.addEventListener("click", (event) => {
    const disclosure = documentRef.querySelector("#dish-details-nutri-status .dish-nutri-disclosure[open]");
    if (!disclosure || disclosure.contains(event.target)) return;
    disclosure.removeAttribute("open");
  });

  const audit = documentRef.querySelector("#nutri-score-audit");
  if (audit && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => updateNutriScoreAuditVisibility(documentRef))
      .observe(audit, { childList: true, subtree: true, characterData: true });
  }
  updateNutriScoreAuditVisibility(documentRef);
}

if (typeof document !== "undefined") {
  installDishUiRefinements(document);
}

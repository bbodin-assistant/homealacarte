export function disabledAutoMenuDishReason(disabled, detailText = "") {
  if (!disabled) return "";
  return /\bkcal\b/i.test(String(detailText)) ? "already-scheduled" : "not-main-meal";
}

export function menuGeneratorRefinementCopy(language, key) {
  const french = String(language || "").toLowerCase().startsWith("fr");
  const copy = french ? {
    "already-scheduled": "Déjà planifié cette semaine",
    "not-main-meal": "Ce plat n’est pas autorisé comme déjeuner ou dîner",
  } : {
    "already-scheduled": "Already scheduled this week",
    "not-main-meal": "This dish is not enabled for lunch or dinner",
  };
  return copy[key] || "";
}

export const MENU_GENERATOR_REFINEMENT_CSS = `
  @media (min-width: 1181px) {
    .auto-menu-parameters {
      grid-template-columns: repeat(4, minmax(105px, 1fr)) minmax(270px, 1.55fr);
      align-items: stretch;
    }
    .auto-menu-parameters .auto-menu-toggle {
      grid-column: auto;
      min-width: 0;
      align-self: stretch;
      align-items: center;
    }
  }

  .auto-menu-dish.used {
    opacity: .72;
    background: color-mix(in srgb, var(--paper) 72%, var(--surface));
  }
  .auto-menu-dish.used small[data-auto-dish-disabled-reason] {
    max-width: 155px;
    color: var(--accent-dark);
    font-weight: 800;
    line-height: 1.3;
    text-align: right;
    white-space: normal;
  }

  .food-rule-item-selection {
    max-height: 104px;
    align-content: flex-start;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  @media (min-width: 701px) {
    .family-food-rule {
      align-items: start;
    }
    .family-food-rule > label,
    .family-food-rule > .food-rule-items-field {
      align-self: start;
    }
    .family-food-rule .remove-food-rule {
      align-self: start;
    }
  }
`;

function language(documentRef) {
  return documentRef.documentElement.lang || globalThis.navigator?.language || "en";
}

export function decorateDisabledAutoMenuDishes(documentRef = document) {
  const currentLanguage = language(documentRef);
  documentRef.querySelectorAll("#auto-menu-dishes .auto-menu-dish").forEach((label) => {
    const input = label.querySelector("input[data-auto-dish-key]");
    const detail = label.querySelector("small");
    const name = label.querySelector("strong")?.textContent?.trim() || "";
    if (!input || !detail || !input.disabled) return;

    const reason = disabledAutoMenuDishReason(true, detail.textContent);
    const reasonText = menuGeneratorRefinementCopy(currentLanguage, reason);
    if (!reasonText) return;

    detail.dataset.autoDishDisabledReason = reason;
    if (detail.textContent !== reasonText) detail.textContent = reasonText;
    label.title = reasonText;
    input.setAttribute("aria-label", name ? `${name} — ${reasonText}` : reasonText);
  });
}

function installStyles(documentRef) {
  if (documentRef.querySelector("#menu-generator-refinement-styles")) return;
  const style = documentRef.createElement("style");
  style.id = "menu-generator-refinement-styles";
  style.textContent = MENU_GENERATOR_REFINEMENT_CSS;
  documentRef.head.append(style);
}

export function installMenuGeneratorRefinements(documentRef = document) {
  installStyles(documentRef);
  const dishes = documentRef.querySelector("#auto-menu-dishes");
  const refresh = () => decorateDisabledAutoMenuDishes(documentRef);
  if (dishes && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => queueMicrotask(refresh))
      .observe(dishes, { childList: true, subtree: true });
  }
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(() => queueMicrotask(refresh))
      .observe(documentRef.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }
  documentRef.querySelector("#language-select")?.addEventListener("change", () => queueMicrotask(refresh));
  refresh();
}

if (typeof document !== "undefined") {
  installMenuGeneratorRefinements(document);
}

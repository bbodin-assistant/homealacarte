import {
  ALLERGEN_CODES,
  allergenIconSvg,
  allergenLabel,
} from "../../core/allergens.js?v=homealacarte-100";

export function ingredientAllergenOptions(selectedAllergens, language, escapeHtml) {
  const selected = new Set(selectedAllergens || []);
  return ALLERGEN_CODES.map((code) => `
    <label class="ingredient-allergen-option">
      <input type="checkbox" value="${escapeHtml(code)}" ${selected.has(code) ? "checked" : ""}>
      <span aria-hidden="true">${allergenIconSvg(code)}</span>
      <strong>${escapeHtml(allergenLabel(code, language))}</strong>
    </label>`).join("");
}

export function ingredientAllergenBadges(allergens, language, escapeHtml) {
  if (!allergens?.length) return "";
  const label = allergens.map((code) => allergenLabel(code, language)).join(", ");
  return `<span class="item-allergen-badges" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
    ${allergens.map((code) => `<span title="${escapeHtml(allergenLabel(code, language))}">${allergenIconSvg(code)}</span>`).join("")}
  </span>`;
}

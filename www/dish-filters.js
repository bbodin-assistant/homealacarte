export const NUTRI_SCORES = ["A", "B", "C", "D", "E"];

export function matchesSelectedNutriScores(dish, selectedScores) {
  const selected = selectedScores instanceof Set
    ? selectedScores
    : new Set(selectedScores || []);
  const score = String(dish?.nutri_score || "").toUpperCase() || "UNKNOWN";
  return selected.size === 0 || selected.has(score);
}

const NUTRI_SCORE_FIELDS = [
  "sugars_g",
  "saturated_fat_g",
  "salt_g",
  "fruit_vegetable_legume_percent",
];

export const ingredientNutriScoreMissing = (ingredient) =>
  NUTRI_SCORE_FIELDS.filter((field) => ingredient[field] == null).length;

export function createDishNutriScoreDetail(translatedTemplate) {
  return (dish) => {
    if (dish.nutri_score_computed) {
      return translatedTemplate("nutri_score_computed_detail", {
        value: dish.nutri_score_value,
      });
    }
    return translatedTemplate(
      dish.nutri_score ? "nutri_score_manual_detail" : "nutri_score_unavailable_detail",
      {
        values: dish.nutri_score_missing_values,
        ingredients: dish.nutri_score_missing_ingredients,
      },
    );
  };
}

use crate::model::{Dish, Ingredient, Nutrients};
use std::collections::{HashMap, HashSet};

pub(super) fn ingredient_nutrients(ingredient: &Ingredient, grams: f64) -> Nutrients {
    let factor = grams / ingredient.grams;
    Nutrients {
        grams,
        kcal: ingredient.kcal * factor,
        protein_g: ingredient.protein_g * factor,
        carbs_g: ingredient.carbs_g * factor,
        fat_g: ingredient.fat_g * factor,
        fiber_g: ingredient.fiber_g * factor,
        cost: ingredient.price_for_grams(grams),
    }
}

pub(super) fn dish_nutrients(
    dish: &Dish,
    ingredients: &HashMap<String, &Ingredient>,
) -> Result<Nutrients, String> {
    let mut total = Nutrients::default();
    for component in &dish.components {
        let ingredient = ingredients
            .get(&component.item_key)
            .ok_or_else(|| format!("dish {} references missing ingredient {}", dish.key, component.item_key))?;
        total.add(ingredient_nutrients(ingredient, component.grams));
    }
    Ok(total.scaled(1.0 / dish.servings))
}

#[derive(Debug, Clone, Copy)]
pub(super) struct CalculatedNutriScore {
    pub(super) letter: char,
    pub(super) value: i32,
}

fn points_above(value: f64, thresholds: &[f64]) -> i32 {
    thresholds.iter().filter(|threshold| value > **threshold).count() as i32
}

fn ingredient_nutri_score_missing(ingredient: &Ingredient) -> usize {
    [
        ingredient.sugars_g,
        ingredient.saturated_fat_g,
        ingredient.salt_g,
        ingredient.fruit_vegetable_legume_percent,
    ]
    .into_iter()
    .filter(Option::is_none)
    .count()
}

pub(super) fn dish_nutri_score(
    dish: &Dish,
    ingredients: &HashMap<String, &Ingredient>,
) -> Result<(Option<CalculatedNutriScore>, usize, usize), String> {
    let mut missing_values = 0;
    let mut missing_ingredients = 0;
    let mut checked_ingredients = HashSet::new();
    for component in &dish.components {
        let ingredient = ingredients
            .get(&component.item_key)
            .ok_or_else(|| format!("dish {} references missing ingredient {}", dish.key, component.item_key))?;
        if !checked_ingredients.insert(ingredient.key.as_str()) {
            continue;
        }
        let missing = ingredient_nutri_score_missing(ingredient);
        missing_values += missing;
        missing_ingredients += usize::from(missing > 0);
    }
    if missing_values > 0 {
        return Ok((None, missing_values, missing_ingredients));
    }

    let total_grams = dish.components.iter().map(|component| component.grams).sum::<f64>();
    if total_grams <= 0.0 {
        return Ok((None, 0, 0));
    }
    let mut energy_kj = 0.0;
    let mut sugars = 0.0;
    let mut saturated_fat = 0.0;
    let mut salt = 0.0;
    let mut protein = 0.0;
    let mut fibre = 0.0;
    let mut fruit_vegetable_legume = 0.0;
    for component in &dish.components {
        let ingredient = ingredients[&component.item_key];
        let factor = component.grams / ingredient.grams;
        energy_kj += ingredient.kcal * 4.184 * factor;
        sugars += ingredient.sugars_g.unwrap_or_default() * factor;
        saturated_fat += ingredient.saturated_fat_g.unwrap_or_default() * factor;
        salt += ingredient.salt_g.unwrap_or_default() * factor;
        protein += ingredient.protein_g * factor;
        fibre += ingredient.fiber_g * factor;
        fruit_vegetable_legume += component.grams
            * ingredient.fruit_vegetable_legume_percent.unwrap_or_default()
            / 100.0;
    }
    let per_100g = 100.0 / total_grams;
    let energy_points = points_above(
        energy_kj * per_100g,
        &[335.0, 670.0, 1005.0, 1340.0, 1675.0, 2010.0, 2345.0, 2680.0, 3015.0, 3350.0],
    );
    let saturated_fat_points = points_above(
        saturated_fat * per_100g,
        &[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
    );
    let sugars_points = points_above(
        sugars * per_100g,
        &[3.4, 6.8, 10.0, 14.0, 17.0, 20.0, 24.0, 27.0, 31.0, 34.0, 37.0, 41.0, 44.0, 48.0, 51.0],
    );
    let salt_points = points_above(
        salt * per_100g,
        &[0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0],
    );
    let negative = energy_points + saturated_fat_points + sugars_points + salt_points;
    let protein_points = points_above(
        protein * per_100g,
        &[2.4, 4.8, 7.2, 9.6, 12.0, 14.0, 17.0],
    );
    let fibre_points = points_above(fibre * per_100g, &[3.0, 4.1, 5.2, 6.3, 7.4]);
    let fruit_vegetable_legume_percent = fruit_vegetable_legume / total_grams * 100.0;
    let fruit_vegetable_legume_points = if fruit_vegetable_legume_percent > 80.0 {
        5
    } else if fruit_vegetable_legume_percent > 60.0 {
        2
    } else if fruit_vegetable_legume_percent > 40.0 {
        1
    } else {
        0
    };
    let value = negative
        - fibre_points
        - fruit_vegetable_legume_points
        - if negative < 11 { protein_points } else { 0 };
    let letter = match value {
        i32::MIN..=0 => 'A',
        1..=2 => 'B',
        3..=10 => 'C',
        11..=18 => 'D',
        _ => 'E',
    };
    Ok((Some(CalculatedNutriScore { letter, value }), 0, 0))
}

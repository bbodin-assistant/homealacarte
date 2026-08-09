use crate::model::{Dataset, Dish, Ingredient, MenuRow};
use std::collections::HashMap;

pub(crate) const EPSILON: f64 = 1e-6;
pub(crate) const DEVIATION_WEIGHT: f64 = 0.0001;
pub(crate) const SOLVE_TIME_LIMIT_SECONDS: f64 = 5.0;

pub(crate) fn ingredient_row_grams(row: &MenuRow, ingredient: &Ingredient) -> f64 {
    match row.quantity_unit.as_str() {
        "g" => row.quantity,
        "unit" => row.quantity * ingredient.grams_per_measure_unit,
        _ => row.quantity * ingredient.grams,
    }
}

pub(crate) fn dish_row_portions(row: &MenuRow, dish: &Dish) -> f64 {
    match row.quantity_unit.as_str() {
        "portion" => row.quantity,
        "g" => {
            let grams_per_serving =
                dish.components.iter().map(|component| component.grams).sum::<f64>()
                    / dish.servings;
            row.quantity / grams_per_serving
        }
        _ => row.quantity,
    }
}

pub(crate) fn ingredient_kcal(ingredient: &Ingredient, grams: f64) -> f64 {
    ingredient.kcal * grams / ingredient.grams
}

pub(crate) fn dish_kcal(dish: &Dish, ingredients: &HashMap<&str, &Ingredient>) -> Result<f64, String> {
    let mut kcal = 0.0;
    for component in &dish.components {
        let ingredient = ingredients.get(component.item_key.as_str()).ok_or_else(|| {
            format!(
                "dish {} references missing ingredient {}",
                dish.key, component.item_key
            )
        })?;
        kcal += ingredient_kcal(ingredient, component.grams);
    }
    Ok(kcal / dish.servings)
}

pub(crate) fn existing_daily_kcal(
    dataset: &Dataset,
    ingredients: &HashMap<&str, &Ingredient>,
    dishes: &HashMap<&str, &Dish>,
    person_key: &str,
    day: &str,
) -> Result<f64, String> {
    let mut kcal = 0.0;
    for row in dataset
        .menu
        .iter()
        .filter(|row| row.day == day && row.people.iter().any(|person| person == person_key))
    {
        if let Some(ingredient) = ingredients.get(row.item_key.as_str()) {
            kcal += ingredient_kcal(ingredient, ingredient_row_grams(row, ingredient));
        } else if let Some(dish) = dishes.get(row.item_key.as_str()) {
            kcal += dish_kcal(dish, ingredients)? * dish_row_portions(row, dish);
        }
    }
    Ok(kcal)
}

pub(crate) fn fixed_ingredient_requirements(
    dataset: &Dataset,
    ingredients: &HashMap<&str, &Ingredient>,
    dishes: &HashMap<&str, &Dish>,
) -> HashMap<String, f64> {
    let mut requirements = HashMap::new();
    for row in &dataset.menu {
        let people_count = row.people.len() as f64;
        if let Some(ingredient) = ingredients.get(row.item_key.as_str()) {
            *requirements.entry(row.item_key.clone()).or_insert(0.0) +=
                ingredient_row_grams(row, ingredient) * people_count;
        } else if let Some(dish) = dishes.get(row.item_key.as_str()) {
            let portions = dish_row_portions(row, dish) * people_count;
            for component in &dish.components {
                *requirements.entry(component.item_key.clone()).or_insert(0.0) +=
                    component.grams / dish.servings * portions;
            }
        }
    }
    for (key, quantity) in &dataset.household_needs {
        if let Some(ingredient) = ingredients.get(key.as_str()) {
            *requirements.entry(key.clone()).or_insert(0.0) +=
                quantity * ingredient.grams_per_measure_unit;
        }
    }
    requirements
}

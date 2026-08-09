use crate::model::{Dish, Ingredient, MenuRow};

pub(crate) fn menu_multiplier(
    row: &MenuRow,
    ingredient: Option<&Ingredient>,
    dish: Option<&Dish>,
) -> f64 {
    match row.quantity_unit.as_str() {
        "portion" => row.quantity,
        "g" => {
            if let Some(ingredient) = ingredient {
                row.quantity / ingredient.grams
            } else if let Some(dish) = dish {
                let grams_per_serving =
                    dish.components.iter().map(|item| item.grams).sum::<f64>() / dish.servings;
                row.quantity / grams_per_serving
            } else {
                row.quantity
            }
        }
        "unit" => ingredient
            .map(|item| row.quantity * item.grams_per_measure_unit / item.grams)
            .unwrap_or(row.quantity),
        _ => row.quantity,
    }
}

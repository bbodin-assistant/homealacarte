use crate::model::{Dataset, Dish, Ingredient};
use std::collections::{BTreeSet, HashMap};

pub(crate) const MAX_DAILY_CANDIDATES: usize = 10;
pub(crate) const MAX_WEEKLY_DISH_USES: usize = 1;
pub(crate) const VARIETY_WEIGHT: f64 = 5.0;

pub(crate) fn dish_retail_cost(dish: &Dish, ingredients: &HashMap<&str, &Ingredient>) -> f64 {
    dish.components
        .iter()
        .filter_map(|component| {
            ingredients.get(component.item_key.as_str()).map(|ingredient| {
                component.grams * ingredient.price_per_kg / 1000.0 / dish.servings
            })
        })
        .sum()
}

pub(crate) fn shortlist_daily_candidates(
    candidates: &[usize],
    minimum_count: usize,
    dataset: &Dataset,
    ingredients: &HashMap<&str, &Ingredient>,
    kcal_values: &[f64],
    weekly_uses: &HashMap<String, usize>,
) -> Vec<usize> {
    let limit = MAX_DAILY_CANDIDATES.max(minimum_count);
    if candidates.len() <= limit {
        return candidates.to_vec();
    }
    let mut by_cost = candidates.to_vec();
    by_cost.sort_by(|left, right| {
        let left_cost = dish_retail_cost(&dataset.dishes[*left], ingredients)
            + weekly_uses.get(&dataset.dishes[*left].key).copied().unwrap_or(0) as f64
                * VARIETY_WEIGHT;
        let right_cost = dish_retail_cost(&dataset.dishes[*right], ingredients)
            + weekly_uses.get(&dataset.dishes[*right].key).copied().unwrap_or(0) as f64
                * VARIETY_WEIGHT;
        left_cost
            .total_cmp(&right_cost)
            .then_with(|| dataset.dishes[*left].key.cmp(&dataset.dishes[*right].key))
    });
    let mut by_kcal = candidates.to_vec();
    by_kcal.sort_by(|left, right| {
        kcal_values[*left]
            .total_cmp(&kcal_values[*right])
            .then_with(|| dataset.dishes[*left].key.cmp(&dataset.dishes[*right].key))
    });

    let mut selected = BTreeSet::new();
    let calorie_reserve = 8.min(limit / 2);
    for index in by_cost.iter().take(limit - calorie_reserve) {
        selected.insert(*index);
    }
    for index in by_kcal.iter().take(calorie_reserve / 2) {
        selected.insert(*index);
    }
    for index in by_kcal.iter().rev().take(calorie_reserve / 2) {
        selected.insert(*index);
    }
    for index in by_cost {
        if selected.len() >= limit {
            break;
        }
        selected.insert(index);
    }
    selected.into_iter().collect()
}

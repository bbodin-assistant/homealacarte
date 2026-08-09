use crate::loader::{
    FOOD_RULE_DAYS, food_rule_meal_name, localized_days, merge_menu_rows,
};
use crate::model::{AutoMenuAvailability, Dataset, Dish, Ingredient, MenuRow, Person};
use std::collections::{BTreeSet, HashMap, HashSet};

pub(crate) const EPSILON: f64 = 1e-6;
pub(crate) const DEVIATION_WEIGHT: f64 = 0.0001;
pub(crate) const SOLVE_TIME_LIMIT_SECONDS: f64 = 5.0;
pub(crate) const MAX_DAILY_CANDIDATES: usize = 10;
pub(crate) const MAX_WEEKLY_DISH_USES: usize = 2;
pub(crate) const VARIETY_WEIGHT: f64 = 5.0;

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

pub(crate) fn rule_matches_meal(rule_meal: &str, meal: &str, language: &str) -> bool {
    rule_meal == "any"
        || food_rule_meal_name(rule_meal, language).is_some_and(|value| value == meal)
}

pub(crate) fn person_forbids_item(
    person: &Person,
    item_key: &str,
    meal: &str,
    language: &str,
    dishes: &HashMap<&str, &Dish>,
) -> bool {
    person.food_rules.iter().any(|rule| {
        if rule.kind != "never" || !rule_matches_meal(&rule.meal, meal, language) {
            return false;
        }
        rule.item_keys.iter().any(|forbidden| {
            forbidden == item_key
                || dishes.get(item_key).is_some_and(|dish| {
                    dish.components
                        .iter()
                        .any(|component| &component.item_key == forbidden)
                })
        })
    })
}

pub(crate) fn routine_rows(
    dataset: &Dataset,
    language: &str,
    availability: &[AutoMenuAvailability],
    selected_days: &HashSet<String>,
) -> Result<Vec<MenuRow>, String> {
    let people = dataset
        .people
        .iter()
        .map(|person| (person.key.as_str(), person))
        .collect::<HashMap<_, _>>();
    let dishes = dataset
        .dishes
        .iter()
        .map(|dish| (dish.key.as_str(), dish))
        .collect::<HashMap<_, _>>();
    let days = localized_days(language);
    let mut seen = BTreeSet::new();
    let mut rows = Vec::new();

    for entry in availability {
        if !selected_days.contains(&entry.day)
            || !seen.insert((entry.person_key.clone(), entry.day.clone()))
        {
            continue;
        }
        let Some(person) = people.get(entry.person_key.as_str()) else {
            continue;
        };
        let day_index = days.iter().position(|day| day == &entry.day).unwrap_or(0);
        let day_code = FOOD_RULE_DAYS[day_index];
        for rule in &person.food_rules {
            if rule.kind != "routine" {
                continue;
            }
            if !rule.days.is_empty() && !rule.days.iter().any(|day| day == day_code) {
                continue;
            }
            let meal = food_rule_meal_name(&rule.meal, language)
                .ok_or_else(|| "auto_menu_invalid_food_rule".to_string())?;
            let already_satisfied = dataset.menu.iter().any(|row| {
                row.day == entry.day
                    && row.meal == meal
                    && row.people.iter().any(|key| key == &person.key)
                    && rule.item_keys.contains(&row.item_key)
            });
            if already_satisfied {
                continue;
            }
            let allowed = rule
                .item_keys
                .iter()
                .filter(|key| !person_forbids_item(person, key, &meal, language, &dishes))
                .collect::<Vec<_>>();
            if allowed.is_empty() {
                return Err("auto_menu_routine_no_allowed_choice".to_string());
            }
            let choice_index = day_index % allowed.len();
            rows.push(MenuRow {
                day: entry.day.clone(),
                meal,
                item_key: allowed[choice_index].to_string(),
                people: vec![person.key.clone()],
                quantity: rule.quantity,
                quantity_unit: rule.quantity_unit.clone(),
                notes: if language == "fr" {
                    "Routine quotidienne".to_string()
                } else {
                    "Daily routine".to_string()
                },
            });
        }
    }
    Ok(merge_menu_rows(rows))
}

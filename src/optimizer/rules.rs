use crate::loader::{
    FOOD_RULE_DAYS, food_rule_meal_name, localized_days, merge_menu_rows,
};
use crate::model::{AutoMenuAvailability, Dataset, Dish, MenuRow, Person};
use std::collections::{BTreeSet, HashMap, HashSet};

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

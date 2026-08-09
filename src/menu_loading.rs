use crate::model::{FoodRule, MenuRow};
use serde::Deserialize;
use std::collections::HashSet;

const DAYS_FR: [&str; 7] = [
    "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche",
];
const DAYS_EN: [&str; 7] = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];
const MEALS_FR: [&str; 7] = [
    "Petit dejeuner",
    "Encas matin",
    "Dejeuner",
    "Encas apres-midi 1",
    "Encas apres-midi 2",
    "Diner",
    "A tout moment",
];
const MEALS_EN: [&str; 7] = [
    "Breakfast",
    "Morning snack",
    "Lunch",
    "Afternoon snack 1",
    "Afternoon snack 2",
    "Dinner",
    "Anytime",
];

pub(crate) const FOOD_RULE_MEALS: [&str; 8] = [
    "any",
    "breakfast",
    "morning_snack",
    "lunch",
    "afternoon_snack_1",
    "afternoon_snack_2",
    "dinner",
    "anytime",
];

pub(crate) const FOOD_RULE_DAYS: [&str; 7] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

#[derive(Debug, Clone, Deserialize)]
pub struct MenuInput {
    pub day: String,
    pub meal: String,
    pub item_key: String,
    pub person: Option<String>,
    pub people: Option<Vec<String>>,
    pub quantity: Option<f64>,
    pub portions: Option<f64>,
    pub quantity_unit: Option<String>,
    pub notes: Option<String>,
}

pub(crate) fn localized_days(language: &str) -> Vec<String> {
    let values = if language == "en" { &DAYS_EN } else { &DAYS_FR };
    values.iter().map(|value| value.to_string()).collect()
}

pub(crate) fn localized_meals(language: &str) -> Vec<String> {
    let values = if language == "en" { &MEALS_EN } else { &MEALS_FR };
    values.iter().map(|value| value.to_string()).collect()
}

fn localized_value(
    value: &str,
    french: &[&str],
    english: &[&str],
    language: &str,
) -> Result<String, String> {
    let index = french
        .iter()
        .position(|candidate| *candidate == value)
        .or_else(|| english.iter().position(|candidate| *candidate == value))
        .ok_or_else(|| format!("unknown localized value: {value}"))?;
    Ok(if language == "en" {
        english[index].to_string()
    } else {
        french[index].to_string()
    })
}

pub(crate) fn localize_day(value: &str, language: &str) -> Result<String, String> {
    localized_value(value.trim(), &DAYS_FR, &DAYS_EN, language)
}

pub(crate) fn localize_meal(value: &str, language: &str) -> Result<String, String> {
    let value = match value.trim() {
        "Petit déjeuner" => "Petit dejeuner",
        "Déjeuner" => "Dejeuner",
        "Encas après-midi 1" => "Encas apres-midi 1",
        "Encas après-midi 2" => "Encas apres-midi 2",
        "Dîner" => "Diner",
        "À tout moment" => "A tout moment",
        value => value,
    };
    localized_value(value, &MEALS_FR, &MEALS_EN, language)
}

pub(crate) fn food_rule_meal_name(meal: &str, language: &str) -> Option<String> {
    if meal == "any" {
        return None;
    }
    let index = FOOD_RULE_MEALS.iter().position(|candidate| *candidate == meal)? - 1;
    localized_meals(language).get(index).cloned()
}

pub(crate) fn normalize_food_rules(
    rules: Vec<FoodRule>,
    valid_items: &HashSet<String>,
    context: &str,
) -> Result<Vec<FoodRule>, String> {
    let mut normalized = Vec::new();
    for (index, mut rule) in rules.into_iter().enumerate() {
        rule.kind = rule.kind.trim().to_lowercase();
        rule.meal = rule.meal.trim().to_lowercase();
        rule.quantity_unit = rule.quantity_unit.trim().to_lowercase();
        if !matches!(rule.kind.as_str(), "routine" | "never") {
            return Err(format!("{context} food rule {} has invalid kind", index + 1));
        }
        if !FOOD_RULE_MEALS.contains(&rule.meal.as_str()) {
            return Err(format!("{context} food rule {} has invalid meal", index + 1));
        }
        if rule.kind == "routine" && rule.meal == "any" {
            return Err(format!("{context} routine rule {} requires a meal", index + 1));
        }
        let mut days = HashSet::new();
        rule.days = rule
            .days
            .into_iter()
            .map(|day| day.trim().to_lowercase())
            .filter(|day| !day.is_empty() && days.insert(day.clone()))
            .collect();
        if let Some(day) = rule
            .days
            .iter()
            .find(|day| !FOOD_RULE_DAYS.contains(&day.as_str()))
        {
            return Err(format!(
                "{context} food rule {} has invalid day: {day}",
                index + 1
            ));
        }
        if rule.kind == "never" {
            rule.days.clear();
        }
        if !rule.quantity.is_finite() || rule.quantity <= 0.0 {
            return Err(format!("{context} food rule {} has invalid quantity", index + 1));
        }
        if !matches!(rule.quantity_unit.as_str(), "portion" | "g" | "unit") {
            return Err(format!("{context} food rule {} has invalid quantity unit", index + 1));
        }
        let mut keys = HashSet::new();
        rule.item_keys = rule
            .item_keys
            .into_iter()
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty() && keys.insert(key.clone()))
            .collect();
        if rule.item_keys.is_empty() {
            return Err(format!("{context} food rule {} requires food choices", index + 1));
        }
        if let Some(key) = rule.item_keys.iter().find(|key| !valid_items.contains(*key)) {
            return Err(format!(
                "{context} food rule {} references unknown item: {key}",
                index + 1
            ));
        }
        normalized.push(rule);
    }
    Ok(normalized)
}

pub(crate) fn normalize_menu(
    inputs: Vec<MenuInput>,
    language: &str,
    valid_items: &HashSet<String>,
    valid_people: &HashSet<String>,
    default_person: Option<&str>,
) -> Result<Vec<MenuRow>, String> {
    let mut rows = Vec::new();
    for (index, input) in inputs.into_iter().enumerate() {
        if !valid_items.contains(input.item_key.trim()) {
            return Err(format!(
                "menu item {} references unknown item: {}",
                index + 1,
                input.item_key
            ));
        }
        if input.quantity.is_some() && input.portions.is_some() {
            return Err(format!(
                "menu item {} cannot define both quantity and portions",
                index + 1
            ));
        }
        let quantity = input.quantity.or(input.portions).ok_or_else(|| {
            format!("menu item {} is missing quantity or portions", index + 1)
        })?;
        if !quantity.is_finite() || quantity <= 0.0 {
            return Err(format!("menu item {} quantity must be positive", index + 1));
        }
        let unit = input
            .quantity_unit
            .unwrap_or_else(|| "portion".to_string())
            .trim()
            .to_lowercase();
        if !matches!(unit.as_str(), "portion" | "g" | "unit") {
            return Err(format!("menu item {} has invalid quantity unit: {unit}", index + 1));
        }
        if input.person.is_some() && input.people.is_some() {
            return Err(format!(
                "menu item {} cannot define both person and people",
                index + 1
            ));
        }
        let people = if let Some(person) = input.person {
            vec![person]
        } else if let Some(people) = input.people {
            if people.is_empty() {
                return Err(format!("menu item {} people cannot be empty", index + 1));
            }
            people
        } else {
            vec![default_person
                .ok_or_else(|| format!("menu item {} requires people", index + 1))?
                .to_string()]
        };
        for person in &people {
            if !valid_people.contains(person.trim()) {
                return Err(format!(
                    "menu item {} references unknown person: {}",
                    index + 1,
                    person
                ));
            }
        }
        rows.push(MenuRow {
            day: localize_day(&input.day, language)
                .map_err(|error| format!("menu item {}: {error}", index + 1))?,
            meal: localize_meal(&input.meal, language)
                .map_err(|error| format!("menu item {}: {error}", index + 1))?,
            item_key: input.item_key.trim().to_string(),
            people: people
                .into_iter()
                .map(|value| value.trim().to_string())
                .collect(),
            quantity,
            quantity_unit: unit,
            notes: input.notes.unwrap_or_default().trim().to_string(),
        });
    }
    Ok(merge_menu_rows(rows))
}

pub(crate) fn merge_menu_rows(rows: Vec<MenuRow>) -> Vec<MenuRow> {
    let mut merged: Vec<MenuRow> = Vec::new();
    'rows: for row in rows {
        for candidate in &mut merged {
            let same_entry = candidate.day == row.day
                && candidate.meal == row.meal
                && candidate.item_key == row.item_key
                && candidate.quantity == row.quantity
                && candidate.quantity_unit == row.quantity_unit
                && candidate.notes == row.notes;
            let people_are_disjoint = candidate
                .people
                .iter()
                .all(|person| !row.people.contains(person));
            if same_entry && people_are_disjoint {
                candidate.people.extend(row.people);
                continue 'rows;
            }
        }
        merged.push(row);
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::merge_menu_rows;
    use crate::model::MenuRow;

    fn row(people: &[&str], quantity: f64, notes: &str) -> MenuRow {
        MenuRow {
            day: "Monday".to_string(),
            meal: "Dinner".to_string(),
            item_key: "vegetable_curry".to_string(),
            people: people.iter().map(|person| person.to_string()).collect(),
            quantity,
            quantity_unit: "portion".to_string(),
            notes: notes.to_string(),
        }
    }

    #[test]
    fn compatible_rows_merge_without_collapsing_repeated_person_portions() {
        let merged = merge_menu_rows(vec![
            row(&["alex"], 1.0, "Serve warm"),
            row(&["sam"], 1.0, "Serve warm"),
            row(&["alex"], 1.0, "Serve warm"),
            row(&["jo"], 2.0, "Serve warm"),
            row(&["pat"], 1.0, "No chilli"),
        ]);

        assert_eq!(merged.len(), 4);
        assert_eq!(merged[0].people, vec!["alex", "sam"]);
        assert_eq!(merged[1].people, vec!["alex"]);
        assert_eq!(merged[2].quantity, 2.0);
        assert_eq!(merged[3].notes, "No chilli");
    }
}

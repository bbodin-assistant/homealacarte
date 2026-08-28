use crate::locale;
use crate::model::{FoodRule, MenuRow};
use super::inputs::MenuInput;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

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

pub(crate) fn annual_date_ordinal(value: &str) -> Option<u16> {
    let bytes = value.as_bytes();
    if bytes.len() != 5
        || bytes[2] != b'-'
        || !bytes[..2].iter().all(u8::is_ascii_digit)
        || !bytes[3..].iter().all(u8::is_ascii_digit)
    {
        return None;
    }
    let month = value[..2].parse::<u16>().ok()?;
    let day = value[3..].parse::<u16>().ok()?;
    let days_before_month = [
        0, 0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335,
    ];
    let month_length = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if !(1..=12).contains(&month) || day == 0 || day > month_length[month as usize] {
        return None;
    }
    Some(days_before_month[month as usize] + day)
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
        rule.period_start = rule.period_start.trim().to_string();
        rule.period_end = rule.period_end.trim().to_string();
        if !matches!(
            rule.kind.as_str(),
            "routine" | "never" | "allergy" | "favorite"
        ) {
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
        if rule.kind != "routine" {
            rule.days.clear();
            rule.period_start.clear();
            rule.period_end.clear();
        } else if rule.period_start.is_empty() != rule.period_end.is_empty() {
            return Err(format!(
                "{context} food rule {} requires both period boundaries",
                index + 1
            ));
        } else if (!rule.period_start.is_empty()
            && annual_date_ordinal(&rule.period_start).is_none())
            || (!rule.period_end.is_empty() && annual_date_ordinal(&rule.period_end).is_none())
        {
            return Err(format!(
                "{context} food rule {} has invalid annual period",
                index + 1
            ));
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
        let mut allergens = HashSet::new();
        rule.allergens = rule
            .allergens
            .into_iter()
            .map(|allergen| allergen.trim().to_lowercase())
            .filter(|allergen| !allergen.is_empty() && allergens.insert(allergen.clone()))
            .collect();
        if rule.kind != "allergy" {
            rule.allergens.clear();
        }
        if let Some(allergen) = rule
            .allergens
            .iter()
            .find(|allergen| !crate::model::ALLERGEN_CODES.contains(&allergen.as_str()))
        {
            return Err(format!(
                "{context} food rule {} has invalid allergen: {allergen}",
                index + 1
            ));
        }
        if rule.item_keys.is_empty() && rule.allergens.is_empty() {
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
    _language: &str,
    valid_items: &HashSet<String>,
    valid_people: &HashSet<String>,
    default_person: Option<&str>,
) -> Result<Vec<MenuRow>, String> {
    let mut rows = Vec::new();
    let mut row_ids = HashSet::new();
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
                "menu item {} cannot define both person and people", index + 1
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
                    "menu item {} references unknown person: {}", index + 1, person
                ));
            }
        }
        let day = locale::day_key(&input.day)
            .ok_or_else(|| format!("menu item {} has an unknown day: {}", index + 1, input.day))?;
        let meal = locale::meal_key(&input.meal)
            .ok_or_else(|| format!("menu item {} has an unknown meal: {}", index + 1, input.meal))?;
        let date = input.date.trim().to_string();
        let supplied_id = input.id.unwrap_or_default().trim().to_string();
        let id = if supplied_id.is_empty() {
            let identity = serde_json::json!({
                "date": date,
                "day": day,
                "meal": meal,
                "item_key": input.item_key,
                "people": people,
                "quantity": quantity,
                "quantity_unit": unit,
                "notes": input.notes,
                "occurrence": index,
            });
            let digest = Sha256::digest(identity.to_string().as_bytes());
            format!(
                "menu_{}",
                digest[..12]
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>()
            )
        } else {
            supplied_id
        };
        if !row_ids.insert(id.clone()) {
            return Err(format!("menu item {} has a duplicate id: {id}", index + 1));
        }
        rows.push(MenuRow {
            id,
            date,
            day,
            meal,
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
            let same_entry = candidate.date == row.date
                && candidate.day == row.day
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

    fn row(date: &str, people: &[&str], quantity: f64, notes: &str) -> MenuRow {
        MenuRow {
            id: String::new(),
            date: date.to_string(),
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
            row("2026-08-17", &["alex"], 1.0, "Serve warm"),
            row("2026-08-17", &["sam"], 1.0, "Serve warm"),
            row("2026-08-17", &["alex"], 1.0, "Serve warm"),
            row("2026-08-17", &["jo"], 2.0, "Serve warm"),
            row("2026-08-17", &["pat"], 1.0, "No chilli"),
            row("2026-08-24", &["lee"], 1.0, "Serve warm"),
        ]);

        assert_eq!(merged.len(), 5);
        assert_eq!(merged[0].people, vec!["alex", "sam"]);
        assert_eq!(merged[1].people, vec!["alex"]);
        assert_eq!(merged[2].quantity, 2.0);
        assert_eq!(merged[3].notes, "No chilli");
        assert_eq!(merged[4].date, "2026-08-24");
    }
}

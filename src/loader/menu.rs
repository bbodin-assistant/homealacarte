use crate::model::{FoodRule, MenuRow};
use super::inputs::MenuInput;
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

const MENU_MEALS: [&str; 7] = [
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

fn valid_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes[..4].iter().all(u8::is_ascii_digit)
        || !bytes[5..7].iter().all(u8::is_ascii_digit)
        || !bytes[8..].iter().all(u8::is_ascii_digit)
    {
        return false;
    }
    let Ok(year) = value[..4].parse::<u32>() else {
        return false;
    };
    let Ok(month) = value[5..7].parse::<usize>() else {
        return false;
    };
    let Ok(day) = value[8..].parse::<u32>() else {
        return false;
    };
    if !(1..=12).contains(&month) || day == 0 {
        return false;
    }
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let month_lengths = [
        0,
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    day <= month_lengths[month]
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
            "routine" | "never" | "allergy" | "favorite" | "like" | "dislike"
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
    valid_items: &HashSet<String>,
    valid_people: &HashSet<String>,
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
        if !input.quantity.is_finite() || input.quantity <= 0.0 {
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
        if input.people.is_empty() {
            return Err(format!("menu item {} people cannot be empty", index + 1));
        }
        for person in &input.people {
            if !valid_people.contains(person.trim()) {
                return Err(format!(
                    "menu item {} references unknown person: {}", index + 1, person
                ));
            }
        }
        let day = crate::locale::day_key(input.day.trim())
            .filter(|day| FOOD_RULE_DAYS.contains(&day.as_str()))
            .ok_or_else(|| {
                format!("menu item {} has an unknown day: {}", index + 1, input.day)
            })?;
        let meal = crate::locale::meal_key(input.meal.trim())
            .filter(|meal| MENU_MEALS.contains(&meal.as_str()))
            .ok_or_else(|| {
                format!("menu item {} has an unknown meal: {}", index + 1, input.meal)
            })?;
        let date = input.date.trim().to_string();
        if !valid_iso_date(&date) {
            return Err(format!("menu item {} has an invalid date: {}", index + 1, input.date));
        }
        rows.push(MenuRow {
            date,
            day,
            meal,
            item_key: input.item_key.trim().to_string(),
            people: input
                .people
                .into_iter()
                .map(|value| value.trim().to_string())
                .collect(),
            quantity: input.quantity,
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
            date: date.to_string(),
            day: "monday".to_string(),
            meal: "dinner".to_string(),
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

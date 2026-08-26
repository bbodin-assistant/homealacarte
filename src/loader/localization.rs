use super::menu::{FOOD_RULE_DAYS, FOOD_RULE_MEALS};
use crate::locale;

pub(crate) fn localized_days(language: &str) -> Vec<String> {
    FOOD_RULE_DAYS
        .iter()
        .filter_map(|key| locale::day_label(language, key))
        .collect()
}

pub(crate) fn localized_meals(language: &str) -> Vec<String> {
    FOOD_RULE_MEALS
        .iter()
        .filter(|key| **key != "any")
        .filter_map(|key| locale::meal_label(language, key))
        .collect()
}

pub(crate) fn localize_day(value: &str, language: &str) -> Result<String, String> {
    let key = locale::day_key(value)
        .ok_or_else(|| format!("unknown localized value: {value}"))?;
    locale::day_label(language, &key)
        .ok_or_else(|| format!("missing localized day: {key}"))
}

pub(crate) fn localize_meal(value: &str, language: &str) -> Result<String, String> {
    let key = locale::meal_key(value)
        .ok_or_else(|| format!("unknown localized value: {value}"))?;
    locale::meal_label(language, &key)
        .ok_or_else(|| format!("missing localized meal: {key}"))
}

pub(crate) fn localized_menu_rows(
    rows: &[crate::model::MenuRow],
    language: &str,
) -> Result<Vec<crate::model::MenuRow>, String> {
    rows.iter()
        .map(|row| {
            let mut localized = row.clone();
            localized.day = localize_day(&row.day, language)?;
            localized.meal = localize_meal(&row.meal, language)?;
            Ok(localized)
        })
        .collect()
}

pub(crate) fn dataset_with_localized_categories(
    dataset: &crate::model::Dataset,
    language: &str,
) -> crate::model::Dataset {
    let mut localized = dataset.clone();
    for item in &mut localized.ingredients {
        item.category = locale::category_label(language, &item.category);
    }
    for item in &mut localized.household_items {
        item.category = locale::category_label(language, &item.category);
    }
    localized
}

pub(crate) fn food_rule_meal_name(meal: &str, language: &str) -> Option<String> {
    if meal == "any" {
        None
    } else {
        locale::meal_label(language, meal)
    }
}

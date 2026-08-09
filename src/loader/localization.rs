use super::menu::FOOD_RULE_MEALS;

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

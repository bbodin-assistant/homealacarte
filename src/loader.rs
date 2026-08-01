use crate::model::{
    Dataset, Dish, DishComponent, FoodRule, HouseholdItem, Ingredient, MenuRow, Person,
    PriceObservation, SourceFile,
};
use serde::{Deserialize, Deserializer};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};

const SECTIONS: &[&str] = &[
    "items",
    "dishes",
    "people",
    "menu",
    "stock",
    "extra_needs",
];

pub const DAYS_FR: [&str; 7] = [
    "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche",
];
pub const DAYS_EN: [&str; 7] = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];
pub const MEALS_FR: [&str; 7] = [
    "Petit dejeuner",
    "Encas matin",
    "Dejeuner",
    "Encas apres-midi 1",
    "Encas apres-midi 2",
    "Diner",
    "A tout moment",
];
pub const MEALS_EN: [&str; 7] = [
    "Breakfast",
    "Morning snack",
    "Lunch",
    "Afternoon snack 1",
    "Afternoon snack 2",
    "Dinner",
    "Anytime",
];

#[derive(Debug)]
struct Document {
    path: String,
    value: Value,
}

#[derive(Debug, Deserialize)]
struct IngredientInput {
    key: String,
    name: String,
    #[serde(default)]
    custom: bool,
    #[serde(default)]
    incomplete: bool,
    grams: f64,
    kcal: f64,
    protein_g: f64,
    carbs_g: f64,
    fat_g: f64,
    fiber_g: f64,
    #[serde(default, deserialize_with = "missing_value")]
    sugars_g: Option<f64>,
    #[serde(default, deserialize_with = "missing_value")]
    saturated_fat_g: Option<f64>,
    #[serde(default, deserialize_with = "missing_value")]
    salt_g: Option<f64>,
    #[serde(default, deserialize_with = "missing_value")]
    fruit_vegetable_legume_percent: Option<f64>,
    category: String,
    source: String,
    url: String,
    price_per_kg: f64,
    #[serde(default)]
    price_source: String,
    #[serde(default)]
    price_checked_at: String,
    #[serde(default)]
    price_history: Vec<PriceObservation>,
    #[serde(default = "default_grams")]
    measure_unit: String,
    #[serde(default = "one")]
    grams_per_measure_unit: f64,
    purchase_unit: Option<String>,
    purchase_quantity_grams: Option<f64>,
}

fn missing_value<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: Deserializer<'de>,
{
    match Value::deserialize(deserializer)? {
        Value::Null => Ok(None),
        Value::Number(value) => value
            .as_f64()
            .map(Some)
            .ok_or_else(|| serde::de::Error::custom("invalid numeric value")),
        Value::String(value) if value == "MISSINGVALUE" => Ok(None),
        _ => Err(serde::de::Error::custom(
            "expected a number, null, or \"MISSINGVALUE\"",
        )),
    }
}

fn default_grams() -> String {
    "g".to_string()
}

fn one() -> f64 {
    1.0
}

fn bool_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
struct DishInput {
    key: String,
    name: String,
    #[serde(default = "bool_true")]
    auto_menu_main: bool,
    #[serde(default = "one")]
    servings: f64,
    #[serde(default)]
    recipe_url: String,
    #[serde(default)]
    source: String,
    #[serde(default)]
    source_notes: Value,
    #[serde(default)]
    nutri_score: String,
    components: Vec<ComponentInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct ComponentInput {
    item_key: String,
    grams: Option<f64>,
    measure_quantity: Option<f64>,
    quantity: Option<f64>,
    quantity_unit: Option<String>,
    #[serde(default)]
    source_quantity: String,
}

#[derive(Debug, Deserialize)]
struct PersonInput {
    key: String,
    name: Option<String>,
    kcal_target: Option<f64>,
    kind: Option<String>,
    description: Option<String>,
    #[serde(default)]
    food_rules: Vec<FoodRule>,
}

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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StockInput {
    item_key: String,
    #[serde(default)]
    quantity: f64,
    quantity_unit: Option<String>,
    #[serde(default)]
    notes: String,
}

#[derive(Debug, Deserialize)]
struct HouseholdItemInput {
    key: String,
    name: String,
    category: String,
    #[serde(default)]
    estimated_price: f64,
    #[serde(default)]
    price_history: Vec<PriceObservation>,
    purchase_unit: Option<String>,
    purchase_quantity: Option<f64>,
    measure_unit: Option<String>,
    last_bought_at: Option<String>,
    lasting_days: Option<f64>,
    notes: Option<String>,
    #[serde(default)]
    custom: bool,
}

#[derive(Debug, Deserialize)]
struct HouseholdQuantityInput {
    item_key: String,
    quantity: f64,
    quantity_unit: Option<String>,
    #[serde(default)]
    notes: String,
}

fn deserialize<T: for<'de> Deserialize<'de>>(path: &str, section: &str, value: Value) -> Result<T, String> {
    serde_json::from_value(value)
        .map_err(|error| format!("{path}.{section}: {error}"))
}

fn section_values(documents: &[Document], section: &str) -> Result<Vec<(String, Value)>, String> {
    let mut result = Vec::new();
    for document in documents {
        let Some(value) = document.value.get(section) else {
            continue;
        };
        let rows = value
            .as_array()
            .ok_or_else(|| format!("{}.{} must be an array", document.path, section))?;
        result.extend(
            rows.iter()
                .cloned()
                .map(|row| (document.path.clone(), row)),
        );
    }
    Ok(result)
}

pub fn localized_days(language: &str) -> Vec<String> {
    let values = if language == "en" { &DAYS_EN } else { &DAYS_FR };
    values.iter().map(|value| value.to_string()).collect()
}

pub fn localized_meals(language: &str) -> Vec<String> {
    let values = if language == "en" { &MEALS_EN } else { &MEALS_FR };
    values.iter().map(|value| value.to_string()).collect()
}

fn localized_value(value: &str, french: &[&str], english: &[&str], language: &str) -> Result<String, String> {
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

pub fn localize_day(value: &str, language: &str) -> Result<String, String> {
    localized_value(value.trim(), &DAYS_FR, &DAYS_EN, language)
}

pub fn localize_meal(value: &str, language: &str) -> Result<String, String> {
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

pub fn normalize_menu(
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
            people: people.into_iter().map(|value| value.trim().to_string()).collect(),
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
mod menu_row_tests {
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

pub fn load_dataset(mut sources: Vec<SourceFile>, language: &str) -> Result<Dataset, String> {
    if language != "fr" && language != "en" {
        return Err(format!("unsupported language: {language}"));
    }
    sources.sort_by(|a, b| a.path.cmp(&b.path));
    let mut hasher = Sha256::new();
    let mut documents = Vec::new();
    for source in &sources {
        hasher.update(source.path.as_bytes());
        hasher.update([0]);
        hasher.update(source.content.as_bytes());
        let value: Value = serde_json::from_str(&source.content)
            .map_err(|error| format!("{}: invalid JSON: {error}", source.path))?;
        let object = value
            .as_object()
            .ok_or_else(|| {
                format!(
                    "{}: top level must be an object containing current data sections",
                    source.path
                )
            })?;
        if !SECTIONS.iter().any(|name| object.contains_key(*name)) {
            return Err(format!(
                "{}: no supported data section (expected one of {})",
                source.path,
                SECTIONS.join(", ")
            ));
        }
        documents.push(Document {
            path: source.path.clone(),
            value,
        });
    }
    let source_hash = format!("{:x}", hasher.finalize());

    let unified_item_values = section_values(&documents, "items")?;
    let ingredient_values = unified_item_values
        .iter()
        .filter(|(_, value)| {
            value.get("grams").is_some()
                || value.get("kcal").is_some()
                || value.get("price_per_kg").is_some()
                || value.get("kind").and_then(Value::as_str) == Some("food")
        })
        .cloned()
        .collect::<Vec<_>>();
    let mut ingredients = Vec::new();
    let mut item_keys = HashSet::new();
    for (path, value) in ingredient_values {
        let input: IngredientInput = deserialize(&path, "items", value)?;
        let key = input.key.trim().to_string();
        if key.is_empty() || !item_keys.insert(key.clone()) {
            return Err(format!("{path}: duplicate or empty ingredient key: {key}"));
        }
        if input.grams <= 0.0
            || input.grams_per_measure_unit <= 0.0
            || input.purchase_quantity_grams.unwrap_or(input.grams) <= 0.0
        {
            return Err(format!("{path}: ingredient {key} has invalid gram quantities"));
        }
        let measure_unit = if input.measure_unit.trim().is_empty() {
            "g".to_string()
        } else {
            input.measure_unit.trim().to_string()
        };
        ingredients.push(Ingredient {
            key,
            name: input.name.trim().to_string(),
            custom: input.custom,
            incomplete: input.incomplete,
            grams: input.grams,
            kcal: input.kcal,
            protein_g: input.protein_g,
            carbs_g: input.carbs_g,
            fat_g: input.fat_g,
            fiber_g: input.fiber_g,
            sugars_g: input.sugars_g,
            saturated_fat_g: input.saturated_fat_g,
            salt_g: input.salt_g,
            fruit_vegetable_legume_percent: input.fruit_vegetable_legume_percent,
            category: input.category.trim().to_string(),
            source: input.source.trim().to_string(),
            url: input.url.trim().to_string(),
            price_per_kg: input.price_per_kg,
            price_source: input.price_source.trim().to_string(),
            price_checked_at: input.price_checked_at.trim().to_string(),
            price_history: normalize_price_history(
                input.price_history,
                &input.price_checked_at,
                input.price_per_kg,
                &input.price_source,
            )?,
            measure_unit: measure_unit.clone(),
            grams_per_measure_unit: input.grams_per_measure_unit,
            purchase_unit: input
                .purchase_unit
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(measure_unit),
            purchase_quantity_grams: input
                .purchase_quantity_grams
                .unwrap_or(input.grams_per_measure_unit.max(input.grams)),
        });
    }
    let ingredient_by_key: HashMap<String, Ingredient> = ingredients
        .iter()
        .cloned()
        .map(|item| (item.key.clone(), item))
        .collect();

    let dish_values = section_values(&documents, "dishes")?;
    let mut dish_inputs = Vec::new();
    let mut dish_keys = HashSet::new();
    for (path, value) in dish_values {
        let input: DishInput = deserialize(&path, "dishes", value)?;
        if input.key.trim().is_empty() || !dish_keys.insert(input.key.trim().to_string()) {
            return Err(format!("{path}: duplicate or empty dish key: {}", input.key));
        }
        if input.servings <= 0.0 || input.components.is_empty() {
            return Err(format!("{path}: dish {} has invalid servings/components", input.key));
        }
        dish_inputs.push(input);
    }
    let dishes = flatten_dishes(dish_inputs, &ingredient_by_key)?;

    let dish_key_set: HashSet<String> = dishes.iter().map(|dish| dish.key.clone()).collect();
    let valid_items: HashSet<String> = item_keys.union(&dish_key_set).cloned().collect();
    let people_values = section_values(&documents, "people")?;
    let mut people = Vec::new();
    let mut people_keys = HashSet::new();
    for (path, value) in people_values {
        let input: PersonInput = deserialize(&path, "people", value)?;
        let key = input.key.trim().to_string();
        if key.is_empty() || !people_keys.insert(key.clone()) {
            return Err(format!("{path}: duplicate or empty person key: {key}"));
        }
        if input.kcal_target.is_some_and(|target| target <= 0.0) {
            return Err(format!("{path}: person {key} kcal target must be positive"));
        }
        let food_rules = normalize_food_rules(input.food_rules, &valid_items, &format!("person {key}"))?;
        people.push(Person {
            key: key.clone(),
            name: input.name.unwrap_or(key),
            kcal_target: input.kcal_target,
            kind: normalize_person_kind(input.kind.as_deref())?,
            description: input.description.unwrap_or_default().trim().to_string(),
            food_rules,
        });
    }
    let default_person = people.first().map(|person| person.key.as_str());

    let menu_values = section_values(&documents, "menu")?;
    let menu_inputs = menu_values
        .into_iter()
        .map(|(path, value)| deserialize::<MenuInput>(&path, "menu", value))
        .collect::<Result<Vec<_>, _>>()?;
    let menu = normalize_menu(
        menu_inputs,
        language,
        &valid_items,
        &people_keys,
        default_person,
    )?;

    let mut household_items = Vec::new();
    let mut household_keys = HashSet::new();
    let household_values = unified_item_values
        .into_iter()
        .filter(|(_, value)| {
            value.get("grams").is_none()
                && value.get("kcal").is_none()
                && value.get("price_per_kg").is_none()
                && value.get("kind").and_then(Value::as_str) != Some("food")
        });
    for (path, value) in household_values {
        let input: HouseholdItemInput = deserialize(&path, "items", value)?;
        let key = input.key.trim().to_string();
        if key.is_empty()
            || item_keys.contains(&key)
            || !household_keys.insert(key.clone())
        {
            return Err(format!("{path}: duplicate or empty item key: {key}"));
        }
        let purchase_quantity = input.purchase_quantity.unwrap_or(1.0);
        if purchase_quantity <= 0.0 || input.estimated_price < 0.0 {
            return Err(format!("{path}: household item {key} has invalid quantity/price"));
        }
        household_items.push(HouseholdItem {
            key,
            name: input.name.trim().to_string(),
            category: input.category.trim().to_string(),
            purchase_unit: input.purchase_unit.unwrap_or_else(|| "unité".to_string()),
            purchase_quantity,
            estimated_price: input.estimated_price,
            price_history: normalize_price_history(
                input.price_history,
                input.last_bought_at.as_deref().unwrap_or(""),
                input.estimated_price,
                input.notes.as_deref().unwrap_or(""),
            )?,
            measure_unit: input.measure_unit.unwrap_or_else(|| "unit".to_string()),
            last_bought_at: input.last_bought_at.unwrap_or_default(),
            lasting_days: input.lasting_days,
            notes: input.notes.unwrap_or_default(),
            custom: input.custom,
        });
    }
    let all_item_keys = item_keys
        .union(&household_keys)
        .cloned()
        .collect::<HashSet<_>>();
    let (household_needs, household_need_notes) =
        household_quantities(&documents, "extra_needs", &all_item_keys)?;

    let mut stock = BTreeMap::new();
    let mut stock_units = BTreeMap::new();
    let mut stock_notes = BTreeMap::new();
    let mut household_stock = BTreeMap::new();
    let stock_values = section_values(&documents, "stock")?;
    for (path, value) in stock_values {
        let input: StockInput = deserialize(&path, "stock", value)?;
        let key = input.item_key;
        if input.quantity < 0.0 {
            return Err(format!("{path}: stock quantity must not be negative"));
        }
        if let Some(ingredient) = ingredient_by_key.get(&key) {
            let quantity_unit = input.quantity_unit.as_deref().unwrap_or("g").to_lowercase();
            let grams = match quantity_unit.as_str() {
                "g" => input.quantity,
                "unit" => input.quantity * ingredient.grams_per_measure_unit,
                unit => return Err(format!("{path}: invalid stock unit: {unit}")),
            };
            stock_units.insert(key.clone(), quantity_unit);
            *stock.entry(key.clone()).or_insert(0.0) += grams;
        } else if household_keys.contains(&key) {
            if input.quantity_unit.as_deref().unwrap_or("unit").to_lowercase() != "unit" {
                return Err(format!("{path}: non-food stock item {key} must use unit"));
            }
            *household_stock.entry(key.clone()).or_insert(0.0) += input.quantity;
        } else {
            return Err(format!("{path}: stock references unknown item: {key}"));
        }
        append_note(&mut stock_notes, &key, &input.notes);
    }
    Ok(Dataset {
        ingredients,
        dishes,
        people,
        menu,
        stock,
        stock_units,
        stock_notes,
        household_items,
        household_needs,
        household_need_notes,
        household_stock,
        source_hash,
    })
}

fn normalize_person_kind(kind: Option<&str>) -> Result<String, String> {
    match kind.unwrap_or("adult").trim().to_lowercase().as_str() {
        "" | "adult" => Ok("adult".to_string()),
        "child" | "kid" | "enfant" => Ok("child".to_string()),
        kind => Err(format!("unsupported family member kind: {kind}")),
    }
}

fn household_quantities(
    documents: &[Document],
    section: &str,
    valid_keys: &HashSet<String>,
) -> Result<(BTreeMap<String, f64>, BTreeMap<String, String>), String> {
    let mut totals = BTreeMap::new();
    let mut notes = BTreeMap::new();
    for (path, value) in section_values(documents, section)? {
        let input: HouseholdQuantityInput = deserialize(&path, section, value)?;
        if !valid_keys.contains(&input.item_key) {
            return Err(format!(
                "{path}: {section} references unknown item: {}",
                input.item_key
            ));
        }
        if input.quantity < 0.0 {
            return Err(format!("{path}: {section} quantity must not be negative"));
        }
        if input.quantity_unit.as_deref().unwrap_or("unit").to_lowercase() != "unit" {
            return Err(format!("{path}: {section} quantity_unit must be unit"));
        }
        *totals.entry(input.item_key.clone()).or_insert(0.0) += input.quantity;
        append_note(&mut notes, &input.item_key, &input.notes);
    }
    Ok((totals, notes))
}

fn append_note(notes: &mut BTreeMap<String, String>, key: &str, note: &str) {
    let note = note.trim();
    if note.is_empty() {
        return;
    }
    let current = notes.entry(key.to_string()).or_default();
    if current.is_empty() {
        current.push_str(note);
    } else if !current.lines().any(|line| line == note) {
        current.push('\n');
        current.push_str(note);
    }
}

fn normalize_price_history(
    mut history: Vec<PriceObservation>,
    current_date: &str,
    current_price: f64,
    current_description: &str,
) -> Result<Vec<PriceObservation>, String> {
    if !current_price.is_finite() || current_price < 0.0 {
        return Err("price history contains an invalid current price".to_string());
    }
    let current_description = if current_description.trim().is_empty() {
        "Imported current price"
    } else {
        current_description.trim()
    };
    if !history.iter().any(|entry| {
            entry.date.trim() == current_date.trim()
                && entry.price == current_price
                && entry.description.trim() == current_description
        })
    {
        history.push(PriceObservation {
            date: current_date.trim().to_string(),
            price: current_price,
            description: current_description.to_string(),
        });
    }
    for entry in &mut history {
        if !entry.price.is_finite() || entry.price < 0.0 {
            return Err("price history contains a negative or non-finite price".to_string());
        }
        entry.date = entry.date.trim().to_string();
        entry.description = entry.description.trim().to_string();
    }
    history.sort_by(|left, right| {
        left.date
            .cmp(&right.date)
            .then_with(|| left.price.total_cmp(&right.price))
            .then(left.description.cmp(&right.description))
    });
    history.dedup();
    Ok(history)
}

fn flatten_dishes(
    inputs: Vec<DishInput>,
    ingredients: &HashMap<String, Ingredient>,
) -> Result<Vec<Dish>, String> {
    let by_key: HashMap<String, DishInput> = inputs
        .iter()
        .cloned()
        .map(|dish| (dish.key.clone(), dish))
        .collect();
    let mut cache: HashMap<String, Dish> = HashMap::new();
    let mut stack = Vec::new();

    fn resolve(
        key: &str,
        by_key: &HashMap<String, DishInput>,
        ingredients: &HashMap<String, Ingredient>,
        cache: &mut HashMap<String, Dish>,
        stack: &mut Vec<String>,
    ) -> Result<Dish, String> {
        if let Some(dish) = cache.get(key) {
            return Ok(dish.clone());
        }
        if stack.iter().any(|item| item == key) {
            stack.push(key.to_string());
            return Err(format!("dish component cycle: {}", stack.join(" -> ")));
        }
        let input = by_key
            .get(key)
            .ok_or_else(|| format!("unknown dish: {key}"))?;
        stack.push(key.to_string());
        let mut components = Vec::new();
        for (index, component) in input.components.iter().enumerate() {
            let explicit_quantity =
                component.quantity.is_some() || component.quantity_unit.is_some();
            if component.quantity.is_some() != component.quantity_unit.is_some() {
                return Err(format!(
                    "dish {key} component {} must define both quantity and quantity_unit",
                    index + 1
                ));
            }
            let representation_count = usize::from(component.grams.is_some())
                + usize::from(component.measure_quantity.is_some())
                + usize::from(explicit_quantity);
            if representation_count != 1 {
                return Err(format!(
                    "dish {key} component {} must define exactly one of grams, measure_quantity, or quantity with quantity_unit",
                    index + 1
                ));
            }
            let quantity = component
                .grams
                .or(component.measure_quantity)
                .or(component.quantity)
                .unwrap_or(0.0);
            if quantity <= 0.0 {
                return Err(format!("dish {key} component {} quantity must be positive", index + 1));
            }
            if let Some(ingredient) = ingredients.get(&component.item_key) {
                let (grams, quantity_unit) = if component.grams.is_some() {
                    (quantity, "g".to_string())
                } else if component.measure_quantity.is_some() {
                    (
                        quantity * ingredient.grams_per_measure_unit,
                        ingredient.measure_unit.clone(),
                    )
                } else {
                    let requested_unit = component
                        .quantity_unit
                        .as_deref()
                        .unwrap_or_default()
                        .trim();
                    if requested_unit.eq_ignore_ascii_case("g") {
                        (quantity, "g".to_string())
                    } else if units_match(requested_unit, &ingredient.measure_unit) {
                        (
                            quantity * ingredient.grams_per_measure_unit,
                            ingredient.measure_unit.clone(),
                        )
                    } else {
                        return Err(format!(
                            "dish {key} component {} uses unsupported unit {requested_unit:?} for {}; expected g or {:?}",
                            index + 1,
                            ingredient.key,
                            ingredient.measure_unit
                        ));
                    }
                };
                components.push(DishComponent {
                    item_key: ingredient.key.clone(),
                    grams,
                    quantity,
                    quantity_unit,
                    source_quantity: component.source_quantity.clone(),
                });
                continue;
            }
            if !by_key.contains_key(&component.item_key) {
                return Err(format!(
                    "dish {key} references unknown ingredient or dish: {}",
                    component.item_key
                ));
            }
            let nested = resolve(&component.item_key, by_key, ingredients, cache, stack)?;
            let nested_total: f64 = nested.components.iter().map(|item| item.grams).sum();
            let uses_portions = component.measure_quantity.is_some()
                || component
                    .quantity_unit
                    .as_deref()
                    .is_some_and(|unit| {
                        matches!(
                            unit.trim().to_lowercase().as_str(),
                            "portion" | "portions"
                        )
                    });
            if explicit_quantity
                && !uses_portions
                && !component
                    .quantity_unit
                    .as_deref()
                    .unwrap_or_default()
                    .eq_ignore_ascii_case("g")
            {
                return Err(format!(
                    "dish {key} component {} references a dish and must use g, portion, or portions",
                    index + 1
                ));
            }
            let desired_grams = if uses_portions {
                quantity * nested_total / nested.servings
            } else {
                quantity
            };
            let scale = desired_grams / nested_total;
            components.extend(nested.components.iter().map(|item| DishComponent {
                item_key: item.item_key.clone(),
                grams: item.grams * scale,
                quantity: item.quantity * scale,
                quantity_unit: item.quantity_unit.clone(),
                source_quantity: item.source_quantity.clone(),
            }));
        }
        stack.pop();
        let nutri_score = input.nutri_score.trim().to_uppercase();
        if !nutri_score.is_empty()
            && !matches!(nutri_score.as_str(), "A" | "B" | "C" | "D" | "E")
        {
            return Err(format!("dish {key} has invalid Nutri-Score: {nutri_score}"));
        }
        let dish = Dish {
            key: input.key.clone(),
            name: input.name.clone(),
            auto_menu_main: input.auto_menu_main,
            servings: input.servings,
            recipe_url: input.recipe_url.clone(),
            source: input.source.clone(),
            source_notes: note_lines(&input.source_notes),
            nutri_score,
            components,
        };
        cache.insert(key.to_string(), dish.clone());
        Ok(dish)
    }

    inputs
        .iter()
        .map(|input| resolve(&input.key, &by_key, ingredients, &mut cache, &mut stack))
        .collect()
}

fn note_lines(value: &Value) -> Vec<String> {
    match value {
        Value::String(text) => {
            let text = text.trim();
            (!text.is_empty()).then(|| text.to_string()).into_iter().collect()
        }
        Value::Array(values) => values
            .iter()
            .filter_map(|value| value.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn units_match(requested: &str, supported: &str) -> bool {
    fn normalized(value: &str) -> String {
        let mut value = value.trim().to_lowercase();
        if value.ends_with('s') {
            value.pop();
        }
        match value.as_str() {
            "piece" | "pièce" => "piece".to_string(),
            "bottle" | "bouteille" => "bouteille".to_string(),
            other => other.to_string(),
        }
    }
    normalized(requested) == normalized(supported)
}

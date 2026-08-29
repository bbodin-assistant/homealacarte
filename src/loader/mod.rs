use crate::model::{Dataset, HouseholdItem, Ingredient, Person, SourceFile};
pub use self::inputs::MenuInput;
pub(crate) use self::localization::{
    dataset_with_localized_categories, food_rule_meal_name, localized_days, localized_meals,
    localized_menu_rows,
};
pub(crate) use self::menu::{
    FOOD_RULE_DAYS, annual_date_ordinal, merge_menu_rows, normalize_food_rules,
    normalize_menu,
};
use self::dishes::flatten_dishes;
use self::inputs::{Document, DishInput, HouseholdItemInput, HouseholdQuantityInput, IngredientInput, PersonInput, StockInput};
use self::prices::normalize_price_history;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};

mod dishes;
mod inputs;
mod localization;
mod menu;
mod prices;

const SECTIONS: &[&str] = &[
    "items",
    "dishes",
    "people",
    "menu",
    "stock",
    "extra_needs",
];

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

pub fn load_dataset(mut sources: Vec<SourceFile>, language: &str) -> Result<Dataset, String> {
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
        let unknown = object
            .keys()
            .filter(|key| !SECTIONS.contains(&key.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        if !unknown.is_empty() {
            return Err(format!(
                "{}: unsupported sections: {}",
                source.path,
                unknown.join(", ")
            ));
        }
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
        let mut seen_allergens = HashSet::new();
        let allergens = input
            .allergens
            .into_iter()
            .map(|allergen| allergen.trim().to_lowercase())
            .filter(|allergen| !allergen.is_empty() && seen_allergens.insert(allergen.clone()))
            .collect::<Vec<_>>();
        if let Some(allergen) = allergens
            .iter()
            .find(|allergen| !crate::model::ALLERGEN_CODES.contains(&allergen.as_str()))
        {
            return Err(format!("{path}: ingredient {key} has invalid allergen: {allergen}"));
        }
        ingredients.push(Ingredient {
            key,
            name: input.name.trim().to_string(),
            custom: input.custom,
            incomplete: input.incomplete,
            allergens,
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
            category: crate::locale::canonical_category(&input.category),
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
            purchase_item_key: input.purchase_item_key.trim().to_string(),
            purchase_grams_per_gram: input.purchase_grams_per_gram,
        });
    }
    let ingredient_by_key: HashMap<String, Ingredient> = ingredients
        .iter()
        .cloned()
        .map(|item| (item.key.clone(), item))
        .collect();
    for ingredient in &ingredients {
        if ingredient.purchase_grams_per_gram <= 0.0
            || !ingredient.purchase_grams_per_gram.is_finite()
        {
            return Err(format!(
                "ingredient {} has invalid purchase_grams_per_gram",
                ingredient.key
            ));
        }
        if !ingredient.purchase_item_key.is_empty() {
            if ingredient.purchase_item_key == ingredient.key {
                return Err(format!(
                    "ingredient {} cannot reference itself as its purchase item",
                    ingredient.key
                ));
            }
            let Some(purchase_item) = ingredient_by_key.get(&ingredient.purchase_item_key) else {
                return Err(format!(
                    "ingredient {} references missing purchase item: {}",
                    ingredient.key, ingredient.purchase_item_key
                ));
            };
            if !purchase_item.purchase_item_key.is_empty() {
                return Err(format!(
                    "ingredient {} references a purchase item that is itself converted: {}",
                    ingredient.key, ingredient.purchase_item_key
                ));
            }
        }
    }

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

    let menu_values = section_values(&documents, "menu")?;
    let menu_inputs = menu_values
        .into_iter()
        .map(|(path, value)| deserialize::<MenuInput>(&path, "menu", value))
        .collect::<Result<Vec<_>, _>>()?;
    let menu = normalize_menu(menu_inputs, &valid_items, &people_keys)?;

    let mut household_items = Vec::new();
    let mut household_keys = HashSet::new();
    let household_values = unified_item_values
        .into_iter()
        .filter(|(_, value)| {
            value.get("grams").is_none()
                && value.get("kcal").is_none()
                && value.get("price_per_kg").is_none()
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
            category: crate::locale::canonical_category(&input.category),
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
    let mut stock_added_at = BTreeMap::new();
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
        let added_at = input.added_at.trim();
        if !added_at.is_empty() {
            stock_added_at
                .entry(key.clone())
                .and_modify(|current: &mut String| {
                    if added_at < current.as_str() {
                        *current = added_at.to_string();
                    }
                })
                .or_insert_with(|| added_at.to_string());
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
        stock_added_at,
        household_items,
        household_needs,
        household_need_notes,
        household_stock,
        source_hash,
    })
}

fn normalize_person_kind(kind: Option<&str>) -> Result<String, String> {
    match kind.map(str::trim).unwrap_or("adult") {
        "adult" => Ok("adult".to_string()),
        "child" => Ok("child".to_string()),
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

use crate::loader::load_dataset;
use crate::model::*;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};

pub(super) fn is_language_tag(value: &str) -> bool {
    let mut parts = value.split('-');
    let Some(language) = parts.next() else {
        return false;
    };
    if language.len() != 2 || !language.chars().all(|character| character.is_ascii_alphabetic()) {
        return false;
    }
    parts.all(|part| {
        (2..=8).contains(&part.len())
            && part
                .chars()
                .all(|character| character.is_ascii_alphanumeric())
    })
}

pub(super) fn localized_dataset(
    sources: &[SourceFile],
    language: &str,
) -> Result<Dataset, String> {
    if !is_language_tag(language) {
        return Err(format!("unsupported language: {language}"));
    }
    let localized_sources = localize_sources(sources, language)?;
    let mut dataset = load_dataset(localized_sources, language)?;
    dataset.source_hash = source_hash(sources);
    Ok(dataset)
}

fn source_hash(sources: &[SourceFile]) -> String {
    let mut sources = sources.to_vec();
    sources.sort_by(|left, right| left.path.cmp(&right.path));
    let mut hasher = Sha256::new();
    for source in &sources {
        hasher.update(source.path.as_bytes());
        hasher.update([0]);
        hasher.update(source.content.as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

fn localize_sources(sources: &[SourceFile], language: &str) -> Result<Vec<SourceFile>, String> {
    sources
        .iter()
        .map(|source| {
            let mut value: Value = serde_json::from_str(&source.content)
                .map_err(|error| format!("{}: invalid JSON: {error}", source.path))?;
            if let Some(object) = value.as_object_mut() {
                for (section, section_value) in object {
                    let Some(rows) = section_value.as_array_mut() else {
                        continue;
                    };
                    for row in rows.iter_mut() {
                        if section == "items" {
                            if let Some(category) = row
                                .as_object_mut()
                                .and_then(|item| item.get_mut("category"))
                            {
                                resolve_localized_value(
                                    category,
                                    &crate::locale::fallback_locale(),
                                );
                            }
                        }
                        resolve_localized_value(row, language);
                    }
                }
            }
            Ok(SourceFile {
                path: source.path.clone(),
                content: serde_json::to_string(&value).map_err(|error| error.to_string())?,
            })
        })
        .collect()
}

fn localized_object(value: &Value) -> Option<&serde_json::Map<String, Value>> {
    let object = value.as_object()?;
    if object.is_empty()
        || !object
            .iter()
            .all(|(key, value)| is_language_tag(key) && value.is_string())
    {
        return None;
    }
    Some(object)
}

fn localized_string(value: &Value, language: &str) -> Option<String> {
    let object = localized_object(value)?;
    let language = language.to_ascii_lowercase();
    let primary = language.split('-').next().unwrap_or(language.as_str());
    let find = |candidate: &str| {
        object
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(candidate))
            .and_then(|(_, value)| value.as_str())
            .map(str::to_string)
    };
    let find_primary = |candidate: &str| {
        object
            .iter()
            .find(|(key, _)| {
                key.split('-')
                    .next()
                    .is_some_and(|key| key.eq_ignore_ascii_case(candidate))
            })
            .and_then(|(_, value)| value.as_str())
            .map(str::to_string)
    };
    find(&language)
        .or_else(|| find_primary(primary))
        .or_else(|| object.values().find_map(Value::as_str).map(str::to_string))
}

fn contains_localized_value(value: &Value) -> bool {
    if localized_object(value).is_some() {
        return true;
    }
    match value {
        Value::Array(values) => values.iter().any(contains_localized_value),
        Value::Object(values) => values.values().any(contains_localized_value),
        _ => false,
    }
}

fn resolve_localized_value(value: &mut Value, language: &str) {
    if let Some(localized) = localized_string(value, language) {
        *value = Value::String(localized);
        return;
    }
    match value {
        Value::Array(values) => {
            for value in values {
                resolve_localized_value(value, language);
            }
        }
        Value::Object(values) => {
            for value in values.values_mut() {
                resolve_localized_value(value, language);
            }
        }
        _ => {}
    }
}

fn choose_text(current: &str, source_current: &str, source_target: &str) -> String {
    if current == source_current {
        source_target.to_string()
    } else {
        current.to_string()
    }
}

fn choose_vec<T: Clone + PartialEq>(current: &[T], source_current: &[T], source_target: &[T]) -> Vec<T> {
    if current == source_current {
        source_target.to_vec()
    } else {
        current.to_vec()
    }
}

fn merge_ingredient(
    current: &Ingredient,
    source_current: &Ingredient,
    source_target: &Ingredient,
) -> Ingredient {
    Ingredient {
        name: choose_text(&current.name, &source_current.name, &source_target.name),
        source: choose_text(&current.source, &source_current.source, &source_target.source),
        url: choose_text(&current.url, &source_current.url, &source_target.url),
        price_source: choose_text(
            &current.price_source,
            &source_current.price_source,
            &source_target.price_source,
        ),
        price_checked_at: choose_text(
            &current.price_checked_at,
            &source_current.price_checked_at,
            &source_target.price_checked_at,
        ),
        price_history: choose_vec(
            &current.price_history,
            &source_current.price_history,
            &source_target.price_history,
        ),
        measure_unit: choose_text(
            &current.measure_unit,
            &source_current.measure_unit,
            &source_target.measure_unit,
        ),
        purchase_unit: choose_text(
            &current.purchase_unit,
            &source_current.purchase_unit,
            &source_target.purchase_unit,
        ),
        ..current.clone()
    }
}

fn dish_components_equal(left: &[DishComponent], right: &[DishComponent]) -> bool {
    left.len() == right.len()
        && left.iter().zip(right).all(|(left, right)| {
            left.item_key == right.item_key
                && left.grams == right.grams
                && left.quantity == right.quantity
                && left.quantity_unit == right.quantity_unit
                && left.source_quantity == right.source_quantity
        })
}

fn merge_dish(current: &Dish, source_current: &Dish, source_target: &Dish) -> Dish {
    Dish {
        name: choose_text(&current.name, &source_current.name, &source_target.name),
        origin_country: choose_text(
            &current.origin_country,
            &source_current.origin_country,
            &source_target.origin_country,
        ),
        recipe_url: choose_text(
            &current.recipe_url,
            &source_current.recipe_url,
            &source_target.recipe_url,
        ),
        source: choose_text(&current.source, &source_current.source, &source_target.source),
        source_notes: choose_vec(
            &current.source_notes,
            &source_current.source_notes,
            &source_target.source_notes,
        ),
        nutri_score: choose_text(
            &current.nutri_score,
            &source_current.nutri_score,
            &source_target.nutri_score,
        ),
        components: if dish_components_equal(&current.components, &source_current.components) {
            source_target.components.clone()
        } else {
            current.components.clone()
        },
        ..current.clone()
    }
}

fn merge_person(current: &Person, source_current: &Person, source_target: &Person) -> Person {
    Person {
        name: choose_text(&current.name, &source_current.name, &source_target.name),
        description: choose_text(
            &current.description,
            &source_current.description,
            &source_target.description,
        ),
        ..current.clone()
    }
}

fn merge_household_item(
    current: &HouseholdItem,
    source_current: &HouseholdItem,
    source_target: &HouseholdItem,
) -> HouseholdItem {
    HouseholdItem {
        name: choose_text(&current.name, &source_current.name, &source_target.name),
        purchase_unit: choose_text(
            &current.purchase_unit,
            &source_current.purchase_unit,
            &source_target.purchase_unit,
        ),
        price_history: choose_vec(
            &current.price_history,
            &source_current.price_history,
            &source_target.price_history,
        ),
        measure_unit: choose_text(
            &current.measure_unit,
            &source_current.measure_unit,
            &source_target.measure_unit,
        ),
        last_bought_at: choose_text(
            &current.last_bought_at,
            &source_current.last_bought_at,
            &source_target.last_bought_at,
        ),
        notes: choose_text(&current.notes, &source_current.notes, &source_target.notes),
        ..current.clone()
    }
}

fn merge_text_map(
    current: &BTreeMap<String, String>,
    source_current: &BTreeMap<String, String>,
    source_target: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    current
        .iter()
        .map(|(key, value)| {
            let next = match (source_current.get(key), source_target.get(key)) {
                (Some(source_current), Some(source_target)) => {
                    choose_text(value, source_current, source_target)
                }
                _ => value.clone(),
            };
            (key.clone(), next)
        })
        .collect()
}

fn merge_menu(
    current: &[MenuRow],
    source_current: &[MenuRow],
    source_target: &[MenuRow],
) -> Result<Vec<MenuRow>, String> {
    let mut used = vec![false; source_current.len()];
    current
        .iter()
        .map(|row| {
            let mut next = row.clone();
            let matching_index = source_current.iter().enumerate().position(|(index, source)| {
                !used[index]
                    && row.date == source.date
                    && row.day == source.day
                    && row.meal == source.meal
                    && row.item_key == source.item_key
                    && row.people == source.people
                    && row.quantity == source.quantity
            });
            if let Some(index) = matching_index {
                used[index] = true;
                let source_current = &source_current[index];
                let source_target = &source_target[index];
                next.notes = choose_text(
                    &row.notes,
                    &source_current.notes,
                    &source_target.notes,
                );
                next.quantity_unit = choose_text(
                    &row.quantity_unit,
                    &source_current.quantity_unit,
                    &source_target.quantity_unit,
                );
            }
            Ok(next)
        })
        .collect()
}

pub(super) fn merge_runtime_dataset(
    current: &Dataset,
    source_current: &Dataset,
    mut source_target: Dataset,
) -> Result<Dataset, String> {
    let target_ingredients = source_target.ingredients.clone();
    source_target.ingredients = current
        .ingredients
        .iter()
        .map(|item| {
            let source_current_item = source_current
                .ingredients
                .iter()
                .find(|source| source.key == item.key);
            let source_target_item = target_ingredients
                .iter()
                .find(|source| source.key == item.key);
            match (source_current_item, source_target_item) {
                (Some(source_current_item), Some(source_target_item)) => {
                    merge_ingredient(item, source_current_item, source_target_item)
                }
                _ => item.clone(),
            }
        })
        .collect();

    let target_dishes = source_target.dishes.clone();
    source_target.dishes = current
        .dishes
        .iter()
        .map(|dish| {
            let source_current_dish = source_current
                .dishes
                .iter()
                .find(|source| source.key == dish.key);
            let source_target_dish = target_dishes.iter().find(|source| source.key == dish.key);
            match (source_current_dish, source_target_dish) {
                (Some(source_current_dish), Some(source_target_dish)) => {
                    merge_dish(dish, source_current_dish, source_target_dish)
                }
                _ => dish.clone(),
            }
        })
        .collect();

    let target_people = source_target.people.clone();
    source_target.people = current
        .people
        .iter()
        .map(|person| {
            let source_current_person = source_current
                .people
                .iter()
                .find(|source| source.key == person.key);
            let source_target_person = target_people.iter().find(|source| source.key == person.key);
            match (source_current_person, source_target_person) {
                (Some(source_current_person), Some(source_target_person)) => {
                    merge_person(person, source_current_person, source_target_person)
                }
                _ => person.clone(),
            }
        })
        .collect();

    let target_household_items = source_target.household_items.clone();
    source_target.household_items = current
        .household_items
        .iter()
        .map(|item| {
            let source_current_item = source_current
                .household_items
                .iter()
                .find(|source| source.key == item.key);
            let source_target_item = target_household_items
                .iter()
                .find(|source| source.key == item.key);
            match (source_current_item, source_target_item) {
                (Some(source_current_item), Some(source_target_item)) => {
                    merge_household_item(item, source_current_item, source_target_item)
                }
                _ => item.clone(),
            }
        })
        .collect();

    let target_menu = source_target.menu.clone();
    source_target.menu = merge_menu(&current.menu, &source_current.menu, &target_menu)?;
    source_target.stock = current.stock.clone();
    source_target.stock_units = current.stock_units.clone();
    let target_stock_notes = source_target.stock_notes.clone();
    source_target.stock_notes = merge_text_map(
        &current.stock_notes,
        &source_current.stock_notes,
        &target_stock_notes,
    );
    source_target.household_needs = current.household_needs.clone();
    let target_household_need_notes = source_target.household_need_notes.clone();
    source_target.household_need_notes = merge_text_map(
        &current.household_need_notes,
        &source_current.household_need_notes,
        &target_household_need_notes,
    );
    source_target.household_stock = current.household_stock.clone();
    source_target.source_hash = current.source_hash.clone();
    Ok(source_target)
}

fn row_identity(section: &str, row: &Value) -> Option<String> {
    let field = match section {
        "menu" => return None,
        "stock" | "extra_needs" => "item_key",
        _ => "key",
    };
    row.get(field)?.as_str().map(str::to_string)
}

fn menu_row_identity(row: &Value) -> Option<String> {
    let row = row.as_object()?;
    let fallback = crate::locale::fallback_locale();
    let day_value = row.get("day")?;
    let day_text = localized_string(day_value, &fallback)
        .or_else(|| day_value.as_str().map(str::to_string))?;
    let day = crate::locale::day_key(&day_text).unwrap_or(day_text);
    let meal_value = row.get("meal")?;
    let meal_text = localized_string(meal_value, &fallback)
        .or_else(|| meal_value.as_str().map(str::to_string))?;
    let meal = crate::locale::meal_key(&meal_text).unwrap_or(meal_text);
    let people = row.get("people").cloned().or_else(|| {
        row.get("person")
            .cloned()
            .map(|person| Value::Array(vec![person]))
    })?;
    let quantity = row
        .get("quantity")
        .or_else(|| row.get("portions"))?
        .as_f64()?;
    Some(format!(
        "{}\0{}\0{}\0{}\0{}\0{:016x}",
        row.get("date").and_then(Value::as_str).unwrap_or_default(),
        day,
        meal,
        row.get("item_key").and_then(Value::as_str)?,
        people,
        quantity.to_bits(),
    ))
}

fn restore_localized_fields(template: &Value, current: &mut Value, language: &str) {
    if let Some(localized) = localized_string(template, language) {
        if current.as_str() == Some(localized.as_str()) {
            *current = template.clone();
        }
        return;
    }
    match (template, current) {
        (Value::Array(template), Value::Array(current)) => {
            for (template, current) in template.iter().zip(current.iter_mut()) {
                restore_localized_fields(template, current, language);
            }
        }
        (Value::Object(template), Value::Object(current)) => {
            for (key, template) in template {
                if let Some(current) = current.get_mut(key) {
                    restore_localized_fields(template, current, language);
                }
            }
        }
        _ => {}
    }
}

pub(super) fn rehydrate_localized_data(
    exported: &mut Value,
    sources: &[SourceFile],
    language: &str,
) -> Result<(), String> {
    if sources.is_empty() {
        return Ok(());
    }
    let mut matched_menu_rows = HashSet::new();
    for source in sources {
        let value: Value = serde_json::from_str(&source.content)
            .map_err(|error| format!("{}: invalid JSON: {error}", source.path))?;
        let Some(source_sections) = value.as_object() else {
            continue;
        };
        for (section, source_rows) in source_sections {
            let Some(source_rows) = source_rows.as_array() else {
                continue;
            };
            let Some(exported_rows) = exported.get_mut(section).and_then(Value::as_array_mut) else {
                continue;
            };
            for source_row in source_rows {
                if !contains_localized_value(source_row) {
                    continue;
                }
                let mut template = source_row.clone();
                let menu_identity = if section == "menu" {
                    menu_row_identity(&template)
                } else {
                    None
                };
                if section == "menu" {
                    if let Some(menu) = template.as_object_mut() {
                        menu.remove("day");
                        menu.remove("meal");
                    }
                } else if section == "items" {
                    if let Some(item) = template.as_object_mut() {
                        item.remove("category");
                    }
                }
                let current = if section == "menu" {
                    let Some(identity) = menu_identity else {
                        continue;
                    };
                    let Some((current_index, current)) = exported_rows
                        .iter_mut()
                        .enumerate()
                        .find(|(current_index, row)| {
                            !matched_menu_rows.contains(current_index)
                                && menu_row_identity(row).as_deref() == Some(identity.as_str())
                        })
                    else {
                        continue;
                    };
                    matched_menu_rows.insert(current_index);
                    current
                } else {
                    let Some(identity) = row_identity(section, &template) else {
                        continue;
                    };
                    let Some(current) = exported_rows.iter_mut().find(|row| {
                        row_identity(section, row).as_deref() == Some(identity.as_str())
                    }) else {
                        continue;
                    };
                    current
                };
                restore_localized_fields(&template, current, language);
            }
        }
    }
    Ok(())
}

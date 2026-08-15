use crate::model::{Dish, DishComponent, Ingredient};
use super::inputs::DishInput;
use serde_json::Value;
use std::collections::HashMap;

pub(crate) fn flatten_dishes(
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
        let origin_country = input.origin_country.trim().to_uppercase();
        if !origin_country.is_empty()
            && (origin_country.len() != 2
                || !origin_country.chars().all(|character| character.is_ascii_alphabetic()))
        {
            return Err(format!(
                "dish {key} has invalid origin country code: {origin_country}"
            ));
        }
        let dish = Dish {
            key: input.key.clone(),
            name: input.name.clone(),
            origin_country,
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

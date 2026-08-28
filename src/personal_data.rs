use crate::{AppConfig, Engine, SourceFile};
use serde::Serialize;
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, HashMap, HashSet};

const CURRENT_AND_LEGACY_SECTIONS: &[&str] = &[
    "items",
    "ingredients",
    "household_items",
    "dishes",
    "people",
    "menu",
    "stock",
    "household_stock",
    "extra_needs",
    "household_needs",
];

const NUTRI_SCORE_FIELDS: &[&str] = &[
    "sugars_g",
    "saturated_fat_g",
    "salt_g",
    "fruit_vegetable_legume_percent",
];
const ALL_CURRENT_PRICE_FIELDS: &[&str] = &[
    "price_per_kg",
    "price_source",
    "price_checked_at",
    "estimated_price",
    "price_history",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PersonalDataReport {
    pub ingredients: usize,
    pub household_items: usize,
    pub dishes: usize,
    pub people: usize,
    pub menu: usize,
    pub stock: usize,
    pub extra_needs: usize,
    pub missing_nutrition_values: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct MergeConflict {
    pub collection: String,
    pub key: String,
    pub field: String,
    pub base: Value,
    pub overlay: Value,
    pub resolution: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PriceHistoryMerge {
    pub key: String,
    pub observations: usize,
    pub selected_date: String,
    pub selected_price: f64,
    pub selected_description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NutritionEnrichment {
    pub key: String,
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PersonalMergeAudit {
    pub base: PersonalDataReport,
    pub overlay: PersonalDataReport,
    pub merged: PersonalDataReport,
    pub added_overlay_records: BTreeMap<String, usize>,
    pub filled_fields: BTreeMap<String, usize>,
    pub nutrition_enrichments: Vec<NutritionEnrichment>,
    pub price_history_merges: Vec<PriceHistoryMerge>,
    pub conflicts: Vec<MergeConflict>,
}

fn section(
    object: &Map<String, Value>,
    name: &str,
    source_path: &str,
) -> Result<Vec<Value>, String> {
    match object.get(name) {
        None => Ok(Vec::new()),
        Some(Value::Array(values)) => Ok(values.clone()),
        Some(_) => Err(format!("{source_path}: section {name} must be an array")),
    }
}

fn rename_field(
    value: &mut Value,
    old_name: &str,
    new_name: &str,
    context: &str,
) -> Result<(), String> {
    let object = value
        .as_object_mut()
        .ok_or_else(|| format!("{context}: expected an object"))?;
    let Some(old_value) = object.remove(old_name) else {
        return Ok(());
    };
    if let Some(new_value) = object.get(new_name) {
        if new_value != &old_value {
            return Err(format!(
                "{context}: conflicting {old_name} and {new_name} values"
            ));
        }
    } else {
        object.insert(new_name.to_string(), old_value);
    }
    Ok(())
}

fn normalize_dish(mut dish: Value, context: &str) -> Result<Value, String> {
    let object = dish
        .as_object_mut()
        .ok_or_else(|| format!("{context}: expected a dish object"))?;
    let components = object
        .get_mut("components")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("{context}: dish components must be an array"))?;
    for (index, component) in components.iter_mut().enumerate() {
        rename_field(
            component,
            "ingredient_key",
            "item_key",
            &format!("{context}.components[{}]", index + 1),
        )?;
    }
    Ok(dish)
}

fn normalize_item_reference(mut row: Value, context: &str) -> Result<Value, String> {
    rename_field(&mut row, "ingredient_key", "item_key", context)?;
    rename_field(&mut row, "household_item_key", "item_key", context)?;
    Ok(row)
}

fn normalize_people(people: &mut Vec<Value>) -> Result<(), String> {
    let default_indexes = people
        .iter()
        .enumerate()
        .filter_map(|(index, person)| {
            (person.get("default").and_then(Value::as_bool) == Some(true)).then_some(index)
        })
        .collect::<Vec<_>>();
    if default_indexes.len() > 1 {
        return Err("personal data declares more than one default person".to_string());
    }
    if let Some(index) = default_indexes.first().copied() {
        let default_person = people.remove(index);
        people.insert(0, default_person);
    }
    for (index, person) in people.iter_mut().enumerate() {
        person
            .as_object_mut()
            .ok_or_else(|| format!("people[{}]: expected an object", index + 1))?
            .remove("default");
    }
    Ok(())
}

pub fn consolidate_personal_sources(
    mut sources: Vec<SourceFile>,
    language: &str,
) -> Result<(String, PersonalDataReport), String> {
    sources.sort_by(|left, right| left.path.cmp(&right.path));
    let supported = CURRENT_AND_LEGACY_SECTIONS
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let mut items = Vec::new();
    let mut dishes = Vec::new();
    let mut people = Vec::new();
    let mut menu = Vec::new();
    let mut stock = Vec::new();
    let mut extra_needs = Vec::new();

    for source in sources {
        let document: Value = serde_json::from_str(&source.content)
            .map_err(|error| format!("{}: invalid JSON: {error}", source.path))?;
        let object = document
            .as_object()
            .ok_or_else(|| format!("{}: top level must be an object", source.path))?;
        let unknown = object
            .keys()
            .filter(|key| !supported.contains(key.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        if !unknown.is_empty() {
            return Err(format!(
                "{}: unsupported sections: {}",
                source.path,
                unknown.join(", ")
            ));
        }

        for name in ["items", "ingredients", "household_items"] {
            items.extend(section(object, name, &source.path)?);
        }
        for (index, dish) in section(object, "dishes", &source.path)?
            .into_iter()
            .enumerate()
        {
            dishes.push(normalize_dish(
                dish,
                &format!("{}.dishes[{}]", source.path, index + 1),
            )?);
        }
        people.extend(section(object, "people", &source.path)?);
        menu.extend(section(object, "menu", &source.path)?);
        for name in ["stock", "household_stock"] {
            for (index, row) in section(object, name, &source.path)?
                .into_iter()
                .enumerate()
            {
                stock.push(normalize_item_reference(
                    row,
                    &format!("{}.{name}[{}]", source.path, index + 1),
                )?);
            }
        }
        for name in ["extra_needs", "household_needs"] {
            for (index, row) in section(object, name, &source.path)?
                .into_iter()
                .enumerate()
            {
                extra_needs.push(normalize_item_reference(
                    row,
                    &format!("{}.{name}[{}]", source.path, index + 1),
                )?);
            }
        }
    }

    normalize_people(&mut people)?;
    let extra_needs_count = extra_needs.len();
    let consolidated = json!({
        "items": items,
        "dishes": dishes,
        "people": people,
        "menu": menu,
        "stock": stock,
        "extra_needs": extra_needs,
    });
    let mut engine = Engine::default();
    let snapshot = engine.load(
        vec![SourceFile {
            path: "personal-data-migration.json".to_string(),
            content: serde_json::to_string(&consolidated).map_err(|error| error.to_string())?,
        }],
        AppConfig {
            language: language.to_string(),
        },
    )?;
    let missing_nutrition_values = snapshot
        .ingredients
        .iter()
        .map(|item| {
            [
                item.sugars_g,
                item.saturated_fat_g,
                item.salt_g,
                item.fruit_vegetable_legume_percent,
            ]
            .iter()
            .filter(|value| value.is_none())
            .count()
        })
        .sum();
    let report = PersonalDataReport {
        ingredients: snapshot.counts.ingredients,
        household_items: snapshot.counts.household_items,
        dishes: snapshot.counts.dishes,
        people: snapshot.counts.people,
        menu: snapshot.counts.menu,
        stock: snapshot.counts.stock,
        extra_needs: extra_needs_count,
        missing_nutrition_values,
    };
    Ok((engine.export_data("consolidated")?, report))
}

fn missing(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => true,
        Some(Value::String(value)) => value.trim().is_empty() || value == "MISSINGVALUE",
        _ => false,
    }
}

fn key_of(value: &Value, collection: &str) -> Result<String, String> {
    let field = if matches!(collection, "stock" | "extra_needs") {
        "item_key"
    } else {
        "key"
    };
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|key| !key.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("{collection}: record is missing {field}"))
}

fn current_price_observation(object: &Map<String, Value>, source_name: &str) -> Option<Value> {
    let price = object
        .get("price_per_kg")
        .or_else(|| object.get("estimated_price"))
        .and_then(Value::as_f64)?;
    let date = object
        .get("price_checked_at")
        .or_else(|| object.get("last_bought_at"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let description = object
        .get("price_source")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            object
                .get("notes")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(source_name)
        });
    Some(json!({
        "date": date,
        "price": price,
        "description": description,
    }))
}

fn price_observation_identity(value: &Value) -> String {
    format!(
        "{}|{}|{}|{}",
        value.get("date").and_then(Value::as_str).unwrap_or(""),
        value.get("price").and_then(Value::as_f64).unwrap_or(0.0),
        value
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or(""),
        value.get("purchase").map(Value::to_string).unwrap_or_default(),
    )
}

fn merge_price_history(
    base: &mut Map<String, Value>,
    overlay: &Map<String, Value>,
    key: &str,
    audit: &mut PersonalMergeAudit,
) {
    let mut observations = base
        .get("price_history")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    observations.extend(
        overlay
            .get("price_history")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    );
    for observation in [
        current_price_observation(base, "Imported from dataweb"),
        current_price_observation(overlay, "Imported from perso-data"),
    ]
    .into_iter()
    .flatten()
    {
        let date = observation.get("date").and_then(Value::as_str);
        let price = observation.get("price").and_then(Value::as_f64);
        if !observations.iter().any(|existing| {
            existing.get("date").and_then(Value::as_str) == date
                && existing.get("price").and_then(Value::as_f64) == price
        }) {
            observations.push(observation);
        }
    }
    let mut unique = BTreeMap::new();
    for observation in observations {
        unique
            .entry(price_observation_identity(&observation))
            .or_insert(observation);
    }
    let mut observations = unique.into_values().collect::<Vec<_>>();
    observations.sort_by(|left, right| {
        left.get("date")
            .and_then(Value::as_str)
            .unwrap_or("")
            .cmp(right.get("date").and_then(Value::as_str).unwrap_or(""))
            .then_with(|| {
                left.get("price")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0)
                    .total_cmp(
                        &right
                            .get("price")
                            .and_then(Value::as_f64)
                            .unwrap_or(0.0),
                    )
            })
            .then_with(|| price_observation_identity(left).cmp(&price_observation_identity(right)))
    });
    let selected = observations
        .iter()
        .max_by_key(|observation| {
            let date = observation
                .get("date")
                .and_then(Value::as_str)
                .unwrap_or("");
            let description = observation
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("");
            (
                !date.is_empty(),
                date,
                description.contains("Ticket de caisse"),
            )
        })
        .cloned();
    base.insert("price_history".to_string(), Value::Array(observations.clone()));
    if let Some(selected) = selected {
        let price = selected
            .get("price")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let date = selected
            .get("date")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let description = selected
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if base.contains_key("price_per_kg") {
            base.insert("price_per_kg".to_string(), json!(price));
            base.insert("price_checked_at".to_string(), json!(date));
            base.insert("price_source".to_string(), json!(description));
        } else if base.contains_key("estimated_price") {
            base.insert("estimated_price".to_string(), json!(price));
        }
        audit.price_history_merges.push(PriceHistoryMerge {
            key: key.to_string(),
            observations: observations.len(),
            selected_date: date,
            selected_price: price,
            selected_description: description,
        });
    }
}

fn merge_object(
    base: &mut Value,
    overlay: &Value,
    collection: &str,
    key: &str,
    audit: &mut PersonalMergeAudit,
) -> Result<(), String> {
    let base_object = base
        .as_object_mut()
        .ok_or_else(|| format!("{collection} {key}: base record must be an object"))?;
    let overlay_object = overlay
        .as_object()
        .ok_or_else(|| format!("{collection} {key}: overlay record must be an object"))?;
    if collection == "items" {
        merge_price_history(base_object, overlay_object, key, audit);
    }

    let mut enriched_nutrition = Vec::new();
    for (field, overlay_value) in overlay_object {
        if collection == "items" && ALL_CURRENT_PRICE_FIELDS.contains(&field.as_str()) {
            continue;
        }
        let base_value = base_object.get(field);
        if missing(base_value) && !missing(Some(overlay_value)) {
            base_object.insert(field.clone(), overlay_value.clone());
            *audit
                .filled_fields
                .entry(format!("{collection}.{field}"))
                .or_default() += 1;
            if collection == "items" && NUTRI_SCORE_FIELDS.contains(&field.as_str()) {
                enriched_nutrition.push(field.clone());
            }
        } else if !missing(base_value)
            && !missing(Some(overlay_value))
            && base_value != Some(overlay_value)
        {
            audit.conflicts.push(MergeConflict {
                collection: collection.to_string(),
                key: key.to_string(),
                field: field.clone(),
                base: base_value.cloned().unwrap_or(Value::Null),
                overlay: overlay_value.clone(),
                resolution: "kept dataweb base value".to_string(),
            });
        }
    }
    if !enriched_nutrition.is_empty() {
        audit.nutrition_enrichments.push(NutritionEnrichment {
            key: key.to_string(),
            fields: enriched_nutrition,
        });
    }
    Ok(())
}

fn merge_keyed_collection(
    base: &mut Vec<Value>,
    overlay: &[Value],
    collection: &str,
    audit: &mut PersonalMergeAudit,
) -> Result<(), String> {
    let mut indexes = base
        .iter()
        .enumerate()
        .map(|(index, value)| Ok((key_of(value, collection)?, index)))
        .collect::<Result<HashMap<_, _>, String>>()?;
    for overlay_value in overlay {
        let key = key_of(overlay_value, collection)?;
        if let Some(index) = indexes.get(&key).copied() {
            merge_object(&mut base[index], overlay_value, collection, &key, audit)?;
        } else {
            indexes.insert(key, base.len());
            base.push(overlay_value.clone());
            *audit
                .added_overlay_records
                .entry(collection.to_string())
                .or_default() += 1;
        }
    }
    Ok(())
}

fn merge_menu(
    base: &mut Vec<Value>,
    overlay: &[Value],
    audit: &mut PersonalMergeAudit,
) -> Result<(), String> {
    let mut identities = base
        .iter()
        .map(serde_json::to_string)
        .collect::<Result<HashSet<_>, _>>()
        .map_err(|error| format!("cannot compare menu rows: {error}"))?;
    for row in overlay {
        let identity = serde_json::to_string(row)
            .map_err(|error| format!("cannot compare menu row: {error}"))?;
        if identities.insert(identity) {
            base.push(row.clone());
            *audit
                .added_overlay_records
                .entry("menu".to_string())
                .or_default() += 1;
        }
    }
    Ok(())
}

fn combine_quantity_rows(
    base: &mut Vec<Value>,
    overlay: &[Value],
    collection: &str,
    audit: &mut PersonalMergeAudit,
) {
    base.extend_from_slice(overlay);
    *audit
        .added_overlay_records
        .entry(collection.to_string())
        .or_default() += overlay.len();
}

fn document_section(document: &Value, name: &str) -> Result<Vec<Value>, String> {
    document
        .get(name)
        .and_then(Value::as_array)
        .cloned()
        .ok_or_else(|| format!("canonical personal data is missing {name}"))
}

pub fn merge_personal_documents(
    base_content: &str,
    overlay_content: &str,
    language: &str,
) -> Result<(String, PersonalMergeAudit), String> {
    let base_document: Value =
        serde_json::from_str(base_content).map_err(|error| format!("invalid base JSON: {error}"))?;
    let overlay_document: Value = serde_json::from_str(overlay_content)
        .map_err(|error| format!("invalid overlay JSON: {error}"))?;
    let base_report = report_for_document(base_content, language)?;
    let overlay_report = report_for_document(overlay_content, language)?;
    let mut audit = PersonalMergeAudit {
        base: base_report,
        overlay: overlay_report,
        merged: PersonalDataReport {
            ingredients: 0,
            household_items: 0,
            dishes: 0,
            people: 0,
            menu: 0,
            stock: 0,
            extra_needs: 0,
            missing_nutrition_values: 0,
        },
        added_overlay_records: BTreeMap::new(),
        filled_fields: BTreeMap::new(),
        nutrition_enrichments: Vec::new(),
        price_history_merges: Vec::new(),
        conflicts: Vec::new(),
    };
    let mut items = document_section(&base_document, "items")?;
    let mut dishes = document_section(&base_document, "dishes")?;
    let mut people = document_section(&base_document, "people")?;
    let mut menu = document_section(&base_document, "menu")?;
    let mut stock = document_section(&base_document, "stock")?;
    let mut extra_needs = document_section(&base_document, "extra_needs")?;

    merge_keyed_collection(
        &mut items,
        &document_section(&overlay_document, "items")?,
        "items",
        &mut audit,
    )?;
    merge_keyed_collection(
        &mut dishes,
        &document_section(&overlay_document, "dishes")?,
        "dishes",
        &mut audit,
    )?;
    merge_keyed_collection(
        &mut people,
        &document_section(&overlay_document, "people")?,
        "people",
        &mut audit,
    )?;
    merge_menu(
        &mut menu,
        &document_section(&overlay_document, "menu")?,
        &mut audit,
    )?;
    combine_quantity_rows(
        &mut stock,
        &document_section(&overlay_document, "stock")?,
        "stock",
        &mut audit,
    );
    combine_quantity_rows(
        &mut extra_needs,
        &document_section(&overlay_document, "extra_needs")?,
        "extra_needs",
        &mut audit,
    );

    let merged = json!({
        "items": items,
        "dishes": dishes,
        "people": people,
        "menu": menu,
        "stock": stock,
        "extra_needs": extra_needs,
    });
    let unvalidated =
        serde_json::to_string(&merged).map_err(|error| format!("cannot encode merge: {error}"))?;
    let mut engine = Engine::default();
    engine.load(
        vec![SourceFile {
            path: "merged-personal-data.json".to_string(),
            content: unvalidated,
        }],
        AppConfig {
            language: language.to_string(),
        },
    )?;
    let content = engine.export_data("consolidated")?;
    audit.merged = report_for_document(&content, language)?;
    Ok((content, audit))
}

fn report_for_document(content: &str, language: &str) -> Result<PersonalDataReport, String> {
    let (_, report) = consolidate_personal_sources(
        vec![SourceFile {
            path: "personal-data-report.json".to_string(),
            content: content.to_string(),
        }],
        language,
    )?;
    Ok(report)
}

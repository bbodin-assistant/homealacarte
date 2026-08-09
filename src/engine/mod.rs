use crate::loader::{
    MenuInput, load_dataset, localize_day, localize_meal, normalize_food_rules, normalize_menu,
};
use crate::grocery::{food_identity, ingredient_requirements};
use crate::model::*;
use crate::price_history::preserve_price_history;
use crate::snapshot::build_snapshot;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap, HashSet};

mod catalogue;

const EPSILON: f64 = 1e-6;

fn quantity_row(key: &str, quantity: f64, quantity_unit: &str, note: Option<&String>) -> Value {
    let mut row = json!({
        "item_key": key,
        "quantity": quantity,
        "quantity_unit": quantity_unit,
    });
    if let Some(note) = note.filter(|value| !value.trim().is_empty()) {
        row["notes"] = Value::String(note.clone());
    }
    row
}

pub struct Engine {
    pub dataset: Option<Dataset>,
    pub language: String,
    pub profile: Option<String>,
}

impl Default for Engine {
    fn default() -> Self {
        Self {
            dataset: None,
            language: "fr".to_string(),
            profile: None,
        }
    }
}

fn preserve_or_replace_note(
    notes: &mut BTreeMap<String, String>,
    previous: &BTreeMap<String, String>,
    key: &str,
    edited: Option<&str>,
) {
    match edited {
        Some(value) if !value.trim().is_empty() => {
            notes.insert(key.to_string(), value.trim().to_string());
        }
        Some(_) => {
            notes.remove(key);
        }
        None => {
            if let Some(value) = previous.get(key) {
                notes.insert(key.to_string(), value.clone());
            }
        }
    }
}

impl Engine {
    pub fn load(&mut self, sources: Vec<SourceFile>, config: AppConfig) -> Result<AppSnapshot, String> {
        let dataset = load_dataset(sources, &config.language)?;
        self.language = config.language;
        self.profile = dataset
            .people
            .iter()
            .find(|person| person.kcal_target.is_some())
            .map(|person| person.key.clone());
        self.dataset = Some(dataset);
        self.snapshot()
    }

    pub fn replace_menu(&mut self, inputs: Vec<MenuInput>) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let valid_items: HashSet<String> = dataset
            .ingredients
            .iter()
            .map(|item| item.key.clone())
            .chain(dataset.dishes.iter().map(|item| item.key.clone()))
            .collect();
        let valid_people: HashSet<String> =
            dataset.people.iter().map(|person| person.key.clone()).collect();
        let default_person = dataset.people.first().map(|person| person.key.as_str());
        dataset.menu = normalize_menu(
            inputs,
            &self.language,
            &valid_items,
            &valid_people,
            default_person,
        )?;
        self.snapshot()
    }

    pub fn replace_people(&mut self, mut people: Vec<Person>) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let valid_items = dataset
            .ingredients
            .iter()
            .map(|item| item.key.clone())
            .chain(dataset.dishes.iter().map(|dish| dish.key.clone()))
            .collect::<HashSet<_>>();
        let mut keys = HashSet::new();
        for (index, person) in people.iter_mut().enumerate() {
            person.key = person.key.trim().to_string();
            person.name = person.name.trim().to_string();
            person.description = person.description.trim().to_string();
            person.food_rules = normalize_food_rules(
                std::mem::take(&mut person.food_rules),
                &valid_items,
                &format!("family member {}", index + 1),
            )?;
            person.kind = match person.kind.trim().to_lowercase().as_str() {
                "" | "adult" => "adult".to_string(),
                "child" | "kid" | "enfant" => "child".to_string(),
                kind => {
                    return Err(format!(
                        "family member {} has invalid kind: {kind}",
                        index + 1
                    ));
                }
            };
            if person.key.is_empty() || !keys.insert(person.key.clone()) {
                return Err(format!(
                    "family member {} has an empty or duplicate key",
                    index + 1
                ));
            }
            if person.name.is_empty() {
                return Err(format!("family member {} has no name", index + 1));
            }
            if person.kcal_target.is_some_and(|target| !target.is_finite() || target <= 0.0) {
                return Err(format!(
                    "family member {} has an invalid calorie target",
                    index + 1
                ));
            }
        }

        dataset.people = people;
        dataset.menu.retain_mut(|row| {
            row.people.retain(|key| keys.contains(key));
            !row.people.is_empty()
        });
        let current_profile = self.profile.clone();
        self.profile = dataset
            .people
            .iter()
            .find(|person| {
                current_profile
                    .as_ref()
                    .is_some_and(|profile| &person.key == profile)
                    && person.kcal_target.is_some()
            })
            .or_else(|| dataset.people.iter().find(|person| person.kcal_target.is_some()))
            .map(|person| person.key.clone());
        self.snapshot()
    }

    pub fn replace_stock(&mut self, inputs: Vec<StockUpdate>) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let ingredients: HashMap<String, (f64, String)> = dataset
            .ingredients
            .iter()
            .map(|item| {
                (
                    item.key.clone(),
                    (item.grams_per_measure_unit, item.measure_unit.clone()),
                )
            })
            .collect();
        let household_items = dataset
            .household_items
            .iter()
            .map(|item| item.key.clone())
            .collect::<HashSet<_>>();
        let mut stock = BTreeMap::new();
        let mut stock_units = BTreeMap::new();
        let mut household_stock = BTreeMap::new();
        let previous_notes = dataset.stock_notes.clone();
        let mut stock_notes = BTreeMap::new();
        for (index, input) in inputs.into_iter().enumerate() {
            let key = input.item_key.trim();
            if input.household {
                if !household_items.contains(key) {
                    return Err(format!(
                        "household stock item {} references unknown item: {key}",
                        index + 1
                    ));
                }
                if !input.quantity.is_finite() || input.quantity < 0.0 {
                    return Err(format!(
                        "household stock item {} quantity must not be negative",
                        index + 1
                    ));
                }
                if input.quantity_unit.trim().to_lowercase() != "unit" {
                    return Err(format!(
                        "household stock item {} has invalid unit: {}",
                        index + 1,
                        input.quantity_unit
                    ));
                }
                if input.quantity > EPSILON {
                    *household_stock.entry(key.to_string()).or_insert(0.0) += input.quantity;
                    preserve_or_replace_note(
                        &mut stock_notes,
                        &previous_notes,
                        key,
                        input.notes.as_deref(),
                    );
                }
                continue;
            }
            let (grams_per_unit, _) = ingredients
                .get(key)
                .ok_or_else(|| format!("stock item {} references unknown ingredient: {key}", index + 1))?;
            if !input.quantity.is_finite() || input.quantity < 0.0 {
                return Err(format!("stock item {} quantity must not be negative", index + 1));
            }
            let quantity_unit = input.quantity_unit.trim().to_lowercase();
            let grams = match quantity_unit.as_str() {
                "g" => input.quantity,
                "unit" => input.quantity * grams_per_unit,
                unit => return Err(format!("stock item {} has invalid unit: {unit}", index + 1)),
            };
            if grams > EPSILON {
                stock_units.insert(key.to_string(), quantity_unit);
                *stock.entry(key.to_string()).or_insert(0.0) += grams;
                preserve_or_replace_note(
                    &mut stock_notes,
                    &previous_notes,
                    key,
                    input.notes.as_deref(),
                );
            }
        }
        dataset.stock = stock;
        dataset.stock_units = stock_units;
        dataset.stock_notes = stock_notes;
        dataset.household_stock = household_stock;
        self.snapshot()
    }

    pub fn set_grocery_stock(
        &mut self,
        item_ids: Vec<String>,
        stocked: bool,
    ) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let requirements = ingredient_requirements(dataset);
        let ingredients = dataset
            .ingredients
            .iter()
            .map(|item| (item.key.clone(), item))
            .collect::<HashMap<_, _>>();

        for item_id in item_ids {
            if let Some(key) = item_id.strip_prefix("household-") {
                let needed = dataset
                    .household_needs
                    .get(key)
                    .copied()
                    .ok_or_else(|| format!("unknown grocery item: {item_id}"))?;
                if stocked {
                    let quantity = dataset.household_stock.entry(key.to_string()).or_default();
                    *quantity = quantity.max(needed);
                } else {
                    dataset.household_stock.remove(key);
                    dataset.stock_notes.remove(key);
                }
                continue;
            }

            let matching = requirements
                .iter()
                .filter_map(|(key, needed)| {
                    ingredients.get(key).and_then(|ingredient| {
                        (format!("food-{}", food_identity(ingredient)) == item_id)
                            .then_some((key.clone(), *needed))
                    })
                })
                .collect::<Vec<_>>();
            if matching.is_empty() {
                return Err(format!("unknown grocery item: {item_id}"));
            }
            for (key, needed) in matching {
                if stocked {
                    let quantity = dataset.stock.entry(key.clone()).or_default();
                    *quantity = quantity.max(needed);
                    dataset.stock_units.entry(key.clone()).or_insert_with(|| "g".to_string());
                } else {
                    dataset.stock.remove(&key);
                    dataset.stock_units.remove(&key);
                    dataset.stock_notes.remove(&key);
                }
            }
        }
        self.snapshot()
    }

    pub fn replace_custom_grocery(
        &mut self,
        inputs: Vec<CustomGroceryItem>,
    ) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let mut keys = HashSet::new();
        let mut needs = BTreeMap::new();
        let previous_notes = dataset.household_need_notes.clone();
        let mut need_notes = BTreeMap::new();
        let existing = dataset
            .household_items
            .iter()
            .enumerate()
            .map(|(index, item)| (item.key.clone(), index))
            .collect::<HashMap<_, _>>();
        let item_keys = dataset
            .ingredients
            .iter()
            .map(|item| item.key.as_str())
            .collect::<HashSet<_>>();

        for (index, input) in inputs.into_iter().enumerate() {
            let key = input.key.trim().to_string();
            if key.is_empty() || !keys.insert(key.clone()) {
                return Err(format!("additional grocery item {} has an empty or duplicate key", index + 1));
            }
            if input.name.trim().is_empty()
                || input.category.trim().is_empty()
                || input.measure_unit.trim().is_empty()
                || input.purchase_unit.trim().is_empty()
            {
                return Err(format!("additional grocery item {} has a missing label", index + 1));
            }
            if !input.quantity.is_finite()
                || input.quantity <= 0.0
                || !input.purchase_quantity.is_finite()
                || input.purchase_quantity <= 0.0
                || !input.estimated_price.is_finite()
                || input.estimated_price < 0.0
            {
                return Err(format!("additional grocery item {} has an invalid quantity or price", index + 1));
            }

            if item_keys.contains(key.as_str()) {
                preserve_or_replace_note(
                    &mut need_notes,
                    &previous_notes,
                    &key,
                    input.notes.as_deref(),
                );
                needs.insert(key, input.quantity);
                continue;
            }

            let previous = existing
                .get(&key)
                .and_then(|item_index| dataset.household_items.get(*item_index));
            let mut item = HouseholdItem {
                key: key.clone(),
                name: input.name.trim().to_string(),
                category: input.category.trim().to_string(),
                purchase_unit: input.purchase_unit.trim().to_string(),
                purchase_quantity: input.purchase_quantity,
                estimated_price: input.estimated_price,
                price_history: previous
                    .map(|item| item.price_history.clone())
                    .unwrap_or_default(),
                measure_unit: input.measure_unit.trim().to_string(),
                last_bought_at: previous.map(|item| item.last_bought_at.clone()).unwrap_or_default(),
                lasting_days: previous.and_then(|item| item.lasting_days),
                notes: previous.map(|item| item.notes.clone()).unwrap_or_default(),
                custom: input.custom || previous.is_some_and(|item| item.custom),
            };
            preserve_price_history(
                &mut item.price_history,
                &[],
                &item.last_bought_at,
                item.estimated_price,
                &item.notes,
            );
            if let Some(item_index) = existing.get(&key) {
                dataset.household_items[*item_index] = item;
            } else {
                dataset.household_items.push(item);
            }
            preserve_or_replace_note(
                &mut need_notes,
                &previous_notes,
                &key,
                input.notes.as_deref(),
            );
            needs.insert(key, input.quantity);
        }
        dataset.household_needs = needs;
        dataset.household_need_notes = need_notes;
        self.snapshot()
    }


    pub fn set_language(&mut self, language: String) -> Result<AppSnapshot, String> {
        if language != "fr" && language != "en" {
            return Err(format!("unsupported language: {language}"));
        }
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        for row in &mut dataset.menu {
            row.day = localize_day(&row.day, &language)?;
            row.meal = localize_meal(&row.meal, &language)?;
        }
        self.language = language;
        self.snapshot()
    }

    pub fn set_profile(&mut self, profile: Option<String>) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_ref().ok_or("no dataset loaded")?;
        if let Some(key) = &profile
            && !dataset
                .people
                .iter()
                .any(|person| &person.key == key && person.kcal_target.is_some())
        {
            return Err(format!("unknown nutrition profile: {key}"));
        }
        self.profile = profile;
        self.snapshot()
    }

    pub fn snapshot(&self) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_ref().ok_or("no dataset loaded")?;
        build_snapshot(dataset, &self.language, self.profile.as_deref())
    }

    pub fn generate_menu(&self, request: AutoMenuRequest) -> Result<AutoMenuProposal, String> {
        let dataset = self.dataset.as_ref().ok_or("no dataset loaded")?;
        crate::optimizer::generate_menu(dataset, &self.language, request)
    }

    pub fn export_data(&self, kind: &str) -> Result<String, String> {
        let dataset = self.dataset.as_ref().ok_or("no dataset loaded")?;
        let value = if kind == "menu" {
            json!({ "menu": dataset.menu })
        } else if kind == "consolidated" {
            let mut stock: Vec<Value> = dataset
                .stock
                .iter()
                .map(|(key, quantity)| {
                    let ingredient = dataset.ingredients.iter().find(|item| &item.key == key);
                    let uses_unit = dataset.stock_units.get(key).is_some_and(|unit| unit == "unit")
                        && ingredient.is_some_and(|item| item.measure_unit != "g");
                    let display_quantity = if uses_unit {
                        *quantity / ingredient.map(|item| item.grams_per_measure_unit).unwrap_or(1.0)
                    } else {
                        *quantity
                    };
                    quantity_row(
                        key,
                        display_quantity,
                        if uses_unit { "unit" } else { "g" },
                        dataset.stock_notes.get(key),
                    )
                })
                .collect();
            stock.extend(dataset.household_stock.iter().map(|(key, quantity)| {
                quantity_row(key, *quantity, "unit", dataset.stock_notes.get(key))
            }));
            let extra_needs: Vec<Value> = dataset
                .household_needs
                .iter()
                .map(|(key, quantity)| {
                    quantity_row(
                        key,
                        *quantity,
                        "unit",
                        dataset.household_need_notes.get(key),
                    )
                })
                .collect();
            let mut items = dataset
                .ingredients
                .iter()
                .map(|item| serde_json::to_value(item).map_err(|error| error.to_string()))
                .collect::<Result<Vec<_>, _>>()?;
            items.extend(
                dataset
                    .household_items
                    .iter()
                    .map(|item| serde_json::to_value(item).map_err(|error| error.to_string()))
                    .collect::<Result<Vec<_>, _>>()?,
            );
            json!({
                "items": items,
                "dishes": dataset.dishes,
                "people": dataset.people,
                "menu": dataset.menu,
                "stock": stock,
                "extra_needs": extra_needs,
            })
        } else {
            return Err(format!("unsupported export kind: {kind}"));
        };
        serde_json::to_string_pretty(&value).map_err(|error| error.to_string())
    }

    pub fn export_folder(&self) -> Result<Vec<SourceFile>, String> {
        let dataset = self.dataset.as_ref().ok_or("no dataset loaded")?;
        let mut stock = dataset
            .stock
            .iter()
            .map(|(key, quantity)| {
                let ingredient = dataset.ingredients.iter().find(|item| &item.key == key);
                let uses_unit = dataset.stock_units.get(key).is_some_and(|unit| unit == "unit")
                    && ingredient.is_some_and(|item| item.measure_unit != "g");
                let display_quantity = if uses_unit {
                    *quantity / ingredient.map(|item| item.grams_per_measure_unit).unwrap_or(1.0)
                } else {
                    *quantity
                };
                quantity_row(
                    key,
                    display_quantity,
                    if uses_unit { "unit" } else { "g" },
                    dataset.stock_notes.get(key),
                )
            })
            .collect::<Vec<_>>();
        stock.extend(dataset.household_stock.iter().map(|(key, quantity)| {
            quantity_row(key, *quantity, "unit", dataset.stock_notes.get(key))
        }));
        let extra_needs = dataset
            .household_needs
            .iter()
            .map(|(key, quantity)| {
                quantity_row(
                    key,
                    *quantity,
                    "unit",
                    dataset.household_need_notes.get(key),
                )
            })
            .collect::<Vec<_>>();
        let mut items = dataset
            .ingredients
            .iter()
            .map(|item| serde_json::to_value(item).map_err(|error| error.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        items.extend(
            dataset
                .household_items
                .iter()
                .map(|item| serde_json::to_value(item).map_err(|error| error.to_string()))
                .collect::<Result<Vec<_>, _>>()?,
        );
        let values = [
            ("items.json", json!({"items": items})),
            ("dishes.json", json!({"dishes": dataset.dishes})),
            ("people.json", json!({"people": dataset.people})),
            ("menu.json", json!({"menu": dataset.menu})),
            ("stock.json", json!({"stock": stock})),
            ("extra_needs.json", json!({"extra_needs": extra_needs})),
        ];
        values
            .into_iter()
            .map(|(path, value)| {
                Ok(SourceFile {
                    path: path.to_string(),
                    content: format!(
                        "{}\n",
                        serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?
                    ),
                })
            })
            .collect()
    }
}

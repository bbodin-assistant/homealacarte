use super::data_i18n::rehydrate_localized_data;
use crate::engine::Engine;
use crate::model::*;
use serde_json::{Value, json};

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

impl Engine {
    pub fn export_data(&self, kind: &str) -> Result<String, String> {
        let dataset = self.dataset.as_ref().ok_or("no dataset loaded")?;
        let mut value = if kind == "menu" {
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
        rehydrate_localized_data(&mut value, &self.source_files, &self.language)?;
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
            .map(|(path, mut value)| {
                rehydrate_localized_data(&mut value, &self.source_files, &self.language)?;
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

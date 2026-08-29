use crate::model::{FoodRule, PriceObservation};
use serde::{Deserialize, Deserializer};
use serde_json::Value;

#[derive(Debug)]
pub(crate) struct Document {
    pub(crate) path: String,
    pub(crate) value: Value,
}

#[derive(Debug, Deserialize)]
pub(crate) struct IngredientInput {
    pub(crate) key: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) custom: bool,
    #[serde(default)]
    pub(crate) incomplete: bool,
    #[serde(default)]
    pub(crate) allergens: Vec<String>,
    pub(crate) grams: f64,
    pub(crate) kcal: f64,
    pub(crate) protein_g: f64,
    pub(crate) carbs_g: f64,
    pub(crate) fat_g: f64,
    pub(crate) fiber_g: f64,
    #[serde(default, deserialize_with = "missing_value")]
    pub(crate) sugars_g: Option<f64>,
    #[serde(default, deserialize_with = "missing_value")]
    pub(crate) saturated_fat_g: Option<f64>,
    #[serde(default, deserialize_with = "missing_value")]
    pub(crate) salt_g: Option<f64>,
    #[serde(default, deserialize_with = "missing_value")]
    pub(crate) fruit_vegetable_legume_percent: Option<f64>,
    pub(crate) category: String,
    pub(crate) source: String,
    pub(crate) url: String,
    pub(crate) price_per_kg: f64,
    #[serde(default)]
    pub(crate) price_source: String,
    #[serde(default)]
    pub(crate) price_checked_at: String,
    #[serde(default)]
    pub(crate) price_history: Vec<PriceObservation>,
    #[serde(default = "default_grams")]
    pub(crate) measure_unit: String,
    #[serde(default = "one")]
    pub(crate) grams_per_measure_unit: f64,
    pub(crate) purchase_unit: Option<String>,
    pub(crate) purchase_quantity_grams: Option<f64>,
    #[serde(default)]
    pub(crate) purchase_item_key: String,
    #[serde(default = "one")]
    pub(crate) purchase_grams_per_gram: f64,
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

#[derive(Debug, Deserialize)]
pub(crate) struct PersonInput {
    pub(crate) key: String,
    pub(crate) name: Option<String>,
    pub(crate) kcal_target: Option<f64>,
    pub(crate) kind: Option<String>,
    pub(crate) description: Option<String>,
    #[serde(default)]
    pub(crate) food_rules: Vec<FoodRule>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct StockInput {
    pub(crate) item_key: String,
    #[serde(default)]
    pub(crate) quantity: f64,
    pub(crate) quantity_unit: Option<String>,
    #[serde(default)]
    pub(crate) notes: String,
    #[serde(default)]
    pub(crate) added_at: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct HouseholdItemInput {
    pub(crate) key: String,
    pub(crate) name: String,
    pub(crate) category: String,
    #[serde(default)]
    pub(crate) estimated_price: f64,
    #[serde(default)]
    pub(crate) price_history: Vec<PriceObservation>,
    pub(crate) purchase_unit: Option<String>,
    pub(crate) purchase_quantity: Option<f64>,
    pub(crate) measure_unit: Option<String>,
    pub(crate) last_bought_at: Option<String>,
    pub(crate) lasting_days: Option<f64>,
    pub(crate) notes: Option<String>,
    #[serde(default)]
    pub(crate) custom: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct HouseholdQuantityInput {
    pub(crate) item_key: String,
    pub(crate) quantity: f64,
    pub(crate) quantity_unit: Option<String>,
    #[serde(default)]
    pub(crate) notes: String,
}

fn bool_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct DishInput {
    pub(crate) key: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) origin_country: String,
    #[serde(default = "bool_true")]
    pub(crate) auto_menu_main: bool,
    #[serde(default)]
    pub(crate) grocery_exempt: bool,
    #[serde(default = "one")]
    pub(crate) servings: f64,
    #[serde(default)]
    pub(crate) recipe_url: String,
    #[serde(default)]
    pub(crate) source: String,
    #[serde(default)]
    pub(crate) source_notes: Value,
    #[serde(default)]
    pub(crate) nutri_score: String,
    pub(crate) components: Vec<ComponentInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ComponentInput {
    pub(crate) item_key: String,
    pub(crate) grams: Option<f64>,
    pub(crate) measure_quantity: Option<f64>,
    pub(crate) quantity: Option<f64>,
    pub(crate) quantity_unit: Option<String>,
    #[serde(default)]
    pub(crate) source_quantity: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MenuInput {
    #[serde(default)]
    pub date: String,
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

use crate::model::{FoodRule, PriceObservation};
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug)]
pub(crate) struct Document {
    pub(crate) path: String,
    pub(crate) value: Value,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
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
    #[serde(default)]
    pub(crate) sugars_g: Option<f64>,
    #[serde(default)]
    pub(crate) saturated_fat_g: Option<f64>,
    #[serde(default)]
    pub(crate) salt_g: Option<f64>,
    #[serde(default)]
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
}

fn default_grams() -> String {
    "g".to_string()
}

fn one() -> f64 {
    1.0
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
    pub(crate) quantity: Option<f64>,
    pub(crate) quantity_unit: Option<String>,
    #[serde(default)]
    pub(crate) source_quantity: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MenuInput {
    pub date: String,
    pub day: String,
    pub meal: String,
    pub item_key: String,
    pub people: Vec<String>,
    pub quantity: f64,
    pub quantity_unit: Option<String>,
    pub notes: Option<String>,
}

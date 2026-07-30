use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_language")]
    pub language: String,
}

pub fn default_language() -> String {
    "fr".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ingredient {
    pub key: String,
    pub name: String,
    #[serde(default)]
    pub custom: bool,
    #[serde(default)]
    pub incomplete: bool,
    pub grams: f64,
    pub kcal: f64,
    pub protein_g: f64,
    pub carbs_g: f64,
    pub fat_g: f64,
    pub fiber_g: f64,
    pub category: String,
    pub source: String,
    pub url: String,
    pub price_per_kg: f64,
    #[serde(default)]
    pub price_source: String,
    #[serde(default)]
    pub price_checked_at: String,
    pub measure_unit: String,
    pub grams_per_measure_unit: f64,
    pub purchase_unit: String,
    pub purchase_quantity_grams: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DishComponent {
    pub item_key: String,
    #[serde(skip)]
    pub grams: f64,
    pub quantity: f64,
    pub quantity_unit: String,
    pub source_quantity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dish {
    pub key: String,
    pub name: String,
    pub servings: f64,
    pub recipe_url: String,
    pub source: String,
    pub source_notes: Vec<String>,
    #[serde(default)]
    pub nutri_score: String,
    pub components: Vec<DishComponent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DishCreateComponentInput {
    pub item_key: String,
    pub quantity: f64,
    pub quantity_unit: String,
    #[serde(default)]
    pub source_quantity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DishCreateInput {
    pub key: String,
    pub name: String,
    pub servings: f64,
    #[serde(default)]
    pub recipe_url: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub source_notes: Vec<String>,
    #[serde(default)]
    pub nutri_score: String,
    pub components: Vec<DishCreateComponentInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Person {
    pub key: String,
    pub name: String,
    pub kcal_target: Option<f64>,
    pub kind: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuRow {
    pub day: String,
    pub meal: String,
    pub item_key: String,
    pub people: Vec<String>,
    pub quantity: f64,
    pub quantity_unit: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HouseholdItem {
    pub key: String,
    pub name: String,
    pub category: String,
    pub purchase_unit: String,
    pub purchase_quantity: f64,
    pub estimated_price: f64,
    pub measure_unit: String,
    pub last_bought_at: String,
    pub lasting_days: Option<f64>,
    pub notes: String,
    #[serde(default)]
    pub custom: bool,
}

#[derive(Debug, Clone)]
pub struct Dataset {
    pub ingredients: Vec<Ingredient>,
    pub dishes: Vec<Dish>,
    pub people: Vec<Person>,
    pub menu: Vec<MenuRow>,
    pub stock: BTreeMap<String, f64>,
    pub stock_units: BTreeMap<String, String>,
    pub household_items: Vec<HouseholdItem>,
    pub household_needs: BTreeMap<String, f64>,
    pub household_stock: BTreeMap<String, f64>,
    pub source_hash: String,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Nutrients {
    pub grams: f64,
    pub kcal: f64,
    pub protein_g: f64,
    pub carbs_g: f64,
    pub fat_g: f64,
    pub fiber_g: f64,
    pub cost: f64,
}

impl Nutrients {
    pub fn scaled(self, factor: f64) -> Self {
        Self {
            grams: self.grams * factor,
            kcal: self.kcal * factor,
            protein_g: self.protein_g * factor,
            carbs_g: self.carbs_g * factor,
            fat_g: self.fat_g * factor,
            fiber_g: self.fiber_g * factor,
            cost: self.cost * factor,
        }
    }

    pub fn add(&mut self, other: Self) {
        self.grams += other.grams;
        self.kcal += other.kcal;
        self.protein_g += other.protein_g;
        self.carbs_g += other.carbs_g;
        self.fat_g += other.fat_g;
        self.fiber_g += other.fiber_g;
        self.cost += other.cost;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemOption {
    pub key: String,
    pub name: String,
    pub kind: String,
    pub measure_unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockUpdate {
    pub item_key: String,
    pub quantity: f64,
    pub quantity_unit: String,
    #[serde(default)]
    pub household: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockItemView {
    pub item_key: String,
    pub name: String,
    pub category: String,
    pub quantity: f64,
    pub quantity_unit: String,
    pub measure_unit: String,
    pub grams_per_measure_unit: f64,
    #[serde(default)]
    pub household: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomGroceryItem {
    pub key: String,
    pub name: String,
    pub category: String,
    pub quantity: f64,
    pub measure_unit: String,
    pub purchase_unit: String,
    pub purchase_quantity: f64,
    pub estimated_price: f64,
    #[serde(default)]
    pub custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuEntryView {
    pub key: String,
    pub name: String,
    pub quantity: f64,
    pub quantity_unit: String,
    pub people: Vec<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuCellView {
    pub day: String,
    pub meal: String,
    pub entries: Vec<MenuEntryView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyNutritionView {
    pub day: String,
    pub nutrients: Nutrients,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DishView {
    pub key: String,
    pub name: String,
    pub servings: f64,
    pub recipe_url: String,
    pub source: String,
    pub source_notes: Vec<String>,
    pub nutri_score: String,
    pub per_serving: Nutrients,
    pub components: Vec<DishComponentView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DishComponentView {
    pub key: String,
    pub name: String,
    pub grams: f64,
    pub quantity: f64,
    pub quantity_unit: String,
    pub source_quantity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroceryItem {
    pub id: String,
    pub category: String,
    pub subcategory: String,
    pub name: String,
    pub needed_quantity: f64,
    pub needed_quantity_text: String,
    pub measure_unit: String,
    pub purchase_unit: String,
    pub purchase_units: u32,
    pub purchase_quantity: f64,
    pub purchase_quantity_text: String,
    pub estimated_need_price: f64,
    pub estimated_purchase_price: f64,
    pub household: bool,
    pub stock_quantity: f64,
    pub stock_quantity_text: String,
    pub stock_sufficient: bool,
    #[serde(skip)]
    pub grams_per_measure_unit: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroceryCategory {
    pub name: String,
    pub subcategories: Vec<GrocerySubcategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrocerySubcategory {
    pub name: String,
    pub items: Vec<GroceryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroceryResult {
    pub items: Vec<GroceryItem>,
    pub categories: Vec<GroceryCategory>,
    pub estimated_purchase_total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Counts {
    pub ingredients: usize,
    pub dishes: usize,
    pub people: usize,
    pub menu: usize,
    pub stock: usize,
    pub household_items: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSnapshot {
    pub language: String,
    pub profile: Option<String>,
    pub source_hash: String,
    pub counts: Counts,
    pub days: Vec<String>,
    pub meals: Vec<String>,
    pub people: Vec<Person>,
    pub ingredients: Vec<Ingredient>,
    pub household_items: Vec<HouseholdItem>,
    pub item_options: Vec<ItemOption>,
    pub stock: Vec<StockItemView>,
    pub stock_options: Vec<StockItemView>,
    pub custom_grocery: Vec<CustomGroceryItem>,
    pub household_options: Vec<CustomGroceryItem>,
    pub planner: Vec<MenuRow>,
    pub menu_cells: Vec<MenuCellView>,
    pub daily_nutrition: Vec<DailyNutritionView>,
    pub dishes: Vec<DishView>,
    pub grocery: GroceryResult,
    pub grocery_plan: GroceryResult,
}

mod catalogue;
mod dish_loading;
mod engine;
mod grocery;
mod loader;
mod menu_loading;
mod menu_math;
mod model;
mod optimizer;
mod optimizer_solver;
mod optimizer_support;
mod personal_data;
mod pdf;
mod price_history;
mod snapshot;

pub use engine::Engine;
pub use grocery::{build_grocery, exclude_grocery_items};
pub use loader::load_dataset;
pub use model::*;
pub use personal_data::{
    PersonalDataReport, PersonalMergeAudit, consolidate_personal_sources,
    merge_personal_documents,
};
pub use pdf::generate_grocery_pdf;
pub use snapshot::build_snapshot;

use loader::MenuInput;
use wasm_bindgen::prelude::*;

#[derive(serde::Deserialize)]
struct PriceHistoryPresence {
    price_history: Option<Vec<PriceObservation>>,
}

fn price_history_is_provided(value: &JsValue) -> Result<bool, JsValue> {
    let presence: PriceHistoryPresence =
        serde_wasm_bindgen::from_value(value.clone()).map_err(js_error)?;
    Ok(presence.price_history.is_some())
}

fn js_error(error: impl ToString) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn to_js<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(js_error)
}

#[wasm_bindgen]
pub struct HomeALaCarteEngine {
    inner: Engine,
}

#[wasm_bindgen]
impl HomeALaCarteEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Engine::default(),
        }
    }

    pub fn load(&mut self, sources: JsValue, config: JsValue) -> Result<JsValue, JsValue> {
        let sources: Vec<SourceFile> = serde_wasm_bindgen::from_value(sources).map_err(js_error)?;
        let config: AppConfig = serde_wasm_bindgen::from_value(config).map_err(js_error)?;
        to_js(&self.inner.load(sources, config).map_err(js_error)?)
    }

    pub fn replace_menu(&mut self, rows: JsValue) -> Result<JsValue, JsValue> {
        let rows: Vec<MenuInput> = serde_wasm_bindgen::from_value(rows).map_err(js_error)?;
        to_js(&self.inner.replace_menu(rows).map_err(js_error)?)
    }

    pub fn generate_menu(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: AutoMenuRequest =
            serde_wasm_bindgen::from_value(request).map_err(js_error)?;
        to_js(&self.inner.generate_menu(request).map_err(js_error)?)
    }

    pub fn replace_people(&mut self, rows: JsValue) -> Result<JsValue, JsValue> {
        let rows: Vec<Person> = serde_wasm_bindgen::from_value(rows).map_err(js_error)?;
        to_js(&self.inner.replace_people(rows).map_err(js_error)?)
    }

    pub fn replace_stock(&mut self, rows: JsValue) -> Result<JsValue, JsValue> {
        let rows: Vec<StockUpdate> = serde_wasm_bindgen::from_value(rows).map_err(js_error)?;
        to_js(&self.inner.replace_stock(rows).map_err(js_error)?)
    }

    pub fn set_grocery_stock(
        &mut self,
        item_ids: JsValue,
        stocked: bool,
    ) -> Result<JsValue, JsValue> {
        let item_ids: Vec<String> =
            serde_wasm_bindgen::from_value(item_ids).map_err(js_error)?;
        to_js(
            &self
                .inner
                .set_grocery_stock(item_ids, stocked)
                .map_err(js_error)?,
        )
    }

    pub fn replace_custom_grocery(&mut self, rows: JsValue) -> Result<JsValue, JsValue> {
        let rows: Vec<CustomGroceryItem> =
            serde_wasm_bindgen::from_value(rows).map_err(js_error)?;
        to_js(&self.inner.replace_custom_grocery(rows).map_err(js_error)?)
    }

    pub fn add_dish(&mut self, dish: JsValue) -> Result<JsValue, JsValue> {
        let dish: DishCreateInput =
            serde_wasm_bindgen::from_value(dish).map_err(js_error)?;
        to_js(&self.inner.add_dish(dish).map_err(js_error)?)
    }

    pub fn replace_dish(&mut self, dish: JsValue) -> Result<JsValue, JsValue> {
        let dish: DishCreateInput =
            serde_wasm_bindgen::from_value(dish).map_err(js_error)?;
        to_js(&self.inner.replace_dish(dish).map_err(js_error)?)
    }

    pub fn save_dish_with_custom_ingredients(
        &mut self,
        dish: JsValue,
        custom_ingredients: JsValue,
        replacing: bool,
    ) -> Result<JsValue, JsValue> {
        let dish: DishCreateInput =
            serde_wasm_bindgen::from_value(dish).map_err(js_error)?;
        let custom_ingredients: Vec<Ingredient> =
            serde_wasm_bindgen::from_value(custom_ingredients).map_err(js_error)?;
        to_js(
            &self
                .inner
                .save_dish_with_custom_ingredients(dish, custom_ingredients, replacing)
                .map_err(js_error)?,
        )
    }

    pub fn replace_ingredient(&mut self, ingredient: JsValue) -> Result<JsValue, JsValue> {
        let price_history_provided = price_history_is_provided(&ingredient)?;
        let ingredient: Ingredient =
            serde_wasm_bindgen::from_value(ingredient).map_err(js_error)?;
        to_js(
            &self
                .inner
                .replace_ingredient_with_history(ingredient, price_history_provided)
                .map_err(js_error)?,
        )
    }

    pub fn add_ingredient(&mut self, ingredient: JsValue) -> Result<JsValue, JsValue> {
        let ingredient: Ingredient =
            serde_wasm_bindgen::from_value(ingredient).map_err(js_error)?;
        to_js(&self.inner.add_ingredient(ingredient).map_err(js_error)?)
    }

    pub fn replace_household_item(&mut self, item: JsValue) -> Result<JsValue, JsValue> {
        let price_history_provided = price_history_is_provided(&item)?;
        let item: HouseholdItem =
            serde_wasm_bindgen::from_value(item).map_err(js_error)?;
        to_js(
            &self
                .inner
                .replace_household_item_with_history(item, price_history_provided)
                .map_err(js_error)?,
        )
    }

    pub fn add_household_item(&mut self, item: JsValue) -> Result<JsValue, JsValue> {
        let item: HouseholdItem =
            serde_wasm_bindgen::from_value(item).map_err(js_error)?;
        to_js(&self.inner.add_household_item(item).map_err(js_error)?)
    }

    pub fn delete_item(&mut self, key: String) -> Result<JsValue, JsValue> {
        to_js(&self.inner.delete_item(key).map_err(js_error)?)
    }

    pub fn set_language(&mut self, language: String) -> Result<JsValue, JsValue> {
        to_js(&self.inner.set_language(language).map_err(js_error)?)
    }

    pub fn set_profile(&mut self, profile: Option<String>) -> Result<JsValue, JsValue> {
        to_js(&self.inner.set_profile(profile).map_err(js_error)?)
    }

    pub fn snapshot(&self) -> Result<JsValue, JsValue> {
        to_js(&self.inner.snapshot().map_err(js_error)?)
    }

    pub fn export_data(&self, kind: String) -> Result<String, JsValue> {
        self.inner.export_data(&kind).map_err(js_error)
    }

    pub fn export_folder(&self) -> Result<JsValue, JsValue> {
        to_js(&self.inner.export_folder().map_err(js_error)?)
    }

    pub fn generate_grocery_pdf(&self, language: Option<String>) -> Result<Vec<u8>, JsValue> {
        self.generate_grocery_pdf_with_exclusions(language, &Default::default())
    }

    pub fn generate_grocery_pdf_excluding(
        &self,
        language: Option<String>,
        excluded_ids: JsValue,
    ) -> Result<Vec<u8>, JsValue> {
        let excluded_ids: std::collections::HashSet<String> =
            serde_wasm_bindgen::from_value(excluded_ids).map_err(js_error)?;
        self.generate_grocery_pdf_with_exclusions(language, &excluded_ids)
    }
}

impl HomeALaCarteEngine {
    fn generate_grocery_pdf_with_exclusions(
        &self,
        language: Option<String>,
        excluded_ids: &std::collections::HashSet<String>,
    ) -> Result<Vec<u8>, JsValue> {
        let dataset = self.inner.dataset.as_ref().ok_or_else(|| js_error("no dataset loaded"))?;
        let grocery = crate::grocery::build_grocery(dataset).map_err(js_error)?;
        let grocery = crate::grocery::exclude_grocery_items(grocery, excluded_ids);
        Ok(crate::pdf::generate_grocery_pdf(
            &grocery,
            language.as_deref().unwrap_or(&self.inner.language),
        ))
    }
}

impl Default for HomeALaCarteEngine {
    fn default() -> Self {
        Self::new()
    }
}

use crate::loader::{
    MenuInput, load_dataset, localize_day, localize_meal, localized_days, localized_meals,
    normalize_menu,
};
use crate::model::*;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap, HashSet};

const EPSILON: f64 = 1e-6;

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
        let mut keys = HashSet::new();
        for (index, person) in people.iter_mut().enumerate() {
            person.key = person.key.trim().to_string();
            person.name = person.name.trim().to_string();
            person.description = person.description.trim().to_string();
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
            }
        }
        dataset.stock = stock;
        dataset.stock_units = stock_units;
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
                needs.insert(key, input.quantity);
                continue;
            }

            let previous = existing
                .get(&key)
                .and_then(|item_index| dataset.household_items.get(*item_index));
            let item = HouseholdItem {
                key: key.clone(),
                name: input.name.trim().to_string(),
                category: input.category.trim().to_string(),
                purchase_unit: input.purchase_unit.trim().to_string(),
                purchase_quantity: input.purchase_quantity,
                estimated_price: input.estimated_price,
                measure_unit: input.measure_unit.trim().to_string(),
                last_bought_at: previous.map(|item| item.last_bought_at.clone()).unwrap_or_default(),
                lasting_days: previous.and_then(|item| item.lasting_days),
                notes: previous.map(|item| item.notes.clone()).unwrap_or_default(),
                custom: input.custom || previous.is_some_and(|item| item.custom),
            };
            if let Some(item_index) = existing.get(&key) {
                dataset.household_items[*item_index] = item;
            } else {
                dataset.household_items.push(item);
            }
            needs.insert(key, input.quantity);
        }
        dataset.household_needs = needs;
        self.snapshot()
    }

    pub fn add_dish(&mut self, input: DishCreateInput) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let dish = dish_from_input(dataset, input, false)?;
        dataset.dishes.push(dish);
        self.snapshot()
    }

    pub fn replace_dish(&mut self, input: DishCreateInput) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let key = input.key.trim().to_string();
        let index = dataset
            .dishes
            .iter()
            .position(|dish| dish.key == key)
            .ok_or_else(|| format!("unknown dish: {key}"))?;
        let dish = dish_from_input(dataset, input, true)?;
        dataset.dishes[index] = dish;
        self.snapshot()
    }

    pub fn save_dish_with_custom_ingredients(
        &mut self,
        input: DishCreateInput,
        custom_ingredients: Vec<Ingredient>,
        replacing: bool,
    ) -> Result<AppSnapshot, String> {
        let mut next = self.dataset.as_ref().ok_or("no dataset loaded")?.clone();
        for ingredient in custom_ingredients {
            validate_ingredient(&ingredient)?;
            if next
                .ingredients
                .iter()
                .any(|existing| existing.key == ingredient.key)
                || next.dishes.iter().any(|dish| dish.key == ingredient.key)
            {
                return Err(format!("item key already exists: {}", ingredient.key));
            }
            next.ingredients.push(ingredient);
        }
        let dish = dish_from_input(&next, input, replacing)?;
        if replacing {
            let index = next
                .dishes
                .iter()
                .position(|existing| existing.key == dish.key)
                .ok_or_else(|| format!("unknown dish: {}", dish.key))?;
            next.dishes[index] = dish;
        } else {
            next.dishes.push(dish);
        }
        self.dataset = Some(next);
        self.snapshot()
    }

    pub fn replace_ingredient(&mut self, mut input: Ingredient) -> Result<AppSnapshot, String> {
        validate_ingredient(&input)?;
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let index = dataset
            .ingredients
            .iter()
            .position(|ingredient| ingredient.key == input.key)
            .ok_or_else(|| format!("unknown ingredient: {}", input.key))?;
        input.custom = input.custom || dataset.ingredients[index].custom;
        for dish in &mut dataset.dishes {
            for component in &mut dish.components {
                if component.item_key != input.key || component.quantity_unit == "g" {
                    continue;
                }
                component.quantity_unit = input.measure_unit.clone();
                component.grams = component.quantity * input.grams_per_measure_unit;
            }
        }
        dataset.ingredients[index] = input;
        self.snapshot()
    }

    pub fn replace_household_item(
        &mut self,
        mut input: HouseholdItem,
    ) -> Result<AppSnapshot, String> {
        validate_household_item(&input)?;
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let index = dataset
            .household_items
            .iter()
            .position(|item| item.key == input.key)
            .ok_or_else(|| format!("unknown general item: {}", input.key))?;
        input.custom = input.custom || dataset.household_items[index].custom;
        dataset.household_items[index] = input;
        self.snapshot()
    }

    pub fn delete_item(&mut self, key: String) -> Result<AppSnapshot, String> {
        let key = key.trim().to_string();
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        if let Some(ingredient_index) = dataset
            .ingredients
            .iter()
            .position(|ingredient| ingredient.key == key)
        {
            let used_by = dataset
                .dishes
                .iter()
                .filter(|dish| dish.components.iter().any(|component| component.item_key == key))
                .map(|dish| dish.name.clone())
                .collect::<Vec<_>>();
            if !used_by.is_empty() {
                return Err(format!(
                    "item is still used by these dishes: {}",
                    used_by.join(", ")
                ));
            }
            dataset.ingredients.remove(ingredient_index);
            dataset.menu.retain(|row| row.item_key != key);
            dataset.stock.remove(&key);
            dataset.stock_units.remove(&key);
            dataset.household_needs.remove(&key);
            return self.snapshot();
        }
        if let Some(item_index) = dataset
            .household_items
            .iter()
            .position(|item| item.key == key)
        {
            dataset.household_items.remove(item_index);
            dataset.household_needs.remove(&key);
            dataset.household_stock.remove(&key);
            return self.snapshot();
        }
        Err(format!("unknown item: {key}"))
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
                    json!({"item_key": key, "quantity": display_quantity, "quantity_unit": if uses_unit { "unit" } else { "g" }})
                })
                .collect();
            stock.extend(dataset.household_stock.iter().map(|(key, quantity)| {
                json!({"item_key": key, "quantity": quantity, "quantity_unit": "unit"})
            }));
            let extra_needs: Vec<Value> = dataset
                .household_needs
                .iter()
                .map(|(key, quantity)| {
                    json!({"item_key": key, "quantity": quantity, "quantity_unit": "unit"})
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
                json!({"item_key": key, "quantity": display_quantity, "quantity_unit": if uses_unit { "unit" } else { "g" }})
            })
            .collect::<Vec<_>>();
        stock.extend(dataset.household_stock.iter().map(|(key, quantity)| {
            json!({"item_key": key, "quantity": quantity, "quantity_unit": "unit"})
        }));
        let extra_needs = dataset
            .household_needs
            .iter()
            .map(|(key, quantity)| {
                json!({"item_key": key, "quantity": quantity, "quantity_unit": "unit"})
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

fn dish_from_input(
    dataset: &Dataset,
    input: DishCreateInput,
    replacing: bool,
) -> Result<Dish, String> {
    let key = input.key.trim().to_string();
    let name = input.name.trim().to_string();
    if key.is_empty() || name.is_empty() {
        return Err("the dish must have a key and a name".to_string());
    }
    if dataset.ingredients.iter().any(|item| item.key == key) {
        return Err(format!("dish key conflicts with an ingredient: {key}"));
    }
    let exists = dataset.dishes.iter().any(|dish| dish.key == key);
    if !replacing && exists {
        return Err(format!("dish key already exists: {key}"));
    }
    if replacing && !exists {
        return Err(format!("unknown dish: {key}"));
    }
    if !input.servings.is_finite() || input.servings <= 0.0 {
        return Err("dish servings must be positive".to_string());
    }
    if input.components.is_empty() {
        return Err("the dish must contain at least one ingredient".to_string());
    }
    let nutri_score = input.nutri_score.trim().to_uppercase();
    if !nutri_score.is_empty() && !matches!(nutri_score.as_str(), "A" | "B" | "C" | "D" | "E") {
        return Err("dish Nutri-Score must be A, B, C, D, E, or empty".to_string());
    }

    let ingredients = dataset
        .ingredients
        .iter()
        .map(|item| (item.key.as_str(), item))
        .collect::<HashMap<_, _>>();
    let mut components = Vec::with_capacity(input.components.len());
    for (index, component) in input.components.into_iter().enumerate() {
        let ingredient = ingredients
            .get(component.item_key.trim())
            .ok_or_else(|| {
                format!(
                    "dish component {} references unknown ingredient: {}",
                    index + 1,
                    component.item_key
                )
            })?;
        if !component.quantity.is_finite() || component.quantity <= 0.0 {
            return Err(format!("dish component {} quantity must be positive", index + 1));
        }
        let requested_unit = component.quantity_unit.trim();
        let (grams, quantity_unit) = if requested_unit.eq_ignore_ascii_case("g") {
            (component.quantity, "g".to_string())
        } else if requested_unit.eq_ignore_ascii_case(&ingredient.measure_unit)
            || requested_unit
                .trim_end_matches('s')
                .eq_ignore_ascii_case(ingredient.measure_unit.trim_end_matches('s'))
        {
            (
                component.quantity * ingredient.grams_per_measure_unit,
                ingredient.measure_unit.clone(),
            )
        } else {
            return Err(format!(
                "dish component {} uses unsupported unit {:?}; expected g or {:?}",
                index + 1,
                requested_unit,
                ingredient.measure_unit
            ));
        };
        components.push(DishComponent {
            item_key: ingredient.key.clone(),
            grams,
            quantity: component.quantity,
            quantity_unit,
            source_quantity: component.source_quantity.trim().to_string(),
        });
    }

    Ok(Dish {
        key,
        name,
        servings: input.servings,
        recipe_url: input.recipe_url.trim().to_string(),
        source: input.source.trim().to_string(),
        source_notes: input
            .source_notes
            .into_iter()
            .map(|note| note.trim().to_string())
            .filter(|note| !note.is_empty())
            .collect(),
        nutri_score,
        components,
    })
}

fn validate_ingredient(ingredient: &Ingredient) -> Result<(), String> {
    if ingredient.key.trim().is_empty()
        || ingredient.name.trim().is_empty()
        || ingredient.measure_unit.trim().is_empty()
        || ingredient.purchase_unit.trim().is_empty()
    {
        return Err("the ingredient must have a key, name, measure unit and purchase unit".to_string());
    }
    if !ingredient.incomplete && ingredient.category.trim().is_empty() {
        return Err("a completed ingredient must have a category".to_string());
    }
    let positive = [
        ingredient.grams,
        ingredient.grams_per_measure_unit,
        ingredient.purchase_quantity_grams,
    ];
    if positive.into_iter().any(|value| !value.is_finite() || value <= 0.0) {
        return Err("the ingredient gram quantities must be positive".to_string());
    }
    let non_negative = [
        ingredient.kcal,
        ingredient.protein_g,
        ingredient.carbs_g,
        ingredient.fat_g,
        ingredient.fiber_g,
        ingredient.price_per_kg,
    ];
    if non_negative
        .into_iter()
        .any(|value| !value.is_finite() || value < 0.0)
    {
        return Err("the ingredient nutrition and price values cannot be negative".to_string());
    }
    Ok(())
}

fn validate_household_item(item: &HouseholdItem) -> Result<(), String> {
    if item.key.trim().is_empty()
        || item.name.trim().is_empty()
        || item.category.trim().is_empty()
        || item.purchase_unit.trim().is_empty()
        || item.measure_unit.trim().is_empty()
    {
        return Err("the item must have a key, name, category, purchase unit and measure unit".to_string());
    }
    if !item.purchase_quantity.is_finite() || item.purchase_quantity <= 0.0 {
        return Err("the item purchase quantity must be positive".to_string());
    }
    if !item.estimated_price.is_finite() || item.estimated_price < 0.0 {
        return Err("the item price cannot be negative".to_string());
    }
    if item
        .lasting_days
        .is_some_and(|days| !days.is_finite() || days <= 0.0)
    {
        return Err("the item lasting days must be positive".to_string());
    }
    Ok(())
}

fn ingredient_nutrients(ingredient: &Ingredient, grams: f64) -> Nutrients {
    let factor = grams / ingredient.grams;
    Nutrients {
        grams,
        kcal: ingredient.kcal * factor,
        protein_g: ingredient.protein_g * factor,
        carbs_g: ingredient.carbs_g * factor,
        fat_g: ingredient.fat_g * factor,
        fiber_g: ingredient.fiber_g * factor,
        cost: grams * ingredient.price_per_kg / 1000.0,
    }
}

fn dish_nutrients(
    dish: &Dish,
    ingredients: &HashMap<String, &Ingredient>,
) -> Result<Nutrients, String> {
    let mut total = Nutrients::default();
    for component in &dish.components {
        let ingredient = ingredients
            .get(&component.item_key)
            .ok_or_else(|| format!("dish {} references missing ingredient {}", dish.key, component.item_key))?;
        total.add(ingredient_nutrients(ingredient, component.grams));
    }
    Ok(total.scaled(1.0 / dish.servings))
}

fn menu_multiplier(
    row: &MenuRow,
    ingredient: Option<&Ingredient>,
    dish: Option<&Dish>,
) -> f64 {
    match row.quantity_unit.as_str() {
        "portion" => row.quantity,
        "g" => {
            if let Some(ingredient) = ingredient {
                row.quantity / ingredient.grams
            } else if let Some(dish) = dish {
                let grams_per_serving =
                    dish.components.iter().map(|item| item.grams).sum::<f64>() / dish.servings;
                row.quantity / grams_per_serving
            } else {
                row.quantity
            }
        }
        "unit" => ingredient
            .map(|item| row.quantity * item.grams_per_measure_unit / item.grams)
            .unwrap_or(row.quantity),
        _ => row.quantity,
    }
}

pub fn build_snapshot(
    dataset: &Dataset,
    language: &str,
    profile: Option<&str>,
) -> Result<AppSnapshot, String> {
    let ingredients: HashMap<String, &Ingredient> = dataset
        .ingredients
        .iter()
        .map(|item| (item.key.clone(), item))
        .collect();
    let dishes: HashMap<String, &Dish> = dataset
        .dishes
        .iter()
        .map(|item| (item.key.clone(), item))
        .collect();
    let days = localized_days(language);
    let meals = localized_meals(language);

    let mut item_options: Vec<ItemOption> = dataset
        .ingredients
        .iter()
        .map(|item| ItemOption {
            key: item.key.clone(),
            name: item.name.clone(),
            kind: "ingredient".to_string(),
            measure_unit: item.measure_unit.clone(),
        })
        .chain(dataset.dishes.iter().map(|item| ItemOption {
            key: item.key.clone(),
            name: item.name.clone(),
            kind: "dish".to_string(),
            measure_unit: "unit".to_string(),
        }))
        .collect();
    item_options.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.key.cmp(&b.key))
    });

    let mut menu_cells = Vec::new();
    for day in &days {
        for meal in &meals {
            let entries = dataset
                .menu
                .iter()
                .filter(|row| &row.day == day && &row.meal == meal)
                .map(|row| {
                    let name = ingredients
                        .get(&row.item_key)
                        .map(|item| item.name.clone())
                        .or_else(|| dishes.get(&row.item_key).map(|item| item.name.clone()))
                        .unwrap_or_else(|| row.item_key.clone());
                    MenuEntryView {
                        key: row.item_key.clone(),
                        name,
                        quantity: row.quantity,
                        quantity_unit: row.quantity_unit.clone(),
                        people: row.people.clone(),
                        notes: row.notes.clone(),
                    }
                })
                .collect();
            menu_cells.push(MenuCellView {
                day: day.clone(),
                meal: meal.clone(),
                entries,
            });
        }
    }

    let mut daily_nutrition = Vec::new();
    for day in &days {
        let mut total = Nutrients::default();
        if let Some(profile) = profile {
            for row in dataset
                .menu
                .iter()
                .filter(|row| &row.day == day && row.people.iter().any(|person| person == profile))
            {
                if let Some(ingredient) = ingredients.get(&row.item_key) {
                    let multiplier = menu_multiplier(row, Some(ingredient), None);
                    total.add(ingredient_nutrients(ingredient, ingredient.grams).scaled(multiplier));
                } else if let Some(dish) = dishes.get(&row.item_key) {
                    let multiplier = menu_multiplier(row, None, Some(dish));
                    total.add(dish_nutrients(dish, &ingredients)?.scaled(multiplier));
                }
            }
        }
        daily_nutrition.push(DailyNutritionView {
            day: day.clone(),
            nutrients: total,
        });
    }

    let mut dish_views = Vec::new();
    for dish in &dataset.dishes {
        let components = dish
            .components
            .iter()
            .map(|component| {
                let ingredient = ingredients
                    .get(&component.item_key)
                    .ok_or_else(|| format!("unknown ingredient {}", component.item_key))?;
                Ok(DishComponentView {
                    key: component.item_key.clone(),
                    name: ingredient.name.clone(),
                    grams: component.grams / dish.servings,
                    quantity: component.quantity / dish.servings,
                    quantity_unit: component.quantity_unit.clone(),
                    source_quantity: component.source_quantity.clone(),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        dish_views.push(DishView {
            key: dish.key.clone(),
            name: dish.name.clone(),
            servings: dish.servings,
            recipe_url: dish.recipe_url.clone(),
            source: dish.source.clone(),
            source_notes: dish.source_notes.clone(),
            nutri_score: dish.nutri_score.clone(),
            per_serving: dish_nutrients(dish, &ingredients)?,
            components,
        });
    }
    dish_views.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let mut stock = dataset
        .stock
        .iter()
        .filter_map(|(key, grams)| {
            ingredients.get(key).map(|ingredient| {
                let uses_measure_unit = ingredient.measure_unit != "g"
                    && dataset.stock_units.get(key).is_some_and(|unit| unit == "unit");
                StockItemView {
                    item_key: key.clone(),
                    name: ingredient.name.clone(),
                    category: ingredient.category.clone(),
                    quantity: if uses_measure_unit {
                        grams / ingredient.grams_per_measure_unit
                    } else {
                        *grams
                    },
                    quantity_unit: if uses_measure_unit { "unit" } else { "g" }.to_string(),
                    measure_unit: ingredient.measure_unit.clone(),
                    grams_per_measure_unit: ingredient.grams_per_measure_unit,
                    household: false,
                }
            })
        })
        .collect::<Vec<_>>();

    let household_items = dataset
        .household_items
        .iter()
        .map(|item| (item.key.as_str(), item))
        .collect::<HashMap<_, _>>();
    stock.extend(dataset.household_stock.iter().filter_map(|(key, quantity)| {
        household_items.get(key.as_str()).map(|item| StockItemView {
            item_key: key.clone(),
            name: item.name.clone(),
            category: item.category.clone(),
            quantity: *quantity,
            quantity_unit: "unit".to_string(),
            measure_unit: item.measure_unit.clone(),
            grams_per_measure_unit: 1.0,
            household: true,
        })
    }));
    stock.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.item_key.cmp(&b.item_key))
    });
    let mut stock_options = dataset
        .ingredients
        .iter()
        .map(|item| StockItemView {
            item_key: item.key.clone(),
            name: item.name.clone(),
            category: item.category.clone(),
            quantity: 0.0,
            quantity_unit: if item.measure_unit == "g" { "g" } else { "unit" }.to_string(),
            measure_unit: item.measure_unit.clone(),
            grams_per_measure_unit: item.grams_per_measure_unit,
            household: false,
        })
        .chain(dataset.household_items.iter().map(|item| StockItemView {
            item_key: item.key.clone(),
            name: item.name.clone(),
            category: item.category.clone(),
            quantity: 0.0,
            quantity_unit: "unit".to_string(),
            measure_unit: item.measure_unit.clone(),
            grams_per_measure_unit: 1.0,
            household: true,
        }))
        .collect::<Vec<_>>();
    stock_options.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.item_key.cmp(&b.item_key))
    });
    let mut custom_grocery = dataset
        .household_needs
        .iter()
        .filter_map(|(key, quantity)| {
            if let Some(item) = household_items.get(key.as_str()) {
                return Some(CustomGroceryItem {
                    key: key.clone(),
                    name: item.name.clone(),
                    category: item.category.clone(),
                    quantity: *quantity,
                    measure_unit: item.measure_unit.clone(),
                    purchase_unit: item.purchase_unit.clone(),
                    purchase_quantity: item.purchase_quantity,
                    estimated_price: item.estimated_price,
                    custom: item.custom,
                });
            }
            ingredients.get(key).map(|item| CustomGroceryItem {
                key: key.clone(),
                name: item.name.clone(),
                category: item.category.clone(),
                quantity: *quantity,
                measure_unit: item.measure_unit.clone(),
                purchase_unit: item.purchase_unit.clone(),
                purchase_quantity: item.purchase_quantity_grams / item.grams_per_measure_unit,
                estimated_price: item.purchase_quantity_grams * item.price_per_kg / 1000.0,
                custom: false,
            })
        })
        .collect::<Vec<_>>();
    custom_grocery.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.key.cmp(&b.key))
    });
    let mut household_options = dataset
        .household_items
        .iter()
        .map(|item| CustomGroceryItem {
            key: item.key.clone(),
            name: item.name.clone(),
            category: item.category.clone(),
            quantity: dataset.household_needs.get(&item.key).copied().unwrap_or(1.0),
            measure_unit: item.measure_unit.clone(),
            purchase_unit: item.purchase_unit.clone(),
            purchase_quantity: item.purchase_quantity,
            estimated_price: item.estimated_price,
            custom: item.custom,
        })
        .chain(dataset.ingredients.iter().map(|item| CustomGroceryItem {
            key: item.key.clone(),
            name: item.name.clone(),
            category: item.category.clone(),
            quantity: dataset.household_needs.get(&item.key).copied().unwrap_or(1.0),
            measure_unit: item.measure_unit.clone(),
            purchase_unit: item.purchase_unit.clone(),
            purchase_quantity: item.purchase_quantity_grams / item.grams_per_measure_unit,
            estimated_price: item.purchase_quantity_grams * item.price_per_kg / 1000.0,
            custom: false,
        }))
        .collect::<Vec<_>>();
    household_options.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.key.cmp(&b.key))
    });

    let mut snapshot_ingredients = dataset.ingredients.clone();
    snapshot_ingredients.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.key.cmp(&b.key))
    });

    Ok(AppSnapshot {
        language: language.to_string(),
        profile: profile.map(str::to_string),
        source_hash: dataset.source_hash.clone(),
        counts: Counts {
            ingredients: dataset.ingredients.len(),
            dishes: dataset.dishes.len(),
            people: dataset.people.len(),
            menu: dataset.menu.len(),
            stock: dataset.stock.len() + dataset.household_stock.len(),
            household_items: dataset.household_items.len(),
        },
        days,
        meals,
        people: dataset.people.clone(),
        ingredients: snapshot_ingredients,
        household_items: dataset.household_items.clone(),
        item_options,
        stock,
        stock_options,
        custom_grocery,
        household_options,
        planner: dataset.menu.clone(),
        menu_cells,
        daily_nutrition,
        dishes: dish_views,
        grocery: build_grocery(dataset)?,
        grocery_plan: build_grocery_plan(dataset)?,
    })
}

fn split_category(category: &str) -> (String, String) {
    let mut parts = category.splitn(2, "::");
    (
        parts.next().unwrap_or("").trim().to_string(),
        parts.next().unwrap_or("").trim().to_string(),
    )
}

fn format_number(value: f64) -> String {
    let value = format!("{value:.1}");
    value.trim_end_matches('0').trim_end_matches('.').to_string()
}

fn format_quantity(quantity: f64, unit: &str, grams_per_unit: f64) -> String {
    if unit != "g" {
        return format!("{} {}", format_number(quantity / grams_per_unit), unit);
    }
    let rounded = quantity.round();
    if rounded >= 1000.0 {
        let value = format!("{:.2}", rounded / 1000.0);
        return format!("{} kg", value.trim_end_matches('0').trim_end_matches('.'));
    }
    if rounded >= 10.0 {
        format!("{rounded:.0} g")
    } else {
        format!("{rounded:.0}g")
    }
}

fn purchase_units(quantity: f64, package_quantity: f64) -> u32 {
    (((quantity - EPSILON) / package_quantity).ceil() as u32).max(1)
}

#[derive(Default)]
struct FoodAggregate {
    category: String,
    subcategory: String,
    name: String,
    measure_unit: String,
    grams_per_measure_unit: f64,
    purchase_unit: String,
    purchase_quantity_grams: f64,
    grams: f64,
    need_price: f64,
}

fn ingredient_requirements(dataset: &Dataset) -> HashMap<String, f64> {
    let ingredients = dataset
        .ingredients
        .iter()
        .map(|item| (item.key.clone(), item))
        .collect::<HashMap<_, _>>();
    let dishes = dataset
        .dishes
        .iter()
        .map(|item| (item.key.clone(), item))
        .collect::<HashMap<_, _>>();
    let mut totals = HashMap::new();
    for row in &dataset.menu {
        let people_count = row.people.len() as f64;
        if let Some(ingredient) = ingredients.get(&row.item_key) {
            let multiplier = menu_multiplier(row, Some(ingredient), None) * people_count;
            *totals.entry(row.item_key.clone()).or_insert(0.0) += ingredient.grams * multiplier;
        } else if let Some(dish) = dishes.get(&row.item_key) {
            let multiplier = menu_multiplier(row, None, Some(dish)) * people_count;
            for component in &dish.components {
                *totals.entry(component.item_key.clone()).or_insert(0.0) +=
                    component.grams / dish.servings * multiplier;
            }
        }
    }
    for (key, quantity) in &dataset.household_needs {
        if let Some(ingredient) = ingredients.get(key) {
            *totals.entry(key.clone()).or_insert(0.0) +=
                quantity * ingredient.grams_per_measure_unit;
        }
    }
    totals
}

fn food_identity(ingredient: &Ingredient) -> String {
    let (category, subcategory) = split_category(&ingredient.category);
    format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}{:x}\u{1f}{}\u{1f}{:x}",
        category,
        subcategory,
        ingredient.name,
        ingredient.measure_unit,
        ingredient.grams_per_measure_unit.to_bits(),
        ingredient.purchase_unit,
        ingredient.purchase_quantity_grams.to_bits(),
    )
}

pub fn build_grocery(dataset: &Dataset) -> Result<GroceryResult, String> {
    let ingredients: HashMap<String, &Ingredient> = dataset
        .ingredients
        .iter()
        .map(|item| (item.key.clone(), item))
        .collect();
    let mut totals = ingredient_requirements(dataset);
    for (key, stocked) in &dataset.stock {
        if let Some(total) = totals.get_mut(key) {
            *total = (*total - stocked).max(0.0);
            if *total <= EPSILON {
                *total = 0.0;
            }
        }
    }

    let mut food_groups: HashMap<String, FoodAggregate> = HashMap::new();
    for (key, grams) in totals {
        if grams <= EPSILON {
            continue;
        }
        let ingredient = ingredients
            .get(&key)
            .ok_or_else(|| format!("grocery references missing ingredient: {key}"))?;
        let (category, subcategory) = split_category(&ingredient.category);
        let identity = food_identity(ingredient);
        let group = food_groups.entry(identity).or_insert_with(|| FoodAggregate {
            category,
            subcategory,
            name: ingredient.name.clone(),
            measure_unit: ingredient.measure_unit.clone(),
            grams_per_measure_unit: ingredient.grams_per_measure_unit,
            purchase_unit: ingredient.purchase_unit.clone(),
            purchase_quantity_grams: ingredient.purchase_quantity_grams,
            ..Default::default()
        });
        group.grams += grams;
        group.need_price += grams * ingredient.price_per_kg / 1000.0;
    }

    let mut items = Vec::new();
    for (identity, group) in food_groups {
        let units = purchase_units(group.grams, group.purchase_quantity_grams);
        let purchase_grams = units as f64 * group.purchase_quantity_grams;
        let purchase_price = units as f64
            * group.purchase_quantity_grams
            * (group.need_price / group.grams);
        items.push(GroceryItem {
            id: format!("food-{identity}"),
            category: group.category,
            subcategory: group.subcategory,
            name: group.name,
            needed_quantity: group.grams,
            needed_quantity_text: format_quantity(
                group.grams,
                &group.measure_unit,
                group.grams_per_measure_unit,
            ),
            measure_unit: group.measure_unit,
            purchase_unit: group.purchase_unit.clone(),
            purchase_units: units,
            purchase_quantity: purchase_grams,
            purchase_quantity_text: format!("{units} x {}", group.purchase_unit),
            estimated_need_price: group.need_price,
            estimated_purchase_price: purchase_price,
            household: false,
            stock_quantity: 0.0,
            stock_quantity_text: String::new(),
            stock_sufficient: false,
            grams_per_measure_unit: group.grams_per_measure_unit,
        });
    }

    let household_by_key: HashMap<String, &HouseholdItem> = dataset
        .household_items
        .iter()
        .map(|item| (item.key.clone(), item))
        .collect();
    for (key, needed) in &dataset.household_needs {
        if ingredients.contains_key(key) {
            continue;
        }
        let remaining = needed - dataset.household_stock.get(key).copied().unwrap_or(0.0);
        if remaining <= EPSILON {
            continue;
        }
        let item = household_by_key
            .get(key)
            .ok_or_else(|| format!("missing household item: {key}"))?;
        let units = purchase_units(remaining, item.purchase_quantity);
        let (category, subcategory) = split_category(&item.category);
        items.push(GroceryItem {
            id: format!("household-{key}"),
            category,
            subcategory,
            name: item.name.clone(),
            needed_quantity: remaining,
            needed_quantity_text: format!(
                "{} {}",
                format_number(remaining),
                item.measure_unit
            ),
            measure_unit: item.measure_unit.clone(),
            purchase_unit: item.purchase_unit.clone(),
            purchase_units: units,
            purchase_quantity: units as f64 * item.purchase_quantity,
            purchase_quantity_text: format!("{units} x {}", item.purchase_unit),
            estimated_need_price: remaining / item.purchase_quantity * item.estimated_price,
            estimated_purchase_price: units as f64 * item.estimated_price,
            household: true,
            stock_quantity: 0.0,
            stock_quantity_text: String::new(),
            stock_sufficient: false,
            grams_per_measure_unit: 1.0,
        });
    }

    items.sort_by(|a, b| {
        a.category
            .to_lowercase()
            .cmp(&b.category.to_lowercase())
            .then(a.subcategory.to_lowercase().cmp(&b.subcategory.to_lowercase()))
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    let mut grouped: BTreeMap<String, BTreeMap<String, Vec<GroceryItem>>> = BTreeMap::new();
    for item in &items {
        grouped
            .entry(item.category.clone())
            .or_default()
            .entry(item.subcategory.clone())
            .or_default()
            .push(item.clone());
    }
    let categories = grouped
        .into_iter()
        .map(|(name, subcategories)| GroceryCategory {
            name,
            subcategories: subcategories
                .into_iter()
                .map(|(name, items)| GrocerySubcategory { name, items })
                .collect(),
        })
        .collect();
    let estimated_purchase_total = items
        .iter()
        .map(|item| item.estimated_purchase_price)
        .sum();
    Ok(GroceryResult {
        items,
        categories,
        estimated_purchase_total,
    })
}

fn apply_purchase_result(
    item: &mut GroceryItem,
    purchases: &HashMap<String, GroceryItem>,
) {
    if let Some(purchase) = purchases.get(&item.id) {
        item.stock_quantity = (item.needed_quantity - purchase.needed_quantity).max(0.0);
        item.stock_quantity_text = if item.stock_quantity > EPSILON {
            format_quantity(
                item.stock_quantity,
                &item.measure_unit,
                item.grams_per_measure_unit,
            )
        } else {
            String::new()
        };
        item.purchase_unit = purchase.purchase_unit.clone();
        item.purchase_units = purchase.purchase_units;
        item.purchase_quantity = purchase.purchase_quantity;
        item.purchase_quantity_text = purchase.purchase_quantity_text.clone();
        item.estimated_purchase_price = purchase.estimated_purchase_price;
        item.stock_sufficient = false;
    } else {
        item.purchase_units = 0;
        item.purchase_quantity = 0.0;
        item.purchase_quantity_text.clear();
        item.estimated_purchase_price = 0.0;
        item.stock_quantity = item.needed_quantity;
        item.stock_quantity_text = item.needed_quantity_text.clone();
        item.stock_sufficient = true;
    }
}

pub fn build_grocery_plan(dataset: &Dataset) -> Result<GroceryResult, String> {
    let purchase = build_grocery(dataset)?;
    let purchases = purchase
        .items
        .iter()
        .map(|item| (item.id.clone(), item.clone()))
        .collect::<HashMap<_, _>>();
    let mut without_stock = dataset.clone();
    without_stock.stock.clear();
    without_stock.household_stock.clear();
    let mut plan = build_grocery(&without_stock)?;
    for item in &mut plan.items {
        apply_purchase_result(item, &purchases);
    }
    for category in &mut plan.categories {
        for subcategory in &mut category.subcategories {
            for item in &mut subcategory.items {
                apply_purchase_result(item, &purchases);
            }
        }
    }
    plan.estimated_purchase_total = purchase.estimated_purchase_total;
    Ok(plan)
}

pub fn exclude_grocery_items(
    mut grocery: GroceryResult,
    excluded_ids: &HashSet<String>,
) -> GroceryResult {
    grocery
        .items
        .retain(|item| !excluded_ids.contains(&item.id));
    for category in &mut grocery.categories {
        for subcategory in &mut category.subcategories {
            subcategory
                .items
                .retain(|item| !excluded_ids.contains(&item.id));
        }
        category
            .subcategories
            .retain(|subcategory| !subcategory.items.is_empty());
    }
    grocery
        .categories
        .retain(|category| !category.subcategories.is_empty());
    grocery.estimated_purchase_total = grocery
        .items
        .iter()
        .map(|item| item.estimated_purchase_price)
        .sum();
    grocery
}

use crate::engine::Engine;
use crate::model::*;
use crate::price_history::preserve_price_history;
use std::collections::HashMap;

impl Engine {
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
        for mut ingredient in custom_ingredients {
            preserve_price_history(
                &mut ingredient.price_history,
                &[],
                &ingredient.price_checked_at,
                ingredient.price_per_kg,
                &ingredient.price_source,
            );
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

    pub fn replace_ingredient(&mut self, input: Ingredient) -> Result<AppSnapshot, String> {
        self.replace_ingredient_with_history(input, false)
    }

    pub fn replace_ingredient_with_history(
        &mut self,
        mut input: Ingredient,
        price_history_provided: bool,
    ) -> Result<AppSnapshot, String> {
        validate_ingredient(&input)?;
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let index = dataset
            .ingredients
            .iter()
            .position(|ingredient| ingredient.key == input.key)
            .ok_or_else(|| format!("unknown ingredient: {}", input.key))?;
        preserve_price_history(
            &mut input.price_history,
            if price_history_provided {
                &[]
            } else {
                &dataset.ingredients[index].price_history
            },
            &input.price_checked_at,
            input.price_per_kg,
            &input.price_source,
        );
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

    pub fn add_ingredient(&mut self, mut input: Ingredient) -> Result<AppSnapshot, String> {
        preserve_price_history(
            &mut input.price_history,
            &[],
            &input.price_checked_at,
            input.price_per_kg,
            &input.price_source,
        );
        validate_ingredient(&input)?;
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        if dataset.ingredients.iter().any(|item| item.key == input.key)
            || dataset.household_items.iter().any(|item| item.key == input.key)
            || dataset.dishes.iter().any(|item| item.key == input.key)
        {
            return Err(format!("item key already exists: {}", input.key));
        }
        dataset.ingredients.push(input);
        self.snapshot()
    }

    pub fn replace_household_item(&mut self, input: HouseholdItem) -> Result<AppSnapshot, String> {
        self.replace_household_item_with_history(input, false)
    }

    pub fn replace_household_item_with_history(
        &mut self,
        mut input: HouseholdItem,
        price_history_provided: bool,
    ) -> Result<AppSnapshot, String> {
        validate_household_item(&input)?;
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let index = dataset
            .household_items
            .iter()
            .position(|item| item.key == input.key)
            .ok_or_else(|| format!("unknown general item: {}", input.key))?;
        preserve_price_history(
            &mut input.price_history,
            if price_history_provided {
                &[]
            } else {
                &dataset.household_items[index].price_history
            },
            &input.last_bought_at,
            input.estimated_price,
            &input.notes,
        );
        input.custom = input.custom || dataset.household_items[index].custom;
        dataset.household_items[index] = input;
        self.snapshot()
    }

    pub fn add_household_item(
        &mut self,
        mut input: HouseholdItem,
    ) -> Result<AppSnapshot, String> {
        preserve_price_history(
            &mut input.price_history,
            &[],
            &input.last_bought_at,
            input.estimated_price,
            &input.notes,
        );
        validate_household_item(&input)?;
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        if dataset.ingredients.iter().any(|item| item.key == input.key)
            || dataset.household_items.iter().any(|item| item.key == input.key)
            || dataset.dishes.iter().any(|item| item.key == input.key)
        {
            return Err(format!("item key already exists: {}", input.key));
        }
        dataset.household_items.push(input);
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
            let used_by_rules = dataset
                .people
                .iter()
                .filter(|person| {
                    person
                        .food_rules
                        .iter()
                        .any(|rule| rule.item_keys.contains(&key))
                })
                .map(|person| person.name.clone())
                .collect::<Vec<_>>();
            if !used_by_rules.is_empty() {
                return Err(format!(
                    "item is still used by food rules for: {}",
                    used_by_rules.join(", ")
                ));
            }
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
            dataset.stock_notes.remove(&key);
            dataset.household_needs.remove(&key);
            dataset.household_need_notes.remove(&key);
            return self.snapshot();
        }
        if let Some(item_index) = dataset
            .household_items
            .iter()
            .position(|item| item.key == key)
        {
            dataset.household_items.remove(item_index);
            dataset.household_needs.remove(&key);
            dataset.household_need_notes.remove(&key);
            dataset.household_stock.remove(&key);
            dataset.stock_notes.remove(&key);
            return self.snapshot();
        }
        Err(format!("unknown item: {key}"))
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
        auto_menu_main: input.auto_menu_main,
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
    if [
        ingredient.sugars_g,
        ingredient.saturated_fat_g,
        ingredient.salt_g,
        ingredient.fruit_vegetable_legume_percent,
    ]
    .into_iter()
    .flatten()
    .any(|value| !value.is_finite() || value < 0.0)
    {
        return Err("the Nutri-Score ingredient values cannot be negative".to_string());
    }
    if ingredient
        .fruit_vegetable_legume_percent
        .is_some_and(|value| value > 100.0)
    {
        return Err("the fruit, vegetable and legume percentage cannot exceed 100".to_string());
    }
    if ingredient
        .price_history
        .iter()
        .any(|entry| !entry.price.is_finite() || entry.price < 0.0)
    {
        return Err("the ingredient price history contains an invalid price".to_string());
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
        .price_history
        .iter()
        .any(|entry| !entry.price.is_finite() || entry.price < 0.0)
    {
        return Err("the item price history contains an invalid price".to_string());
    }
    if item
        .lasting_days
        .is_some_and(|days| !days.is_finite() || days <= 0.0)
    {
        return Err("the item lasting days must be positive".to_string());
    }
    Ok(())
}

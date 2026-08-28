use super::nutrition::{dish_nutri_score, dish_nutrients, ingredient_nutrients};
use crate::grocery::{build_grocery, build_grocery_plan};
use crate::loader::{
    dataset_with_localized_categories, localized_days, localized_meals, localized_menu_rows,
};
use crate::menu_math::menu_multiplier;
use crate::model::*;
use std::collections::HashMap;

fn localize_grocery_categories(grocery: &mut GroceryResult, language: &str) {
    let labels = grocery
        .items
        .iter()
        .map(|item| {
            let code = if item.subcategory.is_empty() {
                item.category.clone()
            } else {
                format!("{}::{}", item.category, item.subcategory)
            };
            (item.id.clone(), crate::locale::category_label(language, &code))
        })
        .collect::<HashMap<_, _>>();
    for item in &mut grocery.items {
        let label = labels.get(&item.id).cloned().unwrap_or_default();
        let (category, subcategory) = label.split_once("::").unwrap_or((&label, ""));
        item.category = category.to_string();
        item.subcategory = subcategory.to_string();
    }
    for category in &mut grocery.categories {
        let category_code = category.name.clone();
        for subcategory in &mut category.subcategories {
            let code = if subcategory.name.is_empty() {
                category_code.clone()
            } else {
                format!("{}::{}", category_code, subcategory.name)
            };
            let label = crate::locale::category_label(language, &code);
            let (category_label, subcategory_label) =
                label.split_once("::").unwrap_or((&label, ""));
            category.name = category_label.to_string();
            subcategory.name = subcategory_label.to_string();
            for item in &mut subcategory.items {
                item.category = category_label.to_string();
                item.subcategory = subcategory_label.to_string();
            }
        }
    }
}

pub fn build_snapshot(
    dataset: &Dataset,
    language: &str,
    profile: Option<&str>,
) -> Result<AppSnapshot, String> {
    let canonical_dataset = dataset;
    let localized_dataset = dataset_with_localized_categories(dataset, language);
    let dataset = &localized_dataset;
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
    let planner = localized_menu_rows(&dataset.menu, language)?;

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
            let entries = planner
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
            for row in planner
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
        let (calculated_nutri_score, nutri_score_missing_values, nutri_score_missing_ingredients) =
            dish_nutri_score(dish, &ingredients)?;
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
                    allergens: ingredient.allergens.clone(),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        dish_views.push(DishView {
            key: dish.key.clone(),
            name: dish.name.clone(),
            origin_country: dish.origin_country.clone(),
            auto_menu_main: dish.auto_menu_main,
            grocery_exempt: dish.grocery_exempt,
            servings: dish.servings,
            recipe_url: dish.recipe_url.clone(),
            source: dish.source.clone(),
            source_notes: dish.source_notes.clone(),
            nutri_score: calculated_nutri_score
                .map(|score| score.letter.to_string())
                .unwrap_or_else(|| dish.nutri_score.clone()),
            nutri_score_manual: dish.nutri_score.clone(),
            nutri_score_computed: calculated_nutri_score.is_some(),
            nutri_score_value: calculated_nutri_score.map(|score| score.value),
            nutri_score_missing_values,
            nutri_score_missing_ingredients,
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
                    notes: dataset.stock_notes.get(key).cloned().unwrap_or_default(),
                    added_at: dataset.stock_added_at.get(key).cloned().unwrap_or_default(),
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
            notes: dataset.stock_notes.get(key).cloned().unwrap_or_default(),
            added_at: dataset.stock_added_at.get(key).cloned().unwrap_or_default(),
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
            notes: dataset.stock_notes.get(&item.key).cloned().unwrap_or_default(),
            added_at: dataset.stock_added_at.get(&item.key).cloned().unwrap_or_default(),
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
            notes: dataset.stock_notes.get(&item.key).cloned().unwrap_or_default(),
            added_at: dataset.stock_added_at.get(&item.key).cloned().unwrap_or_default(),
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
                    notes: dataset.household_need_notes.get(key).cloned(),
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
                notes: dataset.household_need_notes.get(key).cloned(),
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
            notes: dataset.household_need_notes.get(&item.key).cloned(),
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
            notes: dataset.household_need_notes.get(&item.key).cloned(),
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

    let mut grocery = build_grocery(canonical_dataset)?;
    let mut grocery_plan = build_grocery_plan(canonical_dataset)?;
    localize_grocery_categories(&mut grocery, language);
    localize_grocery_categories(&mut grocery_plan, language);

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
        planner,
        menu_cells,
        daily_nutrition,
        dishes: dish_views,
        grocery,
        grocery_plan,
    })
}

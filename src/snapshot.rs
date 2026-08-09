use crate::grocery::{build_grocery, build_grocery_plan};
use crate::loader::{localized_days, localized_meals};
use crate::menu_math::menu_multiplier;
use crate::model::*;
use std::collections::{HashMap, HashSet};

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

#[derive(Debug, Clone, Copy)]
struct CalculatedNutriScore {
    letter: char,
    value: i32,
}

fn points_above(value: f64, thresholds: &[f64]) -> i32 {
    thresholds.iter().filter(|threshold| value > **threshold).count() as i32
}

fn ingredient_nutri_score_missing(ingredient: &Ingredient) -> usize {
    [
        ingredient.sugars_g,
        ingredient.saturated_fat_g,
        ingredient.salt_g,
        ingredient.fruit_vegetable_legume_percent,
    ]
    .into_iter()
    .filter(Option::is_none)
    .count()
}

fn dish_nutri_score(
    dish: &Dish,
    ingredients: &HashMap<String, &Ingredient>,
) -> Result<(Option<CalculatedNutriScore>, usize, usize), String> {
    let mut missing_values = 0;
    let mut missing_ingredients = 0;
    let mut checked_ingredients = HashSet::new();
    for component in &dish.components {
        let ingredient = ingredients
            .get(&component.item_key)
            .ok_or_else(|| format!("dish {} references missing ingredient {}", dish.key, component.item_key))?;
        if !checked_ingredients.insert(ingredient.key.as_str()) {
            continue;
        }
        let missing = ingredient_nutri_score_missing(ingredient);
        missing_values += missing;
        missing_ingredients += usize::from(missing > 0);
    }
    if missing_values > 0 {
        return Ok((None, missing_values, missing_ingredients));
    }

    let total_grams = dish.components.iter().map(|component| component.grams).sum::<f64>();
    if total_grams <= 0.0 {
        return Ok((None, 0, 0));
    }
    let mut energy_kj = 0.0;
    let mut sugars = 0.0;
    let mut saturated_fat = 0.0;
    let mut salt = 0.0;
    let mut protein = 0.0;
    let mut fibre = 0.0;
    let mut fruit_vegetable_legume = 0.0;
    for component in &dish.components {
        let ingredient = ingredients[&component.item_key];
        let factor = component.grams / ingredient.grams;
        energy_kj += ingredient.kcal * 4.184 * factor;
        sugars += ingredient.sugars_g.unwrap_or_default() * factor;
        saturated_fat += ingredient.saturated_fat_g.unwrap_or_default() * factor;
        salt += ingredient.salt_g.unwrap_or_default() * factor;
        protein += ingredient.protein_g * factor;
        fibre += ingredient.fiber_g * factor;
        fruit_vegetable_legume += component.grams
            * ingredient.fruit_vegetable_legume_percent.unwrap_or_default()
            / 100.0;
    }
    let per_100g = 100.0 / total_grams;
    let energy_points = points_above(
        energy_kj * per_100g,
        &[335.0, 670.0, 1005.0, 1340.0, 1675.0, 2010.0, 2345.0, 2680.0, 3015.0, 3350.0],
    );
    let saturated_fat_points = points_above(
        saturated_fat * per_100g,
        &[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
    );
    let sugars_points = points_above(
        sugars * per_100g,
        &[3.4, 6.8, 10.0, 14.0, 17.0, 20.0, 24.0, 27.0, 31.0, 34.0, 37.0, 41.0, 44.0, 48.0, 51.0],
    );
    let salt_points = points_above(
        salt * per_100g,
        &[0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0],
    );
    let negative = energy_points + saturated_fat_points + sugars_points + salt_points;
    let protein_points = points_above(
        protein * per_100g,
        &[2.4, 4.8, 7.2, 9.6, 12.0, 14.0, 17.0],
    );
    let fibre_points = points_above(fibre * per_100g, &[3.0, 4.1, 5.2, 6.3, 7.4]);
    let fruit_vegetable_legume_percent = fruit_vegetable_legume / total_grams * 100.0;
    let fruit_vegetable_legume_points = if fruit_vegetable_legume_percent > 80.0 {
        5
    } else if fruit_vegetable_legume_percent > 60.0 {
        2
    } else if fruit_vegetable_legume_percent > 40.0 {
        1
    } else {
        0
    };
    let value = negative
        - fibre_points
        - fruit_vegetable_legume_points
        - if negative < 11 { protein_points } else { 0 };
    let letter = match value {
        i32::MIN..=0 => 'A',
        1..=2 => 'B',
        3..=10 => 'C',
        11..=18 => 'D',
        _ => 'E',
    };
    Ok((Some(CalculatedNutriScore { letter, value }), 0, 0))
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
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        dish_views.push(DishView {
            key: dish.key.clone(),
            name: dish.name.clone(),
            auto_menu_main: dish.auto_menu_main,
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

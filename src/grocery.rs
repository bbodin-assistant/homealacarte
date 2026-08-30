use crate::menu_math::menu_multiplier;
use crate::model::{
    Dataset, GroceryCategory, GroceryItem, GroceryResult, GrocerySubcategory, HouseholdItem,
    Ingredient,
};
use std::collections::{BTreeMap, HashMap, HashSet};

const EPSILON: f64 = 1e-6;

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
    purchase_quantity: f64,
    purchase_quantity_unit: String,
    package_grams: f64,
    grams: f64,
    need_price: f64,
}

pub(crate) fn menu_row_is_current(row: &crate::model::MenuRow, current_date: &str) -> bool {
    current_date.is_empty() || row.date.is_empty() || row.date.as_str() >= current_date
}

pub(crate) fn ingredient_requirements_from(
    dataset: &Dataset,
    current_date: &str,
) -> HashMap<String, f64> {
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
    for row in dataset
        .menu
        .iter()
        .filter(|row| menu_row_is_current(row, current_date))
    {
        let people_count = row.people.len() as f64;
        if let Some(ingredient) = ingredients.get(&row.item_key) {
            let multiplier = menu_multiplier(row, Some(ingredient), None) * people_count;
            *totals.entry(row.item_key.clone()).or_insert(0.0) += ingredient.grams * multiplier;
        } else if let Some(dish) = dishes.get(&row.item_key) {
            if dish.grocery_exempt {
                continue;
            }
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

fn purchase_requirements_from(
    dataset: &Dataset,
    current_date: &str,
) -> Result<HashMap<String, f64>, String> {
    let ingredients = dataset
        .ingredients
        .iter()
        .map(|item| (item.key.clone(), item))
        .collect::<HashMap<_, _>>();
    let mut purchase_totals = HashMap::new();
    for (key, required_grams) in ingredient_requirements_from(dataset, current_date) {
        let ingredient = ingredients
            .get(&key)
            .ok_or_else(|| format!("grocery references missing ingredient: {key}"))?;
        let (purchase_key, factor) = if ingredient.purchase_item_key.is_empty() {
            (ingredient.key.as_str(), 1.0)
        } else {
            (
                ingredient.purchase_item_key.as_str(),
                ingredient.purchase_grams_per_gram,
            )
        };
        let source_stock = if purchase_key == ingredient.key {
            0.0
        } else {
            dataset.stock.get(&ingredient.key).copied().unwrap_or(0.0) * factor
        };
        *purchase_totals.entry(purchase_key.to_string()).or_insert(0.0) +=
            (required_grams * factor - source_stock).max(0.0);
    }
    for (key, stocked) in &dataset.stock {
        if let Some(total) = purchase_totals.get_mut(key) {
            *total = (*total - stocked).max(0.0);
            if *total <= EPSILON {
                *total = 0.0;
            }
        }
    }
    Ok(purchase_totals)
}

pub(crate) fn food_identity(ingredient: &Ingredient) -> String {
    let (category, subcategory) = split_category(&ingredient.category);
    format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}{:x}\u{1f}{}\u{1f}{:x}\u{1f}{}",
        category,
        subcategory,
        ingredient.name,
        ingredient.measure_unit,
        ingredient.grams_per_measure_unit.to_bits(),
        ingredient.purchase_unit,
        ingredient.purchase_quantity.to_bits(),
        ingredient.purchase_quantity_unit,
    )
}

pub fn build_grocery(dataset: &Dataset) -> Result<GroceryResult, String> {
    build_grocery_from(dataset, "")
}

pub(crate) fn build_grocery_from(
    dataset: &Dataset,
    current_date: &str,
) -> Result<GroceryResult, String> {
    let ingredients: HashMap<String, &Ingredient> = dataset
        .ingredients
        .iter()
        .map(|item| (item.key.clone(), item))
        .collect();
    let totals = purchase_requirements_from(dataset, current_date)?;

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
            purchase_quantity: ingredient.purchase_quantity,
            purchase_quantity_unit: ingredient.purchase_quantity_unit.clone(),
            package_grams: ingredient.purchase_quantity_grams(),
            ..Default::default()
        });
        group.grams += grams;
        group.need_price += ingredient.price_for_grams(grams);
    }

    let mut items = Vec::new();
    for (identity, group) in food_groups {
        let units = purchase_units(group.grams, group.package_grams);
        let purchase_quantity = units as f64 * group.purchase_quantity;
        let purchase_price = units as f64
            * group.package_grams
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
            purchase_quantity,
            purchase_quantity_unit: group.purchase_quantity_unit,
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
            needed_quantity_text: format!("{} {}", format_number(remaining), item.measure_unit),
            measure_unit: item.measure_unit.clone(),
            purchase_unit: item.purchase_unit.clone(),
            purchase_units: units,
            purchase_quantity: units as f64 * item.purchase_quantity,
            purchase_quantity_unit: item.measure_unit.clone(),
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
        estimated_full_purchase_total: estimated_purchase_total,
    })
}

fn apply_purchase_result(item: &mut GroceryItem, purchases: &HashMap<String, GroceryItem>) {
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
        item.purchase_quantity_unit = purchase.purchase_quantity_unit.clone();
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

pub(crate) fn build_grocery_plan_from(
    dataset: &Dataset,
    current_date: &str,
) -> Result<GroceryResult, String> {
    let purchase = build_grocery_from(dataset, current_date)?;
    let purchases = purchase
        .items
        .iter()
        .map(|item| (item.id.clone(), item.clone()))
        .collect::<HashMap<_, _>>();
    let mut without_stock = dataset.clone();
    without_stock.stock.clear();
    without_stock.household_stock.clear();
    let mut plan = build_grocery_from(&without_stock, current_date)?;
    let estimated_full_purchase_total = plan.estimated_purchase_total;
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
    plan.estimated_full_purchase_total = estimated_full_purchase_total;
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
    grocery.estimated_full_purchase_total = grocery.estimated_purchase_total;
    grocery
}

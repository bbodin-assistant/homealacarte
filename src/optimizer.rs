use crate::engine::build_grocery;
use crate::loader::{localized_days, localized_meals};
use crate::model::{
    AutoMenuDailyResult, AutoMenuProposal, AutoMenuRequest, Dataset, Dish, Ingredient, MenuRow,
};
use microlp::{
    ComparisonOp, LinearExpr, OptimizationDirection, Problem, SolveOutcome, SolutionStatus,
    Variable,
};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::time::Duration;

const EPSILON: f64 = 1e-6;
const DEVIATION_WEIGHT: f64 = 0.0001;
const SOLVE_TIME_LIMIT_SECONDS: f64 = 30.0;
const MAX_DAILY_CANDIDATES: usize = 8;

#[derive(Clone)]
struct DishDecision {
    dish_index: usize,
    chosen: Variable,
    portions: Vec<(usize, Variable)>,
}

struct PackageVariable {
    ingredient_index: usize,
    variable: Variable,
}

fn ingredient_row_grams(row: &MenuRow, ingredient: &Ingredient) -> f64 {
    match row.quantity_unit.as_str() {
        "g" => row.quantity,
        "unit" => row.quantity * ingredient.grams_per_measure_unit,
        _ => row.quantity * ingredient.grams,
    }
}

fn dish_row_portions(row: &MenuRow, dish: &Dish) -> f64 {
    match row.quantity_unit.as_str() {
        "portion" => row.quantity,
        "g" => {
            let grams_per_serving =
                dish.components.iter().map(|component| component.grams).sum::<f64>()
                    / dish.servings;
            row.quantity / grams_per_serving
        }
        _ => row.quantity,
    }
}

fn ingredient_kcal(ingredient: &Ingredient, grams: f64) -> f64 {
    ingredient.kcal * grams / ingredient.grams
}

fn dish_kcal(dish: &Dish, ingredients: &HashMap<&str, &Ingredient>) -> Result<f64, String> {
    let mut kcal = 0.0;
    for component in &dish.components {
        let ingredient = ingredients.get(component.item_key.as_str()).ok_or_else(|| {
            format!(
                "dish {} references missing ingredient {}",
                dish.key, component.item_key
            )
        })?;
        kcal += ingredient_kcal(ingredient, component.grams);
    }
    Ok(kcal / dish.servings)
}

fn existing_daily_kcal(
    dataset: &Dataset,
    ingredients: &HashMap<&str, &Ingredient>,
    dishes: &HashMap<&str, &Dish>,
    person_key: &str,
    day: &str,
) -> Result<f64, String> {
    let mut kcal = 0.0;
    for row in dataset
        .menu
        .iter()
        .filter(|row| row.day == day && row.people.iter().any(|person| person == person_key))
    {
        if let Some(ingredient) = ingredients.get(row.item_key.as_str()) {
            kcal += ingredient_kcal(ingredient, ingredient_row_grams(row, ingredient));
        } else if let Some(dish) = dishes.get(row.item_key.as_str()) {
            kcal += dish_kcal(dish, ingredients)? * dish_row_portions(row, dish);
        }
    }
    Ok(kcal)
}

fn fixed_ingredient_requirements(
    dataset: &Dataset,
    ingredients: &HashMap<&str, &Ingredient>,
    dishes: &HashMap<&str, &Dish>,
) -> HashMap<String, f64> {
    let mut requirements = HashMap::new();
    for row in &dataset.menu {
        let people_count = row.people.len() as f64;
        if let Some(ingredient) = ingredients.get(row.item_key.as_str()) {
            *requirements.entry(row.item_key.clone()).or_insert(0.0) +=
                ingredient_row_grams(row, ingredient) * people_count;
        } else if let Some(dish) = dishes.get(row.item_key.as_str()) {
            let portions = dish_row_portions(row, dish) * people_count;
            for component in &dish.components {
                *requirements.entry(component.item_key.clone()).or_insert(0.0) +=
                    component.grams / dish.servings * portions;
            }
        }
    }
    for (key, quantity) in &dataset.household_needs {
        if let Some(ingredient) = ingredients.get(key.as_str()) {
            *requirements.entry(key.clone()).or_insert(0.0) +=
                quantity * ingredient.grams_per_measure_unit;
        }
    }
    requirements
}

fn dish_retail_cost(dish: &Dish, ingredients: &HashMap<&str, &Ingredient>) -> f64 {
    dish.components
        .iter()
        .filter_map(|component| {
            ingredients.get(component.item_key.as_str()).map(|ingredient| {
                component.grams * ingredient.price_per_kg / 1000.0 / dish.servings
            })
        })
        .sum()
}

fn shortlist_daily_candidates(
    candidates: &[usize],
    minimum_count: usize,
    dataset: &Dataset,
    ingredients: &HashMap<&str, &Ingredient>,
    kcal_values: &[f64],
) -> Vec<usize> {
    let limit = MAX_DAILY_CANDIDATES.max(minimum_count);
    if candidates.len() <= limit {
        return candidates.to_vec();
    }
    let mut by_cost = candidates.to_vec();
    by_cost.sort_by(|left, right| {
        dish_retail_cost(&dataset.dishes[*left], ingredients)
            .total_cmp(&dish_retail_cost(&dataset.dishes[*right], ingredients))
            .then_with(|| dataset.dishes[*left].key.cmp(&dataset.dishes[*right].key))
    });
    let mut by_kcal = candidates.to_vec();
    by_kcal.sort_by(|left, right| {
        kcal_values[*left]
            .total_cmp(&kcal_values[*right])
            .then_with(|| dataset.dishes[*left].key.cmp(&dataset.dishes[*right].key))
    });

    let mut selected = BTreeSet::new();
    let calorie_reserve = 8.min(limit / 2);
    for index in by_cost.iter().take(limit - calorie_reserve) {
        selected.insert(*index);
    }
    for index in by_kcal.iter().take(calorie_reserve / 2) {
        selected.insert(*index);
    }
    for index in by_kcal.iter().rev().take(calorie_reserve / 2) {
        selected.insert(*index);
    }
    for index in by_cost {
        if selected.len() >= limit {
            break;
        }
        selected.insert(index);
    }
    selected.into_iter().collect()
}

fn generate_menu_once(
    dataset: &Dataset,
    language: &str,
    request: AutoMenuRequest,
) -> Result<AutoMenuProposal, String> {
    if !request.kcal_threshold.is_finite()
        || request.kcal_threshold < 0.0
        || request.kcal_threshold > 1000.0
        || !request.min_portions.is_finite()
        || !request.max_portions.is_finite()
        || !request.portion_step.is_finite()
        || request.min_portions <= 0.0
        || request.max_portions < request.min_portions
        || request.max_portions > 5.0
        || request.portion_step <= 0.0
        || request.portion_step > 1.0
    {
        return Err("auto_menu_invalid_parameters".to_string());
    }
    let min_steps = (request.min_portions / request.portion_step - EPSILON).ceil() as i32;
    let max_steps = (request.max_portions / request.portion_step + EPSILON).floor() as i32;
    if min_steps <= 0 || max_steps < min_steps {
        return Err("auto_menu_invalid_parameters".to_string());
    }

    let valid_days = localized_days(language).into_iter().collect::<HashSet<_>>();
    let valid_meals = localized_meals(language).into_iter().collect::<HashSet<_>>();
    let people_by_key = dataset
        .people
        .iter()
        .enumerate()
        .map(|(index, person)| (person.key.as_str(), (index, person)))
        .collect::<HashMap<_, _>>();
    let ingredients_by_key = dataset
        .ingredients
        .iter()
        .map(|item| (item.key.as_str(), item))
        .collect::<HashMap<_, _>>();
    let dishes_by_key = dataset
        .dishes
        .iter()
        .map(|dish| (dish.key.as_str(), dish))
        .collect::<HashMap<_, _>>();

    let mut availability = BTreeSet::new();
    for entry in request.availability {
        let Some((person_index, person)) = people_by_key.get(entry.person_key.as_str()) else {
            return Err("auto_menu_invalid_availability".to_string());
        };
        if person.kcal_target.is_none() || !valid_days.contains(&entry.day) {
            return Err("auto_menu_invalid_availability".to_string());
        }
        availability.insert((*person_index, entry.day));
    }
    if availability.is_empty() {
        return Err("auto_menu_no_availability".to_string());
    }

    let mut slots = Vec::new();
    let mut unique_slots = BTreeSet::new();
    for slot in request.slots {
        if !valid_days.contains(&slot.day)
            || !valid_meals.contains(&slot.meal)
            || !unique_slots.insert((slot.day.clone(), slot.meal.clone()))
            || dataset
                .menu
                .iter()
                .any(|row| row.day == slot.day && row.meal == slot.meal)
        {
            return Err("auto_menu_invalid_slot".to_string());
        }
        if !availability.iter().any(|(_, day)| day == &slot.day) {
            return Err("auto_menu_empty_slot_people".to_string());
        }
        slots.push(slot);
    }
    if slots.is_empty() {
        return Err("auto_menu_no_slots".to_string());
    }

    let used_dishes = dataset
        .menu
        .iter()
        .filter_map(|row| dishes_by_key.get(row.item_key.as_str()).map(|dish| dish.key.as_str()))
        .collect::<HashSet<_>>();
    let requested_candidates = request
        .candidate_dish_keys
        .into_iter()
        .collect::<HashSet<_>>();
    let mut candidates = dataset
        .dishes
        .iter()
        .enumerate()
        .filter(|(_, dish)| {
            requested_candidates.contains(&dish.key) && !used_dishes.contains(dish.key.as_str())
        })
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if candidates.len() < slots.len() {
        return Err("auto_menu_not_enough_dishes".to_string());
    }

    let dish_kcal_values = dataset
        .dishes
        .iter()
        .map(|dish| dish_kcal(dish, &ingredients_by_key))
        .collect::<Result<Vec<_>, _>>()?;
    let candidates_were_shortlisted = candidates.len() > MAX_DAILY_CANDIDATES.max(slots.len());
    candidates = shortlist_daily_candidates(
        &candidates,
        slots.len(),
        dataset,
        &ingredients_by_key,
        &dish_kcal_values,
    );
    let minimum_candidate_kcal = candidates
        .iter()
        .map(|index| dish_kcal_values[*index])
        .fold(f64::INFINITY, f64::min);
    let maximum_candidate_kcal = candidates
        .iter()
        .map(|index| dish_kcal_values[*index])
        .fold(0.0, f64::max);
    let mut existing_kcal = BTreeMap::new();
    for (person_index, day) in &availability {
        let person = &dataset.people[*person_index];
        let value = existing_daily_kcal(
            dataset,
            &ingredients_by_key,
            &dishes_by_key,
            &person.key,
            day,
        )?;
        if value > person.kcal_target.unwrap_or(0.0) + request.kcal_threshold + EPSILON {
            return Err("auto_menu_existing_over_target".to_string());
        }
        let slot_count = slots.iter().filter(|slot| slot.day == *day).count() as f64;
        let target = person.kcal_target.unwrap_or(0.0);
        if value + slot_count * maximum_candidate_kcal * request.max_portions
            < target - request.kcal_threshold - EPSILON
        {
            return Err("auto_menu_not_enough_kcal".to_string());
        }
        if value + slot_count * minimum_candidate_kcal * request.min_portions
            > target + request.kcal_threshold + EPSILON
        {
            return Err("auto_menu_too_many_kcal".to_string());
        }
        existing_kcal.insert((*person_index, day.clone()), value);
    }

    let mut problem = Problem::new(OptimizationDirection::Minimize);
    let mut decisions = Vec::new();
    for slot in &slots {
        let slot_people = availability
            .iter()
            .filter(|(_, day)| day == &slot.day)
            .map(|(person_index, _)| *person_index)
            .collect::<Vec<_>>();
        let mut slot_decisions = Vec::new();
        for dish_index in &candidates {
            let chosen = problem.add_binary_var(0.0);
            let portions = slot_people
                .iter()
                .map(|person_index| (*person_index, problem.add_integer_var(0.0, (0, max_steps))))
                .collect();
            slot_decisions.push(DishDecision {
                dish_index: *dish_index,
                chosen,
                portions,
            });
        }
        decisions.push(slot_decisions);
    }

    let fixed_requirements =
        fixed_ingredient_requirements(dataset, &ingredients_by_key, &dishes_by_key);
    let mut maximum_generated = HashMap::<String, f64>::new();
    for (slot_index, _) in slots.iter().enumerate() {
        let people_count = decisions[slot_index][0].portions.len() as f64;
        for ingredient in &dataset.ingredients {
            let maximum_for_slot = candidates
                .iter()
                .map(|dish_index| {
                    dataset.dishes[*dish_index]
                        .components
                        .iter()
                        .filter(|component| component.item_key == ingredient.key)
                        .map(|component| component.grams / dataset.dishes[*dish_index].servings)
                        .sum::<f64>()
                })
                .fold(0.0, f64::max)
                * request.max_portions
                * people_count;
            *maximum_generated.entry(ingredient.key.clone()).or_default() += maximum_for_slot;
        }
    }

    let mut package_variables = Vec::new();
    for (ingredient_index, ingredient) in dataset.ingredients.iter().enumerate() {
        let maximum_need = fixed_requirements.get(&ingredient.key).copied().unwrap_or(0.0)
            + maximum_generated.get(&ingredient.key).copied().unwrap_or(0.0);
        let stock = dataset.stock.get(&ingredient.key).copied().unwrap_or(0.0);
        if maximum_need > stock + EPSILON {
            package_variables.push(PackageVariable {
                ingredient_index,
                variable: problem.add_var(
                    ingredient.price_per_kg / 1000.0,
                    (0.0, (maximum_need - stock).max(1.0)),
                ),
            });
        }
    }

    let mut deviation_variables = BTreeMap::new();
    for key in &availability {
        deviation_variables.insert(
            key.clone(),
            problem.add_var(DEVIATION_WEIGHT, (0.0, request.kcal_threshold)),
        );
    }

    for slot_decisions in &decisions {
        let mut selected = LinearExpr::empty();
        for decision in slot_decisions {
            selected.add(decision.chosen, 1.0);
            for (_, portions) in &decision.portions {
                problem.add_constraint(
                    [(*portions, 1.0), (decision.chosen, -(max_steps as f64))],
                    ComparisonOp::Le,
                    0.0,
                );
                problem.add_constraint(
                    [(*portions, 1.0), (decision.chosen, -(min_steps as f64))],
                    ComparisonOp::Ge,
                    0.0,
                );
            }
        }
        problem.add_constraint(selected, ComparisonOp::Eq, 1.0);
    }
    for dish_index in &candidates {
        let mut uses = LinearExpr::empty();
        for slot_decisions in &decisions {
            if let Some(decision) = slot_decisions
                .iter()
                .find(|decision| decision.dish_index == *dish_index)
            {
                uses.add(decision.chosen, 1.0);
            }
        }
        problem.add_constraint(uses, ComparisonOp::Le, 1.0);
    }

    for ((person_index, day), deviation) in &deviation_variables {
        let person = &dataset.people[*person_index];
        let target = person.kcal_target.unwrap_or(0.0);
        let existing = existing_kcal
            .get(&(*person_index, day.clone()))
            .copied()
            .unwrap_or(0.0);
        let mut generated = LinearExpr::empty();
        let mut generated_negative = LinearExpr::empty();
        for (slot_index, _) in slots.iter().enumerate().filter(|(_, slot)| &slot.day == day) {
            for decision in &decisions[slot_index] {
                if let Some((_, portions)) = decision
                    .portions
                    .iter()
                    .find(|(candidate_person, _)| candidate_person == person_index)
                {
                    let coefficient =
                        dish_kcal_values[decision.dish_index] * request.portion_step;
                    generated.add(*portions, coefficient);
                    generated_negative.add(*portions, -coefficient);
                }
            }
        }
        problem.add_constraint(
            generated.clone(),
            ComparisonOp::Le,
            target + request.kcal_threshold - existing,
        );
        problem.add_constraint(
            generated.clone(),
            ComparisonOp::Ge,
            target - request.kcal_threshold - existing,
        );
        let mut positive_deviation = generated.clone();
        positive_deviation.add(*deviation, -1.0);
        problem.add_constraint(
            positive_deviation,
            ComparisonOp::Le,
            target - existing,
        );
        let mut negative_deviation = generated_negative;
        negative_deviation.add(*deviation, -1.0);
        problem.add_constraint(
            negative_deviation,
            ComparisonOp::Le,
            existing - target,
        );
    }

    for package in &package_variables {
        let ingredient = &dataset.ingredients[package.ingredient_index];
        let mut generated = LinearExpr::empty();
        for slot_decisions in &decisions {
            for decision in slot_decisions {
                let dish = &dataset.dishes[decision.dish_index];
                let grams_per_portion = dish
                    .components
                    .iter()
                    .filter(|component| component.item_key == ingredient.key)
                    .map(|component| component.grams / dish.servings)
                    .sum::<f64>();
                if grams_per_portion <= EPSILON {
                    continue;
                }
                for (_, portions) in &decision.portions {
                    generated.add(*portions, grams_per_portion * request.portion_step);
                }
            }
        }
        let available_after_fixed = dataset.stock.get(&ingredient.key).copied().unwrap_or(0.0)
            - fixed_requirements.get(&ingredient.key).copied().unwrap_or(0.0);
        generated.add(package.variable, -1.0);
        problem.add_constraint(
            generated,
            ComparisonOp::Le,
            available_after_fixed,
        );
    }

    problem.set_time_limit(Duration::from_secs_f64(SOLVE_TIME_LIMIT_SECONDS));
    let outcome = problem.solve().map_err(|error| {
        if matches!(error, microlp::Error::Infeasible) {
            "auto_menu_infeasible".to_string()
        } else {
            format!("auto_menu_solver_error: {error}")
        }
    })?;
    let (solution, optimal) = match outcome {
        SolveOutcome::Solution(solution) => {
            let optimal = matches!(solution.status(), SolutionStatus::Optimal);
            (solution, optimal)
        }
        SolveOutcome::Interrupted(_) => return Err("auto_menu_solver_timeout".to_string()),
    };

    let mut rows = Vec::new();
    let mut selected_dish_keys = Vec::new();
    for (slot_index, slot) in slots.iter().enumerate() {
        let decision = decisions[slot_index]
            .iter()
            .find(|decision| solution.var_value(decision.chosen) > 0.5)
            .ok_or_else(|| "auto_menu_solver_error".to_string())?;
        let dish = &dataset.dishes[decision.dish_index];
        selected_dish_keys.push(dish.key.clone());
        let mut people_by_steps = BTreeMap::<i32, Vec<String>>::new();
        for (person_index, portions) in &decision.portions {
            let steps = solution.var_value(*portions).round() as i32;
            people_by_steps
                .entry(steps)
                .or_default()
                .push(dataset.people[*person_index].key.clone());
        }
        for (steps, people) in people_by_steps {
            rows.push(MenuRow {
                day: slot.day.clone(),
                meal: slot.meal.clone(),
                item_key: dish.key.clone(),
                people,
                quantity: steps as f64 * request.portion_step,
                quantity_unit: "portion".to_string(),
                notes: if language == "fr" {
                    "Généré automatiquement".to_string()
                } else {
                    "Generated automatically".to_string()
                },
            });
        }
    }

    let mut daily_results = Vec::new();
    for (person_index, day) in &availability {
        let existing = existing_kcal
            .get(&(*person_index, day.clone()))
            .copied()
            .unwrap_or(0.0);
        let generated = slots
            .iter()
            .enumerate()
            .filter(|(_, slot)| &slot.day == day)
            .map(|(slot_index, _)| {
                decisions[slot_index]
                    .iter()
                    .map(|decision| {
                        decision
                            .portions
                            .iter()
                            .find(|(candidate_person, _)| candidate_person == person_index)
                            .map(|(_, portions)| {
                                dish_kcal_values[decision.dish_index]
                                    * request.portion_step
                                    * solution.var_value(*portions).round()
                            })
                            .unwrap_or(0.0)
                    })
                    .sum::<f64>()
            })
            .sum::<f64>();
        daily_results.push(AutoMenuDailyResult {
            person_key: dataset.people[*person_index].key.clone(),
            day: day.clone(),
            target_kcal: dataset.people[*person_index].kcal_target.unwrap_or(0.0),
            existing_kcal: existing,
            generated_kcal: generated,
            total_kcal: existing + generated,
        });
    }

    let original_total = build_grocery(dataset)?.estimated_purchase_total;
    let mut generated_dataset = dataset.clone();
    generated_dataset.menu.extend(rows.iter().cloned());
    let estimated_grocery_total = build_grocery(&generated_dataset)?.estimated_purchase_total;
    let additional_cost = (estimated_grocery_total - original_total).max(0.0);
    Ok(AutoMenuProposal {
        rows,
        daily_results,
        selected_dish_keys,
        estimated_grocery_total,
        estimated_additional_cost: additional_cost,
        optimal: optimal && !candidates_were_shortlisted,
        decomposed: false,
    })
}

pub fn generate_menu(
    dataset: &Dataset,
    language: &str,
    request: AutoMenuRequest,
) -> Result<AutoMenuProposal, String> {
    let selected_days = request
        .slots
        .iter()
        .map(|slot| slot.day.clone())
        .collect::<BTreeSet<_>>();
    if selected_days.len() <= 1 {
        return generate_menu_once(dataset, language, request);
    }

    let original_total = build_grocery(dataset)?.estimated_purchase_total;
    let mut working_dataset = dataset.clone();
    let mut rows = Vec::new();
    let mut daily_results = Vec::new();
    let mut selected_dish_keys = Vec::new();
    let requested_candidates = request.candidate_dish_keys.clone();
    let mut every_daily_solve_optimal = true;

    for day in localized_days(language)
        .into_iter()
        .filter(|day| selected_days.contains(day))
    {
        let daily_request = AutoMenuRequest {
            kcal_threshold: request.kcal_threshold,
            min_portions: request.min_portions,
            max_portions: request.max_portions,
            portion_step: request.portion_step,
            availability: request
                .availability
                .iter()
                .filter(|entry| entry.day == day)
                .cloned()
                .collect(),
            slots: request
                .slots
                .iter()
                .filter(|slot| slot.day == day)
                .cloned()
                .collect(),
            candidate_dish_keys: requested_candidates.clone(),
        };
        let proposal = generate_menu_once(&working_dataset, language, daily_request)?;
        every_daily_solve_optimal &= proposal.optimal;
        working_dataset.menu.extend(proposal.rows.iter().cloned());
        rows.extend(proposal.rows);
        daily_results.extend(proposal.daily_results);
        selected_dish_keys.extend(proposal.selected_dish_keys);
    }

    let estimated_grocery_total = build_grocery(&working_dataset)?.estimated_purchase_total;
    Ok(AutoMenuProposal {
        rows,
        daily_results,
        selected_dish_keys,
        estimated_grocery_total,
        estimated_additional_cost: (estimated_grocery_total - original_total).max(0.0),
        // Each day is solved exactly, but earlier dish choices are not revisited by later days.
        optimal: every_daily_solve_optimal,
        decomposed: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{DishComponent, Person};

    fn ingredient(key: &str, price: f64) -> Ingredient {
        Ingredient {
            key: key.to_string(),
            name: key.to_string(),
            custom: false,
            incomplete: false,
            grams: 100.0,
            kcal: 100.0,
            protein_g: 0.0,
            carbs_g: 0.0,
            fat_g: 0.0,
            fiber_g: 0.0,
            sugars_g: Some(0.0),
            saturated_fat_g: Some(0.0),
            salt_g: Some(0.0),
            fruit_vegetable_legume_percent: Some(0.0),
            category: "Test".to_string(),
            source: String::new(),
            url: String::new(),
            price_per_kg: price,
            price_source: String::new(),
            price_checked_at: String::new(),
            price_history: vec![],
            measure_unit: "g".to_string(),
            grams_per_measure_unit: 1.0,
            purchase_unit: "100 g".to_string(),
            purchase_quantity_grams: 100.0,
        }
    }

    fn dish(key: &str, ingredient: &str) -> Dish {
        Dish {
            key: key.to_string(),
            name: key.to_string(),
            servings: 1.0,
            recipe_url: String::new(),
            source: String::new(),
            source_notes: vec![],
            nutri_score: String::new(),
            components: vec![DishComponent {
                item_key: ingredient.to_string(),
                grams: 100.0,
                quantity: 100.0,
                quantity_unit: "g".to_string(),
                source_quantity: "100 g".to_string(),
            }],
        }
    }

    #[test]
    fn generator_prefers_the_stocked_dish_and_keeps_the_target() {
        let mut stock = BTreeMap::new();
        stock.insert("stocked".to_string(), 100.0);
        let dataset = Dataset {
            ingredients: vec![ingredient("stocked", 10.0), ingredient("bought", 10.0)],
            dishes: vec![dish("stocked_dish", "stocked"), dish("bought_dish", "bought")],
            people: vec![Person {
                key: "person".to_string(),
                name: "Person".to_string(),
                kcal_target: Some(100.0),
                kind: "adult".to_string(),
                description: String::new(),
            }],
            menu: vec![],
            stock,
            stock_units: BTreeMap::new(),
            stock_notes: BTreeMap::new(),
            household_items: vec![],
            household_needs: BTreeMap::new(),
            household_need_notes: BTreeMap::new(),
            household_stock: BTreeMap::new(),
            source_hash: String::new(),
        };
        let proposal = generate_menu(
            &dataset,
            "en",
            AutoMenuRequest {
                kcal_threshold: 0.0,
                min_portions: 1.0,
                max_portions: 1.0,
                portion_step: 0.05,
                availability: vec![crate::model::AutoMenuAvailability {
                    person_key: "person".to_string(),
                    day: "Monday".to_string(),
                }],
                slots: vec![crate::model::AutoMenuSlot {
                    day: "Monday".to_string(),
                    meal: "Lunch".to_string(),
                }],
                candidate_dish_keys: vec!["stocked_dish".to_string(), "bought_dish".to_string()],
            },
        )
        .unwrap();
        assert_eq!(proposal.selected_dish_keys, vec!["stocked_dish"]);
        assert_eq!(proposal.rows[0].quantity, 1.0);
        assert_eq!(proposal.estimated_additional_cost, 0.0);
    }
}

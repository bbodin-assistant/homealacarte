use crate::grocery::build_grocery;
use crate::loader::{localized_days, localized_meals};
use crate::model::{
    AutoMenuDailyResult, AutoMenuProposal, AutoMenuRequest, Dataset, MenuRow,
};
use super::support::*;
use microlp::{
    ComparisonOp, LinearExpr, OptimizationDirection, Problem, SolveOutcome, SolutionStatus,
    Variable,
};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::time::Duration;

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

pub(crate) fn solve_menu_once(
    dataset: &Dataset,
    slot_dataset: &Dataset,
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
        let Some((person_index, _)) = people_by_key.get(entry.person_key.as_str()) else {
            return Err("auto_menu_invalid_availability".to_string());
        };
        if !valid_days.contains(&entry.day) {
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
            || slot_dataset
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

    let slot_days = slots
        .iter()
        .map(|slot| slot.day.as_str())
        .collect::<HashSet<_>>();
    let mut dish_use_days = HashMap::<String, HashSet<String>>::new();
    for row in &dataset.menu {
        if dishes_by_key.contains_key(row.item_key.as_str()) {
            dish_use_days
                .entry(row.item_key.clone())
                .or_default()
                .insert(row.day.clone());
        }
    }
    let weekly_uses = dish_use_days
        .into_iter()
        .map(|(key, days)| (key, days.len()))
        .collect::<HashMap<_, _>>();
    let used_dishes = dataset
        .menu
        .iter()
        .filter(|row| slot_days.contains(row.day.as_str()))
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
            dish.auto_menu_main
                && requested_candidates.contains(&dish.key)
                && !used_dishes.contains(dish.key.as_str())
                && weekly_uses.get(&dish.key).copied().unwrap_or(0) < MAX_WEEKLY_DISH_USES
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
    let has_never_rules = availability.iter().any(|(person_index, _)| {
        dataset.people[*person_index]
            .food_rules
            .iter()
            .any(|rule| rule.kind == "never")
    });
    let candidates_were_shortlisted = !has_never_rules
        && candidates.len() > MAX_DAILY_CANDIDATES.max(slots.len());
    if !has_never_rules {
        candidates = shortlist_daily_candidates(
            &candidates,
            slots.len(),
            dataset,
            &ingredients_by_key,
            &dish_kcal_values,
            &weekly_uses,
        );
    }
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
        let Some(target) = person.kcal_target else {
            continue;
        };
        let value = existing_daily_kcal(
            dataset,
            &ingredients_by_key,
            &dishes_by_key,
            &person.key,
            day,
        )?;
        if !request.same_portion_for_everyone {
            if value > target + request.kcal_threshold + EPSILON {
                return Err("auto_menu_existing_over_target".to_string());
            }
            let slot_count = slots.iter().filter(|slot| slot.day == *day).count() as f64;
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
        }
        existing_kcal.insert((*person_index, day.clone()), value);
    }

    let mut shared_remaining_kcal = BTreeMap::<String, (f64, usize)>::new();
    if request.same_portion_for_everyone {
        for ((person_index, day), value) in &existing_kcal {
            let target = dataset.people[*person_index].kcal_target.unwrap_or(0.0);
            let entry = shared_remaining_kcal.entry(day.clone()).or_default();
            entry.0 += target - value;
            entry.1 += 1;
        }
        for (day, (total_remaining, people_count)) in &shared_remaining_kcal {
            let remaining = total_remaining / *people_count as f64;
            let slot_count = slots.iter().filter(|slot| &slot.day == day).count() as f64;
            if slot_count * maximum_candidate_kcal * request.max_portions
                < remaining - request.kcal_threshold - EPSILON
            {
                return Err("auto_menu_not_enough_kcal".to_string());
            }
            if slot_count * minimum_candidate_kcal * request.min_portions
                > remaining + request.kcal_threshold + EPSILON
            {
                return Err("auto_menu_too_many_kcal".to_string());
            }
        }
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
        for dish_index in candidates.iter().filter(|dish_index| {
            slot_people.iter().all(|person_index| {
                !person_forbids_item(
                    &dataset.people[*person_index],
                    &dataset.dishes[**dish_index].key,
                    &slot.meal,
                    language,
                    &dishes_by_key,
                )
            })
        }) {
            let chosen = problem.add_binary_var(
                weekly_uses
                    .get(&dataset.dishes[*dish_index].key)
                    .copied()
                    .unwrap_or(0) as f64
                    * VARIETY_WEIGHT,
            );
            let mut portion_groups = HashMap::new();
            let portions = slot_people
                .iter()
                .map(|person_index| {
                    let person = &dataset.people[*person_index];
                    let target = person.kcal_target.unwrap_or_else(|| {
                        if person.kind == "child" { 1500.0 } else { 2000.0 }
                    });
                    let group = if request.same_portion_for_everyone {
                        ("everyone".to_string(), 0)
                    } else {
                        (person.kind.clone(), (target / 500.0).round() as i32)
                    };
                    let portion = problem.add_integer_var(0.0, (0, max_steps));
                    if let Some(group_portion) = portion_groups.get(&group) {
                        problem.add_constraint(
                            [(portion, 1.0), (*group_portion, -1.0)],
                            ComparisonOp::Eq,
                            0.0,
                        );
                    } else {
                        portion_groups.insert(group, portion);
                    }
                    (*person_index, portion)
                })
                .collect();
            slot_decisions.push(DishDecision {
                dish_index: *dish_index,
                chosen,
                portions,
            });
        }
        if slot_decisions.is_empty() {
            return Err("auto_menu_no_allowed_dish".to_string());
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
        if dataset.people[key.0].kcal_target.is_some() {
            deviation_variables.insert(
                key.clone(),
                problem.add_var(DEVIATION_WEIGHT, (0.0, request.kcal_threshold)),
            );
        }
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
        let desired_generated = if request.same_portion_for_everyone {
            shared_remaining_kcal
                .get(day)
                .map(|(total, count)| total / *count as f64)
                .unwrap_or(target - existing)
        } else {
            target - existing
        };
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
            desired_generated + request.kcal_threshold,
        );
        problem.add_constraint(
            generated.clone(),
            ComparisonOp::Ge,
            desired_generated - request.kcal_threshold,
        );
        let mut positive_deviation = generated.clone();
        positive_deviation.add(*deviation, -1.0);
        problem.add_constraint(
            positive_deviation,
            ComparisonOp::Le,
            desired_generated,
        );
        let mut negative_deviation = generated_negative;
        negative_deviation.add(*deviation, -1.0);
        problem.add_constraint(
            negative_deviation,
            ComparisonOp::Le,
            -desired_generated,
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
        let Some(target_kcal) = dataset.people[*person_index].kcal_target else {
            continue;
        };
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
            target_kcal,
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

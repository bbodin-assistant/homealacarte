use super::solver::DishDecision;
use crate::grocery::build_grocery;
use crate::locale::message_label;
use crate::model::{AutoMenuDailyResult, AutoMenuProposal, AutoMenuSlot, Dataset, MenuRow};
use microlp::Solution;
use std::collections::{BTreeMap, BTreeSet};

pub(crate) fn assemble_result(
    dataset: &Dataset,
    language: &str,
    portion_step: f64,
    slots: &[AutoMenuSlot],
    availability: &BTreeSet<(usize, String)>,
    decisions: &[Vec<DishDecision>],
    solution: &Solution,
    existing_kcal: &BTreeMap<(usize, String), f64>,
    dish_kcal_values: &[f64],
    solver_optimal: bool,
    candidates_were_shortlisted: bool,
) -> Result<AutoMenuProposal, String> {
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
                id: String::new(),
                day: slot.day.clone(),
                meal: slot.meal.clone(),
                item_key: dish.key.clone(),
                people,
                quantity: steps as f64 * portion_step,
                quantity_unit: "portion".to_string(),
                notes: message_label(language, "generated_automatically")
                    .unwrap_or_else(|| "generated_automatically".to_string()),
            });
        }
    }

    let mut daily_results = Vec::new();
    for (person_index, day) in availability {
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
                                    * portion_step
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
        optimal: solver_optimal && !candidates_were_shortlisted,
        decomposed: false,
    })
}

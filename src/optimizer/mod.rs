use crate::grocery::build_grocery;
use crate::loader::{localized_days, merge_menu_rows};
use crate::model::{AutoMenuProposal, AutoMenuRequest, Dataset};
use self::solver::solve_menu_once;
use self::rules::routine_rows;
use std::collections::{BTreeSet, HashSet};

mod candidates;
mod requirements;
mod result;
mod rules;
mod solver;

fn generate_menu_once(
    dataset: &Dataset,
    language: &str,
    request: AutoMenuRequest,
) -> Result<AutoMenuProposal, String> {
    let selected_days = request
        .slots
        .iter()
        .map(|slot| slot.day.clone())
        .collect::<HashSet<_>>();
    let routines = routine_rows(dataset, language, &request.availability, &selected_days)?;
    let mut working_dataset = dataset.clone();
    working_dataset.menu.extend(routines.iter().cloned());
    let mut proposal = solve_menu_once(&working_dataset, dataset, language, request)?;
    let mut rows = routines;
    rows.extend(proposal.rows);
    proposal.rows = merge_menu_rows(rows);

    let original_total = build_grocery(dataset)?.estimated_purchase_total;
    let mut generated_dataset = dataset.clone();
    generated_dataset.menu.extend(proposal.rows.iter().cloned());
    proposal.estimated_grocery_total = build_grocery(&generated_dataset)?.estimated_purchase_total;
    proposal.estimated_additional_cost =
        (proposal.estimated_grocery_total - original_total).max(0.0);
    Ok(proposal)
}

pub fn generate_menu(
    dataset: &Dataset,
    language: &str,
    mut request: AutoMenuRequest,
) -> Result<AutoMenuProposal, String> {
    let people_with_targets = dataset
        .people
        .iter()
        .filter(|person| person.kcal_target.is_some())
        .map(|person| person.key.as_str())
        .collect::<HashSet<_>>();
    request
        .availability
        .retain(|entry| people_with_targets.contains(entry.person_key.as_str()));
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
            same_portion_for_everyone: request.same_portion_for_everyone,
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
mod tests;

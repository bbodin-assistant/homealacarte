use crate::grocery::build_grocery;
use crate::loader::{localized_days, merge_menu_rows};
use crate::model::{AutoMenuProposal, AutoMenuRequest, Dataset};
use self::solver::solve_menu_once;
use self::support::routine_rows;
use std::collections::{BTreeSet, HashSet};

mod solver;
mod support;

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
mod tests {
    use super::*;
    use crate::model::{Dish, DishComponent, FoodRule, Ingredient, Person};
    use std::collections::BTreeMap;

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
            auto_menu_main: true,
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
    fn generator_applies_daily_choices_and_never_rules() {
        let mut stock = BTreeMap::new();
        stock.insert("stocked".to_string(), 200.0);
        let dataset = Dataset {
            ingredients: vec![ingredient("stocked", 10.0), ingredient("bought", 10.0)],
            dishes: vec![dish("stocked_dish", "stocked"), dish("bought_dish", "bought")],
            people: vec![Person {
                key: "person".to_string(),
                name: "Person".to_string(),
                kcal_target: Some(200.0),
                kind: "adult".to_string(),
                description: String::new(),
                food_rules: vec![
                    FoodRule {
                        kind: "routine".to_string(),
                        meal: "breakfast".to_string(),
                        item_keys: vec!["stocked".to_string(), "bought".to_string()],
                        days: vec![
                            "monday".to_string(),
                            "tuesday".to_string(),
                            "wednesday".to_string(),
                            "thursday".to_string(),
                            "friday".to_string(),
                        ],
                        quantity: 100.0,
                        quantity_unit: "g".to_string(),
                    },
                    FoodRule {
                        kind: "never".to_string(),
                        meal: "any".to_string(),
                        item_keys: vec!["bought".to_string()],
                        days: vec![],
                        quantity: 1.0,
                        quantity_unit: "portion".to_string(),
                    },
                ],
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
                same_portion_for_everyone: false,
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
        assert_eq!(proposal.rows.len(), 2);
        assert_eq!(proposal.rows[0].meal, "Breakfast");
        assert_eq!(proposal.rows[0].item_key, "stocked");
        assert_eq!(proposal.rows[1].item_key, "stocked_dish");
        assert_eq!(proposal.estimated_additional_cost, 0.0);

        let mut targetless = dataset.clone();
        targetless.people[0].kcal_target = None;
        let targetless_error = generate_menu(
            &targetless,
            "en",
            AutoMenuRequest {
                kcal_threshold: 50.0,
                min_portions: 1.0,
                max_portions: 1.0,
                portion_step: 0.05,
                same_portion_for_everyone: false,
                availability: vec![crate::model::AutoMenuAvailability {
                    person_key: "person".to_string(),
                    day: "Monday".to_string(),
                }],
                slots: vec![crate::model::AutoMenuSlot {
                    day: "Monday".to_string(),
                    meal: "Lunch".to_string(),
                }],
                candidate_dish_keys: vec![
                    "stocked_dish".to_string(),
                    "bought_dish".to_string(),
                ],
            },
        )
        .unwrap_err();
        assert_eq!(targetless_error, "auto_menu_no_availability");

        let weekend_proposal = generate_menu(
            &dataset,
            "en",
            AutoMenuRequest {
                kcal_threshold: 100.0,
                min_portions: 1.0,
                max_portions: 1.0,
                portion_step: 0.05,
                same_portion_for_everyone: false,
                availability: vec![crate::model::AutoMenuAvailability {
                    person_key: "person".to_string(),
                    day: "Saturday".to_string(),
                }],
                slots: vec![crate::model::AutoMenuSlot {
                    day: "Saturday".to_string(),
                    meal: "Lunch".to_string(),
                }],
                candidate_dish_keys: vec![
                    "stocked_dish".to_string(),
                    "bought_dish".to_string(),
                ],
            },
        )
        .unwrap();
        assert_eq!(weekend_proposal.rows.len(), 1);
        assert_eq!(weekend_proposal.rows[0].meal, "Lunch");

        let mut dessert_only = dataset.clone();
        dessert_only.dishes[0].auto_menu_main = false;
        let dessert_error = generate_menu(
            &dessert_only,
            "en",
            AutoMenuRequest {
                kcal_threshold: 50.0,
                min_portions: 1.0,
                max_portions: 1.0,
                portion_step: 0.05,
                same_portion_for_everyone: false,
                availability: vec![crate::model::AutoMenuAvailability {
                    person_key: "person".to_string(),
                    day: "Saturday".to_string(),
                }],
                slots: vec![crate::model::AutoMenuSlot {
                    day: "Saturday".to_string(),
                    meal: "Lunch".to_string(),
                }],
                candidate_dish_keys: vec!["stocked_dish".to_string()],
            },
        )
        .unwrap_err();
        assert_eq!(dessert_error, "auto_menu_not_enough_dishes");

        let repeated_across_days = generate_menu(
            &dataset,
            "en",
            AutoMenuRequest {
                kcal_threshold: 50.0,
                min_portions: 1.0,
                max_portions: 1.0,
                portion_step: 0.05,
                same_portion_for_everyone: false,
                availability: vec![
                    crate::model::AutoMenuAvailability {
                        person_key: "person".to_string(),
                        day: "Monday".to_string(),
                    },
                    crate::model::AutoMenuAvailability {
                        person_key: "person".to_string(),
                        day: "Tuesday".to_string(),
                    },
                ],
                slots: vec![
                    crate::model::AutoMenuSlot {
                        day: "Monday".to_string(),
                        meal: "Lunch".to_string(),
                    },
                    crate::model::AutoMenuSlot {
                        day: "Tuesday".to_string(),
                        meal: "Lunch".to_string(),
                    },
                ],
                candidate_dish_keys: vec!["stocked_dish".to_string()],
            },
        )
        .unwrap();
        assert_eq!(repeated_across_days.selected_dish_keys.len(), 2);
        assert!(repeated_across_days
            .selected_dish_keys
            .iter()
            .all(|key| key == "stocked_dish"));
    }

    #[test]
    fn generator_can_force_one_shared_portion_for_everyone() {
        let dataset = Dataset {
            ingredients: vec![ingredient("food", 0.0)],
            dishes: vec![dish("shared_dish", "food")],
            people: vec![
                Person {
                    key: "adult".to_string(),
                    name: "Adult".to_string(),
                    kcal_target: Some(100.0),
                    kind: "adult".to_string(),
                    description: String::new(),
                    food_rules: vec![],
                },
                Person {
                    key: "child".to_string(),
                    name: "Child".to_string(),
                    kcal_target: Some(200.0),
                    kind: "child".to_string(),
                    description: String::new(),
                    food_rules: vec![],
                },
                Person {
                    key: "visitor".to_string(),
                    name: "Visitor".to_string(),
                    kcal_target: None,
                    kind: "adult".to_string(),
                    description: String::new(),
                    food_rules: vec![],
                },
            ],
            menu: vec![],
            stock: BTreeMap::new(),
            stock_units: BTreeMap::new(),
            stock_notes: BTreeMap::new(),
            household_items: vec![],
            household_needs: BTreeMap::new(),
            household_need_notes: BTreeMap::new(),
            household_stock: BTreeMap::new(),
            source_hash: String::new(),
        };
        let base_request = AutoMenuRequest {
            kcal_threshold: 100.0,
            min_portions: 1.0,
            max_portions: 2.0,
            portion_step: 1.0,
            same_portion_for_everyone: false,
            availability: vec![
                crate::model::AutoMenuAvailability {
                    person_key: "adult".to_string(),
                    day: "Monday".to_string(),
                },
                crate::model::AutoMenuAvailability {
                    person_key: "child".to_string(),
                    day: "Monday".to_string(),
                },
                crate::model::AutoMenuAvailability {
                    person_key: "visitor".to_string(),
                    day: "Monday".to_string(),
                },
            ],
            slots: vec![crate::model::AutoMenuSlot {
                day: "Monday".to_string(),
                meal: "Lunch".to_string(),
            }],
            candidate_dish_keys: vec!["shared_dish".to_string()],
        };

        let individualized = generate_menu(&dataset, "en", base_request.clone()).unwrap();
        assert_eq!(individualized.rows.len(), 2);

        let shared = generate_menu(
            &dataset,
            "en",
            AutoMenuRequest {
                same_portion_for_everyone: true,
                ..base_request
            },
        )
        .unwrap();
        assert_eq!(shared.rows.len(), 1);
        assert_eq!(shared.rows[0].people.len(), 2);
        assert!(!shared.rows[0].people.iter().any(|person| person == "visitor"));
    }
}

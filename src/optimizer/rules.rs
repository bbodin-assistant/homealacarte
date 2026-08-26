use crate::loader::{
    FOOD_RULE_DAYS, food_rule_meal_name, localized_days, merge_menu_rows,
};
use crate::locale::message_label;
use crate::model::{AutoMenuAvailability, Dataset, Dish, Ingredient, MenuRow, Person};
use std::collections::{BTreeSet, HashMap, HashSet};

pub(crate) fn rule_matches_meal(rule_meal: &str, meal: &str, language: &str) -> bool {
    rule_meal == "any"
        || food_rule_meal_name(rule_meal, language).is_some_and(|value| value == meal)
}

fn rule_matches_item(rule_item: &str, item_key: &str, dishes: &HashMap<&str, &Dish>) -> bool {
    rule_item == item_key
        || dishes.get(item_key).is_some_and(|dish| {
            dish.components
                .iter()
                .any(|component| component.item_key == rule_item)
        })
}

fn is_specific_tree_nut(allergen: &str) -> bool {
    matches!(
        allergen,
        "almond"
            | "hazelnut"
            | "walnut"
            | "cashew_nut"
            | "pecan"
            | "brazil_nut"
            | "pistachio"
            | "macadamia"
    )
}

fn allergens_overlap(rule_allergen: &str, ingredient_allergen: &str) -> bool {
    rule_allergen == ingredient_allergen
        || (rule_allergen == "tree_nut" && is_specific_tree_nut(ingredient_allergen))
        || (ingredient_allergen == "tree_nut" && is_specific_tree_nut(rule_allergen))
}

fn allergen_matches_item(
    allergen: &str,
    item_key: &str,
    ingredients: &HashMap<&str, &Ingredient>,
    dishes: &HashMap<&str, &Dish>,
) -> bool {
    ingredients
        .get(item_key)
        .is_some_and(|ingredient| {
            ingredient
                .allergens
                .iter()
                .any(|value| allergens_overlap(allergen, value))
        })
        || dishes.get(item_key).is_some_and(|dish| {
            dish.components.iter().any(|component| {
                ingredients
                    .get(component.item_key.as_str())
                    .is_some_and(|ingredient| {
                        ingredient
                            .allergens
                            .iter()
                            .any(|value| allergens_overlap(allergen, value))
                    })
            })
        })
}

pub(crate) fn person_forbids_item(
    person: &Person,
    item_key: &str,
    meal: &str,
    language: &str,
    ingredients: &HashMap<&str, &Ingredient>,
    dishes: &HashMap<&str, &Dish>,
) -> bool {
    person.food_rules.iter().any(|rule| {
        let applies = match rule.kind.as_str() {
            "allergy" => true,
            "never" => rule_matches_meal(&rule.meal, meal, language),
            _ => false,
        };
        applies && (rule.item_keys.iter().any(|forbidden| {
                rule_matches_item(forbidden, item_key, dishes)
            }) || (rule.kind == "allergy" && rule.allergens.iter().any(|allergen| {
                allergen_matches_item(allergen, item_key, ingredients, dishes)
            })))
    })
}

pub(crate) fn person_favors_item(
    person: &Person,
    item_key: &str,
    dishes: &HashMap<&str, &Dish>,
) -> bool {
    person.food_rules.iter().any(|rule| {
        rule.kind == "favorite"
            && rule.item_keys.iter().any(|favorite| {
                rule_matches_item(favorite, item_key, dishes)
            })
    })
}

pub(crate) fn routine_rows(
    dataset: &Dataset,
    language: &str,
    availability: &[AutoMenuAvailability],
    selected_days: &HashSet<String>,
) -> Result<Vec<MenuRow>, String> {
    let people = dataset
        .people
        .iter()
        .map(|person| (person.key.as_str(), person))
        .collect::<HashMap<_, _>>();
    let dishes = dataset
        .dishes
        .iter()
        .map(|dish| (dish.key.as_str(), dish))
        .collect::<HashMap<_, _>>();
    let ingredients = dataset
        .ingredients
        .iter()
        .map(|ingredient| (ingredient.key.as_str(), ingredient))
        .collect::<HashMap<_, _>>();
    let days = localized_days(language);
    let mut seen = BTreeSet::new();
    let mut rows = Vec::new();

    for entry in availability {
        if !selected_days.contains(&entry.day)
            || !seen.insert((entry.person_key.clone(), entry.day.clone()))
        {
            continue;
        }
        let Some(person) = people.get(entry.person_key.as_str()) else {
            continue;
        };
        let day_index = days.iter().position(|day| day == &entry.day).unwrap_or(0);
        let day_code = FOOD_RULE_DAYS[day_index];
        for rule in &person.food_rules {
            if rule.kind != "routine" {
                continue;
            }
            if !rule.days.is_empty() && !rule.days.iter().any(|day| day == day_code) {
                continue;
            }
            let meal = food_rule_meal_name(&rule.meal, language)
                .ok_or_else(|| "auto_menu_invalid_food_rule".to_string())?;
            let already_satisfied = dataset.menu.iter().any(|row| {
                row.day == entry.day
                    && row.meal == meal
                    && row.people.iter().any(|key| key == &person.key)
                    && rule.item_keys.contains(&row.item_key)
            });
            if already_satisfied {
                continue;
            }
            let allowed = rule
                .item_keys
                .iter()
                .filter(|key| {
                    !person_forbids_item(person, key, &meal, language, &ingredients, &dishes)
                })
                .collect::<Vec<_>>();
            if allowed.is_empty() {
                return Err("auto_menu_routine_no_allowed_choice".to_string());
            }
            let choice_index = day_index % allowed.len();
            rows.push(MenuRow {
                id: String::new(),
                date: String::new(),
                day: entry.day.clone(),
                meal,
                item_key: allowed[choice_index].to_string(),
                people: vec![person.key.clone()],
                quantity: rule.quantity,
                quantity_unit: rule.quantity_unit.clone(),
                notes: message_label(language, "daily_routine")
                    .unwrap_or_else(|| "daily_routine".to_string()),
            });
        }
    }
    Ok(merge_menu_rows(rows))
}

#[cfg(test)]
mod preference_tests {
    use super::*;
    use crate::model::{DishComponent, FoodRule, Ingredient};

    fn rule(kind: &str, item_key: &str) -> FoodRule {
        FoodRule {
            kind: kind.to_string(),
            meal: "any".to_string(),
            item_keys: vec![item_key.to_string()],
            allergens: vec![],
            days: vec![],
            quantity: 1.0,
            quantity_unit: "portion".to_string(),
        }
    }

    fn person(rules: Vec<FoodRule>) -> Person {
        Person {
            key: "person".to_string(),
            name: "Person".to_string(),
            kcal_target: Some(2000.0),
            kind: "adult".to_string(),
            description: String::new(),
            food_rules: rules,
        }
    }

    fn dish(key: &str, ingredient: &str) -> Dish {
        Dish {
            key: key.to_string(),
            name: key.to_string(),
            origin_country: String::new(),
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

    fn ingredient(key: &str, allergens: &[&str]) -> Ingredient {
        Ingredient {
            key: key.to_string(),
            name: key.to_string(),
            custom: false,
            incomplete: false,
            allergens: allergens.iter().map(|value| value.to_string()).collect(),
            grams: 100.0,
            kcal: 0.0,
            protein_g: 0.0,
            carbs_g: 0.0,
            fat_g: 0.0,
            fiber_g: 0.0,
            sugars_g: None,
            saturated_fat_g: None,
            salt_g: None,
            fruit_vegetable_legume_percent: None,
            category: "Test".to_string(),
            source: String::new(),
            url: String::new(),
            price_per_kg: 0.0,
            price_source: String::new(),
            price_checked_at: String::new(),
            price_history: vec![],
            measure_unit: "g".to_string(),
            grams_per_measure_unit: 1.0,
            purchase_unit: "100 g".to_string(),
            purchase_quantity_grams: 100.0,
        }
    }

    #[test]
    fn allergies_block_dishes_containing_the_allergen() {
        let pasta = dish("pasta", "peanut");
        let dishes = HashMap::from([(pasta.key.as_str(), &pasta)]);
        let ingredients = HashMap::new();
        let allergic = person(vec![rule("allergy", "peanut")]);
        assert!(person_forbids_item(
            &allergic,
            "pasta",
            "Lunch",
            "en",
            &ingredients,
            &dishes,
        ));
    }

    #[test]
    fn allergies_block_compound_ingredients_with_declared_allergens() {
        let noodles = ingredient("sesame_noodles", &["sesame"]);
        let ingredients = HashMap::from([(noodles.key.as_str(), &noodles)]);
        let bowl = dish("noodle_bowl", "sesame_noodles");
        let dishes = HashMap::from([(bowl.key.as_str(), &bowl)]);
        let mut allergy = rule("allergy", "placeholder");
        allergy.item_keys.clear();
        allergy.allergens = vec!["sesame".to_string()];
        let allergic = person(vec![allergy]);
        assert!(person_forbids_item(
            &allergic,
            "noodle_bowl",
            "Lunch",
            "en",
            &ingredients,
            &dishes,
        ));
    }

    #[test]
    fn specific_nut_allergies_conservatively_block_generic_tree_nut_labels() {
        let ice_cream = ingredient("ice_cream", &["tree_nut"]);
        let ingredients = HashMap::from([(ice_cream.key.as_str(), &ice_cream)]);
        let mut allergy = rule("allergy", "placeholder");
        allergy.item_keys.clear();
        allergy.allergens = vec!["pistachio".to_string()];
        let allergic = person(vec![allergy]);

        assert!(person_forbids_item(
            &allergic,
            "ice_cream",
            "Afternoon snack",
            "en",
            &ingredients,
            &HashMap::new(),
        ));
    }

    #[test]
    fn favorite_rules_mark_matching_dishes_without_forbidding_them() {
        let pasta = dish("pasta", "tomato");
        let dishes = HashMap::from([(pasta.key.as_str(), &pasta)]);
        let ingredients = HashMap::new();
        let fan = person(vec![rule("favorite", "pasta")]);
        assert!(person_favors_item(&fan, "pasta", &dishes));
        assert!(!person_forbids_item(
            &fan,
            "pasta",
            "Lunch",
            "en",
            &ingredients,
            &dishes,
        ));
    }
}

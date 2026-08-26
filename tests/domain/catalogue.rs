use homealacarte_web::{AppConfig, Engine, HouseholdItem, Ingredient};


use crate::support::synthetic_dataset;
#[test]
fn the_item_catalogue_edits_general_items_and_deletes_safely() {
    let mut engine = Engine::default();
    let snapshot = engine
        .load(
            vec![synthetic_dataset()],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();
    assert_eq!(snapshot.household_items.len(), 2);

    let with_food = engine
        .add_ingredient(Ingredient {
            key: "new_herb_test".to_string(),
            name: "New herb".to_string(),
            custom: true,
            incomplete: true,
            allergens: vec![],
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
            category: String::new(),
            source: String::new(),
            url: String::new(),
            price_per_kg: 0.0,
            price_source: String::new(),
            price_checked_at: String::new(),
            price_history: vec![],
            measure_unit: "g".to_string(),
            grams_per_measure_unit: 1.0,
            purchase_unit: "bag".to_string(),
            purchase_quantity_grams: 100.0,
        })
        .unwrap();
    assert!(with_food
        .ingredients
        .iter()
        .any(|item| item.key == "new_herb_test" && item.custom));

    let with_general = engine
        .add_household_item(HouseholdItem {
            key: "new_sponge_test".to_string(),
            name: "New sponge".to_string(),
            category: "Household::Cleaning".to_string(),
            purchase_unit: "pack".to_string(),
            purchase_quantity: 2.0,
            estimated_price: 1.5,
            price_history: vec![],
            measure_unit: "sponges".to_string(),
            last_bought_at: String::new(),
            lasting_days: None,
            notes: String::new(),
            custom: true,
        })
        .unwrap();
    assert!(with_general
        .household_items
        .iter()
        .any(|item| item.key == "new_sponge_test" && item.custom));
    let duplicate = engine
        .add_household_item(HouseholdItem {
            key: "new_herb_test".to_string(),
            name: "Duplicate".to_string(),
            category: "Household::Cleaning".to_string(),
            purchase_unit: "unit".to_string(),
            purchase_quantity: 1.0,
            estimated_price: 1.0,
            price_history: vec![],
            measure_unit: "units".to_string(),
            last_bought_at: String::new(),
            lasting_days: None,
            notes: String::new(),
            custom: true,
        })
        .unwrap_err();
    assert!(duplicate.contains("already exists"));

    let updated = engine
        .replace_household_item(HouseholdItem {
            key: "cleaner_test".to_string(),
            name: "Updated cleaner".to_string(),
            category: "Household::Cleaning".to_string(),
            purchase_unit: "bottle".to_string(),
            purchase_quantity: 1.0,
            estimated_price: 3.5,
            price_history: vec![],
            measure_unit: "bottles".to_string(),
            last_bought_at: "2026-07-26".to_string(),
            lasting_days: Some(30.0),
            notes: "Keep away from children.".to_string(),
            custom: false,
        })
        .unwrap();
    assert!(updated
        .household_items
        .iter()
        .any(|item| item.key == "cleaner_test"
            && item.name == "Updated cleaner"
            && item.last_bought_at == "2026-07-26"
            && item.price_history.iter().any(|price| {
                price.date == "2026-07-26"
                    && price.price == 3.5
                    && price.description == "Keep away from children."
            })));

    let history_replaced = engine
        .replace_household_item_with_history(
            HouseholdItem {
                key: "cleaner_test".to_string(),
                name: "Updated cleaner".to_string(),
                category: "Household::Cleaning".to_string(),
                purchase_unit: "bottle".to_string(),
                purchase_quantity: 1.0,
                estimated_price: 3.5,
                price_history: vec![],
                measure_unit: "bottles".to_string(),
                last_bought_at: "2026-07-26".to_string(),
                lasting_days: Some(30.0),
                notes: "Keep away from children.".to_string(),
                custom: false,
            },
            true,
        )
        .unwrap();
    let cleaner_history = &history_replaced
        .household_items
        .iter()
        .find(|item| item.key == "cleaner_test")
        .unwrap()
        .price_history;
    assert_eq!(cleaner_history.len(), 1);
    assert_eq!(cleaner_history[0].date, "2026-07-26");

    let protected = engine.delete_item("tomato_test".to_string()).unwrap_err();
    assert!(protected.contains("Synthetic salad"));

    let deleted = engine.delete_item("paper_test".to_string()).unwrap();
    assert!(!deleted
        .household_items
        .iter()
        .any(|item| item.key == "paper_test"));
    assert!(!deleted.stock.iter().any(|item| item.item_key == "paper_test"));
    assert!(!deleted
        .custom_grocery
        .iter()
        .any(|item| item.key == "paper_test"));
    assert!(!engine.export_data("consolidated").unwrap().contains("\"paper_test\""));
}

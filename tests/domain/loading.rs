use homealacarte_web::{AppConfig, Engine, SourceFile};

use crate::support::synthetic_dataset;

#[test]
fn unsupported_data_shapes_are_rejected() {
    let unsupported_section = SourceFile {
        path: "unsupported.json".to_string(),
        content: r#"{"catalogue":[]}"#.to_string(),
    };
    let error = homealacarte_web::load_dataset(vec![unsupported_section], "fr").unwrap_err();
    assert!(error.contains("unsupported sections: catalogue"));

    let legacy_section = SourceFile {
        path: "legacy.json".to_string(),
        content: r#"{"ingredients":[]}"#.to_string(),
    };
    let error = homealacarte_web::load_dataset(vec![legacy_section], "fr").unwrap_err();
    assert!(error.contains("unsupported sections: ingredients"));

    let bare_array = SourceFile {
        path: "bare-array.json".to_string(),
        content: "[]".to_string(),
    };
    let error = homealacarte_web::load_dataset(vec![bare_array], "fr").unwrap_err();
    assert!(error.contains("top level must be an object"));

    let mut unknown_stock_field = synthetic_dataset();
    unknown_stock_field.content = unknown_stock_field.content.replacen(
        r#"{"item_key": "tomato_test", "quantity": 50"#,
        r#"{"obsolete_key": "tomato_test", "quantity": 50"#,
        1,
    );
    let error = homealacarte_web::load_dataset(vec![unknown_stock_field], "fr").unwrap_err();
    assert!(error.contains("unknown field `obsolete_key`"));

    let mut unknown_component_field = synthetic_dataset();
    unknown_component_field.content = unknown_component_field.content.replacen(
        "\"item_key\": \"tomato_test\",\n              \"grams\"",
        "\"ingredient_key\": \"tomato_test\",\n              \"grams\"",
        1,
    );
    let error = homealacarte_web::load_dataset(vec![unknown_component_field], "fr").unwrap_err();
    assert!(error.contains("unknown field `ingredient_key`"));

    let mut legacy_menu_field = synthetic_dataset();
    legacy_menu_field.content = legacy_menu_field.content.replacen(
        "\"people\": [\"test_person\"],\n              \"quantity\": 1",
        "\"person\": \"test_person\",\n              \"portions\": 1",
        1,
    );
    let error = homealacarte_web::load_dataset(vec![legacy_menu_field], "fr").unwrap_err();
    assert!(error.contains("unknown field `person`") || error.contains("unknown field `portions`"));

    let mut missing_value_sentinel = synthetic_dataset();
    missing_value_sentinel.content = missing_value_sentinel.content.replacen(
        "\"fiber_g\": 1.2,",
        "\"fiber_g\": 1.2,\n              \"sugars_g\": \"MISSINGVALUE\",",
        1,
    );
    let error = homealacarte_web::load_dataset(vec![missing_value_sentinel], "fr").unwrap_err();
    assert!(error.contains("invalid type") || error.contains("expected"));
}

#[test]
fn person_food_rules_are_loaded_and_validated() {
    let mut source = synthetic_dataset();
    source.content = source.content.replacen(
        r#""description": "Likes a small breakfast.""#,
        r#""description": "Likes a small breakfast.",
            "food_rules": [{
              "kind": "routine",
              "meal": "breakfast",
              "item_keys": ["bread_test", "test_salad"],
              "days": ["monday", "wednesday", "friday"],
              "period_start": "09-01",
              "period_end": "10-31",
              "quantity": 1,
              "quantity_unit": "portion"
            }, {
              "kind": "never",
              "meal": "any",
              "item_keys": ["tomato_test"]
            }, {
              "kind": "allergy",
              "meal": "any",
              "item_keys": ["tomato_test"]
            }, {
              "kind": "favorite",
              "meal": "any",
              "item_keys": ["test_salad"]
            }, {
              "kind": "like",
              "meal": "any",
              "item_keys": ["test_salad"]
            }, {
              "kind": "dislike",
              "meal": "any",
              "item_keys": ["tomato_test"]
            }]"#,
        1,
    );
    let dataset = homealacarte_web::load_dataset(vec![source.clone()], "en").unwrap();
    assert_eq!(dataset.people[0].food_rules.len(), 6);
    assert_eq!(dataset.people[0].food_rules[0].item_keys.len(), 2);
    assert_eq!(dataset.people[0].food_rules[2].kind, "allergy");
    assert_eq!(dataset.people[0].food_rules[3].kind, "favorite");
    assert_eq!(dataset.people[0].food_rules[4].kind, "like");
    assert_eq!(dataset.people[0].food_rules[5].kind, "dislike");
    assert_eq!(
        dataset.people[0].food_rules[0].days,
        vec!["monday", "wednesday", "friday"]
    );
    assert_eq!(dataset.people[0].food_rules[0].period_start, "09-01");
    assert_eq!(dataset.people[0].food_rules[0].period_end, "10-31");

    let mut invalid_day = source.clone();
    invalid_day.content = invalid_day.content.replace("wednesday", "funday");
    let error = homealacarte_web::load_dataset(vec![invalid_day], "en").unwrap_err();
    assert!(error.contains("invalid day: funday"));

    let mut invalid_period = source.clone();
    invalid_period.content = invalid_period.content.replace("10-31", "02-31");
    let error = homealacarte_web::load_dataset(vec![invalid_period], "en").unwrap_err();
    assert!(error.contains("invalid annual period"));

    source.content = source.content.replace("bread_test\", \"test_salad", "missing_food");
    let error = homealacarte_web::load_dataset(vec![source], "en").unwrap_err();
    assert!(error.contains("unknown item: missing_food"));
}

#[test]
fn a_household_only_dataset_is_valid() {
    let source = SourceFile {
        path: "household-only.json".to_string(),
        content: r#"{
          "items": [{
            "key": "soap_test",
            "name": "Test soap",
            "category": "Household::Hygiene",
            "estimated_price": 2.5,
            "purchase_unit": "bottle",
            "purchase_quantity": 1,
            "measure_unit": "bottles"
          }]
        }"#.to_string(),
    };
    let mut engine = Engine::default();

    let snapshot = engine
        .load(
            vec![source],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();

    assert!(snapshot.ingredients.is_empty());
    assert!(snapshot.dishes.is_empty());
    assert_eq!(snapshot.household_items.len(), 1);
    assert_eq!(snapshot.household_items[0].key, "soap_test");
}

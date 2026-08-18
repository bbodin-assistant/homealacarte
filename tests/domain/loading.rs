use homealacarte_web::{AppConfig, Engine, SourceFile};

use crate::support::synthetic_dataset;

#[test]
fn unsupported_data_shapes_are_rejected() {
    let unsupported_section = SourceFile {
        path: "unsupported.json".to_string(),
        content: r#"{"catalogue":[]}"#.to_string(),
    };
    let error = homealacarte_web::load_dataset(vec![unsupported_section], "fr").unwrap_err();
    assert!(error.contains("no supported data section"));

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
        "\"obsolete_key\": \"tomato_test\",\n              \"grams\"",
        1,
    );
    let error = homealacarte_web::load_dataset(vec![unknown_component_field], "fr").unwrap_err();
    assert!(error.contains("unknown field `obsolete_key`"));
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
            }]"#,
        1,
    );
    let dataset = homealacarte_web::load_dataset(vec![source.clone()], "en").unwrap();
    assert_eq!(dataset.people[0].food_rules.len(), 4);
    assert_eq!(dataset.people[0].food_rules[0].item_keys.len(), 2);
    assert_eq!(dataset.people[0].food_rules[2].kind, "allergy");
    assert_eq!(dataset.people[0].food_rules[3].kind, "favorite");
    assert_eq!(
        dataset.people[0].food_rules[0].days,
        vec!["monday", "wednesday", "friday"]
    );

    let mut invalid_day = source.clone();
    invalid_day.content = invalid_day.content.replace("wednesday", "funday");
    let error = homealacarte_web::load_dataset(vec![invalid_day], "en").unwrap_err();
    assert!(error.contains("invalid day: funday"));

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
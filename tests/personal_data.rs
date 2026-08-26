use homealacarte_web::{
    AppConfig, Engine, SourceFile, StockUpdate, consolidate_personal_sources,
    merge_personal_documents,
};
use serde_json::Value;

#[test]
fn legacy_personal_files_become_one_valid_current_document() {
    let sources = vec![
        SourceFile {
            path: "ingredients.json".to_string(),
            content: r#"{
              "ingredients": [{
                "key": "apple_test",
                "name": "Test apple",
                "grams": 100,
                "kcal": 52,
                "protein_g": 0.3,
                "carbs_g": 13.8,
                "fat_g": 0.2,
                "fiber_g": 2.4,
                "sugars_g": 10.4,
                "saturated_fat_g": 0.03,
                "salt_g": 0,
                "fruit_vegetable_legume_percent": 100,
                "category": "Produce::Fruit",
                "source": "Synthetic test fixture",
                "url": "",
                "price_per_kg": 2,
                "measure_unit": "piece",
                "grams_per_measure_unit": 150,
                "purchase_unit": "bag",
                "purchase_quantity_grams": 1000
              }]
            }"#.to_string(),
        },
        SourceFile {
            path: "planning.json".to_string(),
            content: r#"{
              "dishes": [{
                "key": "apple_plate_test",
                "name": "Test apple plate",
                "servings": 1,
                "components": [{
                  "ingredient_key": "apple_test",
                  "grams": 150,
                  "source_quantity": "one apple"
                }]
              }],
              "people": [{
                "key": "person_test",
                "name": "Test person",
                "kcal_target": 2000,
                "default": true
              }],
              "menu": [{
                "day": "Lundi",
                "meal": "Déjeuner",
                "item_key": "apple_plate_test",
                "people": ["person_test"],
                "portions": 1
              }],
              "stock": [{
                "ingredient_key": "apple_test",
                "quantity": 1,
                "quantity_unit": "unit",
                "notes": "legacy note"
              }],
              "household_items": [{
                "key": "soap_test",
                "name": "Test soap",
                "category": "Household::Hygiene",
                "estimated_price": 2,
                "purchase_unit": "bottle",
                "purchase_quantity": 1,
                "measure_unit": "bottles"
              }],
              "household_needs": [{
                "item_key": "soap_test",
                "quantity": 2,
                "quantity_unit": "unit",
                "notes": "buy the fragrance-free version"
              }]
            }"#.to_string(),
        },
    ];

    let (content, report) = consolidate_personal_sources(sources, "fr").unwrap();
    let document: Value = serde_json::from_str(&content).unwrap();

    assert_eq!(report.ingredients, 1);
    assert_eq!(report.household_items, 1);
    assert_eq!(report.dishes, 1);
    assert_eq!(report.people, 1);
    assert_eq!(report.menu, 1);
    assert_eq!(report.stock, 1);
    assert_eq!(report.extra_needs, 1);
    assert_eq!(report.missing_nutrition_values, 0);
    assert_eq!(document["items"].as_array().unwrap().len(), 2);
    assert_eq!(
        document["dishes"][0]["components"][0]["item_key"],
        "apple_test"
    );
    assert_eq!(document["stock"][0]["item_key"], "apple_test");
    assert_eq!(document["stock"][0]["notes"], "legacy note");
    assert_eq!(document["extra_needs"][0]["item_key"], "soap_test");
    assert_eq!(
        document["extra_needs"][0]["notes"],
        "buy the fragrance-free version"
    );
    assert!(content.contains("\"meal\": \"lunch\""));
    assert!(!content.contains("ingredient_key"));
    assert!(!content.contains("household_items"));
    assert!(!content.contains("\"default\""));

    let mut engine = Engine::default();
    let snapshot = engine
        .load(
            vec![SourceFile {
                path: "personal-import.json".to_string(),
                content,
            }],
            AppConfig {
                language: "fr".to_string(),
            },
        )
        .unwrap();
    engine
        .replace_stock(vec![StockUpdate {
            item_key: "apple_test".to_string(),
            quantity: 2.0,
            quantity_unit: "unit".to_string(),
            notes: None,
            household: false,
        }])
        .unwrap();
    let mut needs = snapshot.custom_grocery;
    needs[0].quantity = 3.0;
    engine.replace_custom_grocery(needs).unwrap();
    let edited: Value = serde_json::from_str(&engine.export_data("consolidated").unwrap()).unwrap();
    assert_eq!(edited["stock"][0]["notes"], "legacy note");
    assert_eq!(
        edited["extra_needs"][0]["notes"],
        "buy the fragrance-free version"
    );
}

#[test]
fn unknown_sections_are_rejected_instead_of_silently_dropped() {
    let error = consolidate_personal_sources(
        vec![SourceFile {
            path: "unknown.json".to_string(),
            content: r#"{"secret_notes":[{"value":"must not disappear"}]}"#.to_string(),
        }],
        "fr",
    )
    .unwrap_err();

    assert!(error.contains("unsupported sections: secret_notes"));
}

#[test]
fn merge_keeps_rich_base_records_and_applies_explicit_enrichments() {
    let base = r#"{
      "items": [
        {
          "key": "apple_test",
          "name": "Test apple",
          "grams": 100,
          "kcal": 52,
          "protein_g": 0.3,
          "carbs_g": 13.8,
          "fat_g": 0.2,
          "fiber_g": 2.4,
          "category": "Produce::Fruit",
          "source": "Base nutrition",
          "url": "",
          "price_per_kg": 2,
          "price_source": "Old estimate",
          "price_checked_at": "2026-01-01",
          "measure_unit": "piece",
          "grams_per_measure_unit": 150,
          "purchase_unit": "bag",
          "purchase_quantity_grams": 1000
        },
        {
          "key": "soap_test",
          "name": "Test soap",
          "category": "Household::Hygiene",
          "estimated_price": 2,
          "purchase_unit": "bottle",
          "purchase_quantity": 1,
          "measure_unit": "bottles",
          "notes": "Keep the household metadata"
        }
      ],
      "dishes": [{
        "key": "apple_plate_test",
        "name": "Test apple plate",
        "servings": 1,
        "components": [{"item_key": "apple_test", "grams": 150}]
      }],
      "people": [{
        "key": "person_test",
        "name": "Test person",
        "kcal_target": 2000,
        "kind": "adult",
        "description": "Rich base description"
      }],
      "menu": [{
        "day": "Lundi",
        "meal": "Dejeuner",
        "item_key": "apple_plate_test",
        "people": ["person_test"],
        "quantity": 1,
        "quantity_unit": "portion",
        "notes": "base menu note"
      }],
      "stock": [{
        "item_key": "apple_test",
        "quantity": 1,
        "quantity_unit": "unit",
        "notes": "base stock note"
      }],
      "extra_needs": [{
        "item_key": "soap_test",
        "quantity": 1,
        "quantity_unit": "unit",
        "notes": "base need note"
      }]
    }"#;
    let overlay = r#"{
      "items": [
        {
          "key": "apple_test",
          "name": "Test apple",
          "grams": 100,
          "kcal": 52,
          "protein_g": 0.3,
          "carbs_g": 13.8,
          "fat_g": 0.2,
          "fiber_g": 2.4,
          "sugars_g": 10.4,
          "saturated_fat_g": 0.03,
          "salt_g": 0,
          "fruit_vegetable_legume_percent": 100,
          "category": "Produce::Fruit",
          "source": "Base nutrition",
          "url": "",
          "price_per_kg": 2.5,
          "price_source": "Ticket de caisse 2026-07-25 — apples",
          "price_checked_at": "2026-07-25",
          "measure_unit": "piece",
          "grams_per_measure_unit": 150,
          "purchase_unit": "bag",
          "purchase_quantity_grams": 1000
        },
        {
          "key": "banana_test",
          "name": "Test banana",
          "grams": 100,
          "kcal": 89,
          "protein_g": 1.1,
          "carbs_g": 23,
          "fat_g": 0.3,
          "fiber_g": 2.6,
          "sugars_g": 12,
          "saturated_fat_g": 0.1,
          "salt_g": 0,
          "fruit_vegetable_legume_percent": 100,
          "category": "Produce::Fruit",
          "source": "Overlay nutrition",
          "url": "",
          "price_per_kg": 2,
          "measure_unit": "piece",
          "grams_per_measure_unit": 120,
          "purchase_unit": "bunch",
          "purchase_quantity_grams": 1000
        }
      ],
      "dishes": [
        {
          "key": "apple_plate_test",
          "name": "Test apple plate",
          "servings": 1,
          "components": [{"item_key": "apple_test", "grams": 150}]
        },
        {
          "key": "banana_plate_test",
          "name": "Test banana plate",
          "servings": 1,
          "components": [{"item_key": "banana_test", "grams": 120}]
        }
      ],
      "people": [{
        "key": "person_test",
        "name": "Test person",
        "kcal_target": 2000
      }],
      "menu": [
        {
          "day": "Lundi",
          "meal": "Dejeuner",
          "item_key": "apple_plate_test",
          "people": ["person_test"],
          "quantity": 1,
          "quantity_unit": "portion",
          "notes": "base menu note"
        },
        {
          "day": "Lundi",
          "meal": "Dejeuner",
          "item_key": "apple_plate_test",
          "people": ["person_test"],
          "quantity": 2,
          "quantity_unit": "portion"
        },
        {
          "day": "Mardi",
          "meal": "Dejeuner",
          "item_key": "banana_plate_test",
          "people": ["person_test"],
          "quantity": 1,
          "quantity_unit": "portion"
        }
      ],
      "stock": [{
        "item_key": "apple_test",
        "quantity": 2,
        "quantity_unit": "unit",
        "notes": "overlay stock note"
      }],
      "extra_needs": []
    }"#;

    let (content, audit) = merge_personal_documents(base, overlay, "fr").unwrap();
    let merged: Value = serde_json::from_str(&content).unwrap();
    let apple = merged["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["key"] == "apple_test")
        .unwrap();
    let person = &merged["people"][0];

    assert_eq!(
        apple["fruit_vegetable_legume_percent"].as_f64(),
        Some(100.0)
    );
    assert_eq!(apple["price_per_kg"].as_f64(), Some(2.5));
    assert_eq!(
        apple["price_source"],
        "Ticket de caisse 2026-07-25 — apples"
    );
    assert_eq!(person["kind"], "adult");
    assert_eq!(person["description"], "Rich base description");
    assert_eq!(merged["menu"].as_array().unwrap().len(), 3);
    assert_eq!(merged["menu"][0]["quantity"], 1.0);
    assert_eq!(merged["stock"][0]["quantity"].as_f64(), Some(3.0));
    assert_eq!(
        merged["stock"][0]["notes"],
        "base stock note\noverlay stock note"
    );
    assert_eq!(apple["price_history"].as_array().unwrap().len(), 2);
    assert_eq!(audit.nutrition_enrichments.len(), 1);
    assert_eq!(audit.price_history_merges.len(), 1);
    assert_eq!(audit.added_overlay_records["items"], 1);
    assert_eq!(audit.added_overlay_records["dishes"], 1);
    assert_eq!(audit.added_overlay_records["menu"], 2);
    assert_eq!(audit.added_overlay_records["stock"], 1);
    let item_keys = merged["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["key"].as_str().unwrap())
        .collect::<std::collections::HashSet<_>>();
    let dish_keys = merged["dishes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|dish| dish["key"].as_str().unwrap())
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(item_keys.len(), merged["items"].as_array().unwrap().len());
    assert_eq!(dish_keys.len(), merged["dishes"].as_array().unwrap().len());
}

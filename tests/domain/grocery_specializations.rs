use homealacarte_web::{AppConfig, Engine, SourceFile};

fn specialization_dataset(requirement_keys: &[&str], stock_key: &str) -> SourceFile {
    let ingredient = |key: &str,
                      name: &str,
                      generic_item_key: Option<&str>,
                      purchase_item_key: Option<&str>| {
        let mut value = serde_json::json!({
            "key": key,
            "name": name,
            "grams": 100,
            "kcal": 100,
            "protein_g": 3,
            "carbs_g": 20,
            "fat_g": 1,
            "fiber_g": 2,
            "category": "Test::Staples",
            "source": "Synthetic test fixture",
            "url": "",
            "price": 2,
            "price_basis": "kg",
            "measure_unit": "g",
            "grams_per_measure_unit": 1,
            "purchase_unit": "100 g pack",
            "purchase_quantity": 100,
            "purchase_quantity_unit": "g"
        });
        if let Some(parent) = generic_item_key {
            value["generic_item_key"] = serde_json::Value::String(parent.to_string());
        }
        if let Some(purchase) = purchase_item_key {
            value["purchase_item_key"] = serde_json::Value::String(purchase.to_string());
        }
        value
    };

    let dishes = requirement_keys
        .iter()
        .enumerate()
        .map(|(index, item_key)| serde_json::json!({
            "key": format!("specialization_dish_{index}"),
            "name": format!("Specialization dish {index}"),
            "servings": 1,
            "components": [{
                "item_key": item_key,
                "grams": 100,
                "source_quantity": "100 g"
            }]
        }))
        .collect::<Vec<_>>();
    let menu = requirement_keys
        .iter()
        .enumerate()
        .map(|(index, _)| serde_json::json!({
            "date": "2026-09-20",
            "day": "sunday",
            "meal": if index == 0 { "lunch" } else { "dinner" },
            "item_key": format!("specialization_dish_{index}"),
            "people": ["specialization_person"],
            "quantity": 1,
            "quantity_unit": "portion"
        }))
        .collect::<Vec<_>>();

    SourceFile {
        path: "specialization_test_data.json".to_string(),
        content: serde_json::json!({
            "items": [
                ingredient("generic_staple_test", "Generic staple", None, None),
                ingredient(
                    "specialized_staple_test",
                    "Specialized staple",
                    Some("generic_staple_test"),
                    None
                ),
                ingredient(
                    "prepared_staple_test",
                    "Prepared staple",
                    None,
                    Some("generic_staple_test")
                )
            ],
            "dishes": dishes,
            "people": [{
                "key": "specialization_person",
                "name": "Specialization person",
                "kind": "adult",
                "kcal_target": 2000
            }],
            "menu": menu,
            "stock": [{
                "item_key": stock_key,
                "quantity": 100,
                "quantity_unit": "g"
            }]
        })
        .to_string(),
    }
}

#[test]
fn specialized_stock_satisfies_generic_requirements_but_not_the_reverse() {
    let mut engine = Engine::default();
    let generic_need = engine
        .load(
            vec![specialization_dataset(
                &["generic_staple_test"],
                "specialized_staple_test",
            )],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();
    assert!(generic_need.grocery.items.is_empty());
    let generic_plan = generic_need
        .grocery_plan
        .items
        .iter()
        .find(|item| item.name == "Generic staple")
        .unwrap();
    assert!(generic_plan.stock_sufficient);
    assert!((generic_plan.stock_quantity - 100.0).abs() < 0.001);

    let reverse_need = engine
        .load(
            vec![specialization_dataset(
                &["specialized_staple_test"],
                "generic_staple_test",
            )],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();
    assert!(reverse_need
        .grocery
        .items
        .iter()
        .any(|item| item.name == "Specialized staple"));
}

#[test]
fn specialized_stock_is_reserved_for_specific_requirements_before_generic_ones() {
    let mut engine = Engine::default();
    let snapshot = engine
        .load(
            vec![specialization_dataset(
                &["generic_staple_test", "specialized_staple_test"],
                "specialized_staple_test",
            )],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();

    assert!(snapshot
        .grocery
        .items
        .iter()
        .any(|item| item.name == "Generic staple"));
    assert!(!snapshot
        .grocery
        .items
        .iter()
        .any(|item| item.name == "Specialized staple"));
}

#[test]
fn specialized_stock_satisfies_generic_purchase_forms_after_recipe_conversion() {
    let mut engine = Engine::default();
    let snapshot = engine
        .load(
            vec![specialization_dataset(
                &["prepared_staple_test"],
                "specialized_staple_test",
            )],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();

    assert!(snapshot.grocery.items.is_empty());
    let plan = snapshot
        .grocery_plan
        .items
        .iter()
        .find(|item| item.name == "Generic staple")
        .unwrap();
    assert!(plan.stock_sufficient);
}

use homealacarte_web::{
    AppConfig, DishCreateComponentInput, DishCreateInput, Engine, Ingredient, SourceFile,
};


use crate::support::synthetic_dataset;
#[test]
fn a_new_dish_is_calculated_and_exported() {
    let mut engine = Engine::default();
    engine
        .load(
            vec![synthetic_dataset()],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();
    let snapshot = engine
        .add_dish(DishCreateInput {
            key: "dish_test_toast".to_string(),
            name: "Test toast".to_string(),
            auto_menu_main: true,
            grocery_exempt: false,
            servings: 2.0,
            recipe_url: "https://example.com/toast".to_string(),
            source: "Test kitchen".to_string(),
            source_notes: vec!["Toast gently.".to_string()],
            nutri_score: "B".to_string(),
            components: vec![DishCreateComponentInput {
                item_key: "bread_test".to_string(),
                quantity: 4.0,
                quantity_unit: "slices".to_string(),
                source_quantity: "4 slices".to_string(),
            }],
        })
        .unwrap();

    let dish = snapshot
        .dishes
        .iter()
        .find(|dish| dish.key == "dish_test_toast")
        .unwrap();
    assert_eq!(dish.components[0].quantity_unit, "slices");
    assert!((dish.components[0].grams - 50.0).abs() < 0.005);
    assert_eq!(dish.nutri_score, "B");
    assert!(engine.export_data("consolidated").unwrap().contains("dish_test_toast"));

    let updated = engine
        .replace_dish(DishCreateInput {
            key: "dish_test_toast".to_string(),
            name: "Updated test toast".to_string(),
            auto_menu_main: false,
            grocery_exempt: false,
            servings: 2.0,
            recipe_url: String::new(),
            source: "Test kitchen".to_string(),
            source_notes: vec![],
            nutri_score: "A".to_string(),
            components: vec![DishCreateComponentInput {
                item_key: "bread_test".to_string(),
                quantity: 2.0,
                quantity_unit: "slices".to_string(),
                source_quantity: "2 slices".to_string(),
            }],
        })
        .unwrap();
    let dish = updated
        .dishes
        .iter()
        .find(|dish| dish.key == "dish_test_toast")
        .unwrap();
    assert_eq!(dish.name, "Updated test toast");
    assert_eq!(dish.nutri_score, "A");
    assert!(!dish.auto_menu_main);
}

#[test]
fn a_custom_dish_ingredient_can_be_completed_and_round_tripped() {
    let mut engine = Engine::default();
    engine
        .load(
            vec![synthetic_dataset()],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();
    let placeholder = Ingredient {
        key: "item_test_leaf".to_string(),
        name: "Test leaf".to_string(),
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
        measure_unit: "leaves".to_string(),
        grams_per_measure_unit: 1.0,
        purchase_unit: "leaves".to_string(),
        purchase_quantity_grams: 1.0,
    };
    let snapshot = engine
        .save_dish_with_custom_ingredients(
            DishCreateInput {
                key: "dish_test_leaf".to_string(),
                name: "Leaf dish".to_string(),
                auto_menu_main: true,
                grocery_exempt: false,
                servings: 2.0,
                recipe_url: String::new(),
                source: String::new(),
                source_notes: vec![],
                nutri_score: String::new(),
                components: vec![DishCreateComponentInput {
                    item_key: placeholder.key.clone(),
                    quantity: 4.0,
                    quantity_unit: "leaves".to_string(),
                    source_quantity: "4 leaves".to_string(),
                }],
            },
            vec![placeholder],
            false,
        )
        .unwrap();
    assert!(snapshot
        .ingredients
        .iter()
        .any(|ingredient| ingredient.key == "item_test_leaf" && ingredient.incomplete));
    let incomplete_dish = snapshot
        .dishes
        .iter()
        .find(|dish| dish.key == "dish_test_leaf")
        .unwrap();
    assert!(!incomplete_dish.nutri_score_computed);
    assert_eq!(incomplete_dish.nutri_score_missing_values, 4);
    assert_eq!(incomplete_dish.nutri_score_missing_ingredients, 1);

    let completed = engine
        .replace_ingredient(Ingredient {
            key: "item_test_leaf".to_string(),
            name: "Test leaf".to_string(),
            custom: true,
            incomplete: false,
            allergens: vec![],
            grams: 100.0,
            kcal: 25.0,
            protein_g: 2.0,
            carbs_g: 3.0,
            fat_g: 0.5,
            fiber_g: 2.0,
            sugars_g: Some(0.5),
            saturated_fat_g: Some(0.1),
            salt_g: Some(0.02),
            fruit_vegetable_legume_percent: Some(100.0),
            category: "Produce::Leaves".to_string(),
            source: "Test source".to_string(),
            url: "https://example.com/leaf".to_string(),
            price_per_kg: 8.0,
            price_source: "Test shop receipt, 1.20 EUR".to_string(),
            price_checked_at: "2026-07-26".to_string(),
            price_history: vec![],
            measure_unit: "leaves".to_string(),
            grams_per_measure_unit: 12.0,
            purchase_unit: "bag".to_string(),
            purchase_quantity_grams: 120.0,
        })
        .unwrap();
    let dish = completed
        .dishes
        .iter()
        .find(|dish| dish.key == "dish_test_leaf")
        .unwrap();
    assert!((dish.components[0].grams - 24.0).abs() < 0.005);
    assert_eq!(dish.nutri_score, "A");
    assert!(dish.nutri_score_computed);
    assert_eq!(dish.nutri_score_value, Some(-5));
    assert_eq!(dish.nutri_score_missing_values, 0);
    assert!(!completed
        .ingredients
        .iter()
        .find(|ingredient| ingredient.key == "item_test_leaf")
        .unwrap()
        .incomplete);

    let mut roundtrip = Engine::default();
    let roundtrip_snapshot = roundtrip
        .load(
            engine.export_folder().unwrap(),
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();
    assert!(roundtrip_snapshot
        .ingredients
        .iter()
        .any(|ingredient| ingredient.key == "item_test_leaf"
            && ingredient.custom
            && !ingredient.incomplete
            && ingredient.sugars_g == Some(0.5)
            && ingredient.saturated_fat_g == Some(0.1)
            && ingredient.salt_g == Some(0.02)
            && ingredient.fruit_vegetable_legume_percent == Some(100.0)
            && ingredient.price_source == "Test shop receipt, 1.20 EUR"
            && ingredient.price_checked_at == "2026-07-26"
            && ingredient.price_history.iter().any(|price| {
                price.date == "2026-07-26"
                    && price.price == 8.0
                    && price.description == "Test shop receipt, 1.20 EUR"
            })));
}

#[test]
fn dish_components_accept_and_preserve_supported_ingredient_units() {
    let source = SourceFile {
        path: "dataset.json".to_string(),
        content: r#"{
          "items": [{
            "key": "tomate_test",
            "name": "Tomate test",
            "grams": 100,
            "kcal": 18,
            "protein_g": 0.9,
            "carbs_g": 3.9,
            "fat_g": 0.2,
            "fiber_g": 1.2,
            "category": "Légumes",
            "source": "Test",
            "url": "",
            "price_per_kg": 2,
            "measure_unit": "pieces",
            "grams_per_measure_unit": 150,
            "purchase_unit": "lot",
            "purchase_quantity_grams": 600
          }],
          "dishes": [{
            "key": "plat_test_unites",
            "name": "Plat test unités",
            "origin_country": "fr",
            "servings": 2,
            "components": [{
              "item_key": "tomate_test",
              "quantity": 2,
              "quantity_unit": "pieces"
            }]
          }],
          "people": [{
            "key": "personne_test",
            "name": "Personne test",
            "kcal_target": 2000
          }],
          "menu": [{
            "day": "Lundi",
            "meal": "Dejeuner",
            "item_key": "plat_test_unites",
            "people": ["personne_test"],
            "quantity": 1,
            "quantity_unit": "portion"
          }]
        }"#.to_string(),
    };

    let mut engine = Engine::default();
    let snapshot = engine
        .load(
            vec![source],
            AppConfig {
                language: "fr".to_string(),
            },
        )
        .unwrap();
    let dish = snapshot
        .dishes
        .iter()
        .find(|dish| dish.key == "plat_test_unites")
        .unwrap();
    assert_eq!(dish.origin_country, "FR");
    assert_eq!(dish.components[0].quantity, 1.0);
    assert_eq!(dish.components[0].quantity_unit, "pieces");
    assert_eq!(dish.components[0].grams, 150.0);

    let updated = engine
        .replace_dish(DishCreateInput {
            key: "plat_test_unites".to_string(),
            name: "Plat test unités modifié".to_string(),
            auto_menu_main: true,
            grocery_exempt: false,
            servings: 2.0,
            recipe_url: String::new(),
            source: String::new(),
            source_notes: vec![],
            nutri_score: String::new(),
            components: vec![DishCreateComponentInput {
                item_key: "tomate_test".to_string(),
                quantity: 2.0,
                quantity_unit: "pieces".to_string(),
                source_quantity: String::new(),
            }],
        })
        .unwrap();
    assert_eq!(
        updated
            .dishes
            .iter()
            .find(|dish| dish.key == "plat_test_unites")
            .unwrap()
            .origin_country,
        "FR"
    );

    let folder = engine.export_folder().unwrap();
    let dishes = folder
        .iter()
        .find(|file| file.path == "dishes.json")
        .unwrap();
    assert!(dishes.content.contains("\"origin_country\": \"FR\""));
    assert!(dishes.content.contains("\"quantity\": 2.0"));
    assert!(dishes.content.contains("\"quantity_unit\": \"pieces\""));
    assert!(!dishes.content.contains("\"grams\": 300.0"));

    let mut roundtrip = Engine::default();
    roundtrip
        .load(
            folder,
            AppConfig {
                language: "fr".to_string(),
            },
        )
        .unwrap();
}

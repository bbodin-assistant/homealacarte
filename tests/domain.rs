use homealacarte_web::{
    AppConfig, CustomGroceryItem, DishCreateComponentInput, DishCreateInput, Engine, HouseholdItem,
    Ingredient, Person,
    SourceFile, StockUpdate, exclude_grocery_items, generate_grocery_pdf,
};
use std::collections::HashSet;

fn synthetic_dataset() -> SourceFile {
    SourceFile {
        path: "synthetic_test_data.json".to_string(),
        content: r#"{
          "items": [
            {
              "key": "tomato_test",
              "name": "Test tomato",
              "grams": 100,
              "kcal": 18,
              "protein_g": 0.9,
              "carbs_g": 3.9,
              "fat_g": 0.2,
              "fiber_g": 1.2,
              "category": "Produce::Vegetables",
              "source": "Synthetic test fixture",
              "url": "",
              "price_per_kg": 2,
              "measure_unit": "pieces",
              "grams_per_measure_unit": 150,
              "purchase_unit": "500 g pack",
              "purchase_quantity_grams": 500
            },
            {
              "key": "bread_test",
              "name": "Test bread",
              "grams": 50,
              "kcal": 130,
              "protein_g": 4,
              "carbs_g": 24,
              "fat_g": 2,
              "fiber_g": 2,
              "category": "Bakery",
              "source": "Synthetic test fixture",
              "url": "",
              "price_per_kg": 4,
              "measure_unit": "slices",
              "grams_per_measure_unit": 25,
              "purchase_unit": "250 g loaf",
              "purchase_quantity_grams": 250
            },
            {
              "key": "cleaner_test",
              "name": "Test cleaner",
              "category": "Household",
              "estimated_price": 3,
              "purchase_unit": "bottle",
              "purchase_quantity": 1,
              "measure_unit": "bottles"
            },
            {
              "key": "paper_test",
              "name": "Test paper",
              "category": "Household",
              "estimated_price": 2,
              "purchase_unit": "pack",
              "purchase_quantity": 1,
              "measure_unit": "packs"
            }
          ],
          "dishes": [{
            "key": "test_salad",
            "name": "Synthetic salad",
            "servings": 2,
            "recipe_url": "https://example.com/synthetic-recipe",
            "source": "Synthetic cookbook",
            "source_notes": ["Synthetic preparation note."],
            "components": [{
              "item_key": "tomato_test",
              "grams": 300,
              "source_quantity": "300 g test tomato"
            }]
          }],
          "people": [{
            "key": "test_person",
            "name": "Test person",
            "kcal_target": 2000,
            "kind": "child",
            "description": "Likes a small breakfast."
          }],
          "menu": [
            {
              "day": "Lundi",
              "meal": "Dejeuner",
              "item_key": "test_salad",
              "people": ["test_person"],
              "quantity": 1,
              "quantity_unit": "portion"
            },
            {
              "day": "Lundi",
              "meal": "Petit dejeuner",
              "item_key": "bread_test",
              "people": ["test_person"],
              "quantity": 1,
              "quantity_unit": "portion"
            }
          ],
          "stock": [
            {"item_key": "tomato_test", "quantity": 50, "quantity_unit": "g"},
            {"item_key": "bread_test", "quantity": 50, "quantity_unit": "g"},
            {"item_key": "cleaner_test", "quantity": 1, "quantity_unit": "unit"},
            {"item_key": "paper_test", "quantity": 1, "quantity_unit": "unit"}
          ],
          "extra_needs": [
            {"item_key": "cleaner_test", "quantity": 2, "quantity_unit": "unit"},
            {"item_key": "paper_test", "quantity": 1, "quantity_unit": "unit"}
          ]
        }"#.to_string(),
    }
}

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
fn synthetic_data_supports_groceries_stock_export_and_pdf() {
    let mut engine = Engine::default();
    let snapshot = engine
        .load(
            vec![synthetic_dataset()],
            AppConfig {
                language: "fr".to_string(),
            },
        )
        .unwrap();

    assert_eq!(snapshot.counts.ingredients, 2);
    assert_eq!(snapshot.counts.dishes, 1);
    assert_eq!(snapshot.counts.people, 1);
    assert_eq!(snapshot.people[0].kind, "child");
    assert_eq!(snapshot.counts.menu, 2);
    assert_eq!(snapshot.stock.len(), snapshot.counts.stock);
    assert_eq!(snapshot.grocery.items.len(), 2);
    assert!((snapshot.grocery.estimated_purchase_total - 4.0).abs() < 0.005);
    let dish = &snapshot.dishes[0];
    assert_eq!(dish.recipe_url, "https://example.com/synthetic-recipe");
    assert_eq!(dish.source, "Synthetic cookbook");
    assert_eq!(dish.source_notes, ["Synthetic preparation note."]);
    assert_eq!(dish.components[0].source_quantity, "300 g test tomato");
    assert!(snapshot.grocery_plan.items.len() > snapshot.grocery.items.len());
    assert!(
        snapshot
            .grocery_plan
            .items
            .iter()
            .any(|item| item.stock_sufficient)
    );
    let partial_food = snapshot
        .grocery_plan
        .items
        .iter()
        .find(|item| item.name == "Test tomato")
        .unwrap();
    assert!(!partial_food.stock_sufficient);
    assert!((partial_food.stock_quantity - 50.0).abs() < 0.005);
    assert_eq!(partial_food.stock_quantity_text, "0.3 pieces");
    let partial_household = snapshot
        .grocery_plan
        .items
        .iter()
        .find(|item| item.name == "Test cleaner")
        .unwrap();
    assert!(!partial_household.stock_sufficient);
    assert!((partial_household.stock_quantity - 1.0).abs() < 0.005);
    assert_eq!(partial_household.stock_quantity_text, "1 bottles");
    assert!(
        (snapshot.grocery_plan.estimated_purchase_total
            - snapshot.grocery.estimated_purchase_total)
            .abs()
            < 0.005
    );

    assert_eq!(snapshot.custom_grocery.len(), 2);
    assert_eq!(snapshot.household_options.len(), 4);
    assert_eq!(snapshot.stock_options.len(), 4);
    assert!(
        snapshot
            .stock_options
            .iter()
            .any(|item| {
                item.name == "Test cleaner"
                    && item.category == "Household"
                    && item.household
            })
    );
    assert!(snapshot.stock.iter().any(|item| {
        item.name == "Test tomato" && item.category == "Produce::Vegetables"
    }));
    let consolidated: serde_json::Value =
        serde_json::from_str(&engine.export_data("consolidated").unwrap()).unwrap();
    assert!(consolidated.get("items").is_some());
    assert!(consolidated.get("stock").is_some());
    assert!(consolidated.get("extra_needs").is_some());
    assert_eq!(consolidated.as_object().unwrap().len(), 6);
    let folder = engine.export_folder().unwrap();
    assert_eq!(folder.len(), 6);
    assert!(folder.iter().any(|file| file.path == "items.json"));
    assert!(folder.iter().any(|file| file.path == "extra_needs.json"));
    let mut roundtrip = Engine::default();
    let roundtrip_snapshot = roundtrip
        .load(
            folder,
            AppConfig {
                language: "fr".to_string(),
            },
        )
        .unwrap();
    assert_eq!(roundtrip_snapshot.grocery.items.len(), snapshot.grocery.items.len());
    assert!(
        (roundtrip_snapshot.grocery.estimated_purchase_total
            - snapshot.grocery.estimated_purchase_total)
            .abs()
            < 0.005
    );

    let food_target = roundtrip_snapshot
        .grocery_plan
        .items
        .iter()
        .find(|item| !item.household && !item.stock_sufficient)
        .unwrap()
        .clone();
    let household_target = roundtrip_snapshot
        .grocery_plan
        .items
        .iter()
        .find(|item| item.household && !item.stock_sufficient)
        .unwrap()
        .clone();
    let stocked = roundtrip
        .set_grocery_stock(
            vec![food_target.id.clone(), household_target.id.clone()],
            true,
        )
        .unwrap();
    assert!(
        stocked
            .grocery_plan
            .items
            .iter()
            .filter(|item| item.id == food_target.id || item.id == household_target.id)
            .all(|item| item.stock_sufficient)
    );
    assert!(stocked.stock.iter().any(|item| item.household));
    assert!(
        stocked.grocery.estimated_purchase_total
            < roundtrip_snapshot.grocery.estimated_purchase_total
    );
    let unstocked = roundtrip
        .set_grocery_stock(vec![food_target.id, household_target.id], false)
        .unwrap();
    assert!(
        unstocked
            .grocery_plan
            .items
            .iter()
            .filter(|item| item.name == food_target.name || item.name == household_target.name)
            .all(|item| !item.stock_sufficient)
    );

    let custom = roundtrip
        .replace_custom_grocery(vec![CustomGroceryItem {
            key: "custom_test".to_string(),
            name: "Article test".to_string(),
            category: "Autres".to_string(),
            quantity: 2.0,
            measure_unit: "unités".to_string(),
            purchase_unit: "unité".to_string(),
            purchase_quantity: 1.0,
            estimated_price: 1.25,
            custom: true,
        }])
        .unwrap();
    assert_eq!(custom.custom_grocery.len(), 1);
    assert!(custom.grocery.items.iter().any(|item| item.name == "Article test"));

    let without_stock = roundtrip.replace_stock(Vec::new()).unwrap();
    assert!(without_stock.stock.is_empty());
    assert!(without_stock.grocery.items.len() > custom.grocery.items.len());
    assert!(
        without_stock.grocery.estimated_purchase_total
            > custom.grocery.estimated_purchase_total
    );

    let pdf = generate_grocery_pdf(&snapshot.grocery, "fr");
    assert!(pdf.starts_with(b"%PDF-1.7"));
    assert!(pdf.ends_with(b"%%EOF\n"));
    assert!(pdf.len() > 1_000);
    let text = String::from_utf8_lossy(&pdf);
    assert!(text.contains("/MediaBox [0 0 595.28 841.89]"));
    assert!(text.contains("/Count 1"));

    let excluded_item = snapshot.grocery.items.first().unwrap();
    let excluded_price = excluded_item.estimated_purchase_price;
    let filtered = exclude_grocery_items(
        snapshot.grocery.clone(),
        &HashSet::from([excluded_item.id.clone()]),
    );
    assert_eq!(filtered.items.len(), snapshot.grocery.items.len() - 1);
    assert!(
        (filtered.estimated_purchase_total
            - (snapshot.grocery.estimated_purchase_total - excluded_price))
            .abs()
            < 0.005
    );
    assert!(filtered.categories.iter().all(|category| {
        category.subcategories.iter().all(|subcategory| {
            subcategory
                .items
                .iter()
                .all(|item| item.id != excluded_item.id)
        })
    }));
    let filtered_pdf = generate_grocery_pdf(&filtered, "fr");
    let filtered_text = String::from_utf8_lossy(&filtered_pdf);
    let filtered_total =
        format!("{:.2} EUR", filtered.estimated_purchase_total).replace('.', ",");
    assert!(filtered_text.contains(&filtered_total));
}

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
            && ingredient.price_checked_at == "2026-07-26"));
}

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

    let updated = engine
        .replace_household_item(HouseholdItem {
            key: "cleaner_test".to_string(),
            name: "Updated cleaner".to_string(),
            category: "Household::Cleaning".to_string(),
            purchase_unit: "bottle".to_string(),
            purchase_quantity: 1.0,
            estimated_price: 3.5,
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
            && item.last_bought_at == "2026-07-26"));

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

#[test]
fn stock_unit_changes_preserve_the_physical_quantity_and_selected_unit() {
    let mut engine = Engine::default();
    engine
        .load(
            vec![synthetic_dataset()],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();

    let units = engine
        .replace_stock(vec![StockUpdate {
            item_key: "tomato_test".to_string(),
            quantity: 1.0,
            quantity_unit: "unit".to_string(),
            household: false,
        }])
        .unwrap();
    let tomato = units.stock.iter().find(|item| item.item_key == "tomato_test").unwrap();
    assert_eq!(tomato.quantity_unit, "unit");
    assert!((tomato.quantity - 1.0).abs() < 0.005);

    let grams = engine
        .replace_stock(vec![StockUpdate {
            item_key: "tomato_test".to_string(),
            quantity: 150.0,
            quantity_unit: "g".to_string(),
            household: false,
        }])
        .unwrap();
    let tomato = grams.stock.iter().find(|item| item.item_key == "tomato_test").unwrap();
    assert_eq!(tomato.quantity_unit, "g");
    assert!((tomato.quantity - 150.0).abs() < 0.005);
    assert!(engine.export_data("consolidated").unwrap().contains("\"quantity_unit\": \"g\""));
}

#[test]
fn family_members_can_be_added_removed_and_exported() {
    let mut engine = Engine::default();
    engine
        .load(
            vec![synthetic_dataset()],
            AppConfig {
                language: "en".to_string(),
            },
        )
        .unwrap();

    let updated = engine
        .replace_people(vec![
            Person {
                key: "test_person".to_string(),
                name: "Test child".to_string(),
                kcal_target: Some(1600.0),
                kind: "child".to_string(),
                description: "Likes fruit at lunch.".to_string(),
            },
            Person {
                key: "test_adult".to_string(),
                name: "Test adult".to_string(),
                kcal_target: Some(2200.0),
                kind: "adult".to_string(),
                description: "Drinks sparkling water.".to_string(),
            },
        ])
        .unwrap();
    assert_eq!(updated.people.len(), 2);
    assert_eq!(updated.planner.len(), 2);
    assert_eq!(updated.profile.as_deref(), Some("test_person"));

    let removed = engine
        .replace_people(vec![Person {
            key: "test_adult".to_string(),
            name: "Test adult".to_string(),
            kcal_target: Some(2200.0),
            kind: "adult".to_string(),
            description: "Drinks sparkling water.".to_string(),
        }])
        .unwrap();
    assert_eq!(removed.people.len(), 1);
    assert!(removed.planner.is_empty());

    let people_file = engine
        .export_folder()
        .unwrap()
        .into_iter()
        .find(|file| file.path == "people.json")
        .unwrap();
    assert!(people_file.content.contains("\"kind\": \"adult\""));
    assert!(people_file.content.contains("\"name\": \"Test adult\""));
    assert!(people_file.content.contains("\"description\": \"Drinks sparkling water.\""));

    let empty = engine.replace_people(Vec::new()).unwrap();
    assert!(empty.people.is_empty());
    assert!(empty.planner.is_empty());
    assert!(empty.profile.is_none());
    assert!(engine.export_data("consolidated").unwrap().contains("\"people\": []"));
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
    assert_eq!(dish.components[0].quantity, 1.0);
    assert_eq!(dish.components[0].quantity_unit, "pieces");
    assert_eq!(dish.components[0].grams, 150.0);

    let folder = engine.export_folder().unwrap();
    let dishes = folder
        .iter()
        .find(|file| file.path == "dishes.json")
        .unwrap();
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

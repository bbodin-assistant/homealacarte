use homealacarte_web::SourceFile;

pub fn synthetic_dataset() -> SourceFile {
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


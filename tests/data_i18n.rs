use homealacarte_web::{AppConfig, Engine, SourceFile};
use serde_json::Value;

fn localized_source() -> SourceFile {
    SourceFile {
        path: "localized.json".to_string(),
        content: r#"{
          "items": [
            {
              "key": "tomato",
              "name": {"en": "Test tomato", "fr": "Tomate test"},
              "grams": 100,
              "kcal": 18,
              "protein_g": 0.9,
              "carbs_g": 3.9,
              "fat_g": 0.2,
              "fiber_g": 1.2,
              "category": {"en": "Produce::Vegetables", "fr": "Fruits et légumes::Légumes"},
              "source": {"en": "Synthetic source", "fr": "Source synthétique"},
              "url": "",
              "price_per_kg": 2,
              "measure_unit": {"en": "piece", "fr": "pièce"},
              "grams_per_measure_unit": 150,
              "purchase_unit": {"en": "500 g pack", "fr": "barquette de 500 g"},
              "purchase_quantity_grams": 500
            },
            {
              "key": "soap",
              "name": {"en": "Hand soap", "fr": "Savon pour les mains"},
              "category": {"en": "Household::Hygiene", "fr": "Maison::Hygiène"},
              "estimated_price": 2.5,
              "purchase_unit": {"en": "bottle", "fr": "flacon"},
              "purchase_quantity": 1,
              "measure_unit": {"en": "bottle", "fr": "flacon"},
              "notes": {"en": "Synthetic household note", "fr": "Note ménagère synthétique"}
            }
          ],
          "dishes": [{
            "key": "tomato_plate",
            "name": {"en": "Tomato plate", "fr": "Assiette de tomates"},
            "servings": 2,
            "source": {"en": "Synthetic recipe", "fr": "Recette synthétique"},
            "source_notes": [{"en": "Slice and serve.", "fr": "Trancher et servir."}],
            "components": [{
              "item_key": "tomato",
              "quantity": 2,
              "quantity_unit": {"en": "piece", "fr": "pièce"},
              "source_quantity": {"en": "2 tomatoes", "fr": "2 tomates"}
            }]
          }],
          "people": [{
            "key": "alex",
            "name": {"en": "Alex", "fr": "Alexandre"},
            "kcal_target": 2000,
            "kind": "adult",
            "description": {"en": "Synthetic profile", "fr": "Profil synthétique"}
          }],
          "menu": [{
            "day": {"en": "Monday", "fr": "Lundi"},
            "meal": {"en": "Dinner", "fr": "Diner"},
            "item_key": "tomato_plate",
            "people": ["alex"],
            "quantity": 1,
            "quantity_unit": "portion",
            "notes": {"en": "Serve cold", "fr": "Servir froid"}
          }],
          "stock": [{
            "item_key": "tomato",
            "quantity": 1,
            "quantity_unit": "unit",
            "notes": {"en": "One left", "fr": "Il en reste une"}
          }],
          "extra_needs": [{
            "item_key": "soap",
            "quantity": 1,
            "quantity_unit": "unit",
            "notes": {"en": "Buy this week", "fr": "Acheter cette semaine"}
          }]
        }"#.to_string(),
    }
}

fn item<'a>(snapshot: &'a homealacarte_web::AppSnapshot, key: &str) -> &'a homealacarte_web::Ingredient {
    snapshot.ingredients.iter().find(|item| item.key == key).unwrap()
}

#[test]
fn localized_data_switches_language_without_discarding_runtime_edits() {
    let mut engine = Engine::default();
    let french = engine
        .load(
            vec![localized_source()],
            AppConfig {
                language: "fr".to_string(),
            },
        )
        .unwrap();

    assert_eq!(item(&french, "tomato").name, "Tomate test");
    assert_eq!(item(&french, "tomato").measure_unit, "pièce");
    assert_eq!(french.dishes[0].name, "Assiette de tomates");
    assert_eq!(french.dishes[0].source_notes, vec!["Trancher et servir."]);
    assert_eq!(french.dishes[0].components[0].source_quantity, "2 tomates");
    assert_eq!(french.household_items[0].name, "Savon pour les mains");
    assert_eq!(french.people[0].name, "Alexandre");
    assert_eq!(french.people[0].description, "Profil synthétique");
    assert_eq!(french.planner[0].day, "Lundi");
    assert_eq!(french.planner[0].meal, "Diner");
    assert_eq!(french.planner[0].notes, "Servir froid");
    assert_eq!(french.stock[0].notes, "Il en reste une");
    assert_eq!(
        french.custom_grocery[0].notes.as_deref(),
        Some("Acheter cette semaine")
    );
    let menu_id = french.planner[0].id.clone();
    let source_hash = french.source_hash.clone();

    let mut edited = item(&french, "tomato").clone();
    edited.name = "Tomate personnalisée".to_string();
    engine.replace_ingredient(edited).unwrap();

    let english = engine.set_language("en".to_string()).unwrap();
    assert_eq!(english.source_hash, source_hash);
    assert_eq!(item(&english, "tomato").name, "Tomate personnalisée");
    assert_eq!(item(&english, "tomato").category, "Produce::Vegetables");
    assert_eq!(item(&english, "tomato").measure_unit, "piece");
    assert_eq!(item(&english, "tomato").purchase_unit, "500 g pack");
    assert_eq!(english.dishes[0].name, "Tomato plate");
    assert_eq!(english.dishes[0].source_notes, vec!["Slice and serve."]);
    assert_eq!(english.dishes[0].components[0].source_quantity, "2 tomatoes");
    assert_eq!(english.household_items[0].name, "Hand soap");
    assert_eq!(english.people[0].name, "Alex");
    assert_eq!(english.people[0].description, "Synthetic profile");
    assert_eq!(english.planner[0].id, menu_id);
    assert_eq!(english.planner[0].day, "Monday");
    assert_eq!(english.planner[0].meal, "Dinner");
    assert_eq!(english.planner[0].notes, "Serve cold");
    assert_eq!(english.stock[0].notes, "One left");
    assert_eq!(english.custom_grocery[0].notes.as_deref(), Some("Buy this week"));

    let exported: Value = serde_json::from_str(&engine.export_data("consolidated").unwrap()).unwrap();
    let tomato = exported["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["key"] == "tomato")
        .unwrap();
    assert_eq!(tomato["name"], "Tomate personnalisée");
    assert_eq!(tomato["category"]["en"], "Produce::Vegetables");
    assert_eq!(tomato["category"]["fr"], "Fruits et légumes::Légumes");
    assert_eq!(tomato["measure_unit"]["fr"], "pièce");
    assert_eq!(exported["dishes"][0]["name"]["en"], "Tomato plate");
    assert_eq!(exported["dishes"][0]["name"]["fr"], "Assiette de tomates");
    assert_eq!(exported["people"][0]["description"]["fr"], "Profil synthétique");
    assert_eq!(exported["menu"][0]["notes"]["en"], "Serve cold");
    assert_eq!(exported["menu"][0]["notes"]["fr"], "Servir froid");
    assert_eq!(exported["menu"][0]["id"], menu_id);
}

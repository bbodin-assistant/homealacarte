use homealacarte_web::{AppConfig, Engine, SourceFile};
use serde_json::Value;

fn localized_source() -> SourceFile {
    SourceFile {
        path: "localized.json".to_string(),
        content: r#"{
          "items": [
            {
              "key": "tomato",
              "name": {"en": "Test tomato", "fr": "Tomate test", "es": "Tomate de prueba"},
              "grams": 100,
              "kcal": 18,
              "protein_g": 0.9,
              "carbs_g": 3.9,
              "fat_g": 0.2,
              "fiber_g": 1.2,
              "category": {"en": "Produce::Vegetables", "fr": "Fruits et légumes::Légumes", "es": "Productos::Verduras"},
              "source": {"en": "Synthetic source", "fr": "Source synthétique", "es": "Fuente sintética"},
              "url": "",
              "price_per_kg": 2,
              "price_source": {"es": "Mercado de prueba"},
              "measure_unit": {"en": "piece", "fr": "pièce", "es": "pieza"},
              "grams_per_measure_unit": 150,
              "purchase_unit": {"en": "500 g pack", "fr": "barquette de 500 g", "es": "paquete de 500 g"},
              "purchase_quantity_grams": 500
            },
            {
              "key": "soap",
              "name": {"en": "Hand soap", "fr": "Savon pour les mains", "es": "Jabón de manos"},
              "category": {"en": "Household::Hygiene", "fr": "Maison::Hygiène", "es": "Hogar::Higiene"},
              "estimated_price": 2.5,
              "purchase_unit": {"en": "bottle", "fr": "flacon", "es": "botella"},
              "purchase_quantity": 1,
              "measure_unit": {"en": "bottle", "fr": "flacon", "es": "botella"},
              "notes": {"en": "Synthetic household note", "fr": "Note ménagère synthétique", "es": "Nota doméstica sintética"}
            }
          ],
          "dishes": [{
            "key": "tomato_plate",
            "name": {"en": "Tomato plate", "fr": "Assiette de tomates", "es": "Plato de tomate"},
            "servings": 2,
            "source": {"en": "Synthetic recipe", "fr": "Recette synthétique", "es": "Receta sintética"},
            "source_notes": [{"en": "Slice and serve.", "fr": "Trancher et servir.", "es": "Cortar y servir."}],
            "components": [{
              "item_key": "tomato",
              "quantity": 2,
              "quantity_unit": {"en": "piece", "fr": "pièce", "es": "pieza"},
              "source_quantity": {"en": "2 tomatoes", "fr": "2 tomates", "es": "2 tomates"}
            }]
          }],
          "people": [{
            "key": "alex",
            "name": {"en": "Alex", "fr": "Alexandre", "es": "Alejandro"},
            "kcal_target": 2000,
            "kind": "adult",
            "description": {"en": "Synthetic profile", "fr": "Profil synthétique", "es": "Perfil sintético"}
          }],
          "menu": [{
            "day": {"en": "Monday", "fr": "Lundi"},
            "meal": {"en": "Dinner", "fr": "Diner"},
            "item_key": "tomato_plate",
            "people": ["alex"],
            "quantity": 1,
            "quantity_unit": "portion",
            "notes": {"en": "Serve cold", "fr": "Servir froid", "es": "Servir frío"}
          }],
          "stock": [{
            "item_key": "tomato",
            "quantity": 1,
            "quantity_unit": "unit",
            "notes": {"en": "One left", "fr": "Il en reste une", "es": "Queda uno"}
          }],
          "extra_needs": [{
            "item_key": "soap",
            "quantity": 1,
            "quantity_unit": "unit",
            "notes": {"en": "Buy this week", "fr": "Acheter cette semaine", "es": "Comprar esta semana"}
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
    assert_eq!(item(&french, "tomato").category, "Fruits et légumes::Légumes");
    assert_eq!(item(&french, "tomato").measure_unit, "pièce");
    assert_eq!(french.dishes[0].name, "Assiette de tomates");
    assert_eq!(french.dishes[0].source_notes, vec!["Trancher et servir."]);
    assert_eq!(french.dishes[0].components[0].source_quantity, "2 tomates");
    assert_eq!(french.household_items[0].name, "Savon pour les mains");
    assert_eq!(french.people[0].name, "Alexandre");
    assert_eq!(french.people[0].description, "Profil synthétique");
    assert_eq!(french.planner[0].day, "Lundi");
    assert_eq!(french.planner[0].meal, "Dîner");
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
    assert_eq!(tomato["category"], "Produce::Vegetables");
    assert_eq!(tomato["measure_unit"]["fr"], "pièce");
    assert_eq!(tomato["price_source"]["es"], "Mercado de prueba");
    assert_eq!(exported["dishes"][0]["name"]["en"], "Tomato plate");
    assert_eq!(exported["dishes"][0]["name"]["fr"], "Assiette de tomates");
    assert_eq!(exported["dishes"][0]["name"]["es"], "Plato de tomate");
    assert_eq!(exported["people"][0]["description"]["fr"], "Profil synthétique");
    assert_eq!(exported["menu"][0]["notes"]["en"], "Serve cold");
    assert_eq!(exported["menu"][0]["notes"]["fr"], "Servir froid");
    assert_eq!(exported["menu"][0]["notes"]["es"], "Servir frío");
    assert_eq!(exported["menu"][0]["id"], menu_id);
    assert_eq!(exported["menu"][0]["day"], "monday");
    assert_eq!(exported["menu"][0]["meal"], "dinner");
}

#[test]
fn localized_data_accepts_new_language_tags_without_engine_changes() {
    let mut engine = Engine::default();
    let spanish = engine
        .load(
            vec![localized_source()],
            AppConfig {
                language: "es".to_string(),
            },
        )
        .unwrap();

    assert_eq!(item(&spanish, "tomato").name, "Tomate de prueba");
    assert_eq!(item(&spanish, "tomato").category, "Productos::Verduras");
    assert_eq!(item(&spanish, "tomato").measure_unit, "pieza");
    assert_eq!(item(&spanish, "tomato").price_source, "Mercado de prueba");
    assert_eq!(spanish.dishes[0].name, "Plato de tomate");
    assert_eq!(spanish.dishes[0].source_notes, vec!["Cortar y servir."]);
    assert_eq!(spanish.household_items[0].name, "Jabón de manos");
    assert_eq!(spanish.people[0].name, "Alejandro");
    assert_eq!(spanish.planner[0].day, "Lunes");
    assert_eq!(spanish.planner[0].meal, "Cena");
    assert_eq!(spanish.planner[0].notes, "Servir frío");
    assert_eq!(spanish.stock[0].notes, "Queda uno");
    assert_eq!(spanish.custom_grocery[0].notes.as_deref(), Some("Comprar esta semana"));

    let chinese = engine.set_language("zh-CN".to_string()).unwrap();
    assert_eq!(item(&chinese, "tomato").name, "Test tomato");
    assert_eq!(chinese.dishes[0].name, "Tomato plate");
    assert_eq!(chinese.planner[0].day, "Monday");
    assert_eq!(chinese.planner[0].meal, "Dinner");
}

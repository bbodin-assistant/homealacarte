use homealacarte_web::{AppConfig, Engine, StockUpdate};


use crate::support::synthetic_dataset;
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
            notes: Some("Bien mûres".to_string()),
            added_at: None,
            household: false,
        }])
        .unwrap();
    let tomato = units.stock.iter().find(|item| item.item_key == "tomato_test").unwrap();
    assert_eq!(tomato.quantity_unit, "unit");
    assert_eq!(tomato.notes, "Bien mûres");
    assert!((tomato.quantity - 1.0).abs() < 0.005);

    let grams = engine
        .replace_stock(vec![StockUpdate {
            item_key: "tomato_test".to_string(),
            quantity: 150.0,
            quantity_unit: "g".to_string(),
            notes: Some("Sans emballage".to_string()),
            added_at: None,
            household: false,
        }])
        .unwrap();
    let tomato = grams.stock.iter().find(|item| item.item_key == "tomato_test").unwrap();
    assert_eq!(tomato.quantity_unit, "g");
    assert_eq!(tomato.notes, "Sans emballage");
    assert!((tomato.quantity - 150.0).abs() < 0.005);
    assert!(engine.export_data("consolidated").unwrap().contains("\"quantity_unit\": \"g\""));
}

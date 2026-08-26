use crate::support::synthetic_dataset;
use homealacarte_web::{AppConfig, Engine, MenuInput};

#[test]
fn menu_replacement_normalizes_localized_rows() {
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
        .replace_menu(vec![MenuInput {
            id: None,
            date: "2026-08-18".to_string(),
            day: "Mardi".to_string(),
            meal: "Diner".to_string(),
            item_key: "bread_test".to_string(),
            person: Some("test_person".to_string()),
            people: None,
            quantity: Some(2.0),
            portions: None,
            quantity_unit: Some("unit".to_string()),
            notes: Some("Toast before serving".to_string()),
        }])
        .unwrap();

    assert_eq!(snapshot.planner.len(), 1);
    assert_eq!(snapshot.planner[0].date, "2026-08-18");
    assert_eq!(snapshot.planner[0].day, "Tuesday");
    assert_eq!(snapshot.planner[0].meal, "Dinner");
    assert_eq!(snapshot.planner[0].people, ["test_person"]);
    assert!(snapshot.planner[0].id.starts_with("menu_"));
    let exported: serde_json::Value =
        serde_json::from_str(&engine.export_data("consolidated").unwrap()).unwrap();
    assert_eq!(
        exported["menu"][0]["id"].as_str(),
        Some(snapshot.planner[0].id.as_str())
    );
    assert_eq!(exported["menu"][0]["date"].as_str(), Some("2026-08-18"));
    assert_eq!(exported["menu"][0]["day"].as_str(), Some("tuesday"));
    assert_eq!(exported["menu"][0]["meal"].as_str(), Some("dinner"));
}

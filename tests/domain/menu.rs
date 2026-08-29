use crate::support::synthetic_dataset;
use homealacarte_web::{AppConfig, Engine, MenuInput};

#[test]
fn menu_replacement_uses_canonical_rows() {
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
            date: "2026-08-18".to_string(),
            day: "tuesday".to_string(),
            meal: "dinner".to_string(),
            item_key: "bread_test".to_string(),
            people: vec!["test_person".to_string()],
            quantity: 2.0,
            quantity_unit: Some("unit".to_string()),
            notes: Some("Toast before serving".to_string()),
        }])
        .unwrap();

    assert_eq!(snapshot.planner.len(), 1);
    assert_eq!(snapshot.planner[0].date, "2026-08-18");
    assert_eq!(snapshot.planner[0].day, "Tuesday");
    assert_eq!(snapshot.planner[0].meal, "Dinner");
    assert_eq!(snapshot.planner[0].people, ["test_person"]);
    let exported: serde_json::Value =
        serde_json::from_str(&engine.export_data("consolidated").unwrap()).unwrap();
    assert!(exported["menu"][0].get("id").is_none());
    assert_eq!(exported["menu"][0]["date"].as_str(), Some("2026-08-18"));
    assert_eq!(exported["menu"][0]["day"].as_str(), Some("tuesday"));
    assert_eq!(exported["menu"][0]["meal"].as_str(), Some("dinner"));
}

#[test]
fn localized_planner_rows_can_be_sent_back_before_pdf_generation() {
    let mut engine = Engine::default();
    engine
        .load(
            vec![synthetic_dataset()],
            AppConfig {
                language: "fr".to_string(),
            },
        )
        .unwrap();

    let snapshot = engine
        .replace_menu(vec![MenuInput {
            date: "2026-08-19".to_string(),
            day: "Mercredi".to_string(),
            meal: "Dîner".to_string(),
            item_key: "bread_test".to_string(),
            people: vec!["test_person".to_string()],
            quantity: 1.0,
            quantity_unit: Some("unit".to_string()),
            notes: None,
        }])
        .unwrap();

    assert_eq!(snapshot.planner[0].day, "Mercredi");
    assert_eq!(snapshot.planner[0].meal, "Dîner");
    let exported: serde_json::Value =
        serde_json::from_str(&engine.export_data("consolidated").unwrap()).unwrap();
    assert_eq!(exported["menu"][0]["day"], "wednesday");
    assert_eq!(exported["menu"][0]["meal"], "dinner");
}

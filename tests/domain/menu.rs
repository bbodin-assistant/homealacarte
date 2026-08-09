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
    assert_eq!(snapshot.planner[0].day, "Tuesday");
    assert_eq!(snapshot.planner[0].meal, "Dinner");
    assert_eq!(snapshot.planner[0].people, ["test_person"]);
}

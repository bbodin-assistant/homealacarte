use homealacarte_web::{AppConfig, Engine, Person};


mod support;
use support::synthetic_dataset;
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
                food_rules: Vec::new(),
            },
            Person {
                key: "test_adult".to_string(),
                name: "Test adult".to_string(),
                kcal_target: Some(2200.0),
                kind: "adult".to_string(),
                description: "Drinks sparkling water.".to_string(),
                food_rules: Vec::new(),
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
            food_rules: Vec::new(),
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

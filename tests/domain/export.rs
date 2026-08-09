use crate::support::synthetic_dataset;
use homealacarte_web::{AppConfig, Engine};

#[test]
fn consolidated_and_folder_exports_round_trip() {
    let mut engine = Engine::default();
    let original = engine
        .load(
            vec![synthetic_dataset()],
            AppConfig {
                language: "fr".to_string(),
            },
        )
        .unwrap();

    let consolidated: serde_json::Value =
        serde_json::from_str(&engine.export_data("consolidated").unwrap()).unwrap();
    assert_eq!(consolidated.as_object().unwrap().len(), 6);
    assert!(consolidated.get("stock").is_some());
    assert!(consolidated.get("extra_needs").is_some());

    let folder = engine.export_folder().unwrap();
    assert_eq!(folder.len(), 6);
    assert!(folder.iter().any(|file| file.path == "items.json"));
    assert!(folder.iter().any(|file| file.path == "extra_needs.json"));

    let mut roundtrip = Engine::default();
    let restored = roundtrip
        .load(
            folder,
            AppConfig {
                language: "fr".to_string(),
            },
        )
        .unwrap();
    assert_eq!(restored.counts.ingredients, original.counts.ingredients);
    assert_eq!(restored.counts.household_items, original.counts.household_items);
    assert_eq!(restored.grocery.items.len(), original.grocery.items.len());
}

use homealacarte_web::{SourceFile, load_dataset};
use std::fs;
use std::path::{Path, PathBuf};

fn json_files(directory: &Path, result: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(directory).expect("read private data directory") {
        let path = entry.expect("read private data entry").path();
        if path.is_dir() {
            json_files(&path, result);
        } else if path.extension().is_some_and(|extension| extension == "json") {
            result.push(path);
        }
    }
}

#[test]
fn public_sample_data_uses_the_current_schema() {
    let directory = Path::new("sample-data");

    let mut paths = Vec::new();
    json_files(directory, &mut paths);
    paths.sort();
    let sources = paths
        .into_iter()
        .map(|path| SourceFile {
            path: path
                .strip_prefix(directory)
                .expect("sample data path")
                .to_string_lossy()
                .to_string(),
            content: fs::read_to_string(path).expect("read sample data file"),
        })
        .collect();

    let dataset = load_dataset(sources, "fr").expect("load sample data with current schema");
    assert!(!dataset.ingredients.is_empty());
    assert!(!dataset.dishes.is_empty());
    assert!(!dataset.people.is_empty());
    assert!(!dataset.menu.is_empty());
    let sample_item = dataset
        .ingredients
        .iter()
        .find(|ingredient| ingredient.key == "sample_tomato")
        .expect("sample ingredient");
    assert!(sample_item.source.contains("Anses Ciqual 2025"));
    assert_eq!(sample_item.sugars_g, Some(3.22));
    assert_eq!(sample_item.saturated_fat_g, Some(0.01));
    assert_eq!(sample_item.salt_g, Some(0.01));
    assert_eq!(sample_item.fruit_vegetable_legume_percent, Some(100.0));
    assert!(dataset.people.iter().all(|person| person.key.starts_with("sample_")));
}

#[test]
fn post_deletion_starter_state_is_valid_and_person_free() {
    let source = SourceFile {
        path: "homealacarte_blank_state.json".to_string(),
        content: r#"{
          "items": [{
            "key": "starter_water",
            "name": "Water",
            "grams": 100,
            "kcal": 0,
            "protein_g": 0,
            "carbs_g": 0,
            "fat_g": 0,
            "fiber_g": 0,
            "category": "Basics",
            "source": "Home à la Carte starter item",
            "url": "",
            "price_per_kg": 0,
            "measure_unit": "g",
            "grams_per_measure_unit": 1,
            "purchase_unit": "1 L bottle",
            "purchase_quantity_grams": 1000
          }],
          "dishes": [],
          "people": [],
          "menu": [],
          "stock": [],
          "extra_needs": []
        }"#.to_string(),
    };

    let dataset = load_dataset(vec![source], "fr").expect("load post-deletion starter state");
    assert!(dataset.people.is_empty());
    assert!(dataset.menu.is_empty());
    assert_eq!(dataset.ingredients.len(), 1);
}

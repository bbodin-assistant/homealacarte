use crate::loader::{load_dataset, localize_day, localize_meal};
use crate::model::*;
use crate::snapshot::build_snapshot;

mod catalogue;
mod export;
mod family;
mod menu;
mod stock;

pub struct Engine {
    pub dataset: Option<Dataset>,
    pub language: String,
    pub profile: Option<String>,
}

impl Default for Engine {
    fn default() -> Self {
        Self {
            dataset: None,
            language: "fr".to_string(),
            profile: None,
        }
    }
}

impl Engine {
    pub fn load(&mut self, sources: Vec<SourceFile>, config: AppConfig) -> Result<AppSnapshot, String> {
        let dataset = load_dataset(sources, &config.language)?;
        self.language = config.language;
        self.profile = dataset
            .people
            .iter()
            .find(|person| person.kcal_target.is_some())
            .map(|person| person.key.clone());
        self.dataset = Some(dataset);
        self.snapshot()
    }

    pub fn set_language(&mut self, language: String) -> Result<AppSnapshot, String> {
        if language != "fr" && language != "en" {
            return Err(format!("unsupported language: {language}"));
        }
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        for row in &mut dataset.menu {
            row.day = localize_day(&row.day, &language)?;
            row.meal = localize_meal(&row.meal, &language)?;
        }
        self.language = language;
        self.snapshot()
    }

    pub fn snapshot(&self) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_ref().ok_or("no dataset loaded")?;
        build_snapshot(dataset, &self.language, self.profile.as_deref())
    }
}

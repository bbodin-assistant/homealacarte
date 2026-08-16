use crate::loader::{localize_day, localize_meal};
use crate::model::*;
use crate::snapshot::build_snapshot;

mod catalogue;
mod data_i18n;
mod export;
mod family;
mod menu;
mod stock;

pub struct Engine {
    pub dataset: Option<Dataset>,
    pub language: String,
    pub profile: Option<String>,
    pub(crate) source_files: Vec<SourceFile>,
}

impl Default for Engine {
    fn default() -> Self {
        Self {
            dataset: None,
            language: "fr".to_string(),
            profile: None,
            source_files: Vec::new(),
        }
    }
}

impl Engine {
    pub fn load(&mut self, sources: Vec<SourceFile>, config: AppConfig) -> Result<AppSnapshot, String> {
        let dataset = data_i18n::localized_dataset(&sources, &config.language)?;
        self.language = config.language;
        self.profile = dataset
            .people
            .iter()
            .find(|person| person.kcal_target.is_some())
            .map(|person| person.key.clone());
        self.source_files = sources;
        self.dataset = Some(dataset);
        self.snapshot()
    }

    pub fn set_language(&mut self, language: String) -> Result<AppSnapshot, String> {
        if !data_i18n::is_language_tag(&language) {
            return Err(format!("unsupported language: {language}"));
        }
        if language == self.language {
            return self.snapshot();
        }

        if self.source_files.is_empty() {
            let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
            for row in &mut dataset.menu {
                row.day = localize_day(&row.day, &language)?;
                row.meal = localize_meal(&row.meal, &language)?;
            }
        } else {
            let source_current = data_i18n::localized_dataset(&self.source_files, &self.language)?;
            let source_target = data_i18n::localized_dataset(&self.source_files, &language)?;
            let current = self.dataset.as_ref().ok_or("no dataset loaded")?;
            let next = data_i18n::merge_runtime_dataset(
                current,
                &source_current,
                source_target,
                &language,
            )?;
            self.dataset = Some(next);
        }
        self.language = language;
        self.snapshot()
    }

    pub fn snapshot(&self) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_ref().ok_or("no dataset loaded")?;
        build_snapshot(dataset, &self.language, self.profile.as_deref())
    }
}

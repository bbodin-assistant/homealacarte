use crate::engine::Engine;
use crate::loader::{MenuInput, normalize_menu};
use crate::model::*;
use std::collections::HashSet;

impl Engine {
    pub fn replace_menu(&mut self, inputs: Vec<MenuInput>) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let valid_items: HashSet<String> = dataset
            .ingredients
            .iter()
            .map(|item| item.key.clone())
            .chain(dataset.dishes.iter().map(|item| item.key.clone()))
            .collect();
        let valid_people: HashSet<String> =
            dataset.people.iter().map(|person| person.key.clone()).collect();
        dataset.menu = normalize_menu(inputs, &valid_items, &valid_people)?;
        self.snapshot()
    }

    pub fn generate_menu(&self, request: AutoMenuRequest) -> Result<AutoMenuProposal, String> {
        let dataset = self.dataset_with_localized_menu()?;
        crate::optimizer::generate_menu(&dataset, &self.language, request)
    }
}

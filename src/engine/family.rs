use crate::engine::Engine;
use crate::loader::normalize_food_rules;
use crate::model::*;
use std::collections::HashSet;

impl Engine {
    pub fn replace_people(&mut self, mut people: Vec<Person>) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_mut().ok_or("no dataset loaded")?;
        let valid_items = dataset
            .ingredients
            .iter()
            .map(|item| item.key.clone())
            .chain(dataset.dishes.iter().map(|dish| dish.key.clone()))
            .collect::<HashSet<_>>();
        let mut keys = HashSet::new();
        for (index, person) in people.iter_mut().enumerate() {
            person.key = person.key.trim().to_string();
            person.name = person.name.trim().to_string();
            person.description = person.description.trim().to_string();
            person.food_rules = normalize_food_rules(
                std::mem::take(&mut person.food_rules),
                &valid_items,
                &format!("family member {}", index + 1),
            )?;
            person.kind = match person.kind.trim().to_lowercase().as_str() {
                "" | "adult" => "adult".to_string(),
                "child" | "kid" | "enfant" => "child".to_string(),
                kind => {
                    return Err(format!(
                        "family member {} has invalid kind: {kind}",
                        index + 1
                    ));
                }
            };
            if person.key.is_empty() || !keys.insert(person.key.clone()) {
                return Err(format!(
                    "family member {} has an empty or duplicate key",
                    index + 1
                ));
            }
            if person.name.is_empty() {
                return Err(format!("family member {} has no name", index + 1));
            }
            if person.kcal_target.is_some_and(|target| !target.is_finite() || target <= 0.0) {
                return Err(format!(
                    "family member {} has an invalid calorie target",
                    index + 1
                ));
            }
        }

        dataset.people = people;
        dataset.menu.retain_mut(|row| {
            row.people.retain(|key| keys.contains(key));
            !row.people.is_empty()
        });
        let current_profile = self.profile.clone();
        self.profile = dataset
            .people
            .iter()
            .find(|person| {
                current_profile
                    .as_ref()
                    .is_some_and(|profile| &person.key == profile)
                    && person.kcal_target.is_some()
            })
            .or_else(|| dataset.people.iter().find(|person| person.kcal_target.is_some()))
            .map(|person| person.key.clone());
        self.snapshot()
    }

    pub fn set_profile(&mut self, profile: Option<String>) -> Result<AppSnapshot, String> {
        let dataset = self.dataset.as_ref().ok_or("no dataset loaded")?;
        if let Some(key) = &profile
            && !dataset
                .people
                .iter()
                .any(|person| &person.key == key && person.kcal_target.is_some())
        {
            return Err(format!("unknown nutrition profile: {key}"));
        }
        self.profile = profile;
        self.snapshot()
    }
}

use serde::Deserialize;
use std::collections::BTreeMap;
use std::sync::OnceLock;

#[derive(Debug, Deserialize)]
pub(crate) struct PdfLocaleStrings {
    pub(crate) grocery_title: String,
    pub(crate) decimal_separator: String,
}

#[derive(Debug, Deserialize)]
struct LocaleStrings {
    days: BTreeMap<String, String>,
    meals: BTreeMap<String, String>,
    #[serde(default)]
    categories: BTreeMap<String, String>,
    #[serde(default)]
    messages: BTreeMap<String, String>,
    pdf: PdfLocaleStrings,
}

#[derive(Debug, Default, Deserialize)]
struct LocaleAliases {
    #[serde(default)]
    days: BTreeMap<String, String>,
    #[serde(default)]
    meals: BTreeMap<String, String>,
    #[serde(default)]
    categories: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct LocaleRegistry {
    fallback: String,
    locales: BTreeMap<String, LocaleStrings>,
    #[serde(default)]
    aliases: LocaleAliases,
}

static REGISTRY: OnceLock<LocaleRegistry> = OnceLock::new();

fn registry() -> &'static LocaleRegistry {
    REGISTRY.get_or_init(|| {
        serde_json::from_str(include_str!("../locales/structural.json"))
            .expect("locales/structural.json must be valid")
    })
}

pub(crate) fn fallback_locale() -> String {
    registry().fallback.clone()
}

fn primary_locale(locale: &str) -> &str {
    locale.split('-').next().unwrap_or(locale)
}

fn locale(language: &str) -> Option<&'static LocaleStrings> {
    let registry = registry();
    let requested = language.trim();
    let primary = primary_locale(requested);
    registry
        .locales
        .iter()
        .find(|(code, _)| code.eq_ignore_ascii_case(requested))
        .map(|(_, strings)| strings)
        .or_else(|| {
            registry
                .locales
                .iter()
                .find(|(code, _)| primary_locale(code).eq_ignore_ascii_case(primary))
                .map(|(_, strings)| strings)
        })
        .or_else(|| registry.locales.get(&registry.fallback))
        .or_else(|| registry.locales.values().next())
}

fn localized_value(
    language: &str,
    key: &str,
    select: fn(&LocaleStrings) -> &BTreeMap<String, String>,
) -> Option<String> {
    let registry = registry();
    locale(language)
        .and_then(|strings| select(strings).get(key))
        .or_else(|| {
            registry
                .locales
                .get(&registry.fallback)
                .and_then(|strings| select(strings).get(key))
        })
        .or_else(|| {
            registry
                .locales
                .values()
                .find_map(|strings| select(strings).get(key))
        })
        .cloned()
}

fn canonical_key(
    value: &str,
    aliases: &BTreeMap<String, String>,
    select: fn(&LocaleStrings) -> &BTreeMap<String, String>,
) -> Option<String> {
    let value = value.trim();
    if let Some((_, key)) = aliases
        .iter()
        .find(|(alias, _)| alias.eq_ignore_ascii_case(value))
    {
        return Some(key.clone());
    }
    for strings in registry().locales.values() {
        if let Some((key, _)) = select(strings)
            .iter()
            .find(|(key, translated)| {
                key.eq_ignore_ascii_case(value) || translated.eq_ignore_ascii_case(value)
            })
        {
            return Some(key.clone());
        }
    }
    None
}

pub(crate) fn day_label(language: &str, key: &str) -> Option<String> {
    localized_value(language, key, |strings| &strings.days)
}

pub(crate) fn meal_label(language: &str, key: &str) -> Option<String> {
    localized_value(language, key, |strings| &strings.meals)
}

pub(crate) fn message_label(language: &str, key: &str) -> Option<String> {
    localized_value(language, key, |strings| &strings.messages)
}

pub(crate) fn day_key(value: &str) -> Option<String> {
    canonical_key(value, &registry().aliases.days, |strings| &strings.days)
}

pub(crate) fn meal_key(value: &str) -> Option<String> {
    canonical_key(value, &registry().aliases.meals, |strings| &strings.meals)
}

pub(crate) fn category_key(value: &str) -> Option<String> {
    canonical_key(value, &registry().aliases.categories, |strings| &strings.categories)
}

pub(crate) fn canonical_category(value: &str) -> String {
    category_key(value).unwrap_or_else(|| value.trim().to_string())
}

pub(crate) fn category_label(language: &str, value: &str) -> String {
    let Some(key) = category_key(value) else {
        return value.trim().to_string();
    };
    locale(language)
        .and_then(|strings| strings.categories.get(&key))
        .cloned()
        .unwrap_or(key)
}

pub(crate) fn pdf_strings(language: &str) -> Option<&'static PdfLocaleStrings> {
    locale(language).map(|strings| &strings.pdf)
}

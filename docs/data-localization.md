# Localized data values

Home à la Carte accepts either a plain JSON string or a localized string object for textual data fields loaded through the application engine.

```json
{
  "key": "tomato",
  "name": {
    "en": "Tomato",
    "fr": "Tomate",
    "es": "Tomate",
    "zh-CN": "番茄"
  },
  "category": "Produce::Vegetables"
}
```

The same representation can be used for textual fields in items, dishes, people, menu rows, stock and extra needs, including nested text such as dish `source_notes` and component `source_quantity` values. Entity identifiers such as `key` and `item_key` remain stable strings and should not be translated. Item `category` is also structural data and uses a stable semantic code rather than this localized representation.

Locale keys use language tags such as `en`, `fr`, `es`, `zh-CN`, `en-GB`, or `fr-FR`. Localized data is not restricted to the languages currently translated by the application UI. Resolution first tries the requested locale, then its base language, then the first available localized value. A normal JSON string remains language-neutral and is fully backward compatible.

The UI language selector is generated from the locales present in the application translation catalogue. Localized name editors use those UI locales plus any additional locale keys already stored on the edited record. Therefore adding a new application translation automatically exposes the corresponding name field, while imported third-language or regional values remain visible and editable without being discarded.

Structural day, meal, category, and PDF labels are stored in `locales/structural.json`. Resolution tries the requested locale, then its base locale, then the configured registry fallback, then the first available locale. Adding another structural locale is a resource-data change rather than a new language branch in application code.

Menu rows store semantic day and meal codes such as `monday` and `dinner`. These fields are never localized in JSON; the structural catalogue supplies their display labels. Localized labels in older imports remain accepted and are normalized to semantic codes on export.

Items likewise store category codes such as `Produce::Vegetables` and `Household::Hygiene`. Registered category codes are translated for display, while unregistered custom categories remain language-neutral. Localized category values from older imports are accepted and normalize to registered codes on export.

When the language changes, source-backed localized text is switched while runtime changes such as edited quantities, added or deleted records, and user-edited text are preserved.

Localized name edits are merged into the existing locale map. Untouched locale keys are preserved, including regional or third-language variants. A field is collapsed back to a plain language-neutral string only when all non-empty localized values are identical.

Exports preserve untouched localized objects and the merged locale maps produced by localized edits, so saving or synchronizing data does not silently discard translations that were not edited.

Localized menu rows are matched by their stable scheduling fields while changing language. Synchronization identity is not stored in portable menu data; the server versions the complete household document.

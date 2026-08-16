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
  "category": {
    "en": "Produce::Vegetables",
    "fr": "Fruits et légumes::Légumes"
  }
}
```

The same representation can be used for textual fields in items, dishes, people, menu rows, stock and extra needs, including nested text such as dish `source_notes` and component `source_quantity` values. Entity identifiers such as `key` and `item_key` remain stable strings and should not be translated.

Locale keys use language tags such as `en`, `fr`, `es`, `zh-CN`, `en-GB`, or `fr-FR`. Localized data is not restricted to the languages currently translated by the application UI. Resolution first tries the requested locale, then its base language, then the first available localized value. A normal JSON string remains language-neutral and is fully backward compatible.

The UI language selector is generated from the locales present in the application translation catalogue. Localized name editors use those UI locales plus any additional locale keys already stored on the edited record. Therefore adding a new application translation automatically exposes the corresponding name field, while imported third-language or regional values remain visible and editable without being discarded.

Structural day, meal, and PDF labels are stored in `locales/structural.json`. Resolution tries the requested locale, then its base locale, then the configured registry fallback, then the first available locale. Adding another structural locale is a resource-data change rather than a new language branch in application code.

When the language changes, source-backed localized text is switched while runtime changes such as edited quantities, added or deleted records, and user-edited text are preserved.

Localized name edits are merged into the existing locale map. Untouched locale keys are preserved, including regional or third-language variants. A field is collapsed back to a plain language-neutral string only when all non-empty localized values are identical.

Exports preserve untouched localized objects and the merged locale maps produced by localized edits, so saving or synchronizing data does not silently discard translations that were not edited.

Localized menu rows without an explicit `id` receive a stable generated ID before localization so switching languages does not change their synchronization identity. Supplying explicit stable menu IDs is still recommended for long-lived synchronized data.

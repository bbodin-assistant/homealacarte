# Localized data values

Home à la Carte accepts either a plain JSON string or a localized string object for textual data fields loaded through the application engine.

```json
{
  "key": "tomato",
  "name": {
    "en": "Tomato",
    "fr": "Tomate"
  },
  "category": {
    "en": "Produce::Vegetables",
    "fr": "Fruits et légumes::Légumes"
  }
}
```

The same representation can be used for textual fields in items, dishes, people, menu rows, stock and extra needs, including nested text such as dish `source_notes` and component `source_quantity` values. Entity identifiers such as `key` and `item_key` remain stable strings and should not be translated.

The current application languages are `en` and `fr`. Locale keys may also include a region suffix such as `en-GB` or `fr-FR`. Resolution first tries the requested locale, then its base language, then English, then French, then the first available value. A normal JSON string remains language-neutral and is fully backward compatible.

When the language changes, source-backed localized text is switched while runtime changes such as edited quantities, added or deleted records, and user-edited text are preserved. If a localized field is edited in the app, that edited value becomes the language-neutral value for that field until translations are supplied again.

Exports preserve untouched localized objects. Fields changed by the user are exported as their new plain-string value, so saving or synchronizing data does not silently restore an obsolete translation.

Localized menu rows without an explicit `id` receive a stable generated ID before localization so switching languages does not change their synchronization identity. Supplying explicit stable menu IDs is still recommended for long-lived synchronized data.

# Home à la Carte JSON Agent Guide

This guide describes the JSON format agents should generate or update for Home à la Carte. Prefer valid, conservative data over guessed metadata: preserve stable identifiers, provide translations when they are reliable, and omit optional values when they are unknown.

## 1. Full database

```json
{
  "items": [],
  "dishes": [],
  "people": [],
  "menu": [],
  "stock": [],
  "extra_needs": []
}
```

## 2. Generated menu export

A generated menu is an incremental patch:

```json
{
  "items": [],
  "dishes": [],
  "menu": []
}
```

Rules:

- `items`: only newly created ingredients not present in the base database.
- `dishes`: only newly created dishes not present in the base database.
- `menu`: the complete newly generated menu.
- Never copy existing items or dishes into the export.
- Do not include `people`, `stock`, or `extra_needs` in the export.
- For newly created user-facing items and dishes, use localized names when reliable translations are available.

## 3. Localized text

Home à la Carte accepts either a plain JSON string or a localized string object for textual data.

Plain language-neutral value:

```json
{
  "name": "Emmental"
}
```

Localized value:

```json
{
  "name": {
    "en": "Tomato",
    "fr": "Tomate",
    "es": "Tomate"
  }
}
```

Agent rules:

- Localized values may contain any valid language-tag keys for which reliable text is available; do not restrict records to the locales currently present in the UI translation catalogue.
- Do not invent a translation only to fill a locale. A normal string remains valid and is treated as language-neutral.
- The same localized representation may be used for other user-facing text such as `category`, `source`, `measure_unit`, `purchase_unit`, dish `source_notes`, component `source_quantity`, person descriptions, and notes.
- Locale keys may include a region suffix such as `en-GB`, `fr-FR`, or `zh-CN`.
- Resolution tries the requested locale, then its base language, then the first available localized value.
- Keep identifiers and machine-readable codes stable. Do **not** localize fields such as `key`, `item_key`, person keys, `origin_country`, `nutri_score`, booleans, or numeric values.
- Food-rule `kind`, `meal`, and `days` values are semantic codes and must remain the documented codes rather than translated display text.

## 4. Item

```json
{
  "key": "tomato",
  "name": {
    "en": "Tomato",
    "fr": "Tomate",
    "es": "Tomate"
  },
  "category": {
    "en": "Produce::Vegetables",
    "fr": "Fruits et légumes::Légumes"
  },
  "custom": false,
  "measure_unit": "g",
  "grams": 100.0,
  "grams_per_measure_unit": 1.0,
  "kcal": 0.0,
  "protein_g": 0.0,
  "carbs_g": 0.0,
  "fat_g": 0.0,
  "fiber_g": 0.0,
  "sugars_g": 0.0,
  "salt_g": 0.0,
  "saturated_fat_g": 0.0,
  "fruit_vegetable_legume_percent": 0.0,
  "incomplete": false,
  "purchase_quantity_grams": 0.0,
  "purchase_unit": "package description",
  "price_per_kg": 0.0,
  "price_checked_at": "",
  "price_source": "",
  "price_history": [],
  "source": "",
  "url": ""
}
```

Notes:

- Nutrition values apply to `grams` grams.
- `grams_per_measure_unit` converts one `measure_unit` to grams.
- Keys use lowercase `snake_case` and must remain identical in every language.
- Localize the display `name` rather than creating separate item records for different languages.

## 5. Dish

```json
{
  "key": "tomato_emmental_toast",
  "name": {
    "en": "Tomato and Emmental toast",
    "fr": "Tartine tomate-emmental",
    "es": "Tostada de tomate y emmental"
  },
  "origin_country": "FR",
  "auto_menu_main": true,
  "servings": 4.0,
  "components": [
    {
      "item_key": "tomato",
      "quantity": 500.0,
      "quantity_unit": "g",
      "source_quantity": "500 g"
    }
  ],
  "nutri_score": "",
  "recipe_url": "",
  "source": "",
  "source_notes": []
}
```

Rules:

- `components[*].item_key` must reference an item.
- `auto_menu_main` defaults to `true`. Set it to `false` for breakfasts, snacks, desserts, and drinks so automatic generation does not use them as lunch or dinner.
- `servings` and component quantities must be positive.
- Common component units: `g`, `L`, `pieces`.
- Localize the dish `name` rather than creating separate records for different languages.

### Dish country flag

`origin_country` is optional metadata used to display a country flag for the dish.

- Prefer an ISO 3166-1 alpha-2 country code such as `FR`, `IT`, `JP`, or `MX`.
- The loader accepts exactly two ASCII letters and normalizes them to uppercase.
- Use the code only when the dish has a reasonably clear country of origin. If the origin is uncertain, omit `origin_country` or leave it empty rather than guessing.
- Do not use a country name (`"France"`), nationality (`"French"`), or emoji (`"🇫🇷"`) in this field.
- Do not localize `origin_country`; the same stable code is used in every language.

## 6. Menu entry

```json
{
  "id": "menu_entry_stable_id",
  "day": "Monday",
  "meal": "Dinner",
  "item_key": "tomato_emmental_toast",
  "people": ["person_key"],
  "quantity": 1.0,
  "quantity_unit": "portion",
  "notes": ""
}
```

Rules:

- `id` is optional on import. Home à la Carte assigns one when absent and preserves it on export for incremental synchronization.
- `item_key` may reference an item or dish.
- Use `portion` for dishes.
- Use `g` or `unit` for direct items.
- `people` contains existing person keys.
- Quantities must be positive.

## 7. Person

```json
{
  "key": "person_key",
  "name": "Display name",
  "kind": "adult",
  "kcal_target": 2000.0,
  "description": "",
  "food_rules": [
    {
      "kind": "routine",
      "meal": "breakfast",
      "item_keys": ["porridge", "toast", "yoghurt"],
      "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "quantity": 1.0,
      "quantity_unit": "portion"
    },
    {
      "kind": "never",
      "meal": "any",
      "item_keys": ["peanut"]
    }
  ]
}
```

Food rules:

- `routine`: on each selected and available day, schedule one of `item_keys` at `meal`; one key expresses a fixed habit.
- `days` is optional for a routine. An omitted or empty list means every available day. Otherwise use any of `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, and `sunday`.
- `never`: exclude the listed dishes and any dish containing the listed ingredients. Use `meal: "any"` for every meal.
- Meal codes are `breakfast`, `morning_snack`, `lunch`, `afternoon_snack_1`, `afternoon_snack_2`, `dinner`, and `anytime`.

## 8. Stock entry

```json
{
  "item_key": "tomato",
  "quantity": 500.0,
  "quantity_unit": "g",
  "notes": ""
}
```

## 9. Extra need

```json
{
  "item_key": "item_key",
  "quantity": 1.0,
  "quantity_unit": "unit",
  "notes": ""
}
```

## 10. Required validation

- JSON must parse.
- Every key must be unique.
- New export keys must not exist in the base database.
- Every dish component must resolve to an item.
- Every menu entry must resolve to an item or dish.
- Every menu person must resolve to a person.
- Existing records must not be duplicated in the export.
- Localized text objects must use language-tag keys with string values.
- Stable identifiers and references must remain strings and must not vary by language.
- If `origin_country` is present and non-empty, it must contain exactly two ASCII letters.

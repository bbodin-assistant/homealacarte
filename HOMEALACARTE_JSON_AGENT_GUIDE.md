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
- Generated menu rows should include their calendar `date` so identical weekdays in different weeks remain distinct.

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
- The same localized representation may be used for other user-facing text such as `source`, `measure_unit`, `purchase_unit`, dish `source_notes`, component `source_quantity`, person descriptions, and notes.
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
  "category": "Produce::Vegetables",
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
  "purchase_quantity_grams": 100.0,
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

- `category` is a stable `Category::Subcategory` semantic code. Use a registered code when one applies and do not translate it in item data; display labels come from `locales/structural.json`.
- A genuinely custom category may remain a language-neutral string.
- Nutrition values apply to `grams` grams.
- `grams_per_measure_unit` converts one `measure_unit` to grams.
- `grams`, `grams_per_measure_unit`, and `purchase_quantity_grams` must be positive.
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
  "date": "2026-08-17",
  "day": "monday",
  "meal": "dinner",
  "item_key": "tomato_emmental_toast",
  "people": ["person_key"],
  "quantity": 1.0,
  "quantity_unit": "portion",
  "notes": ""
}
```

Rules:

- `id` is optional on import. Home à la Carte assigns one when absent and preserves it on export for incremental synchronization.
- `date` is optional for backward-compatible imports, but agents generating current menus should provide the calendar date in `YYYY-MM-DD` form and keep `day` consistent with it.
- `date` is part of menu-row identity: otherwise-compatible rows on different dates remain separate.
- `day` is a semantic code: `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, or `sunday`.
- `meal` is a semantic code: `breakfast`, `morning_snack`, `lunch`, `afternoon_snack_1`, `afternoon_snack_2`, `dinner`, or `anytime`.
- Do not translate `day` or `meal` in menu data. Home à la Carte translates these shared concepts for display.
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
      "meal": "dinner",
      "item_keys": ["tomato_emmental_toast"]
    },
    {
      "kind": "allergy",
      "meal": "any",
      "item_keys": ["peanut"]
    },
    {
      "kind": "favorite",
      "meal": "any",
      "item_keys": ["tomato"]
    }
  ]
}
```

Food rules:

- Valid `kind` codes are `routine`, `never`, `allergy`, and `favorite`.
- `routine`: on each selected and available day, schedule one of `item_keys` at `meal`; one key expresses a fixed habit.
- `days` applies only to `routine`. An omitted or empty list means every available day. Otherwise use any of `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, and `sunday`. Days on non-routine rules are ignored.
- `never`: exclude a listed dish or item at the selected meal. Listing an ingredient also excludes dishes containing that ingredient. Use `meal: "any"` to apply the rule to every meal.
- `allergy`: exclude a listed dish or item, and dishes containing a listed ingredient, at every meal. Use `meal: "any"`; allergy matching is global rather than meal-specific.
- `favorite`: make matching candidate dishes, including dishes containing a listed ingredient, preferred during automatic menu generation without forcing their selection. Use `meal: "any"`; favorite matching is currently global rather than meal-specific.
- Meal codes are `any`, `breakfast`, `morning_snack`, `lunch`, `afternoon_snack_1`, `afternoon_snack_2`, `dinner`, and `anytime`. `any` is the all-meals rule code and cannot be used by a `routine` rule.
- `quantity` must be positive. `quantity_unit` must be `portion`, `g`, or `unit`; omitted values default to `1.0` and `portion`.
- Every `item_keys` entry must resolve to an existing item or dish.
- Canonical allergen codes are `gluten`, `wheat`, `rye`, `barley`, `oat`,
  `spelt`, `crustacean`, `egg`, `fish`, `peanut`, `soy`, `milk`, `tree_nut`,
  `almond`, `hazelnut`, `walnut`, `cashew_nut`, `pecan`, `brazil_nut`,
  `pistachio`, `macadamia`, `celery`, `mustard`, `sesame`, and `sulfite`.
  Use the individual tree-nut code when it is known; an ingredient may also
  carry `tree_nut` to support broader allergy profiles.

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
- Generated menu rows should include a calendar `date`; legacy date-less rows remain importable.
- Food-rule `kind`, `meal`, `days`, quantity, unit, and references must use the codes and constraints documented above.
- Existing records must not be duplicated in the export.
- Localized text objects must use language-tag keys with string values.
- Stable identifiers and references must remain strings and must not vary by language.
- If `origin_country` is present and non-empty, it must contain exactly two ASCII letters.

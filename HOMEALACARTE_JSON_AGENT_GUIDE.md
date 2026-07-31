# HomeAlacarte JSON Format

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

## 3. Item

```json
{
  "key": "ingredient_key",
  "name": "Ingredient name",
  "category": "Category::Subcategory",
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
- Keys use lowercase `snake_case`.

## 4. Dish

```json
{
  "key": "plat_dish_key",
  "name": "Dish name",
  "servings": 4.0,
  "components": [
    {
      "item_key": "ingredient_key",
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
- `servings` and component quantities must be positive.
- Common component units: `g`, `L`, `pieces`.

## 5. Menu entry

```json
{
  "day": "Monday",
  "meal": "Dinner",
  "item_key": "plat_dish_key",
  "people": ["person_key"],
  "quantity": 1.0,
  "quantity_unit": "portion",
  "notes": ""
}
```

Rules:

- `item_key` may reference an item or dish.
- Use `portion` for dishes.
- Use `g` or `unit` for direct items.
- `people` contains existing person keys.
- Quantities must be positive.

## 6. Person

```json
{
  "key": "person_key",
  "name": "Display name",
  "kind": "adult",
  "kcal_target": 2000.0,
  "description": ""
}
```

## 7. Stock entry

```json
{
  "item_key": "ingredient_key",
  "quantity": 500.0,
  "quantity_unit": "g",
  "notes": ""
}
```

## 8. Extra need

```json
{
  "item_key": "item_key",
  "quantity": 1.0,
  "quantity_unit": "unit",
  "notes": ""
}
```

## 9. Required validation

- JSON must parse.
- Every key must be unique.
- New export keys must not exist in the base database.
- Every dish component must resolve to an item.
- Every menu entry must resolve to an item or dish.
- Every menu person must resolve to a person.
- Existing records must not be duplicated in the export.

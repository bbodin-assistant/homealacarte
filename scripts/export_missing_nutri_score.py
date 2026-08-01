#!/usr/bin/env python3
"""Export catalog ingredients that still lack Nutri-Score input values."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


NUTRI_SCORE_FIELDS = (
    "sugars_g",
    "saturated_fat_g",
    "salt_g",
    "fruit_vegetable_legume_percent",
)
OUTPUT_FIELDS = (
    "key",
    "name",
    "category",
    "missing_values_count",
    "missing_fields",
    "kcal",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    *NUTRI_SCORE_FIELDS,
    "source",
    "url",
)


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "Usage: export_missing_nutri_score.py CONSOLIDATED_JSON OUTPUT_CSV",
            file=sys.stderr,
        )
        return 2

    source_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    document = json.loads(source_path.read_text(encoding="utf-8"))
    ingredients = document.get("items", [])
    rows = []
    for ingredient in ingredients:
        # Consolidated exports keep food ingredients and non-food household
        # products in the same `items` array. Only foods have a 100 g basis.
        if ingredient.get("grams") is None:
            continue
        missing = [field for field in NUTRI_SCORE_FIELDS if ingredient.get(field) is None]
        if not missing:
            continue
        row = {field: ingredient.get(field, "") for field in OUTPUT_FIELDS}
        row["missing_values_count"] = len(missing)
        row["missing_fields"] = "; ".join(missing)
        rows.append(row)

    rows.sort(key=lambda row: (str(row["name"]).casefold(), str(row["key"])))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    missing_count = sum(int(row["missing_values_count"]) for row in rows)
    print(
        f"Wrote {output_path}: {len(rows)} ingredients, "
        f"{missing_count} missing Nutri-Score values"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Review CIQUAL matches and safely fill personal ingredient nutrition.

Workflow:
    # Review one ingredient at a time; progress is saved after each answer.
    python3 CIQUAL/update_perso_from_ciqual.py review

    # Preview the approved changes without touching the personal files.
    python3 CIQUAL/update_perso_from_ciqual.py apply

    # Apply approved, numeric CIQUAL values.
    python3 CIQUAL/update_perso_from_ciqual.py apply --write

CIQUAL provides sugars, saturated fat, and salt. For the Nutri-Score
fruit/vegetable/legume component, this script applies a reviewed binary
classification to ingredients: qualifying ingredients are 100%, all others 0%.
Existing values are preserved unless --overwrite is explicitly supplied.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path
from typing import Any

import search_ciqual


PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = PROJECT_DIR / "perso-data" / "sample" / "ingredients"
DEFAULT_MAPPING = Path(__file__).resolve().parent / "perso_ciqual_mapping.json"
TARGET_FIELDS = ("sugars_g", "saturated_fat_g", "salt_g")
AUDIT_FIELDS = (
    ("kcal", "kcal", 20.0),
    ("protein_g", "protein_g", 1.0),
    ("carbs_g", "carbs_g", 1.0),
    ("fat_g", "fat_g", 1.0),
    ("fiber_g", "fiber_g", 1.0),
)
MISSING_MARKERS = (None, "", "MISSINGVALUE")

# Nutri-Score 2023 qualifying food groups: fruit, the listed vegetable groups
# (including edible fungi and algae), and pulses. Potatoes and sweet potatoes
# are not in the qualifying Eurocode groups. Herbs/spices, nuts/seeds and oils
# are likewise outside this general-food component.
FVL_100_KEYS = frozenset(
    {
        "abricot",
        "ail",
        "avocat",
        "banane",
        "bok_choy",
        "brocoli",
        "carotte",
        "celeri",
        "champignon",
        "chou",
        "ciboule",
        "citron_vert",
        "compote_pomme",
        "concentre_tomate",
        "concombre",
        "echalote",
        "edamame",
        "enoki",
        "epinard",
        "farine_pois_chiche",
        "gingembre",
        "haricots_noirs",
        "haricots_verts",
        "laitue",
        "legumes_melanges",
        "mais",
        "melange_legumes_secs_feves_soja",
        "myrtille",
        "nectarine",
        "nori",
        "oignon",
        "oignon_vert",
        "pasteque",
        "peche",
        "pois_chiche",
        "poireau",
        "poivron",
        "pomme",
        "salade",
        "sauce_tomate",
        "tomate",
        "tomate_concassee",
        "tomate_sechee",
    }
)


def item_key(path: Path, item: dict[str, Any]) -> str:
    key = item.get("key") or item.get("ingredient_key") or item["name"]
    return f"{path.resolve()}::{key}"


def read_mapping(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "instructions": (
                "Only approved entries are applied. Review preparation state, "
                "brand equivalence, and whether values represent the same edible form."
            ),
            "mappings": {},
        }
    return json.loads(path.read_text(encoding="utf-8"))


def write_mapping(path: Path, mapping: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def short_value(nutrients: dict[str, Any], field: str) -> str:
    value = nutrients.get(field)
    if not value:
        return "?"
    return value["raw"] or "?"


def show_candidates(matches: list[dict[str, Any]]) -> None:
    for index, match in enumerate(matches, start=1):
        nutrients = match["nutrients"]
        facts = ", ".join(
            (
                f"sugars={short_value(nutrients, 'sugars_g')}",
                f"sat.fat={short_value(nutrients, 'saturated_fat_g')}",
                f"salt={short_value(nutrients, 'salt_g')}",
            )
        )
        print(
            f"  {index}. [{match['code']}] {match['name_fr']} "
            f"({match['score']:.0%}; {facts})"
        )


def mapping_record(
    source_path: Path,
    item: dict[str, Any],
    match: dict[str, Any] | None,
    status: str,
) -> dict[str, Any]:
    return {
        "status": status,
        "source_file": str(source_path.resolve()),
        "ingredient_key": item.get("key") or item.get("ingredient_key"),
        "ingredient_name": item["name"],
        "ciqual_code": match["code"] if match else None,
        "ciqual_name_fr": match["name_fr"] if match else None,
    }


def review(
    connection: Any,
    catalog: Path,
    mapping_path: Path,
    limit: int,
    revisit: bool,
) -> None:
    mapping = read_mapping(mapping_path)
    entries = list(search_ciqual.catalog_items(catalog))
    remaining = [
        (path, item)
        for path, item in entries
        if revisit or item_key(path, item) not in mapping["mappings"]
    ]
    print(
        f"{len(entries)} ingredients; {len(remaining)} awaiting review. "
        "CIQUAL facts are per 100 g."
    )
    print("Choose 1-5, s=skip, q=save/quit, /text=new search, c CODE=exact code.")

    for position, (source_path, item) in enumerate(remaining, start=1):
        query = item["name"]
        while True:
            matches = search_ciqual.search_foods(connection, query, limit)
            search_ciqual.enrich_matches(connection, matches, include_all=False)
            print(f"\n[{position}/{len(remaining)}] {item['name']} ({source_path.name})")
            show_candidates(matches)
            try:
                answer = input("> ").strip()
            except (EOFError, KeyboardInterrupt):
                answer = "q"

            if answer.lower() == "q":
                write_mapping(mapping_path, mapping)
                print(f"Progress saved to {mapping_path}")
                return
            if answer.lower() == "s":
                mapping["mappings"][item_key(source_path, item)] = mapping_record(
                    source_path, item, None, "skipped"
                )
                write_mapping(mapping_path, mapping)
                break
            if answer.startswith("/") and answer[1:].strip():
                query = answer[1:].strip()
                continue
            if answer.lower().startswith("c "):
                exact = search_ciqual.food_by_code(connection, answer[2:].strip())
                if exact is None:
                    print("Unknown CIQUAL code.")
                    continue
                match = exact
            else:
                try:
                    match = matches[int(answer) - 1]
                except (ValueError, IndexError):
                    print("Invalid choice.")
                    continue

            mapping["mappings"][item_key(source_path, item)] = mapping_record(
                source_path, item, match, "approved"
            )
            write_mapping(mapping_path, mapping)
            break

    print(f"Review complete. Mapping saved to {mapping_path}")


def should_fill(value: Any, overwrite: bool) -> bool:
    return overwrite or value in MISSING_MARKERS


def fvl_percent(item: dict[str, Any]) -> float:
    key = item.get("key") or item.get("ingredient_key")
    return 100.0 if key in FVL_100_KEYS else 0.0


def atomic_json_write(path: Path, document: Any) -> None:
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(document, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def approved_mappings(mapping_path: Path) -> dict[str, dict[str, Any]]:
    mapping = read_mapping(mapping_path)
    return {
        identity: record
        for identity, record in mapping["mappings"].items()
        if record.get("status") == "approved" and record.get("ciqual_code")
    }


def approved_record(
    approved: dict[str, dict[str, Any]],
    source_path: Path,
    item: dict[str, Any],
) -> dict[str, Any] | None:
    ingredient_identity = item.get("key") or item.get("ingredient_key")
    return approved.get(item_key(source_path, item)) or approved.get(
        ingredient_identity
    )


def audit_nutrition(
    connection: Any,
    catalog: Path,
    mapping_path: Path,
    output: Path,
    threshold: float,
) -> None:
    approved = approved_mappings(mapping_path)
    results = []
    comparison_count = 0

    for source_path, item in search_ciqual.catalog_items(catalog):
        record = approved_record(approved, source_path, item)
        if not record:
            continue
        code = str(record["ciqual_code"])
        ciqual_food = search_ciqual.food_by_code(connection, code)
        nutrients = search_ciqual.core_nutrients(connection, code)
        reference_grams = float(item.get("grams", 100.0))
        ciqual_scale = reference_grams / 100.0
        comparisons = {}
        maximum_difference = 0.0
        for local_field, ciqual_field, scale_floor in AUDIT_FIELDS:
            current = item.get(local_field)
            fact = nutrients.get(ciqual_field)
            reference = (
                fact["value"] * ciqual_scale
                if fact and fact["value"] is not None
                else None
            )
            if not isinstance(current, (int, float)) or reference is None:
                comparisons[local_field] = {
                    "current": current,
                    "ciqual": reference,
                    "relative_difference": None,
                }
                continue
            absolute = abs(float(current) - reference)
            relative = absolute / max(abs(float(current)), abs(reference), scale_floor)
            maximum_difference = max(maximum_difference, relative)
            comparison_count += 1
            comparisons[local_field] = {
                "current": current,
                "ciqual": reference,
                "absolute_difference": round(absolute, 6),
                "relative_difference": round(relative, 6),
            }
        results.append(
            {
                "ingredient_key": item.get("key") or item.get("ingredient_key"),
                "ingredient_name": item["name"],
                "source_file": str(source_path),
                "current_source": item.get("source"),
                "ciqual_code": code,
                "ciqual_name": ciqual_food["name_fr"] if ciqual_food else None,
                "reference_grams": reference_grams,
                "maximum_relative_difference": round(maximum_difference, 6),
                "needs_review": maximum_difference > threshold,
                "comparisons": comparisons,
            }
        )

    results.sort(
        key=lambda result: (
            -result["maximum_relative_difference"],
            result["ingredient_name"],
        )
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "threshold": threshold,
                "mapped_ingredients": len(results),
                "comparisons": comparison_count,
                "needs_review": sum(result["needs_review"] for result in results),
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    review_count = sum(result["needs_review"] for result in results)
    print(
        f"Audited {comparison_count} existing values for {len(results)} matched "
        f"ingredients; {review_count} ingredients exceed the "
        f"{threshold:.0%} review threshold."
    )
    print(f"Wrote the complete audit to {output}")
    for result in results[:20]:
        if not result["needs_review"]:
            break
        differences = [
            f"{field} {values['current']}→{values['ciqual']}"
            for field, values in result["comparisons"].items()
            if values.get("relative_difference") is not None
            and values["relative_difference"] > threshold
        ]
        print(
            f"  - {result['ingredient_key']}: {result['ciqual_name']} "
            f"({'; '.join(differences)})"
        )


def apply_mapping(
    connection: Any,
    catalog: Path,
    mapping_path: Path,
    write: bool,
    overwrite: bool,
) -> None:
    approved = approved_mappings(mapping_path)
    field_changes = 0
    fvl_changes = 0
    unavailable = 0
    unavailable_details: list[str] = []
    unmapped_ingredients: list[str] = []
    documents_to_write: dict[Path, Any] = {}
    paths = sorted(catalog.rglob("*.json")) if catalog.is_dir() else [catalog]
    for source_path in paths:
        document = json.loads(source_path.read_text(encoding="utf-8"))
        items = (
            (document.get("items") or document.get("ingredients") or [])
            if isinstance(document, dict)
            else document
        )
        document_changed = False
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str):
                continue

            if should_fill(item.get("fruit_vegetable_legume_percent"), overwrite):
                item["fruit_vegetable_legume_percent"] = fvl_percent(item)
                fvl_changes += 1
                document_changed = True

            ingredient_identity = item.get("key") or item.get("ingredient_key")
            record = approved_record(approved, source_path, item)
            if not record:
                unmapped_ingredients.append(str(ingredient_identity))
                continue
            nutrients = search_ciqual.core_nutrients(
                connection, str(record["ciqual_code"])
            )
            ciqual_scale = float(item.get("grams", 100.0)) / 100.0
            for field in TARGET_FIELDS:
                fact = nutrients[field]
                if fact is None or fact["value"] is None:
                    unavailable += 1
                    unavailable_details.append(
                        f"{ingredient_identity}.{field} "
                        f"(CIQUAL {record['ciqual_code']}: "
                        f"{fact['raw'] if fact else 'absent'})"
                    )
                    continue
                if should_fill(item.get(field), overwrite):
                    item[field] = round(fact["value"] * ciqual_scale, 6)
                    field_changes += 1
                    document_changed = True
        if document_changed:
            documents_to_write[source_path] = document

    mode = "Will update" if not write else "Updated"
    print(
        f"{mode} {field_changes} CIQUAL fields and {fvl_changes} "
        f"fruit/vegetable/legume fields in {len(documents_to_write)} files "
        f"from {len(approved)} approved CIQUAL mappings."
    )
    if unavailable:
        print(f"{unavailable} selected CIQUAL facts were non-numeric or unavailable.")
        for detail in unavailable_details:
            print(f"  - {detail}")
    if unmapped_ingredients:
        print(
            f"{len(unmapped_ingredients)} ingredients have no sufficiently "
            "equivalent CIQUAL food:"
        )
        print(f"  {', '.join(unmapped_ingredients)}")
    if not write:
        print("Dry run only. Re-run with --write after checking the mapping.")
        return
    for path, document in documents_to_write.items():
        atomic_json_write(path, document)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Review CIQUAL matches and fill personal ingredient nutrition."
    )
    parser.add_argument(
        "command",
        choices=("review", "audit", "apply"),
        help="review mappings, audit existing facts, or apply missing facts",
    )
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--mapping", type=Path, default=DEFAULT_MAPPING)
    parser.add_argument(
        "--audit-output",
        type=Path,
        default=Path(__file__).resolve().parent / "perso_ciqual_audit.json",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.20,
        help="relative difference requiring review during audit (default: 0.20)",
    )
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument(
        "--revisit", action="store_true", help="review already mapped ingredients again"
    )
    parser.add_argument(
        "--write", action="store_true", help="write changes (apply is dry-run by default)"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="replace existing nutrition values as well as missing ones",
    )
    arguments = parser.parse_args()
    if arguments.limit < 1:
        parser.error("--limit must be at least 1")
    if arguments.command != "apply" and (arguments.write or arguments.overwrite):
        parser.error("--write and --overwrite are only valid with apply")
    if not 0 <= arguments.threshold <= 1:
        parser.error("--threshold must be between 0 and 1")
    return arguments


def main() -> int:
    arguments = parse_arguments()
    with search_ciqual.open_database() as connection:
        if arguments.command == "review":
            review(
                connection,
                arguments.catalog,
                arguments.mapping,
                arguments.limit,
                arguments.revisit,
            )
        elif arguments.command == "audit":
            audit_nutrition(
                connection,
                arguments.catalog,
                arguments.mapping,
                arguments.audit_output,
                arguments.threshold,
            )
        else:
            apply_mapping(
                connection,
                arguments.catalog,
                arguments.mapping,
                arguments.write,
                arguments.overwrite,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

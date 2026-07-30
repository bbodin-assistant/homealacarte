#!/usr/bin/env python3
"""Search the local ANSES-CIQUAL XML database.

Examples:
    python3 CIQUAL/search_ciqual.py "haricots verts"
    python3 CIQUAL/search_ciqual.py --code 20061 --all-nutrients
    python3 CIQUAL/search_ciqual.py "green beans" --json
    python3 CIQUAL/search_ciqual.py \
        --catalog perso-data/sample/ingredients \
        --suggestions CIQUAL/perso_ciqual_suggestions.json

The first invocation builds a SQLite cache next to this script. The source XML
files remain the source of truth; the cache is rebuilt automatically when they
change.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree


SCRIPT_DIR = Path(__file__).resolve().parent
ALIM_XML = SCRIPT_DIR / "alim_2025_11_03.xml"
COMPO_XML = SCRIPT_DIR / "compo_2025_11_03.xml"
CONST_XML = SCRIPT_DIR / "const_2025_11_03.xml"
CACHE_FILE = SCRIPT_DIR / ".ciqual.sqlite3"

SOURCE_FILES = (ALIM_XML, COMPO_XML, CONST_XML)

# CIQUAL 2025 constituent codes used by Home à la carte. Values are per 100 g.
CORE_NUTRIENTS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("energy_kj", "Energy", ("327",)),
    ("kcal", "Energy", ("328",)),
    ("protein_g", "Protein", ("25000", "25003")),
    ("carbs_g", "Carbohydrates", ("31000",)),
    ("sugars_g", "Sugars", ("32000",)),
    ("fat_g", "Fat", ("40000",)),
    ("saturated_fat_g", "Saturated fat", ("40302",)),
    ("fiber_g", "Fibre", ("34100",)),
    ("salt_g", "Salt", ("10004",)),
)

PLAIN_NUMBER = re.compile(r"^[+-]?\d+(?:[.,]\d+)?$")
NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalized(value: str) -> str:
    """Return a lower-case, accent-insensitive string suitable for matching."""
    value = value.casefold().replace("œ", "oe").replace("æ", "ae")
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(NON_ALNUM.sub(" ", ascii_value).split())


def comparison_tokens(value: str) -> list[str]:
    """Apply a deliberately small plural fold for French/English food names."""
    tokens = normalized(value).split()
    return [token[:-1] if len(token) > 3 and token.endswith("s") else token for token in tokens]


def element_text(element: ElementTree.Element, tag: str) -> str:
    return " ".join((element.findtext(tag) or "").split())


def numeric_value(raw: str) -> float | None:
    """Parse exact CIQUAL numbers; preserve traces and bounds as non-exact."""
    compact = raw.strip().replace(" ", "").casefold()
    if not PLAIN_NUMBER.fullmatch(compact):
        return None
    return float(compact.replace(",", "."))


def conservative_unfavourable_value(raw: str) -> float | None:
    """Convert a CIQUAL trace/bound for an unfavourable Nutri-Score fact."""
    compact = raw.strip().replace(" ", "").casefold()
    if compact == "traces":
        return 0.0
    if compact.startswith("<") and PLAIN_NUMBER.fullmatch(compact[1:]):
        return float(compact[1:].replace(",", "."))
    return None


def source_fingerprint() -> str:
    return "|".join(
        f"{path.name}:{path.stat().st_size}:{path.stat().st_mtime_ns}"
        for path in SOURCE_FILES
    )


def require_sources() -> None:
    missing = [path.name for path in SOURCE_FILES if not path.is_file()]
    if missing:
        names = ", ".join(missing)
        raise SystemExit(f"Missing CIQUAL source file(s) in {SCRIPT_DIR}: {names}")


def iter_records(path: Path, record_tag: str) -> Iterable[ElementTree.Element]:
    for _event, element in ElementTree.iterparse(path, events=("end",)):
        if element.tag == record_tag:
            yield element
            element.clear()


def build_cache(connection: sqlite3.Connection) -> None:
    print("Building the CIQUAL search cache...", file=sys.stderr)
    connection.executescript(
        """
        DROP TABLE IF EXISTS metadata;
        DROP TABLE IF EXISTS foods;
        DROP TABLE IF EXISTS constituents;
        DROP TABLE IF EXISTS composition;

        CREATE TABLE metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE foods (
            code TEXT PRIMARY KEY,
            name_fr TEXT NOT NULL,
            name_en TEXT NOT NULL,
            scientific_name TEXT NOT NULL,
            group_code TEXT NOT NULL,
            subgroup_code TEXT NOT NULL,
            subsubgroup_code TEXT NOT NULL,
            norm_fr TEXT NOT NULL,
            norm_en TEXT NOT NULL
        );

        CREATE TABLE constituents (
            code TEXT PRIMARY KEY,
            name_fr TEXT NOT NULL,
            name_en TEXT NOT NULL,
            infoods_code TEXT NOT NULL
        );

        CREATE TABLE composition (
            food_code TEXT NOT NULL,
            constituent_code TEXT NOT NULL,
            value_raw TEXT NOT NULL,
            value_real REAL,
            min_raw TEXT NOT NULL,
            max_raw TEXT NOT NULL,
            confidence TEXT NOT NULL,
            source_code TEXT NOT NULL,
            PRIMARY KEY (food_code, constituent_code)
        );

        CREATE INDEX composition_food_idx ON composition(food_code);
        """
    )

    food_rows = []
    for item in iter_records(ALIM_XML, "ALIM"):
        name_fr = element_text(item, "alim_nom_fr")
        name_en = element_text(item, "alim_nom_eng")
        food_rows.append(
            (
                element_text(item, "alim_code"),
                name_fr,
                name_en,
                element_text(item, "alim_nom_sci"),
                element_text(item, "alim_grp_code"),
                element_text(item, "alim_ssgrp_code"),
                element_text(item, "alim_ssssgrp_code"),
                normalized(name_fr),
                normalized(name_en),
            )
        )
    connection.executemany(
        "INSERT INTO foods VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", food_rows
    )

    constituent_rows = []
    for item in iter_records(CONST_XML, "CONST"):
        constituent_rows.append(
            (
                element_text(item, "const_code"),
                element_text(item, "const_nom_fr"),
                element_text(item, "const_nom_eng"),
                element_text(item, "const_code_infoods"),
            )
        )
    connection.executemany(
        "INSERT INTO constituents VALUES (?, ?, ?, ?)", constituent_rows
    )

    composition_rows = []
    for item in iter_records(COMPO_XML, "COMPO"):
        raw = element_text(item, "teneur")
        composition_rows.append(
            (
                element_text(item, "alim_code"),
                element_text(item, "const_code"),
                raw,
                numeric_value(raw),
                element_text(item, "min"),
                element_text(item, "max"),
                element_text(item, "code_confiance"),
                element_text(item, "source_code"),
            )
        )
        if len(composition_rows) >= 10_000:
            connection.executemany(
                "INSERT OR REPLACE INTO composition VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                composition_rows,
            )
            composition_rows.clear()
    if composition_rows:
        connection.executemany(
            "INSERT OR REPLACE INTO composition VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            composition_rows,
        )

    connection.execute(
        "INSERT INTO metadata(key, value) VALUES ('source_fingerprint', ?)",
        (source_fingerprint(),),
    )
    connection.commit()
    print(
        f"Indexed {len(food_rows)} foods and {len(constituent_rows)} nutrients.",
        file=sys.stderr,
    )


def open_database(rebuild: bool = False) -> sqlite3.Connection:
    require_sources()
    connection = sqlite3.connect(CACHE_FILE)
    connection.row_factory = sqlite3.Row
    cached_fingerprint = None
    try:
        row = connection.execute(
            "SELECT value FROM metadata WHERE key = 'source_fingerprint'"
        ).fetchone()
        cached_fingerprint = row["value"] if row else None
    except sqlite3.Error:
        pass
    if rebuild or cached_fingerprint != source_fingerprint():
        build_cache(connection)
    return connection


def name_score(query: str, candidate: str) -> float:
    if not candidate:
        return 0.0
    if query == candidate:
        return 1.0

    query_tokens = set(comparison_tokens(query))
    candidate_tokens = set(comparison_tokens(candidate))
    intersection = len(query_tokens & candidate_tokens)
    union = len(query_tokens | candidate_tokens)
    jaccard = intersection / union if union else 0.0
    containment = intersection / len(query_tokens) if query_tokens else 0.0
    sequence = SequenceMatcher(None, query, candidate).ratio()
    score = 0.45 * sequence + 0.35 * jaccard + 0.20 * containment

    if query_tokens == candidate_tokens:
        score = max(score, 0.995)
    elif query_tokens and query_tokens <= candidate_tokens:
        score = max(
            score,
            0.86 + 0.10 * len(query_tokens) / max(len(candidate_tokens), 1),
        )
    if query in candidate:
        score = max(score, 0.90 + min(len(query) / max(len(candidate), 1), 1.0) * 0.08)
    elif candidate in query:
        score = max(score, 0.86 + min(len(candidate) / max(len(query), 1), 1.0) * 0.08)
    return min(score, 1.0)


def search_foods(
    connection: sqlite3.Connection, query: str, limit: int
) -> list[dict[str, Any]]:
    norm_query = normalized(query)
    if not norm_query:
        return []

    # Restrict fuzzy comparison to foods sharing at least one token. This keeps
    # whole-catalog runs quick while still falling back to every food for typos
    # or brand names absent from CIQUAL.
    tokens = sorted(set(comparison_tokens(norm_query)), key=len, reverse=True)
    conditions = []
    parameters = []
    for token in tokens:
        conditions.append("(norm_fr LIKE ? OR norm_en LIKE ?)")
        wildcard = f"%{token}%"
        parameters.extend((wildcard, wildcard))
    rows = (
        connection.execute(
            f"SELECT * FROM foods WHERE {' OR '.join(conditions)}", parameters
        ).fetchall()
        if conditions
        else []
    )
    if not rows:
        rows = connection.execute("SELECT * FROM foods").fetchall()

    matches = []
    for row in rows:
        score_fr = name_score(norm_query, row["norm_fr"])
        score_en = name_score(norm_query, row["norm_en"])
        score = max(score_fr, score_en)
        matches.append(
            {
                "code": row["code"],
                "name_fr": row["name_fr"],
                "name_en": row["name_en"],
                "scientific_name": row["scientific_name"],
                "score": round(score, 4),
                "matched_language": "fr" if score_fr >= score_en else "en",
            }
        )
    matches.sort(key=lambda item: (-item["score"], item["name_fr"], item["code"]))
    return matches[:limit]


def nutrient_rows(
    connection: sqlite3.Connection, food_code: str
) -> dict[str, sqlite3.Row]:
    rows = connection.execute(
        """
        SELECT c.*, n.name_fr, n.name_en, n.infoods_code
        FROM composition AS c
        LEFT JOIN constituents AS n ON n.code = c.constituent_code
        WHERE c.food_code = ?
        """,
        (food_code,),
    )
    return {row["constituent_code"]: row for row in rows}


def serialized_value(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "value": row["value_real"],
        "raw": row["value_raw"],
        "min": row["min_raw"] or None,
        "max": row["max_raw"] or None,
        "confidence": row["confidence"] or None,
        "source_code": row["source_code"] or None,
        "ciqual_constituent_code": row["constituent_code"],
        "name_fr": row["name_fr"],
        "name_en": row["name_en"],
    }


def core_nutrients(
    connection: sqlite3.Connection, food_code: str
) -> dict[str, dict[str, Any] | None]:
    rows = nutrient_rows(connection, food_code)
    result: dict[str, dict[str, Any] | None] = {}
    for field, _label, codes in CORE_NUTRIENTS:
        candidates = [
            rows[code] for code in codes if code in rows and rows[code]["value_raw"]
        ]
        selected = next(
            (row for row in candidates if row["value_real"] is not None),
            candidates[0] if candidates else None,
        )
        value = serialized_value(selected) if selected is not None else None
        if (
            field in {"sugars_g", "saturated_fat_g", "salt_g"}
            and value is not None
            and value["value"] is None
        ):
            value["value"] = conservative_unfavourable_value(value["raw"])
        if (
            field == "salt_g"
            and (value is None or value["value"] is None)
            and "10110" in rows
            and rows["10110"]["value_real"] is not None
        ):
            value = serialized_value(rows["10110"])
            value["value"] = rows["10110"]["value_real"] * 2.5 / 1000.0
            value["raw"] = (
                f"{value['value']:.6g} "
                "(derived from CIQUAL sodium × 2.5 / 1000)"
            )
            value["name_en"] = "Salt derived from sodium (g/100g)"
            value["name_fr"] = "Sel dérivé du sodium (g/100 g)"
        result[field] = value
    return result


def all_nutrients(
    connection: sqlite3.Connection, food_code: str
) -> list[dict[str, Any]]:
    rows = nutrient_rows(connection, food_code)
    return [serialized_value(rows[code]) for code in sorted(rows, key=int)]


def food_by_code(
    connection: sqlite3.Connection, code: str
) -> dict[str, Any] | None:
    row = connection.execute(
        "SELECT * FROM foods WHERE code = ?", (code,)
    ).fetchone()
    if row is None:
        return None
    return {
        "code": row["code"],
        "name_fr": row["name_fr"],
        "name_en": row["name_en"],
        "scientific_name": row["scientific_name"],
        "score": 1.0,
        "matched_language": None,
    }


def enrich_matches(
    connection: sqlite3.Connection,
    matches: list[dict[str, Any]],
    include_all: bool,
) -> list[dict[str, Any]]:
    for match in matches:
        match["nutrients"] = (
            all_nutrients(connection, match["code"])
            if include_all
            else core_nutrients(connection, match["code"])
        )
    return matches


def display_value(value: dict[str, Any] | None) -> str:
    if value is None:
        return "not available"
    rendered = value["raw"] or "not available"
    if value["confidence"]:
        rendered += f" (confidence {value['confidence']})"
    return rendered


def print_matches(matches: list[dict[str, Any]], include_all: bool) -> None:
    if not matches:
        print("No matching CIQUAL food found.")
        return
    for index, match in enumerate(matches, start=1):
        print(
            f"{index}. [{match['code']}] {match['name_fr']} "
            f"— match {match['score']:.0%}"
        )
        if match["name_en"]:
            print(f"   English: {match['name_en']}")
        nutrients = match["nutrients"]
        if include_all:
            for nutrient in nutrients:
                name = nutrient["name_en"] or nutrient["name_fr"]
                print(
                    f"   {name} [{nutrient['ciqual_constituent_code']}]: "
                    f"{display_value(nutrient)}"
                )
        else:
            for field, label, _codes in CORE_NUTRIENTS:
                print(f"   {label} ({field}): {display_value(nutrients[field])}")


def catalog_items(catalog: Path) -> Iterable[tuple[Path, dict[str, Any]]]:
    paths = sorted(catalog.rglob("*.json")) if catalog.is_dir() else [catalog]
    for path in paths:
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            print(f"Skipping {path}: {error}", file=sys.stderr)
            continue
        if isinstance(document, dict):
            items = document.get("items") or document.get("ingredients") or []
        elif isinstance(document, list):
            items = document
        else:
            items = []
        for item in items:
            if isinstance(item, dict) and isinstance(item.get("name"), str):
                yield path, item


def build_suggestions(
    connection: sqlite3.Connection,
    catalog: Path,
    output: Path,
    limit: int,
) -> None:
    suggestions = []
    item_count = 0
    for path, item in catalog_items(catalog):
        item_count += 1
        matches = search_foods(connection, item["name"], limit)
        enrich_matches(connection, matches, include_all=False)
        suggestions.append(
            {
                "file": str(path),
                "ingredient_key": item.get("key") or item.get("ingredient_key"),
                "ingredient_name": item["name"],
                "candidates": matches,
            }
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "catalog": str(catalog),
                "item_count": item_count,
                "instructions": (
                    "Review candidate codes before updating ingredient JSON. "
                    "A high text score does not prove that preparation state or "
                    "brand-specific nutrition is equivalent."
                ),
                "suggestions": suggestions,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {item_count} review entries to {output}")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search the local ANSES-CIQUAL 2025 food database."
    )
    parser.add_argument("query", nargs="?", help="French or English food name")
    parser.add_argument("--code", help="return one exact CIQUAL food code")
    parser.add_argument(
        "--limit", type=int, default=5, help="number of matches (default: 5)"
    )
    parser.add_argument(
        "--json", action="store_true", help="emit machine-readable JSON"
    )
    parser.add_argument(
        "--all-nutrients",
        action="store_true",
        help="return every CIQUAL constituent instead of the core facts",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        help="scan a JSON file/directory and create candidate suggestions",
    )
    parser.add_argument(
        "--suggestions",
        type=Path,
        default=SCRIPT_DIR / "ciqual_suggestions.json",
        help="batch suggestion output (default: CIQUAL/ciqual_suggestions.json)",
    )
    parser.add_argument(
        "--rebuild", action="store_true", help="force rebuilding the SQLite cache"
    )
    arguments = parser.parse_args()
    if arguments.limit < 1:
        parser.error("--limit must be at least 1")
    modes = sum(bool(value) for value in (arguments.query, arguments.code, arguments.catalog))
    if modes != 1:
        parser.error("provide exactly one of a query, --code, or --catalog")
    return arguments


def main() -> int:
    arguments = parse_arguments()
    with open_database(arguments.rebuild) as connection:
        if arguments.catalog:
            build_suggestions(
                connection,
                arguments.catalog,
                arguments.suggestions,
                arguments.limit,
            )
            return 0

        if arguments.code:
            item = food_by_code(connection, arguments.code)
            matches = [item] if item else []
        else:
            matches = search_foods(connection, arguments.query, arguments.limit)
        enrich_matches(connection, matches, arguments.all_nutrients)

        if arguments.json:
            print(json.dumps({"matches": matches}, ensure_ascii=False, indent=2))
        else:
            print_matches(matches, arguments.all_nutrients)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

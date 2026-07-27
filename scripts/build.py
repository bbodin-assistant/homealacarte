#!/usr/bin/env python3
"""Assemble the static site using only Python's standard library."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "sample-data")).resolve()
DIST = ROOT / "dist"


def json_paths(directory: Path) -> list[Path]:
    return sorted(
        path
        for path in directory.rglob("*.json")
        if path.is_file()
        and not any(part.startswith(".") for part in path.relative_to(directory).parts)
    )


if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir(parents=True)
shutil.copytree(ROOT / "www", DIST, dirs_exist_ok=True)
shutil.copytree(ROOT / "pkg", DIST / "pkg")
supabase_config = DIST / "supabase-config.js"
if not supabase_config.exists():
    shutil.copy2(ROOT / "www" / "supabase-config.example.js", supabase_config)

files = json_paths(DATA_DIR)
manifest_paths: list[str] = []
for source in files:
    relative = source.relative_to(DATA_DIR)
    destination = DIST / "data" / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    manifest_paths.append((Path("data") / relative).as_posix())

(DIST / "data-manifest.json").write_text(
    json.dumps({"version": 1, "files": manifest_paths}, ensure_ascii=False, indent=2)
    + "\n",
    encoding="utf-8",
)
(DIST / "build-meta.json").write_text(
    json.dumps(
        {"app": "homealacarte-static-web", "version": "0.1.0"},
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

print(f"Built {DIST} with {len(files)} JSON source files from {DATA_DIR}.")

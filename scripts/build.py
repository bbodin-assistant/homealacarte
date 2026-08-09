#!/usr/bin/env python3
"""Assemble the static site using only Python's standard library."""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "sample-data")).resolve()
DEMO_DATA_DIR = (ROOT / "sample-data").resolve()
DIST = ROOT / "dist"
INDEX_SOURCE = ROOT / "www" / "index.html"
WWW_ROOT = (ROOT / "www").resolve()
INCLUDE_PATTERN = re.compile(
    r"^[ \t]*\{\{ include: ([a-zA-Z0-9_./-]+) \}\}[ \t]*(?:\n|$)",
    re.MULTILINE,
)


def compose_html(source: Path, stack: tuple[Path, ...] = ()) -> str:
    resolved = source.resolve()
    if resolved in stack:
        chain = " -> ".join(str(path.relative_to(WWW_ROOT)) for path in (*stack, resolved))
        raise SystemExit(f"Cyclic HTML include: {chain}")
    try:
        resolved.relative_to(WWW_ROOT)
    except ValueError as error:
        raise SystemExit(f"HTML include escapes {WWW_ROOT}: {resolved}") from error
    if not resolved.is_file():
        raise SystemExit(f"Missing HTML include: {resolved}")
    content = resolved.read_text(encoding="utf-8")

    def expand(match: re.Match[str]) -> str:
        return compose_html(resolved.parent / match.group(1), (*stack, resolved))

    composed = INCLUDE_PATTERN.sub(expand, content)
    if "{{ include:" in composed:
        raise SystemExit(f"Malformed HTML include in {resolved}")
    return composed


index_source = compose_html(INDEX_SOURCE)
asset_versions = set(re.findall(r"homealacarte-(\d+)", index_source))
visible_versions = set(re.findall(r'class="app-version"[^>]*>v(\d+)</small>', index_source))
if len(asset_versions) != 1:
    raise SystemExit(f"Expected one asset version in {INDEX_SOURCE}, found {sorted(asset_versions)}")
APP_VERSION = asset_versions.pop()
if visible_versions != {APP_VERSION}:
    raise SystemExit(
        f"Visible app version {sorted(visible_versions)} does not match asset version {APP_VERSION}"
    )


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
(DIST / "index.html").write_text(index_source, encoding="utf-8")
shutil.rmtree(DIST / "views")
supabase_config = DIST / "supabase-config.js"
if not supabase_config.exists():
    shutil.copy2(ROOT / "www" / "supabase-config.example.js", supabase_config)

def copy_dataset(source_directory: Path, output_directory: str, manifest_name: str) -> int:
    files = json_paths(source_directory)
    manifest_paths: list[str] = []
    for source in files:
        relative = source.relative_to(source_directory)
        destination = DIST / output_directory / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        manifest_paths.append((Path(output_directory) / relative).as_posix())

    (DIST / manifest_name).write_text(
        json.dumps({"version": 1, "files": manifest_paths}, ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
    return len(files)


file_count = copy_dataset(DATA_DIR, "data", "data-manifest.json")
demo_file_count = copy_dataset(DEMO_DATA_DIR, "demo-data", "demo-data-manifest.json")
(DIST / "build-meta.json").write_text(
    json.dumps(
        {"app": "homealacarte-static-web", "version": APP_VERSION},
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

print(
    f"Built {DIST} with {file_count} JSON source files from {DATA_DIR} "
    f"and {demo_file_count} reset-demo files from {DEMO_DATA_DIR}."
)

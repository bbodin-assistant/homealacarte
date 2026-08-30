#!/usr/bin/env python3
"""Fail when source size or browser dependency boundaries regress."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_ROOTS = ("src", "tests", "www", "scripts")
SOURCE_SUFFIXES = {".css", ".html", ".js", ".mjs", ".py", ".rs"}
IGNORED_PARTS = {"dist", "pkg", "target", "__pycache__"}

# These coordinators intentionally keep their direct dependencies visible.
# New exceptions require an architectural rationale here and code review.
SIZE_EXCEPTIONS = {
    "www/core/purchases.js": (520, "coordinates purchase parsing, normalization, history, and stock updates"),
    "www/features/catalogue.js": (750, "coordinates catalogue rendering and both item editors"),
}


def default_limit(relative: str) -> int:
    path = Path(relative)
    if relative in {"www/app.js", "www/storage.js", "www/worker.js"}:
        return 400
    if path.parts[0] == "tests" or path.suffix in {".css", ".html"}:
        return 500
    if len(path.parts) > 1 and path.parts[:2] == ("www", "core"):
        return 500
    if path.parts[0] == "scripts":
        return 500
    return 700


def source_files() -> list[Path]:
    files: list[Path] = []
    for root_name in SOURCE_ROOTS:
        for path in (ROOT / root_name).rglob("*"):
            if (
                path.is_file()
                and path.suffix in SOURCE_SUFFIXES
                and not IGNORED_PARTS.intersection(path.relative_to(ROOT).parts)
            ):
                files.append(path)
    return sorted(files)


def main() -> None:
    errors: list[str] = []
    used_exceptions: set[str] = set()
    files = source_files()
    for path in files:
        relative = path.relative_to(ROOT).as_posix()
        lines = len(path.read_text(encoding="utf-8").splitlines())
        limit = default_limit(relative)
        if relative in SIZE_EXCEPTIONS:
            exception_limit, rationale = SIZE_EXCEPTIONS[relative]
            if lines > limit:
                used_exceptions.add(relative)
                limit = exception_limit
            if lines > exception_limit:
                errors.append(
                    f"{relative}: {lines} lines exceeds exception {exception_limit} ({rationale})"
                )
        elif lines > limit:
            errors.append(f"{relative}: {lines} lines exceeds limit {limit}")

    unused = set(SIZE_EXCEPTIONS) - used_exceptions
    for relative in sorted(unused):
        errors.append(f"{relative}: size exception is no longer needed; remove it")

    import_pattern = re.compile(r"(?:from|import\s*\()\s*[\"']([^\"']+)[\"']")
    for path in sorted((ROOT / "www" / "core").glob("*.js")):
        for dependency in import_pattern.findall(path.read_text(encoding="utf-8")):
            if "features/" in dependency:
                errors.append(
                    f"{path.relative_to(ROOT).as_posix()}: core must not import {dependency}"
                )

    if errors:
        raise SystemExit("Source boundary check failed:\n- " + "\n- ".join(errors))
    print(f"Source boundaries pass for {len(files)} files with {len(used_exceptions)} exceptions.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Fail a public release when private paths or credential-shaped values are tracked."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN_PATHS = (
    "data/",
    "dist/",
    "pkg/",
    "target/",
    ".env",
    "www/supabase-config.js",
)
SECRET_PATTERNS = {
    "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "Supabase secret key": re.compile(rb"\bsb_secret_[A-Za-z0-9_-]+"),
    "Supabase service-role key": re.compile(rb"service[_-]?role[^\\n]{0,80}\\beyJ[A-Za-z0-9_-]+", re.I),
}


def git(*arguments: str) -> str:
    return subprocess.check_output(
        ("git", *arguments),
        cwd=ROOT,
        text=True,
        encoding="utf-8",
    )


def main() -> int:
    tracked = [Path(path) for path in git("ls-files").splitlines() if path]
    problems: list[str] = []
    for path in tracked:
        normalized = path.as_posix()
        if any(
            normalized == prefix.rstrip("/") or normalized.startswith(prefix)
            for prefix in FORBIDDEN_PATHS
        ):
            problems.append(f"private/generated path is tracked: {normalized}")
            continue
        absolute = ROOT / path
        if not absolute.is_file():
            continue
        content = absolute.read_bytes()
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(content):
                problems.append(f"{label} found in {normalized}")

    history_paths = git(
        "log",
        "--format=",
        "--name-only",
        "--",
        "data",
        "dist",
        "www/supabase-config.js",
        ".env",
    ).strip()
    if history_paths:
        problems.append(
            "private paths exist in the current branch history; publish from a clean history"
        )

    if problems:
        print("Release check failed:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1

    print(f"Release check passed for {len(tracked)} tracked files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Upload one consolidated Home à la Carte JSON document to a Supabase account."""

from __future__ import annotations

import argparse
import getpass
import os
from pathlib import Path

from supabase_account import (
    SupabaseAccountClient,
    SupabaseError,
    build_private_state,
    environment_or_value,
    load_json_file,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_file", type=Path, help="consolidated Home à la Carte JSON file")
    parser.add_argument("--email", default=os.environ.get("HOMEALACARTE_EMAIL", ""))
    parser.add_argument("--password", default=os.environ.get("HOMEALACARTE_PASSWORD", ""))
    parser.add_argument("--project-url", default=os.environ.get("SUPABASE_PROJECT_URL", ""))
    parser.add_argument(
        "--publishable-key",
        default=os.environ.get("SUPABASE_PUBLISHABLE_KEY", ""),
    )
    parser.add_argument(
        "--language",
        help="account UI language tag; defaults to the existing account value, then en",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        project_url = environment_or_value(args.project_url, "SUPABASE_PROJECT_URL")
        publishable_key = environment_or_value(
            args.publishable_key, "SUPABASE_PUBLISHABLE_KEY"
        )
        email = environment_or_value(args.email, "HOMEALACARTE_EMAIL")
        password = args.password or getpass.getpass("Home à la Carte account password: ")
        if not password:
            raise SupabaseError("Missing HOMEALACARTE_PASSWORD")

        document = load_json_file(args.json_file)
        client = SupabaseAccountClient(project_url, publishable_key)
        access_token = client.sign_in(email, password)
        current = client.get_household_state(access_token)
        expected_revision = int(current.get("revision", 0)) if current else 0
        current_payload = current.get("payload") if current else None
        language = args.language
        if language is None and isinstance(current_payload, dict):
            language = str(current_payload.get("language") or "").strip() or None
        payload = build_private_state(document, language or "en")
        result = client.save_household_state(access_token, payload, expected_revision)
        print(
            f"Uploaded {args.json_file} for {email}; "
            f"online revision is now {result.get('revision')}."
        )
        return 0
    except (SupabaseError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Download one Supabase account's Home à la Carte data as consolidated JSON."""

from __future__ import annotations

import argparse
import getpass
import os
from pathlib import Path

from supabase_account import (
    SupabaseAccountClient,
    SupabaseError,
    consolidated_document_from_private_state,
    environment_or_value,
    write_json_file,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="destination JSON file")
    parser.add_argument("--email", default=os.environ.get("HOMEALACARTE_EMAIL", ""))
    parser.add_argument("--password", default=os.environ.get("HOMEALACARTE_PASSWORD", ""))
    parser.add_argument("--project-url", default=os.environ.get("SUPABASE_PROJECT_URL", ""))
    parser.add_argument(
        "--publishable-key",
        default=os.environ.get("SUPABASE_PUBLISHABLE_KEY", ""),
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

        client = SupabaseAccountClient(project_url, publishable_key)
        access_token = client.sign_in(email, password)
        current = client.get_household_state(access_token)
        if current is None:
            raise SupabaseError("This account has no online Home à la Carte data")
        document = consolidated_document_from_private_state(current.get("payload"))
        write_json_file(args.output, document)
        print(
            f"Downloaded revision {current.get('revision')} for {email} to {args.output}."
        )
        return 0
    except SupabaseError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    raise SystemExit(main())

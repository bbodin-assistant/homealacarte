from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from supabase_account import (  # noqa: E402
    DATA_SCHEMA_VERSION,
    SupabaseAccountClient,
    SupabaseError,
    build_private_state,
    consolidated_document_from_private_state,
    validate_consolidated_document,
)


def sample_document():
    return {
        "items": [{"key": "apple"}],
        "dishes": [],
        "people": [{"key": "person"}],
        "menu": [],
        "stock": [],
        "extra_needs": [],
    }


class DocumentConversionTests(unittest.TestCase):
    def test_upload_wrapper_round_trips_as_portable_json(self):
        document = sample_document()
        payload = build_private_state(document, "fr")

        self.assertEqual(payload["version"], DATA_SCHEMA_VERSION)
        self.assertEqual(payload["language"], "fr")
        self.assertEqual(payload["sources"][0]["path"], "homealacarte_data.json")
        self.assertEqual(consolidated_document_from_private_state(payload), document)

    def test_consolidated_document_rejects_missing_or_extra_sections(self):
        missing = sample_document()
        missing.pop("stock")
        with self.assertRaisesRegex(SupabaseError, "missing sections: stock"):
            validate_consolidated_document(missing)

        extra = sample_document()
        extra["private"] = []
        with self.assertRaisesRegex(SupabaseError, "unsupported sections: private"):
            validate_consolidated_document(extra)

    def test_download_prefers_current_consolidated_source(self):
        document = sample_document()
        payload = {
            "sources": [
                {"path": "old.json", "content": json.dumps({"items": []})},
                {
                    "path": "homealacarte_data.json",
                    "content": json.dumps(document),
                },
            ]
        }
        self.assertEqual(consolidated_document_from_private_state(payload), document)

    def test_command_names_are_download_and_upload(self):
        scripts = ROOT / "scripts"
        self.assertTrue((scripts / "download_supabase_json.py").is_file())
        self.assertTrue((scripts / "upload_supabase_json.py").is_file())
        self.assertFalse((scripts / "export_supabase_json.py").exists())
        self.assertFalse((scripts / "import_supabase_json.py").exists())

    def test_schema_version_matches_public_application(self):
        bootstrap = (ROOT / "www" / "core" / "bootstrap.js").read_text(encoding="utf-8")
        match = re.search(r"const DATA_SCHEMA_VERSION = (\d+);", bootstrap)
        self.assertIsNotNone(match)
        self.assertEqual(int(match.group(1)), DATA_SCHEMA_VERSION)


class FakeClient(SupabaseAccountClient):
    def __init__(self, responses):
        super().__init__("https://example.supabase.co", "publishable")
        self.responses = iter(responses)
        self.calls = []

    def _request(self, path, body, *, access_token=None):
        self.calls.append((path, body, access_token))
        return next(self.responses)


class SupabaseClientTests(unittest.TestCase):
    def test_login_and_revision_checked_save_use_app_rpcs(self):
        client = FakeClient(
            [
                {"access_token": "token"},
                {"payload": {"x": 1}, "revision": 7},
                {"status": "applied", "revision": 8},
            ]
        )
        token = client.sign_in("user@example.com", "secret")
        current = client.get_household_state(token)
        result = client.save_household_state(token, {"state": True}, current["revision"])

        self.assertEqual(result["revision"], 8)
        self.assertEqual(client.calls[0][0], "/auth/v1/token?grant_type=password")
        self.assertEqual(client.calls[1][0], "/rest/v1/rpc/get_household_state")
        self.assertEqual(client.calls[2][0], "/rest/v1/rpc/save_household_state")
        self.assertEqual(client.calls[2][1]["expected_revision"], 7)
        self.assertEqual(client.calls[2][2], "token")

    def test_conflict_is_not_overwritten(self):
        client = FakeClient([{"status": "conflict", "revision": 9}])
        with self.assertRaisesRegex(SupabaseError, "nothing was overwritten"):
            client.save_household_state("token", {"state": True}, 8)


if __name__ == "__main__":
    unittest.main()

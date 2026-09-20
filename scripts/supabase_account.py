#!/usr/bin/env python3
"""Small stdlib-only client for Home à la Carte's Supabase household document."""

from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DATA_SCHEMA_VERSION = 12
FULL_DOCUMENT_SECTIONS = (
    "items",
    "dishes",
    "people",
    "menu",
    "stock",
    "extra_needs",
)
DEFAULT_TIMEOUT_SECONDS = 30


class SupabaseError(RuntimeError):
    """Raised when Supabase authentication or document access fails."""


def _error_message(data: Any, fallback: str) -> str:
    if isinstance(data, dict):
        for key in ("msg", "message", "error_description", "hint", "error"):
            value = data.get(key)
            if value:
                return str(value)
    if isinstance(data, str) and data.strip():
        return data.strip()
    return fallback


def load_json_file(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SupabaseError(f"JSON file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SupabaseError(
            f"Invalid JSON in {path} at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
    if not isinstance(value, dict):
        raise SupabaseError("Home à la Carte JSON must be a top-level object")
    return value


def validate_consolidated_document(document: dict[str, Any]) -> None:
    actual = set(document)
    expected = set(FULL_DOCUMENT_SECTIONS)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    problems: list[str] = []
    if missing:
        problems.append(f"missing sections: {', '.join(missing)}")
    if extra:
        problems.append(f"unsupported sections: {', '.join(extra)}")
    for section in FULL_DOCUMENT_SECTIONS:
        if section in document and not isinstance(document[section], list):
            problems.append(f"{section} must be an array")
    if problems:
        raise SupabaseError("Invalid consolidated Home à la Carte JSON: " + "; ".join(problems))


def build_private_state(document: dict[str, Any], language: str) -> dict[str, Any]:
    validate_consolidated_document(document)
    normalized = json.loads(json.dumps(document, ensure_ascii=False))
    content = json.dumps(normalized, ensure_ascii=False, indent=2) + "\n"
    return {
        "version": DATA_SCHEMA_VERSION,
        "language": language,
        "people": normalized["people"],
        "menu": normalized["menu"],
        "stock": normalized["stock"],
        "customGrocery": normalized["extra_needs"],
        "sources": [{"path": "homealacarte_data.json", "content": content}],
    }


def consolidated_document_from_private_state(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SupabaseError("Online household payload is not an object")

    if set(FULL_DOCUMENT_SECTIONS).issubset(payload):
        document = {key: payload[key] for key in FULL_DOCUMENT_SECTIONS}
        validate_consolidated_document(document)
        return document

    sources = payload.get("sources")
    if not isinstance(sources, list) or not sources:
        raise SupabaseError("Online household payload does not contain JSON sources")

    preferred = next(
        (
            source
            for source in sources
            if isinstance(source, dict) and source.get("path") == "homealacarte_data.json"
        ),
        None,
    )
    source = preferred or (sources[0] if isinstance(sources[0], dict) else None)
    if not source or not isinstance(source.get("content"), str):
        raise SupabaseError("Online household JSON source is missing its content")

    try:
        document = json.loads(source["content"])
    except json.JSONDecodeError as exc:
        raise SupabaseError(
            f"Online household JSON is invalid at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
    if not isinstance(document, dict):
        raise SupabaseError("Online household JSON must be a top-level object")
    validate_consolidated_document(document)
    return document


def write_json_file(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def environment_or_value(value: str | None, name: str) -> str:
    resolved = (value or os.environ.get(name, "")).strip()
    if not resolved:
        raise SupabaseError(f"Missing {name}")
    return resolved


class SupabaseAccountClient:
    def __init__(
        self,
        project_url: str,
        publishable_key: str,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.project_url = project_url.rstrip("/")
        self.publishable_key = publishable_key
        self.timeout_seconds = timeout_seconds
        if not self.project_url.startswith(("https://", "http://")):
            raise SupabaseError("SUPABASE_PROJECT_URL must start with http:// or https://")
        if not self.publishable_key:
            raise SupabaseError("SUPABASE_PUBLISHABLE_KEY is empty")

    def _request(
        self,
        path: str,
        body: Any,
        *,
        access_token: str | None = None,
    ) -> Any:
        headers = {
            "apikey": self.publishable_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        request = urllib.request.Request(
            f"{self.project_url}{path}",
            data=json.dumps(body).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                data = raw
            raise SupabaseError(
                _error_message(data, f"Supabase request failed with HTTP {exc.code}")
            ) from exc
        except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
            reason = getattr(exc, "reason", exc)
            raise SupabaseError(f"Unable to reach Supabase: {reason}") from exc

        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise SupabaseError("Supabase returned a non-JSON response") from exc

    def sign_in(self, email: str, password: str) -> str:
        data = self._request(
            "/auth/v1/token?grant_type=password",
            {"email": email, "password": password},
        )
        token = data.get("access_token") if isinstance(data, dict) else None
        if not token:
            raise SupabaseError("Supabase returned an invalid login session")
        return str(token)

    def get_household_state(self, access_token: str) -> dict[str, Any] | None:
        data = self._request(
            "/rest/v1/rpc/get_household_state",
            {},
            access_token=access_token,
        )
        if data is None:
            return None
        if not isinstance(data, dict):
            raise SupabaseError("Supabase returned an invalid household state")
        return data

    def save_household_state(
        self,
        access_token: str,
        payload: dict[str, Any],
        expected_revision: int,
    ) -> dict[str, Any]:
        data = self._request(
            "/rest/v1/rpc/save_household_state",
            {
                "new_payload": payload,
                "expected_revision": expected_revision,
            },
            access_token=access_token,
        )
        if not isinstance(data, dict):
            raise SupabaseError("Supabase returned an invalid save result")
        if data.get("status") == "conflict":
            raise SupabaseError(
                "Online data changed while uploading; nothing was overwritten. Run the upload again."
            )
        if data.get("status") != "applied":
            raise SupabaseError(f"Unexpected Supabase save status: {data.get('status')!r}")
        return data

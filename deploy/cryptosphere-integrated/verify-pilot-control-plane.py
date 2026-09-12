#!/usr/bin/env python3
"""Validate CryptoSphere Pilot governance/control-plane invariants without deploying."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE_PATH = ROOT / "PILOT_STATE.json"
MANIFEST_PATH = ROOT / "SHA256.txt"

EXPECTED_PROJECT = "d97e67d0-aa94-43f1-b727-d63deadecbf0"
EXPECTED_ENVIRONMENT = "813e5b56-edf8-413a-9725-47732474d61f"
EXPECTED_SERVICE = "7c0e7b73-2e9b-41e0-9f78-4df4e9b0a52d"
OWNER_FILE = "cryptosphere-owner-runtime.zip"
CORE_FILE = "cryptosphere-core-runtime.zip"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"PILOT CONTROL-PLANE GATE: FAIL — {message}")


def parse_manifest() -> dict[str, str]:
    result: dict[str, str] = {}
    for raw in MANIFEST_PATH.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        digest, filename = raw.split(None, 1)
        result[filename.strip()] = digest.strip().lower()
    return result


state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
manifest = parse_manifest()

require(state.get("schema_version") == "1.0", "unexpected state schema")
require(state.get("program") == "CryptoSphere", "wrong program")
require(state.get("stage") == "PILOT", "wrong lifecycle stage")
require(state.get("disposition") == "HOLD", "Pilot must remain HOLD until certified")

authority = state.get("authority", {})
require(authority.get("mode") == "ADVISORY_ONLY", "authority mode is not ADVISORY_ONLY")
require(authority.get("production_execution") is False, "production execution must be false")
require(authority.get("autonomous_policy_change") is False, "autonomous policy change must be false")
require(authority.get("autonomous_deployment") is False, "autonomous deployment must be false")
require(authority.get("human_governance_required") is True, "human governance must be required")

gates = state.get("gates", {})
require(gates.get("railway_pilot_deployment") == "NOT_STARTED", "Railway deployment state changed")
require(gates.get("hosted_acceptance") == "NOT_STARTED", "hosted acceptance cannot precede deployment")
require(gates.get("external_canary") == "DISABLED", "external canary must remain disabled")
require(gates.get("human_go_hold") == "HOLD", "human GO/HOLD gate must remain HOLD")

boundary = state.get("railway_boundary", {})
require(boundary.get("project_id") == EXPECTED_PROJECT, "unexpected Railway project boundary")
require(boundary.get("environment_id") == EXPECTED_ENVIRONMENT, "unexpected Railway environment boundary")
require(boundary.get("service_id") == EXPECTED_SERVICE, "unexpected Railway service boundary")
require(boundary.get("source_deployment_started") is False, "source deployment must not be started")
require(boundary.get("public_domain_enabled") is False, "public domain must remain disabled")
require(boundary.get("external_canary_allowed") is False, "external canary authority must remain false")
require(boundary.get("promotion_allowed") is False, "promotion authority must remain false")

requirements = state.get("artifact_requirements", {})
owner_sha = requirements.get("owner_runtime_sha256", "").lower()
core_sha = requirements.get("core_runtime_sha256", "").lower()
require(len(owner_sha) == 64 and all(c in "0123456789abcdef" for c in owner_sha), "invalid Owner digest")
require(len(core_sha) == 64 and all(c in "0123456789abcdef" for c in core_sha), "invalid Core digest")
require(manifest.get(OWNER_FILE) == owner_sha, "Owner state digest disagrees with SHA256.txt")
require(manifest.get(CORE_FILE) == core_sha, "Core state digest disagrees with SHA256.txt")
require(requirements.get("manifest_must_not_be_changed_to_match_bad_bytes") is True, "manifest anti-blessing invariant missing")
require(requirements.get("owner_runtime_size_bytes") == 27977, "approved Owner byte count changed")
require(requirements.get("core_runtime_size_bytes") == 95596, "approved Core byte count changed")

print("PILOT CONTROL-PLANE GATE: PASS")
print("Governance, authority, artifact binding, and isolated Railway boundary remain fail-closed.")
print("No deployment, promotion, external contact, secret access, or authority increase was performed.")

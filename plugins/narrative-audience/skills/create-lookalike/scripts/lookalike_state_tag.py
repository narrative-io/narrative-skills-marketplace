#!/usr/bin/env python3
"""Encode/decode the Lookalike Studio wizard-state dataset tag.

The platform UI serializes the builder state into a dataset tag of the
form `_nio_lookalike_serialization=<base64 of UTF-8 JSON>` so an
audience can be reopened in the Lookalike Studio wizard for editing.
This script reproduces that encoding so skill-built audiences are
re-editable in the UI, and decodes existing tags for inspection.

Dependencies: Python 3.8+ standard library only. No network access.

Usage:
    lookalike_state_tag.py encode < state.json
        Read the builder-state JSON on stdin, print the tag on stdout.
    lookalike_state_tag.py decode '<tag>'
        Print the decoded state JSON (pretty) on stdout. The tag may
        also be piped on stdin if the argument is omitted.

Encode input shape (all five keys required; `version` is added
automatically):
    {
      "seedDatasetName": "premium_subscribers",
      "populationDatasetName": "acme_population",
      "classifiedAttributes": [<ClassifiedAttribute>, ...],
      "seedIdentityAttributes": [<ClassifiedAttribute>, ...],
      "outputConfig": {
        "outputMode": "size" | "score",
        "outputValue": <number > 0>,
        "includeSeedUsers": <bool>
      }
    }

ClassifiedAttribute (as produced by the classification phase):
    {
      "field": "_rosetta_stone.user.country",
      "displayName": "User - Country",
      "type": "categorical" | "continuous",
      "cardinality": <int or null>,
      "extractionExpr": "company_data.\"ds\".\"_rosetta_stone\"...",
      "source": "rosetta_stone" | "dataset_column",
      "dataType": {"type": "string"},
      "enums": ["..."],            # optional
      "role": "identity" | "feature" | "metadata"
    }

Exits 0 on success; non-zero with a message on stderr for invalid
input. Never truncates: the tag embeds the full state and can be
several KB for wide feature sets — that matches the UI's behavior.
"""

import base64
import json
import sys

TAG_PREFIX = "_nio_lookalike_serialization="
CURRENT_VERSION = 1

REQUIRED_STATE_KEYS = (
    "seedDatasetName",
    "populationDatasetName",
    "classifiedAttributes",
    "seedIdentityAttributes",
    "outputConfig",
)
REQUIRED_ATTR_KEYS = (
    "field",
    "displayName",
    "type",
    "cardinality",
    "extractionExpr",
    "source",
    "dataType",
    "role",
)
OUTPUT_MODES = ("size", "score")


def fail(message: str) -> "NoReturn":  # noqa: F821 - py3.8 typing
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def validate_state(state: dict) -> None:
    for key in REQUIRED_STATE_KEYS:
        if not state.get(key):
            fail(f"missing or empty required key: {key}")

    for list_key in ("classifiedAttributes", "seedIdentityAttributes"):
        attrs = state[list_key]
        if not isinstance(attrs, list):
            fail(f"{list_key} must be a list")
        for i, attr in enumerate(attrs):
            if not isinstance(attr, dict):
                fail(f"{list_key}[{i}] must be an object")
            missing = [k for k in REQUIRED_ATTR_KEYS if k not in attr]
            if missing:
                fail(f"{list_key}[{i}] missing keys: {', '.join(missing)}")

    cfg = state["outputConfig"]
    if cfg.get("outputMode") not in OUTPUT_MODES:
        fail(f"outputConfig.outputMode must be one of {OUTPUT_MODES}")
    value = cfg.get("outputValue")
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
        fail("outputConfig.outputValue must be a number > 0")
    if not isinstance(cfg.get("includeSeedUsers"), bool):
        fail("outputConfig.includeSeedUsers must be a boolean")


def encode(state: dict) -> str:
    validate_state(state)
    payload = {
        "version": CURRENT_VERSION,
        "seedDatasetName": state["seedDatasetName"],
        "populationDatasetName": state["populationDatasetName"],
        "classifiedAttributes": state["classifiedAttributes"],
        "seedIdentityAttributes": state["seedIdentityAttributes"],
        "outputConfig": state["outputConfig"],
    }
    # Compact separators + no ASCII escaping mirrors JSON.stringify, and
    # the UI base64-encodes the raw UTF-8 bytes (TextEncoder + btoa).
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return TAG_PREFIX + base64.b64encode(raw).decode("ascii")


def decode(tag: str) -> dict:
    tag = tag.strip()
    if not tag.startswith(TAG_PREFIX):
        fail(f"tag does not start with {TAG_PREFIX!r}")
    try:
        raw = base64.b64decode(tag[len(TAG_PREFIX):], validate=True)
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:  # malformed base64 / UTF-8 / JSON
        fail(f"could not decode tag payload: {exc}")
    if not isinstance(payload, dict) or not payload.get("version"):
        fail("decoded payload is not a versioned state object")
    validate_state(payload)
    return payload


def main(argv: list) -> int:
    if len(argv) < 2 or argv[1] not in ("encode", "decode"):
        print(__doc__, file=sys.stderr)
        return 2

    if argv[1] == "encode":
        try:
            state = json.load(sys.stdin)
        except json.JSONDecodeError as exc:
            fail(f"stdin is not valid JSON: {exc}")
        print(encode(state))
    else:
        tag = argv[2] if len(argv) > 2 else sys.stdin.read()
        print(json.dumps(decode(tag), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

#!/usr/bin/env python3
"""Build Gate B per-head capture fixtures from fixture-nyc/nyc-shared.json."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURE_DIR = ROOT / "fixture-nyc"
SHARED_PATH = FIXTURE_DIR / "nyc-shared.json"
HEADS_DIR = FIXTURE_DIR / "heads"
BUDGET_SCRIPT = ROOT / "scripts" / "gateb_head_budget_lines.mjs"


def load_shared_trip_source() -> dict:
    if not SHARED_PATH.is_file():
        raise SystemExit(f"Missing trip source: {SHARED_PATH}")
    payload = json.loads(SHARED_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise SystemExit(f"Expected object in {SHARED_PATH}")
    return payload


def fill_budget(shared: dict, repo_root: Path = ROOT) -> list:
    """Run the checkout's gateb_head_budget_lines.mjs (syncSharedTripApiBudget)."""
    if not BUDGET_SCRIPT.is_file():
        raise SystemExit(f"Missing budget script: {BUDGET_SCRIPT}")
    trip = dict(shared)
    trip["budget"] = []
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
        json.dump(trip, handle)
        temp_path = Path(handle.name)
    try:
        out = subprocess.check_output(
            ["node", str(BUDGET_SCRIPT), str(temp_path)],
            cwd=repo_root,
            text=True,
        )
        budget = json.loads(out)
    finally:
        temp_path.unlink(missing_ok=True)
    if not isinstance(budget, list):
        raise SystemExit("gateb_head_budget_lines did not return a budget array")
    return budget


def build_head_fixture(sha: str, repo_root: Path = ROOT) -> Path:
    normalized = sha.strip().lower()
    if len(normalized) < 8:
        raise SystemExit("head sha must be at least 8 characters")
    shared = load_shared_trip_source()
    shared["budget"] = fill_budget(shared, repo_root=repo_root)
    HEADS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = HEADS_DIR / f"{normalized}.json"
    out_path.write_text(f"{json.dumps(shared, separators=(',', ':'))}\n", encoding="utf-8")
    return out_path


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if not args:
        print("Usage: build_head_fixture.py <head-sha>", file=sys.stderr)
        return 1
    out = build_head_fixture(args[0])
    payload = json.loads(out.read_text(encoding="utf-8"))
    budget = payload.get("budget") if isinstance(payload.get("budget"), list) else []
    print(
        json.dumps(
            {
                "ok": True,
                "wrote": str(out),
                "budget_rows": len(budget),
                "southwest_rows": sum(
                    1
                    for line in budget
                    if isinstance(line, dict) and "Southwest LAS" in str(line.get("name", ""))
                ),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

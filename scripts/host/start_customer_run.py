#!/usr/bin/env python3
"""Repo copy installed to tsv-dispatch/bin/start_customer_run.py.

Story lopez runs the trip_state arm and stops after 50 customer messages.
The run is done only when the itinerary is stored and every finish artifact
is present. This file does not schedule itself.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

LOPEZ_CUSTOMER = "1"
LOPEZ_STORY_ID = "vk-001"
LOPEZ_BACKEND = "trip_state"
LOPEZ_MAX_TURNS = 50
FINISH_ARTIFACTS = (
    "dialog-pdf",
    "keepsake-pdf",
    "screenshots",
    "admin-dialog",
    "admin-turns",
    "admin-astra-json",
    "admin-timing-summary",
)


def lopez_plan():
    return {
        "story": "lopez",
        "customer": LOPEZ_CUSTOMER,
        "story_id": LOPEZ_STORY_ID,
        "reply_backend": LOPEZ_BACKEND,
        "max_turns": LOPEZ_MAX_TURNS,
    }


def _pdf(path):
    if not path.is_file() or path.stat().st_size < 5:
        return False
    return path.read_bytes()[:5] == b"%PDF-"


def artifact_states(run_dir, record):
    declared = dict((record or {}).get("artifacts") or {})
    for name in FINISH_ARTIFACTS:
        declared.setdefault(name, "missing")
    if not _pdf(Path(run_dir) / "dialog.pdf"):
        declared["dialog-pdf"] = "missing"
        declared["admin-dialog"] = "missing"
    if not _pdf(Path(run_dir) / "keepsake.pdf"):
        declared["keepsake-pdf"] = "missing"
    shots = list((Path(run_dir) / "screens").glob("*.png")) if (Path(run_dir) / "screens").is_dir() else []
    if not shots:
        declared["screenshots"] = "missing"
    return {name: declared[name] for name in FINISH_ARTIFACTS}


def ring_message(states):
    return "\n".join(f"{name}: {states[name]}" for name in FINISH_ARTIFACTS)


def run_done(record, states, harness_ok):
    count = record.get("itineraryCount")
    stored = isinstance(count, int) and count > 0
    complete = all(states[name] == "present" for name in FINISH_ARTIFACTS)
    return bool(harness_ok and stored and complete)


def load_record(run_dir):
    path = Path(run_dir) / "finish-artifacts.json"
    if not path.is_file():
        return {"itineraryCount": None, "artifacts": {}}
    return json.loads(path.read_text())


def evaluate(run_dir, harness_ok=True):
    record = load_record(run_dir)
    states = artifact_states(run_dir, record)
    done = run_done(record, states, harness_ok)
    return {"done": done, "ring": ring_message(states), "itineraryCount": record.get("itineraryCount")}


def launch(repo, run_id, roster, out_root):
    plan = lopez_plan()
    env = os.environ.copy()
    env["VK_TEST_MAX_TURNS"] = str(plan["max_turns"])
    cmd = [
        "node", "scripts/vk-customer-harness.mjs",
        "--roster", roster,
        "--customer", plan["customer"],
        "--reply-backend", plan["reply_backend"],
        "--run-id", run_id,
        "--out-root", out_root,
    ]
    completed = subprocess.run(cmd, cwd=repo, env=env)
    run_dir = Path(out_root) / run_id / plan["story_id"]
    result = evaluate(run_dir, harness_ok=completed.returncode == 0)
    sys.stdout.write(result["ring"] + "\n")
    return 0 if result["done"] else 1


def main(argv):
    parser = argparse.ArgumentParser(description="Start one Lopez customer run")
    parser.add_argument("story", nargs="?", default="lopez")
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--check", default="")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--repo", default="")
    parser.add_argument("--roster", default="")
    parser.add_argument("--out-root", default="")
    args = parser.parse_args(argv)
    if args.story != "lopez":
        sys.stderr.write("refused: story must be lopez\n")
        return 2
    if args.plan:
        sys.stdout.write(json.dumps(lopez_plan()) + "\n")
        return 0
    if args.check:
        result = evaluate(args.check, harness_ok=True)
        sys.stdout.write(result["ring"] + "\n")
        return 0 if result["done"] else 1
    if not args.run_id or not args.repo or not args.roster or not args.out_root:
        sys.stderr.write("refused: --run-id --repo --roster and --out-root are required\n")
        return 2
    return launch(args.repo, args.run_id, args.roster, args.out_root)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

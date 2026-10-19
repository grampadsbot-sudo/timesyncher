"""Gate B judgment inbox. The managing dr reads requests and supplies verdicts.

No model subprocess, paid fallback, or usage/reset dependency. A missing or
invalid receipt returns None so existing Gate B checks continue to fail closed.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import tempfile

ROOT = os.path.expanduser("~/tsv-gateb/dr-description-judgments")
REVIEWERS = {"gpt", "claude-code", "grok", "dr-eggbot"}


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".judge-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(value, f, indent=2, sort_keys=True)
            f.write("\n")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


class ManagingDrJudgmentPending(RuntimeError):
    """No qualitative verdict yet; a harness pause, never a coder failure."""


class ManagingDrJudge:
    def __init__(self, cache_path=ROOT, cap=60, offline=False, usage=True):
        self.root = Path(cache_path)
        self.cap, self.offline = cap, offline
        self.calls = self.hits = self.skipped = 0
        self.gate = "managing dr judgment required"
        self.context = "unbound"
        self.pending_keys = set()

    def bind_capture(self, cand_dir):
        path = Path(cand_dir)
        regions = (path / "capture-regions.json").read_bytes()
        try:
            manifest = json.loads((path / "capture-manifest.json").read_text())
        except (OSError, ValueError):
            manifest = {}
        self.context = hashlib.sha256(regions + str(manifest.get("capture_fixture_sha256") or manifest.get("fixture_sha256") or "").encode()).hexdigest()

    def request(self, cat, name, price, text, rubric=None, scope=None, reviews=None, ask=None):
        body = {"schema": 1, "context": self.context, "cat": cat,
                "name": name, "price": price, "text": text,
                "rubric": rubric or self.rubrics.get(cat, ""),
                "scope": scope, "reviews": reviews or [], "ask": ask,
                "standard": "score 1-5; pass requires >=4 and non-generic; unchanged category rubric"}
        key = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        return {"key": key, "input": body}

    @staticmethod
    def valid_receipt(receipt, request):
        if not isinstance(receipt, dict) or receipt.get("key") != request["key"] or receipt.get("input") != request["input"]:
            return False
        if receipt.get("reviewer") not in REVIEWERS or not str(receipt.get("reason") or "").strip():
            return False
        try:
            stamp = datetime.datetime.fromisoformat(receipt["reviewed_at"].replace("Z", "+00:00"))
            if stamp.tzinfo is None or stamp > datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5):
                return False
        except (KeyError, TypeError, ValueError, AttributeError):
            return False
        value = receipt.get("verdict")
        return (isinstance(value, dict) and type(value.get("score")) is int and 1 <= value["score"] <= 5
                and type(value.get("generic")) is bool and isinstance(value.get("missing"), list)
                and all(isinstance(x, str) for x in value["missing"]))

    def judge(self, cat, name, price, text, rubric=None, scope=None, reviews=None, ask=None):
        request = self.request(cat, name, price, text, rubric, scope, reviews, ask)
        key = request["key"]
        try:
            receipt = json.loads((self.root / "verdicts" / (key + ".json")).read_text())
        except (OSError, ValueError):
            receipt = None
        if self.valid_receipt(receipt, request):
            self.hits += 1
            return dict(receipt["verdict"], cat=cat)
        if not self.offline and self.context != "unbound":
            atomic_json(self.root / "pending" / (key + ".json"), request)
            self.pending_keys.add(key)
        self.skipped += 1
        return None

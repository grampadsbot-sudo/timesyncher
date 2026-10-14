"""Collect qualitative checks from a saved capture; no build or Gate B round."""
import argparse
import json
from pathlib import Path
import restore_check as rc

parser = argparse.ArgumentParser()
parser.add_argument("capture")
args = parser.parse_args()
judge = rc.DescJudge()
judge.bind_capture(args.capture)
regions = json.loads((Path(args.capture) / "capture-regions.json").read_text())
reasons = []
for shot, reg in regions.items():
    if shot.startswith(rc.LIST_PREFIX) and not shot.endswith("-top.png"):
        vw, vh = reg.get("viewport") or [0, 0]
        reasons.extend(rc.structure_extras(shot, reg, reg.get("struct") or {}, regions, judge, vw, vh, False))
    if rc.DETAIL_RE.match(shot):
        reasons.extend(rc.detail_reasons(shot, reg, judge))
print(json.dumps({"context": judge.context, "pending": len(judge.pending_keys), "receipt_hits":judge.hits,
                  "not_judged": judge.skipped, "quality_failures":sorted(set(r for r in reasons if r.startswith(("description quality", "summary", "review sample"))))}, indent=2))

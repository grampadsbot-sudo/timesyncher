#!/usr/bin/env python3
"""Fail if a GitHub Actions workflow would let a pixel-diff step fail the run.

Craig 2026-11-12 1:56 PM PT: remove pixel compare from VK CI completely.
Screenshots may still be captured as review-only artifacts (continue-on-error
or an explicit advisory/upload-only step). Blocking gates stay DOM / layout /
behavior / unit-tests / secrets.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"
PIXEL_RE = re.compile(
    r"(pixelmatch|pixel-?diff|pixel_diff|pixel.?compare|image-?diff|screenshot.?diff|looks-?same|odiff|reg-?cli)",
    re.I,
)
ADVISORY_RE = re.compile(r"(continue-on-error\s*:\s*true|advisory|artifacts? only|review-only|does not block)", re.I)
COMMENT_RE = re.compile(r"^\s*#")


def workflow_files():
    if not WORKFLOWS.is_dir():
        return []
    return sorted(list(WORKFLOWS.glob("*.yml")) + list(WORKFLOWS.glob("*.yaml")))


def blocking_hits(text: str, rel: str):
    hits = []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if COMMENT_RE.match(line) or not PIXEL_RE.search(line):
            continue
        stripped = line.lstrip()
        if not (stripped.startswith("run:") or stripped.startswith("uses:") or stripped.startswith("- run:") or stripped.startswith("- uses:")):
            continue
        window = "\n".join(lines[max(0, i - 12) : min(len(lines), i + 8)])
        if ADVISORY_RE.search(window) or ADVISORY_RE.search(line):
            continue
        hits.append("%s:%d: blocking pixel-diff CI step: %s" % (rel, i + 1, line.strip()))
    return hits



def main():
    bad = []
    for path in workflow_files():
        rel = path.relative_to(ROOT).as_posix()
        bad.extend(blocking_hits(path.read_text(), rel))
    if bad:
        print("Blocking pixel-diff CI is not allowed (Craig 11/12 1:56 PM PT):")
        print("\n".join(bad))
        return 1
    print("OK: no blocking pixel-diff steps in %d workflow file(s)" % len(workflow_files()))
    return 0


if __name__ == "__main__":
    sys.exit(main())

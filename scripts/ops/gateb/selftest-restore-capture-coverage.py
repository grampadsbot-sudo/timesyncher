#!/usr/bin/env python3
"""Capture-coverage selftest for restore-check.mjs (issue #433 follow-up).

Off-frame / clipped row logo chips must report capture coverage gap, not no glyph drawn.
In-frame blank chips must still fail with no glyph drawn."""
import json
import os
import struct
import subprocess
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "selftest-restore-capture-coverage")
FAILS = []


def png(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(c for x in range(w) for c in px(x, y)) for y in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    with open(path, "wb") as fh:
        fh.write(
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw))
            + chunk(b"IEND", b"")
        )


def blank_chip_image(path, w, h, box):
    bx, by, bw, bh = box

    def px(x, y):
        if bx <= x < bx + bw and by <= y < by + bh:
            return (248, 250, 252)
        return (255, 255, 255)

    png(path, w, h, px)


def run_restore(spec, base, cand, name):
    sp = os.path.join(OUT, name + "-spec.json")
    with open(sp, "w", encoding="utf-8") as fh:
        json.dump(spec, fh)
    proc = subprocess.run(
        ["node", os.path.join(HERE, "restore-check.mjs"), base, cand, sp],
        capture_output=True,
        text=True,
        cwd=HERE,
        timeout=120,
    )
    if proc.returncode != 0:
        return None, f"restore-check exit {proc.returncode}: {proc.stderr.strip()}"
    line = proc.stdout.strip().splitlines()[-1]
    return json.loads(line), None


def case(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (("  [" + detail + "]") if detail else ""))
    if not cond:
        FAILS.append(name)


def main():
    os.makedirs(OUT, exist_ok=True)
    w, h = 390, 120
    regions = {"ok": True, "viewport": [w, h], "struct": {"tabs": []}, "items": []}
    base_spec = {
        "structure": True,
        "need_regions": False,
        "top": True,
        "pending_masks": [],
        "max_allowed_pct": 100,
        "icon_search_px": 4,
        "day_map": False,
        "map_below_fold": False,
        "tab_boxes": [],
        "regions": regions,
    }

    # Chip mostly above the screenshot (clipped / off-frame): coverage gap, not no glyph.
    off_box = [20, -14, 48, 28]
    off_base = os.path.join(OUT, "off-base.png")
    off_cand = os.path.join(OUT, "off-cand.png")
    blank_chip_image(off_base, w, h, off_box)
    blank_chip_image(off_cand, w, h, off_box)
    off_spec = {
        **base_spec,
        "file": "off-frame-chip.png",
        "overlay": os.path.join(OUT, "ov-off.png"),
        "logo_chips": [{"name": "Clip Me", "box": list(off_box)}],
    }
    res, err = run_restore(off_spec, off_base, off_cand, "off-frame")
    if err:
        case("off-frame chip reports capture coverage gap", False, err)
    else:
        cov = [r for r in res.get("reasons", []) if r.startswith("capture coverage gap")]
        logo_centre = [r for r in res.get("reasons", []) if r.startswith("logo not vertically centred")]
        no_glyph = any("no glyph drawn" in r for r in logo_centre)
        case("off-frame chip reports capture coverage gap", len(cov) == 1 and "Clip Me" in cov[0], str(res.get("reasons")))
        case("off-frame chip not no glyph drawn", not no_glyph, str(logo_centre))

    # Same chip box: clipped capture frame -> coverage gap; full capture frame -> no glyph drawn.
    shared_box = [20, 20, 48, 28]
    shared_base = os.path.join(OUT, "shared-base.png")
    shared_cand = os.path.join(OUT, "shared-cand.png")
    blank_chip_image(shared_base, w, h, shared_box)
    blank_chip_image(shared_cand, w, h, shared_box)
    chip = [{"name": "Shared Row", "box": list(shared_box)}]
    clip_spec = {
        **base_spec,
        "file": "shared-clipped-chip.png",
        "overlay": os.path.join(OUT, "ov-shared-clip.png"),
        "logo_chips": chip,
        "capture_frame": {"x": 0, "y": 0, "width": w, "height": 40},
    }
    res, err = run_restore(clip_spec, shared_base, shared_cand, "shared-clip")
    if err:
        case("same chip clipped frame -> coverage gap", False, err)
    else:
        cov = [r for r in res.get("reasons", []) if r.startswith("capture coverage gap")]
        logo_centre = [r for r in res.get("reasons", []) if r.startswith("logo not vertically centred")]
        case("same chip clipped frame -> coverage gap", len(cov) == 1 and "Shared Row" in cov[0], str(res.get("reasons")))
        case("same chip clipped frame not no glyph", not any("no glyph drawn" in r for r in logo_centre), str(logo_centre))

    full_spec = {
        **base_spec,
        "file": "shared-full-blank-chip.png",
        "overlay": os.path.join(OUT, "ov-shared-full.png"),
        "logo_chips": chip,
        "capture_frame": {"x": 0, "y": 0, "width": w, "height": h},
    }
    res, err = run_restore(full_spec, shared_base, shared_cand, "shared-full")
    if err:
        case("same chip full frame blank -> no glyph drawn", False, err)
    else:
        logo_centre = [r for r in res.get("reasons", []) if r.startswith("logo not vertically centred")]
        no_glyph = any("row logo Shared Row (no glyph drawn)" in r for r in logo_centre)
        cov = [r for r in res.get("reasons", []) if r.startswith("capture coverage gap")]
        case("same chip full frame blank -> no glyph drawn", no_glyph, str(logo_centre))
        case("same chip full frame not coverage gap", len(cov) == 0, str(res.get("reasons")))

    if FAILS:
        print("FAILED:", ", ".join(FAILS))
        return 1
    print("restore-capture-coverage selftest ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())

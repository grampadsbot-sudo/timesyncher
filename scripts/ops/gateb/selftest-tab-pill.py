#!/usr/bin/env python3
"""Tab-pill centring selftest for restore-check.mjs (issue #432).

Centred synthetic pills must PASS; 2 px low controls must FAIL.
Covers viewport widths 1280 and 390 and odd/even pill heights at 0.5 px tolerance.
Row logo chips stay on ink-bbox (one regression case). Exits non-zero on any failure."""
import json
import os
import struct
import subprocess
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "selftest-tab-pill")
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


def pill_image(path, w, pill, glyph):
    px_, py_, pw, ph = pill
    gx0, gy0, gx1, gy1 = glyph

    def px(x, y):
        if px_ <= x < px_ + pw and py_ <= y < py_ + ph:
            if x in (px_, px_ + pw - 1) or y in (py_, py_ + ph - 1):
                return (209, 213, 219)
            if gx0 <= x < gx1 and gy0 <= y < gy1:
                return (120, 120, 120)
            return (255, 255, 255)
        return (255, 255, 255)

    png(path, w, py_ + ph + 40, px)


def centred_glyph(pill):
    px_, py_, pw, ph = pill
    cc = py_ + ph / 2.0
    half = 5
    gy0 = int(round(cc - half))
    gy1 = int(round(cc + half))
    return (px_ + 10, gy0, px_ + pw - 10, gy1 + 1)


def low_glyph(pill, delta_px=2):
    gx0, gy0, gx1, gy1 = centred_glyph(pill)
    return (gx0, gy0 + delta_px, gx1, gy1 + delta_px)


def run_tab_check(name, w, pill, glyph, expect_fail=False):
    base = os.path.join(OUT, "base-" + name)
    cand = os.path.join(OUT, "cand-" + name)
    pill_image(base, w, pill, glyph)
    pill_image(cand, w, pill, glyph)
    tab = {"text": "Hotels", "box": list(pill), "icon": [pill[0] + 8, pill[1] + 4, 14, 14], "active": True}
    spec = {
        "file": name,
        "structure": True,
        "need_regions": False,
        "top": True,
        "pending_masks": [],
        "max_allowed_pct": 100,
        "icon_search_px": 4,
        "overlay": os.path.join(OUT, "ov-" + name),
        "day_map": False,
        "map_below_fold": False,
        "day_mapped_places": None,
        "tab_boxes": [tab],
        "logo_chips": [],
        "regions": {"ok": True, "viewport": [w, pill[1] + pill[3] + 40], "struct": {"tabs": [tab]}, "items": []},
    }
    sp = os.path.join(OUT, "spec-" + name + ".json")
    with open(sp, "w", encoding="utf-8") as fh:
        json.dump(spec, fh)
    proc = subprocess.run(
        ["node", os.path.join(HERE, "restore-check.mjs"), base, cand, sp],
        capture_output=True,
        text=True,
        cwd=HERE,
        timeout=120,
    )
    if proc.returncode != 0 and not proc.stdout.strip():
        return [f"restore-check exit {proc.returncode}: {proc.stderr.strip()}"]
    line = proc.stdout.strip().splitlines()[-1]
    res = json.loads(line)
    reasons = [r for r in res.get("reasons", []) if r.startswith("logo not vertically centred")]
    if expect_fail:
        return [] if reasons else ["expected FAIL, got PASS"]
    return reasons


def case(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (("  [" + detail + "]") if detail else ""))
    if not cond:
        FAILS.append(name)


def main():
    os.makedirs(OUT, exist_ok=True)
    widths = [390, 1280]
    heights = [28, 27]
    for w in widths:
        for ph in heights:
            pill = (20, 20, 48, ph)
            tag = f"centred-{w}-h{ph}"
            r = run_tab_check(tag + ".png", w, pill, centred_glyph(pill))
            case(f"centred tab pill {w}px h={ph} PASSES", r == [], str(r))
            tag = f"low2-{w}-h{ph}"
            r = run_tab_check(tag + ".png", w, pill, low_glyph(pill, 2), expect_fail=True)
            case(f"2px-low tab pill {w}px h={ph} FAILS", r == [], str(r))

    chip = [{"name": "Hotel A", "box": [20, 20, 48, 28]}]
    pill = (20, 20, 48, 28)
    base = os.path.join(OUT, "chip-base.png")
    cand = os.path.join(OUT, "chip-cand.png")
    pill_image(base, 390, pill, (200, 100, 205, 105))
    pill_image(cand, 390, pill, (24, 33, 40, 46))
    spec = {
        "file": "chip-bbox-regression.png",
        "structure": True,
        "need_regions": False,
        "top": True,
        "pending_masks": [],
        "max_allowed_pct": 100,
        "icon_search_px": 4,
        "overlay": os.path.join(OUT, "ov-chip.png"),
        "day_map": False,
        "tab_boxes": [],
        "logo_chips": chip,
        "regions": {"ok": True, "viewport": [390, 120], "struct": {"tabs": []}, "items": []},
    }
    sp = os.path.join(OUT, "spec-chip.json")
    with open(sp, "w", encoding="utf-8") as fh:
        json.dump(spec, fh)
    proc = subprocess.run(
        ["node", os.path.join(HERE, "restore-check.mjs"), base, cand, sp],
        capture_output=True,
        text=True,
        cwd=HERE,
        timeout=120,
    )
    line = proc.stdout.strip().splitlines()[-1]
    res = json.loads(line)
    chip_reasons = [r for r in res.get("reasons", []) if "row logo Hotel A" in r]
    case("row logo chip still uses ink-bbox (off-centre FAILS)", len(chip_reasons) == 1, str(res.get("reasons")))

    if FAILS:
        print("FAILED:", ", ".join(FAILS))
        return 1
    print("tab-pill selftest ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())

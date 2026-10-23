from __future__ import annotations

import json
import os
import re
import subprocess
from typing import Any

FIXTURE_F = os.environ.get("TSV_CAPTURE_FIXTURE") or "/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json"

MAP_MASK_WHY = (
    "day-by-day map: judged by the colour-variety rule, not pixels "
    "(baseline shows Carto error tiles)"
)


def is_daybyday_full_shot(name: str) -> bool:
    n = str(name or "")
    return n.startswith("daybyday") and n.endswith(".png") and not n.endswith("-top.png")


def map_box_from_regions(reg: dict | None) -> list[float] | None:
    if not reg:
        return None
    box = (reg.get("map") or {}).get("box")
    if not box or len(box) != 4:
        return None
    return [float(v) for v in box]


def day_mapped_places(struct: dict | None) -> int | None:
    try:
        act = [c["text"] for c in (struct or {}).get("chips") or [] if c.get("active")]
        n = int(re.match(r"Day\s+(\d+)$", act[0]).group(1)) if len(act) == 1 else None
        fx = json.load(open(FIXTURE_F))
        day = next(d for d in fx["days"] if d["day_number"] == n)
        return sum(
            1
            for a in fx["assignments"].get(str(day["id"]), [])
            if a["place"].get("lat") is not None and a["place"].get("lng") is not None
        )
    except Exception:
        return None


def _sh_convert_mask(src: str, dest: str, box: list[float]) -> None:
    x, y, w, h = [int(round(v)) for v in box]
    x2, y2 = x + w, y + h
    subprocess.run(
        ["convert", src, "-fill", "white", "-draw", "rectangle %d,%d %d,%d" % (x, y, x2, y2), dest],
        check=True,
        capture_output=True,
    )


def masked_pair_paths(base: str, cand: str, box: list[float], out_dir: str, stem: str) -> tuple[str, str]:
    mb = os.path.join(out_dir, stem + "-base-mapmask.png")
    mc = os.path.join(out_dir, stem + "-cand-mapmask.png")
    _sh_convert_mask(base, mb, box)
    _sh_convert_mask(cand, mc, box)
    return mb, mc


def _load_tile_log(capture_dir: str) -> dict | None:
    path = os.path.join(capture_dir, "tile-log.json")
    if not os.path.isfile(path):
        return None
    try:
        return json.load(open(path))
    except Exception:
        return None


def _shot_entry(log: dict | None, shot: str, viewport_w: int | None) -> dict | None:
    if not log:
        return None
    for s in log.get("shots") or []:
        if s.get("shot") != shot:
            continue
        w = s.get("w")
        if w is not None and viewport_w is not None and w != viewport_w:
            continue
        return s
    return None


def marker_count(capture_dir: str, shot: str, viewport_w: int | None) -> int | None:
    entry = _shot_entry(_load_tile_log(capture_dir), shot, viewport_w)
    if not entry:
        return None
    return int(entry.get("markers") or 0)


def map_tile_evidence_failures(capture_dir: str, shot: str, reg: dict | None) -> list[str]:
    if not is_daybyday_full_shot(shot):
        return []
    box = map_box_from_regions(reg)
    if not box:
        return ["no day map rendered"]
    viewport = (reg or {}).get("viewport") or []
    vw = int(viewport[0]) if len(viewport) >= 1 else None
    log = _load_tile_log(capture_dir)
    entry = _shot_entry(log, shot, vw)
    if not entry:
        return ["map tiles did not load (no tile log entry for this shot)"]
    cut = entry.get("t_ms")
    if cut is None:
        cut = float("inf")
    tiles = [
        q
        for q in (log.get("requests") or [])
        if (q.get("w") is None or q.get("w") == vw) and (q.get("t_ms") is None or q.get("t_ms") <= cut)
    ]

    def is_img(q: dict) -> bool:
        return bool(re.match(r"^image/", str(q.get("content_type") or ""), re.I))

    def is_osm(q: dict) -> bool:
        return bool(re.search(r"(^|\.)tile\.openstreetmap\.org$", str(q.get("host") or ""), re.I))

    ok = [q for q in tiles if q.get("status") == 200 and is_img(q) and is_osm(q)]
    wrong = [q for q in tiles if q.get("status") == 200 and is_img(q) and not is_osm(q)]
    bad = [q for q in tiles if not (q.get("status") == 200 and is_img(q) and is_osm(q))]
    sizes: dict[int, int] = {}
    for q in ok:
        b = int(q.get("bytes") or 0)
        sizes[b] = sizes.get(b, 0) + 1
    max_same = max(sizes.values()) if sizes else 0
    pins = int(entry.get("markers") or 0)
    mapped = day_mapped_places((reg or {}).get("struct"))
    pins_required = mapped is None or mapped > 0
    reasons: list[str] = []
    if len(ok) < 8:
        if wrong:
            hosts = sorted({str(q.get("host") or "") for q in wrong})
            reasons.append("tiles from wrong host %s (expected tile.openstreetmap.org)" % ",".join(hosts))
        else:
            hosts = sorted({str(q.get("host") or "none") for q in bad}) or ["none"]
            sts = sorted(
                {str(q.get("status") if q.get("status") != 0 else (q.get("failure") or "failed")) for q in bad}
            ) or ["none (no tile requests)"]
            reasons.append(
                "map tiles did not load (host %s, status %s; %d of 8 needed came back 200 from tile.openstreetmap.org)"
                % (",".join(hosts), ",".join(sts), len(ok))
            )
        return reasons
    if len(sizes) < 4:
        reasons.append("tiles look like error/deny tiles (%d identical)" % max_same)
    if pins_required and pins < 1:
        reasons.append("no pins visible")
    return reasons


def marker_regression_failures(
    base_dir: str | None,
    cand_dir: str | None,
    shot: str,
    reg: dict | None,
) -> list[str]:
    if not base_dir or not cand_dir or not is_daybyday_full_shot(shot):
        return []
    viewport = (reg or {}).get("viewport") or []
    vw = int(viewport[0]) if len(viewport) >= 1 else None
    base_n = marker_count(base_dir, shot, vw)
    cand_n = marker_count(cand_dir, shot, vw)
    if base_n is None or cand_n is None:
        return []
    mapped = day_mapped_places((reg or {}).get("struct"))
    if mapped is not None and mapped == 0:
        return []
    if cand_n < base_n:
        return ["map markers decreased (%d -> %d)" % (base_n, cand_n)]
    return []


def assess_daybyday_after_pixels(
    shot: str,
    base_dir: str | None,
    cand_dir: str | None,
    base_reg: dict | None,
    cand_reg: dict | None,
) -> tuple[bool, str]:
    if not is_daybyday_full_shot(shot):
        return True, ""
    reasons = map_tile_evidence_failures(cand_dir or "", shot, cand_reg)
    reasons.extend(marker_regression_failures(base_dir, cand_dir, shot, cand_reg))
    if reasons:
        return False, reasons[0]
    if map_box_from_regions(cand_reg):
        return True, "day-by-day map box masked for pixels; tile evidence OK"
    return True, ""


def pixelmatch_outside_map_fails(
    pm_path: str,
    base: str,
    cand: str,
    box: list[float],
    out_dir: str,
    stem: str,
    *,
    cwd: str,
) -> tuple[bool, int]:
    mb, mc = masked_pair_paths(base, cand, box, out_dir, stem)
    diff = os.path.join(out_dir, stem + "-outside-map-diff.png")
    proc = subprocess.run(
        ["node", pm_path, mb, mc, diff],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return True, -1
    data = json.loads(proc.stdout)
    mismatched = int(data.get("mismatched") or 0)
    return mismatched > 0, mismatched

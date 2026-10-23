from __future__ import annotations

import struct
import zlib
from typing import Any, Iterable, Mapping, Sequence


def is_daybyday_full_shot(screen: str) -> bool:
    name = str(screen or "")
    return name.startswith("daybyday-") and name.endswith(".png") and "-top" not in name


def map_box_from_regions(region_entry: Mapping[str, Any] | None) -> list[int] | None:
    if not isinstance(region_entry, dict):
        return None
    mp = region_entry.get("map")
    if not isinstance(mp, dict):
        return None
    box = mp.get("box")
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return None
    try:
        return [int(round(v)) for v in box]
    except (TypeError, ValueError):
        return None


def _cluster_box(cluster: Any) -> list[int] | None:
    if isinstance(cluster, (list, tuple)) and len(cluster) == 4:
        try:
            return [int(v) for v in cluster]
        except (TypeError, ValueError):
            return None
    if isinstance(cluster, dict):
        if all(k in cluster for k in ("x", "y", "w", "h")):
            return [int(cluster["x"]), int(cluster["y"]), int(cluster["w"]), int(cluster["h"])]
        if all(k in cluster for k in ("left", "top", "width", "height")):
            return [
                int(cluster["left"]),
                int(cluster["top"]),
                int(cluster["width"]),
                int(cluster["height"]),
            ]
    return None


def box_inside(outer: Sequence[int], inner: Sequence[int], pad: int = 0) -> bool:
    ox, oy, ow, oh = outer
    ix, iy, iw, ih = inner
    x0, y0 = ox - pad, oy - pad
    x1, y1 = ox + ow + pad, oy + oh + pad
    return ix >= x0 and iy >= y0 and (ix + iw) <= x1 and (iy + ih) <= y1


def diff_clusters_inside_map(clusters: Iterable[Any], map_box: Sequence[int], pad: int = 1) -> bool:
    boxes = [_cluster_box(c) for c in clusters]
    if not boxes or any(b is None for b in boxes):
        return False
    return all(box_inside(map_box, b, pad=pad) for b in boxes if b is not None)


def timeline_titles(region_entry: Mapping[str, Any] | None) -> list[str]:
    if not isinstance(region_entry, dict):
        return []
    struct_data = region_entry.get("struct")
    if not isinstance(struct_data, dict):
        return []
    timeline = struct_data.get("timeline")
    if not isinstance(timeline, list):
        return []
    out: list[str] = []
    for row in timeline:
        if isinstance(row, dict):
            title = str(row.get("title") or "").strip()
            if title:
                out.append(title)
    return out


def timelines_match(ref_entry: Mapping[str, Any] | None, cand_entry: Mapping[str, Any] | None) -> bool:
    return timeline_titles(ref_entry) == timeline_titles(cand_entry)


def _shot_tile_record(tile_log: Mapping[str, Any] | None, shot: str) -> dict[str, Any] | None:
    if not isinstance(tile_log, dict):
        return None
    for rec in tile_log.get("shots") or []:
        if isinstance(rec, dict) and rec.get("shot") == shot:
            return rec
    return None


def marker_count(tile_log: Mapping[str, Any] | None, shot: str) -> int | None:
    rec = _shot_tile_record(tile_log, shot)
    if not rec:
        return None
    try:
        return int(rec.get("markers", 0))
    except (TypeError, ValueError):
        return None


def markers_unchanged(
    ref_tile_log: Mapping[str, Any] | None,
    cand_tile_log: Mapping[str, Any] | None,
    shot: str,
) -> bool:
    base = marker_count(ref_tile_log, shot)
    cand = marker_count(cand_tile_log, shot)
    if base is None or cand is None:
        return False
    return base == cand and base >= 1


def _load_png_rgba(path: str) -> tuple[int, int, bytes]:
    with open(path, "rb") as fh:
        sig = fh.read(8)
        if sig != b"\x89PNG\r\n\x1a\n":
            raise ValueError("not a PNG")
        width = height = None
        color_type = None
        idat = bytearray()
        while True:
            head = fh.read(8)
            if len(head) < 8:
                break
            length, ctype = struct.unpack(">I4s", head)
            data = fh.read(length)
            fh.read(4)
            if ctype == b"IHDR":
                width, height, _bit, color_type = struct.unpack(">IIBBBBB", data[:13])[:4]
            elif ctype == b"IDAT":
                idat.extend(data)
            elif ctype == b"IEND":
                break
        if width is None or height is None or color_type not in (2, 6):
            raise ValueError("unsupported PNG for map colour scoring")
        raw = zlib.decompress(bytes(idat))
        bpp = 4 if color_type == 6 else 3
        stride = width * bpp
        out = bytearray(width * height * 4)
        idx = 0
        prev = bytearray(stride)
        for y in range(height):
            if raw[idx] != 0:
                raise ValueError("unsupported PNG filter")
            idx += 1
            row = bytearray(raw[idx : idx + stride])
            idx += stride
            recon = bytearray(row)
            prev = recon
            if color_type == 6:
                out[y * width * 4 : (y + 1) * width * 4] = recon
            else:
                for x in range(width):
                    si = x * 3
                    di = (y * width + x) * 4
                    out[di : di + 3] = recon[si : si + 3]
                    out[di + 3] = 255
        return width, height, bytes(out)


def colour_variety_in_box(rgba: bytes, width: int, height: int, map_box: Sequence[int]) -> dict[str, Any]:
    mx, my, mw, mh = [int(round(v)) for v in map_box]
    x0, y0 = max(0, mx), max(0, my)
    x1, y1 = min(width, mx + mw), min(height, my + mh)
    hues = [0] * 12
    sat = 0
    counted = max(1, ((x1 - x0 + 1) // 2) * ((y1 - y0 + 1) // 2))
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            k = (y * width + x) * 4
            r, g, b = rgba[k] / 255.0, rgba[k + 1] / 255.0, rgba[k + 2] / 255.0
            m_val = max(r, g, b)
            mn = min(r, g, b)
            vv = m_val
            ss = (m_val - mn) / m_val if m_val else 0.0
            if ss >= 0.15 and vv >= 0.25:
                sat += 1
                if m_val == mn:
                    h = 0.0
                elif m_val == r:
                    h = ((g - b) / (m_val - mn)) % 6
                elif m_val == g:
                    h = (b - r) / (m_val - mn) + 2
                else:
                    h = (r - g) / (m_val - mn) + 4
                hues[(round((h / 6) * 12) + 12) % 12] += 1
    buckets = sum(1 for c in hues if c >= 0.005 * counted)
    frac = sat / counted
    ok = buckets >= 4 and frac >= 0.05
    return {"hue_buckets": buckets, "sat_frac": round(frac, 3), "ok": ok}


def score_map_colour(png_path: str | None, map_box: Sequence[int]) -> dict[str, Any]:
    if not png_path or not map_box:
        return {"ok": False, "reason": "missing png or map box"}
    try:
        w, h, rgba = _load_png_rgba(png_path)
    except OSError:
        return {"ok": False, "reason": "candidate png unreadable"}
    except ValueError as exc:
        return {"ok": False, "reason": str(exc)}
    metrics = colour_variety_in_box(rgba, w, h, map_box)
    metrics["ok"] = bool(metrics.get("ok"))
    if not metrics["ok"]:
        metrics["reason"] = (
            "day-by-day map is not the colourful styled map "
            f"(hue buckets {metrics['hue_buckets']}, saturated {metrics['sat_frac']*100:.1f}%; "
            "need >=4 buckets and >=5% saturated)"
        )
    return metrics


def adjudicate_daybyday_pregate(
    screen: str,
    compare: Mapping[str, Any],
    *,
    cand_regions: Mapping[str, Any] | None,
    ref_regions: Mapping[str, Any] | None = None,
    cand_tile_log: Mapping[str, Any] | None = None,
    ref_tile_log: Mapping[str, Any] | None = None,
    cand_png_path: str | None = None,
) -> tuple[bool, str]:
    if not is_daybyday_full_shot(screen):
        return False, "not a day-by-day full screenshot"
    if str(compare.get("verdict") or "").upper() == "PASS":
        return True, "pixel compare already PASS"
    region_entry = (cand_regions or {}).get(screen) if isinstance(cand_regions, dict) else None
    ref_entry = (ref_regions or {}).get(screen) if isinstance(ref_regions, dict) else None
    map_box = map_box_from_regions(region_entry)
    if not map_box:
        return False, "day-by-day map region not recorded (fail closed)"
    if ref_entry is not None and not timelines_match(ref_entry, region_entry):
        return False, "timeline rows changed outside the map box rule"
    clusters = compare.get("clusters") or compare.get("diff_clusters") or []
    mismatched = int(compare.get("mismatched") or 0)
    if mismatched <= 0:
        return False, "no pixel diff to adjudicate"
    if not diff_clusters_inside_map(clusters, map_box):
        return False, "pixel diff is not confined to the day-by-day map box"
    if ref_tile_log is not None and not markers_unchanged(ref_tile_log, cand_tile_log, screen):
        return False, "map marker count changed"
    colour = score_map_colour(cand_png_path, map_box)
    if not colour.get("ok"):
        return False, str(colour.get("reason") or "map colour variety check failed")
    mc = marker_count(cand_tile_log, screen)
    if mc is None or mc < 1:
        return False, "no pins visible on the day-by-day map"
    return True, (
        "PASS map-box masked pregate: tile noise inside map box only "
        f"({mismatched} px, {len(clusters)} clusters); colour variety and markers hold"
    )


def merge_daybyday_pregate_verdict(pixel_verdict: str, adjudication: tuple[bool, str]) -> dict[str, Any]:
    ok, reason = adjudication
    base = str(pixel_verdict or "").upper()
    if ok:
        return {"verdict": "PASS", "pregate_map": "map-box-masked", "reason": reason, "was": base}
    return {"verdict": base or "FAIL", "pregate_map": "fail", "reason": reason}

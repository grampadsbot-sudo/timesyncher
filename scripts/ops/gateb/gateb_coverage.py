from __future__ import annotations

import re

from gateb_text_normalize import norm_match_key

_PRICE_IN_SEGMENT = re.compile(r"\$\s*[\d,]+(?:\.\d+)?")


def segment_has_price(segment: str) -> bool:
    if _PRICE_IN_SEGMENT.search(segment or ""):
        return True
    if re.search(r"\bfree\b", segment or "", re.I):
        return True
    return False


def _name_start(norm_body: str, name: str) -> int | None:
    key = norm_match_key(name)
    if not key:
        return None
    idx = norm_body.find(key)
    return idx if idx >= 0 else None


def unpriced_list_rows(body: str, items) -> list[str]:
    if not body or not items:
        return []
    norm_body = norm_match_key(body)
    ordered = []
    for it in items:
        name = (it.get("name") if isinstance(it, dict) else None) or ""
        start = _name_start(norm_body, name)
        ordered.append((start if start is not None else 10**12, name, start))
    ordered.sort(key=lambda row: row[0])
    misses: list[str] = []
    for i, (_sort, name, start) in enumerate(ordered):
        if start is None or start >= 10**11:
            misses.append(str(name)[:80] or "?")
            continue
        end = len(norm_body)
        for j in range(i + 1, len(ordered)):
            nxt = ordered[j][2]
            if nxt is not None and nxt < 10**11:
                end = nxt
                break
        segment = norm_body[start:end]
        if not segment_has_price(segment):
            misses.append(str(name)[:80] or "?")
    return misses


def list_price_coverage_failure(screen: str, body: str, items) -> str | None:
    if not screen.endswith(".png"):
        screen = str(screen or "")
    if not (screen.startswith("hotels-") or screen.startswith("flights-") or screen.startswith("cars-")):
        return None
    cat = "hotels" if screen.startswith("hotels") else "flights" if screen.startswith("flights") else "cars"
    rows = [it for it in (items or []) if isinstance(it, dict)]
    total = len(rows)
    if total == 0:
        return None
    misses = unpriced_list_rows(body or "", rows)
    if not misses:
        return None
    sample = ", ".join(misses[:4])
    return "price %s list: %d/%d %ss have no price (%s)" % (screen, len(misses), total, cat, sample)

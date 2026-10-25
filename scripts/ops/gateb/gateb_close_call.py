from __future__ import annotations

import re
from collections import Counter

from gateb_text_normalize import norm_match_key

CLOSE_RATIO_MIN = 0.0001
CLOSE_RATIO_MAX = 0.02
LIST_PRICE_RATIO_MAX = 0.12

_LAYOUT_FAIL_MARKERS = (
    "layout",
    "row count",
    "missing row",
    "extra row",
    "fewer row",
    "more row",
    "logo",
    "chip",
    "size changed",
    "aspect",
    "font",
    "colour",
    "color",
    "header",
    "tab",
    "map",
    "overflow",
)

_SKIP_ROW_FP = frozenset({"price_text"})


def vision_reason_price_only(reason: str | None) -> bool:
    text = str(reason or "").strip().lower()
    if not text:
        return False
    if any(marker in text for marker in _LAYOUT_FAIL_MARKERS):
        return False
    return bool(
        re.search(
            r"price|add price|total|\$|amount|cheapest|re-?sort|reorder|order changed",
            text,
            re.I,
        )
    )


def list_row_name_multiset(items) -> Counter:
    counts: Counter = Counter()
    for it in items or []:
        if not isinstance(it, dict):
            continue
        key = norm_match_key(it.get("name"))
        if key:
            counts[key] += 1
    return counts


def list_rows_identical_set(base_items, cand_items) -> bool:
    return list_row_name_multiset(base_items) == list_row_name_multiset(cand_items)


def _row_fingerprint(it: dict) -> tuple:
    parts = []
    for k in sorted(it.keys()):
        if k in _SKIP_ROW_FP:
            continue
        parts.append((k, it.get(k)))
    return tuple(parts)


def _row_multiset_signature(items) -> Counter:
    sig: Counter = Counter()
    for it in items or []:
        if not isinstance(it, dict):
            continue
        name = norm_match_key(it.get("name"))
        if not name:
            continue
        sig[(name, _row_fingerprint(it))] += 1
    return sig


def capture_rows_price_only_change(base_items, cand_items) -> bool:
    if not list_rows_identical_set(base_items, cand_items):
        return False
    return _row_multiset_signature(base_items) == _row_multiset_signature(cand_items)


def in_close_ratio_band(ratio: float | None) -> bool:
    if ratio is None:
        return False
    return CLOSE_RATIO_MIN < float(ratio) < CLOSE_RATIO_MAX


def adjudicate_close_call(
    screen: str,
    ratio: float | None,
    base_items,
    cand_items,
    vision_fail_reason: str | None,
    *,
    size_changed: bool = False,
) -> tuple[bool, str]:
    return adjudicate_price_compare(
        screen,
        ratio,
        base_items,
        cand_items,
        vision_fail_reason,
        size_changed=size_changed,
    )


def adjudicate_price_compare(
    screen: str,
    ratio: float | None,
    base_items,
    cand_items,
    vision_fail_reason: str | None,
    *,
    size_changed: bool = False,
) -> tuple[bool, str]:
    if size_changed:
        return False, "price-only pass blocked: viewport size changed"
    name = str(screen or "")
    ratio_f = float(ratio) if ratio is not None else None
    if name.startswith("budget"):
        if not in_close_ratio_band(ratio_f):
            return False, "budget: not in close-call pixel band"
        if not vision_reason_price_only(vision_fail_reason):
            return False, vision_fail_reason or "vision close call not price-only"
        return True, "PASS price-amount-only: budget amounts, totals or Add-price labels (%s)" % (
            (vision_fail_reason or "")[:160]
        )
    if name.startswith(("hotels-", "flights-", "cars-")):
        if ratio_f is None or ratio_f > LIST_PRICE_RATIO_MAX:
            return False, "list: ratio above price-only list cap"
        if not list_rows_identical_set(base_items, cand_items):
            return False, "list row set changed (not price-only reorder)"
        if capture_rows_price_only_change(base_items, cand_items):
            return True, "PASS price-only list: capture rows match except price text (ratio %.4f)" % ratio_f
        if in_close_ratio_band(ratio_f) and vision_reason_price_only(vision_fail_reason):
            return True, "PASS price-only list close call: same rows (%s)" % ((vision_fail_reason or "")[:120])
        if ratio_f >= CLOSE_RATIO_MAX and vision_reason_price_only(vision_fail_reason):
            return True, "PASS price-only list: same rows; price or reorder (%s)" % ((vision_fail_reason or "")[:120])
        return False, vision_fail_reason or "list compare not price-only"
    return False, vision_fail_reason or "screen not eligible for price-only pass"


def merge_close_call_verdict(pixel_verdict: str, adjudication: tuple[bool, str]) -> dict:
    ok, reason = adjudication
    base = str(pixel_verdict or "").upper()
    if ok:
        return {"verdict": "PASS", "close_call": "price-only", "reason": reason, "was": base}
    return {"verdict": base or "FAIL", "close_call": "fail", "reason": reason}


def apply_compare_override(
    screen: str,
    ratio: float | None,
    vision_why: str | None,
    *,
    size_changed: bool = False,
    base_items=None,
    cand_items=None,
) -> dict | None:
    ok, reason = adjudicate_price_compare(
        screen,
        ratio,
        base_items or [],
        cand_items or [],
        vision_why,
        size_changed=size_changed,
    )
    if not ok:
        return None
    merged = merge_close_call_verdict("FAIL", (True, reason))
    merged["vision_price_only"] = True
    return merged

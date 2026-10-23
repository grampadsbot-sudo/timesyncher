#!/usr/bin/env python3
"""Evidence helpers for Gate B price-only and price-driven re-sort (TSV #671).

Used by gateb_coverage._segments and gateb_compare.close-call reassessment.
No vision calls; fail closed when capture-regions evidence is missing or ambiguous.
"""
import re
from collections import Counter, defaultdict

_APOS = {"\u2019": "'", "\u2018": "'", "\u2032": "'", "\u00b4": "'", "\u02bc": "'"}
_PRICE_RE = re.compile(r"\$\s*([\d,]+(?:\.\d+)?)")
_ADD_PRICE_RE = re.compile(r"^\s*Add price\s*$", re.I)


def norm_apostrophe(s):
    t = str(s or "")
    for a, b in _APOS.items():
        t = t.replace(a, b)
    return t


def _segments(text, names):
    """Map fixture place names to captured lines under each list header.

    Headers match after apostrophe normalization. Duplicate headers for the same
    canonical name merge their following lines (safe for twin hotel rows).
    """
    lines = [l.strip() for l in (text or "").split("\n")]
    norm_lines = [norm_apostrophe(l) for l in lines]
    canon = {}
    for n in names:
        canon.setdefault(norm_apostrophe(n), n)
    idx = []
    for i, nl in enumerate(norm_lines):
        if nl in canon:
            idx.append((i, canon[nl]))
    seg = defaultdict(list)
    for k, (i, name) in enumerate(idx):
        j = idx[k + 1][0] if k + 1 < len(idx) else len(lines)
        seg[name].extend(lines[i + 1 : j])
    return dict(seg)


def row_base_name(it):
    t = norm_apostrophe(it.get("name") or (it.get("first_text") or {}).get("text") or "")
    return re.sub(r"\s*\$\s*[\d,]+(?:\.\d+)?\s*$", "", t).strip()


def row_asset_sig(it):
    img = it.get("img") or {}
    return (
        row_base_name(it),
        (img.get("src") or it.get("logo_src") or "")[:120],
        (it.get("desc") or "")[:160],
    )


def norm_budget_body(text):
    out = []
    for line in (text or "").split("\n"):
        line = _PRICE_RE.sub("PRICE", line)
        if _ADD_PRICE_RE.match(line):
            line = "PRICE"
        out.append(line)
    return "\n".join(out)


def _dims_match(base_reg, cand_reg):
    if not base_reg or not cand_reg:
        return False
    if base_reg.get("viewport") != cand_reg.get("viewport"):
        return False
    bs = (base_reg.get("struct") or {}).get("doc_width")
    cs = (cand_reg.get("struct") or {}).get("doc_width")
    if bs is not None and cs is not None and bs != cs:
        return False
    return True


def _list_prices_sorted(items):
    prices = []
    for it in items or []:
        m = _PRICE_RE.search(it.get("price_text") or it.get("name") or "")
        prices.append(float(m.group(1).replace(",", "")) if m else None)
    nums = [p for p in prices if p is not None]
    if len(nums) < 2:
        return True
    first_none = next((i for i, p in enumerate(prices) if p is None), len(prices))
    if any(p is not None for p in prices[first_none:]):
        return False
    return nums == sorted(nums)


def _hotel_row_multiset_equal(base_items, cand_items):
    if len(base_items) != len(cand_items):
        return False
    return Counter(row_asset_sig(x) for x in base_items) == Counter(row_asset_sig(x) for x in cand_items)


def _hotel_rows_in_order_price_only(base_items, cand_items):
    if len(base_items) != len(cand_items):
        return False
    for b, c in zip(base_items, cand_items):
        if row_asset_sig(b) != row_asset_sig(c):
            return False
        if (b.get("box") or []) != (c.get("box") or []):
            return False
        chip_b, chip_c = b.get("chip") or {}, c.get("chip") or {}
        if (chip_b.get("box") or []) != (chip_c.get("box") or []):
            return False
    return True


def assess_price_effect(base_reg, cand_reg, shot, ctx=None):
    """Return a PASS reason string or None (keep pixel/vision verdict).

    ctx is a mutable dict shared across shots in one compare run; it records
    full-frame hotel/budget screens that qualified so matching -top shots can pass.
    """
    if not base_reg or not cand_reg or not _dims_match(base_reg, cand_reg):
        return None
    ctx = ctx if ctx is not None else {}
    qualified = ctx.setdefault("qualified", set())
    name = shot or ""

    if name.startswith("budget-") and name.endswith(".png"):
        stem = name[:-4]
        if stem.endswith("-top"):
            full_key = stem[: -len("-top")]
            if full_key not in qualified:
                return None
            return "price-only (budget -top; full %s frame qualified)" % full_key
        bb = ((base_reg.get("struct") or {}).get("body_text")) or ""
        cb = ((cand_reg.get("struct") or {}).get("body_text")) or ""
        if not bb or not cb:
            return None
        if norm_budget_body(bb) != norm_budget_body(cb):
            return None
        qualified.add(stem)
        return "price-only (budget text matches after normalizing prices and Add price labels)"

    if name.startswith("hotels-") and name.endswith(".png"):
        stem = name[:-4]
        if stem.endswith("-top"):
            full_key = stem[: -len("-top")]
            if full_key not in qualified:
                return None
            return "price-resort (hotels -top; full %s frame qualified)" % full_key
        base_items, cand_items = base_reg.get("items") or [], cand_reg.get("items") or []
        if not base_items or not cand_items:
            return None
        if _hotel_rows_in_order_price_only(base_items, cand_items):
            qualified.add(stem)
            return "price-only (hotel rows match; only prices differ)"
        if not _hotel_row_multiset_equal(base_items, cand_items):
            return None
        if not _list_prices_sorted(cand_items):
            return None
        qualified.add(stem)
        return "price-resort (same hotel row assets; candidate sorted by price)"

    return None

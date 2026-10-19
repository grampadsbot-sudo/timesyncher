#!/usr/bin/env python3
"""vk_contract_check.py: field-by-field check of a search/test-trip fixture against skills/vk-thing-data-contract (v1.2.0).

Input: a snapshot JSON object keyed by row id (the shape of scripts/fixtures/pr336-vk-search-places.snapshot.json).
Checks the contract's required fields per category (summary, description, price, logoUrl) and its banned values and
duplicate descriptions. Contract per Craig 2026-10-13 2:15 PM PT: ratings are a fetched average + count + themes (no
star mix); a row whose fetched data is blocked stays empty and is reported as FLAGGED, not as a field failure, and
flagged rows over 20% of the rows fail the run. Prints one line per failing field/category:
    DATA-CONTRACT: <field>/<category> <n> failing
    DATA-CONTRACT: flagged/over-cap <n> of <m>
    FLAGGED: <row id> <title> (<reason>)
plus a JSON summary on the last line. Exit 0 = pass, 1 = contract failures, 2 = unreadable input.

This is a DATA fault report for the harness (Gate B pre-check, fixture generator guard). It never writes fixture data
and never produces a fix-it for a coder.
"""
import json, re, sys
from collections import Counter, defaultdict

BANNED_RE = re.compile(r"\b(TBD|N/A|Quote TBD|Add price|lorem|placeholder|sample)\b|^\$0$|^\s*candidate\b|^\s*option\b|Flight option:", re.I)
FILLER = ("hotel option worth comparing", "flight option to compare", "convenient grocery stop",
          "worth comparing because of its JFK counter tradeoff")
CATEGORIES = {"hotel", "flight", "car", "restaurant", "store", "event"}
CATEGORY_ALIASES = {"lodging": "hotel", "accommodation": "hotel", "grocery": "store", "market": "store",
                    "shopping": "store", "shop": "store", "activity": "event", "attraction": "event",
                    "tour": "event", "music": "event", "theatre": "event"}
MAPPABLE = {"hotel", "restaurant", "store", "event"}
REVIEWED = {"hotel", "restaurant", "store", "event"}
FLAGGABLE = {"price", "logoUrl", "coordinates", "ratings", "reviews"}
FLAG_CAP = 0.20
RATING_LEAD_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)")

def _text(v): return re.sub(r"\s+", " ", str(v or "")).strip()

def _category(p):
    c = _text(p.get("category")).lower()
    return CATEGORY_ALIASES.get(c, c)

def _price(p):
    src = p.get("sourceRecord") if isinstance(p.get("sourceRecord"), dict) else {}
    for v in (p.get("price"), src.get("price"), src.get("rate"), src.get("amount"), src.get("totalPrice")):
        if v is None or v == "": continue
        try:
            n = float(str(v).replace("$", "").replace(",", ""))
            if n > 0: return n
        except ValueError:
            continue
    return None

def _logo(p):
    src = p.get("sourceRecord") if isinstance(p.get("sourceRecord"), dict) else {}
    return _text(p.get("logoUrl") or src.get("logoUrl") or src.get("logo") or src.get("faviconUrl"))

def _num(v):
    try: return float(str(v).replace(",", ""))
    except (TypeError, ValueError): return None

def _has_coords(p):
    return _num(p.get("lat")) is not None and _num(p.get("lng")) is not None

def _fetched_average_and_count(p, src):
    """A fetched average plus a positive count. thirdPartyRating may be a composite display string ("4.9 (9,034) · ...")
    whose leading number is the average, so it parses by its lead, not by _num()."""
    count = _num(p.get("ratingCount")) or _num(src.get("ratingCount"))
    if not count or count <= 0: return False
    for obj in (p, src):
        if RATING_LEAD_RE.match(str(obj.get("thirdPartyRating") or "")): return True
    for obj in (p, src):
        sites = obj.get("otherRatingSites")
        if isinstance(sites, list) and any(isinstance(s, dict) and _num(s.get("rating")) is not None for s in sites):
            return True
    return False

def _rating_count(p):
    src = p.get("sourceRecord") if isinstance(p.get("sourceRecord"), dict) else {}
    n = 0
    for k in ("googleRating", "yelpRating", "thirdPartyRating", "rating", "stars"):
        if _num(p.get(k)) is not None or _num(src.get(k)) is not None: n += 1
    if _fetched_average_and_count(p, src): n += 1
    return n

def _flag_reason(p):
    """Why a row is empty + flagged rather than failed (Craig 2026-10-13 2:15 PM PT), or None. Blockers may sit on the row or its sourceRecord."""
    src = p.get("sourceRecord") if isinstance(p.get("sourceRecord"), dict) else {}
    if any(obj.get(k) for obj in (p, src) for k in ("provenanceBlocker", "identityBlocker")): return "provenance-blocked"
    if any(obj.get("missingFields") for obj in (p, src)): return "missing-fields"
    if p.get("xaiRatingsFetched") is False or src.get("xaiRatingsFetched") is False: return "ratings-not-fetched"
    return None

def _review_texts(p):
    """Distinct full review texts on the row or its nested sourceRecord. Four are required (v1.2.0)."""
    src = p.get("sourceRecord") if isinstance(p.get("sourceRecord"), dict) else {}
    vals = []
    for obj in (p, src):
        for k in ("review1", "review2", "review3", "review4"):
            vals.append(_text(obj.get(k)))
        reviews = obj.get("reviews")
        if isinstance(reviews, list):
            vals.extend(_text(x.get("text") if isinstance(x, dict) else x) for x in reviews)
    seen = []
    for v in vals:
        if v and v not in seen: seen.append(v)
    return seen

def _review_count(p):
    return len(_review_texts(p))

def _identity_blocked(p):
    if p.get("provenanceBlocker") or p.get("identityBlocker") or p.get("sourceIdentityMismatch"):
        return True
    title = _text(p.get("title") or p.get("name")).lower()
    logo = _text(p.get("logoUrl")).lower()
    if "midtown sample hotel" in title and "manhattanclub" in logo:
        return True
    return False

def check(rows):
    """Return (failing, total, examples): failing[(field, category)] = count."""
    failing, total, examples = Counter(), Counter(), defaultdict(list)
    descs, flagged = Counter(), []
    if not isinstance(rows, dict) or not rows:
        failing[("payload", "empty")] += 1
        examples[("payload", "empty")].append("no rows")
        return failing, total, examples
    for rid, p in rows.items():
        if not isinstance(p, dict):
            failing[("payload", "invalid")] += 1
            examples[("payload", "invalid")].append(str(rid))
            continue
        cat = _category(p)
        if cat not in CATEGORIES:
            failing[("category", "unknown")] += 1
            examples[("category", "unknown")].append("%s %s" % (rid, _text(p.get("category") or p.get("title") or p.get("name"))[:60]))
            continue
        total[cat] += 1
        summary, desc = _text(p.get("summary")), _text(p.get("description"))
        if desc: descs[desc] += 1
        bad = []
        if not summary: bad.append("summary")
        elif BANNED_RE.search(summary) or any(f in summary.lower() for f in FILLER): bad.append("summary")
        elif summary == desc: bad.append("summary")
        if not desc: bad.append("description")
        elif BANNED_RE.search(desc) or any(f in desc.lower() for f in FILLER): bad.append("description")
        if _price(p) is None: bad.append("price")
        if not _logo(p): bad.append("logoUrl")
        if _identity_blocked(p): bad.append("identity")
        if cat in MAPPABLE and not _has_coords(p): bad.append("coordinates")
        if cat in REVIEWED and _rating_count(p) < 1: bad.append("ratings")
        if cat in REVIEWED and _review_count(p) < 4: bad.append("reviews")
        reason = _flag_reason(p)
        if reason:
            flagged.append("%s %s (%s)" % (rid, _text(p.get("title") or p.get("name"))[:60], reason))
            bad = [f for f in bad if f not in FLAGGABLE]
        for field in bad:
            failing[(field, cat)] += 1
            examples[(field, cat)].append("%s %s" % (rid, _text(p.get("title") or p.get("name"))[:60]))
    if not sum(total.values()):
        failing[("payload", "no-known-category")] += 1
        examples[("payload", "no-known-category")].append("no known VK categories")
    for rid, p in rows.items():
        desc = _text(p.get("description"))
        if desc and descs[desc] > 1 and _category(p) in CATEGORIES:
            cat = _category(p)
            failing[("description-duplicate", cat)] += 1
            examples[("description-duplicate", cat)].append("%s %s" % (rid, _text(p.get("title") or p.get("name"))[:60]))
    known = sum(total.values())
    examples[("flagged", "rows")] = flagged
    if flagged and len(flagged) > FLAG_CAP * known:
        failing[("flagged", "over-cap")] += 1
        examples[("flagged", "over-cap")].append("%d of %d" % (len(flagged), known))
    return failing, total, examples

def main(argv):
    if len(argv) != 2:
        sys.exit(__doc__)
    try:
        rows = json.load(open(argv[1]))
    except (OSError, ValueError) as e:
        print(json.dumps({"ok": False, "error": "unreadable input: " + type(e).__name__}))
        return 2
    failing, total, examples = check(rows)
    flagged = examples.get(("flagged", "rows"), [])
    for line in flagged:
        print("FLAGGED: %s" % line)
    for (field, cat), n in sorted(failing.items()):
        if field == "flagged":
            print("DATA-CONTRACT: flagged/over-cap %s" % examples[(field, cat)][0])
            continue
        print("DATA-CONTRACT: %s/%s %d failing (e.g. %s)" % (field, cat, n, "; ".join(examples[(field, cat)][:2])))
    ok = not failing
    print(json.dumps({"ok": ok, "rows": sum(total.values()), "total_by_category": dict(total),
                      "failing": {"%s/%s" % k: v for k, v in sorted(failing.items())}, "flagged": flagged}))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))

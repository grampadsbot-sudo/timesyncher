#!/usr/bin/env python3
"""restore_check.py: Gate B v6 restore/new-look screen rules (dr eggbot 2026-10-08, after #274 d832b42's false PASS). NO LLM.
Per screen: node restore-check.mjs (everything outside the lists 0 px vs the approved baseline, list height change carried
below; tab/header icons: translation only; allowed area <= 25%; region detection failure = FAIL) + row_design() from the DOM
(Craig 2026-10-08: no fixed row count; every row keeps the approved row design: a real logo for every hotel and every thing
the app has a logo for (no emoji/category stand-in), logo chip at the left, name visible, right-hand control kept, row inside
the screen width, row height one or two lines, airline names on flights, list starts cheapest first).
Plus scan_diff(): PR diffs that detect the capture tool or paint bitmap stand-ins of the approved screens = FAIL.
CLI: restore_check.py --baselines DIR --candidates DIR [--issue 273] [--allow gateb-allow.json] [--out DIR] [--diff-range A..B --repo DIR]"""
import argparse, fnmatch, hashlib, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
RC = os.path.join(HERE, "restore-check.mjs")
ALLOW_F = "/home/ubishere9995/tsv-dispatch/gateb-allow.json"

def fm(f, pats): return any(fnmatch.fnmatch(f, p) for p in pats or [])

FIXTURE_F = os.environ.get("TSV_CAPTURE_FIXTURE") or "/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json"
def day_mapped_places(struct):
    """Places with coordinates on the day the capture showed (the one active 'Day N' chip), from the NYC fixture.
    Returns None when the active day cannot be read; the caller then requires pins (fail closed)."""
    try:
        act = [c["text"] for c in (struct or {}).get("chips") or [] if c.get("active")]
        n = int(re.match(r"Day\s+(\d+)$", act[0]).group(1)) if len(act) == 1 else None
        fx = json.load(open(FIXTURE_F))
        day = next(d for d in fx["days"] if d["day_number"] == n)
        return sum(1 for a in fx["assignments"].get(str(day["id"]), []) if (a["place"].get("lat") is not None and a["place"].get("lng") is not None))
    except Exception:
        return None

def norm_text(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()

def budget_label(n):
    """The name the Budget screen shows: the fixture's internal 'Flight option: ' prefix is not rendered (ask #51(c)(2), 20261014-0530)."""
    return re.sub(r"^\s*Flight option:\s*", "", str(n or ""), flags=re.I)

def budget_names():
    """Names of every thing placed on an itinerary day in the NYC fixture (the trip the Budget screen is captured for). None = unreadable."""
    try:
        fx = json.load(open(FIXTURE_F)); names = []
        for lst in (fx.get("assignments") or {}).values():
            for a in lst or []:
                n = str(((a or {}).get("place") or {}).get("name") or "").strip()
                if n and n not in names: names.append(n)
        return names
    except Exception:
        return None

def check_screen(allow, f, reference, cand_dir, workdir, regions=None):
    if regions is None:
        try: regions = json.load(open(os.path.join(cand_dir, "capture-regions.json")))
        except Exception: regions = None
    base, cand = os.path.join(reference, f), os.path.join(cand_dir, f)
    if not (os.path.isfile(base) and os.path.isfile(cand)):
        return {"file": f, "ok": False, "reasons": ["baseline or candidate missing"], "band": "FAIL"}
    if not isinstance(regions, dict):
        return {"file": f, "ok": False, "reasons": ["region detection failed: capture-regions.json missing"], "band": "FAIL"}
    stem = f[:-4]
    spec = {"file": f, "regions": regions.get(f), "need_regions": True, "top": f.endswith("-top.png"),
            "rows_allowed": fm(f, allow.get("row_design", ["hotels-*", "cars-*", "flights-*"])), "rows_optional": fm(f, allow.get("rows_optional", ["cars-*"])),
            "pending_masks": (allow.get("pending_masks") or {}).get(f, []),
            "logo_boxes": [dict(m, ref=os.path.join(cand_dir, m["ref"])) for m in (allow.get("logo_boxes") or {}).get(f, [])],
            "max_allowed_pct": float(allow.get("max_allowed_pct", 25)), "icon_search_px": int(allow.get("icon_search_px", 4)),
            "overlay": os.path.join(workdir, "%s-v6.png" % stem)}
    if f.startswith("daybyday") and spec["regions"] and spec["regions"].get("map"):   # Craig 2026-10-08 12:20 PM PT: map judged by the colour rule
        spec["map_box"] = spec["regions"]["map"]["box"]   # (the approved baselines show Carto "API KEY REQUIRED" error tiles there, so no pixel compare)
        spec["pending_masks"] = list(spec["pending_masks"]) + [{"box": spec["map_box"], "why": "day-by-day map: judged by the colour-variety rule, not pixels (baseline shows Carto error tiles)"}]
    if not fm(f, allow.get("icons", ["*"])): spec["regions"] = dict(spec["regions"] or {}, icons=[])
    sp = os.path.join(workdir, "_v6-%s.json" % stem)
    with open(sp, "w") as fh: json.dump(spec, fh)
    if allow.get("mode") == "structure":   # structure mode (Craig 12:27 PM PT): the pixel compare is skipped entirely; only the map colour rule runs
        spec["structure"] = True
        spec["day_map"] = f.startswith("daybyday") and not spec["top"]   # GBrain request claude-manager-pr274-maprule-brief-20261009-1710: a full day-by-day shot must show a map
        spec["map_below_fold"] = f.startswith("daybyday") and spec["top"]   # GBrain request claude-manager-pr274-maprule-fix-20261009-1710b: top shots are judged on the full shot
        spec["day_mapped_places"] = day_mapped_places((spec["regions"] or {}).get("struct"))   # pins are required only when this day has mapped places
        spec["tab_boxes"] = ((spec["regions"] or {}).get("struct") or {}).get("tabs") or []   # tab icon centring (Craig 12:41 PM PT)
        spec["logo_chips"] = [{"name": it.get("name"), "box": it["chip"]["box"], "name_cy": (it["first_text"]["box"][1] + it["first_text"]["box"][3] / 2) if (it.get("first_text") or {}).get("box") else None}
                              for it in (spec["regions"] or {}).get("items") or []
                              if (it.get("chip") or {}).get("visible") and (it.get("chip") or {}).get("box")]   # row logo centring (Craig 2026-10-10); name_cy = the row name's line centre (logo centred with the name, Craig 2026-10-10 part 2)
        with open(sp, "w") as fh: json.dump(spec, fh)
        p = subprocess.run(["node", RC, base, cand, sp], capture_output=True, text=True, cwd=HERE, timeout=1800)
        try: res = json.loads(p.stdout.strip().splitlines()[-1])
        except Exception: res = {"file": f, "ok": False, "reasons": ["restore-check failed to run: %s" % (p.stderr.strip()[-200:] or p.returncode)]}
        res["pixel_skipped"] = True
        res["reasons"] = [r for r in res.get("reasons", []) if r.startswith(("day-by-day map", "tab icons", "logo not vertically centred", "logo not centred with name", "generic logo", "no day map", "map tiles", "tiles look like", "tiles from wrong host", "no pins visible")) or "map region not recorded" in r or "map is missing" in r]
    else:
        p = subprocess.run(["node", RC, base, cand, sp], capture_output=True, text=True, cwd=HERE, timeout=1800)
        try: res = json.loads(p.stdout.strip().splitlines()[-1])
        except Exception: res = {"file": f, "ok": False, "reasons": ["restore-check failed to run: %s" % (p.stderr.strip()[-200:] or p.returncode)]}
    if spec["regions"] and spec["regions"].get("rows") and allow.get("mode") != "structure":
        rr_, nn_ = row_design(f, spec["regions"], res, allow)
        res.setdefault("reasons", []).extend(rr_); res.setdefault("notes", []).extend(nn_)
        res["ok"] = not res["reasons"]
    if f.startswith("daybyday") and isinstance(spec["regions"], dict):   # Craig 2026-10-08 12:20 PM PT: the styled map must be there
        if "map" not in spec["regions"]: res.setdefault("reasons", []).append("day-by-day map region not recorded by the capture (fail closed)")
        elif spec["regions"]["map"] is None and not spec["top"]: res.setdefault("reasons", []).append("day-by-day map missing (no map element on the page)")
        res["ok"] = not res.get("reasons")
    res["band"] = "PASS" if res.get("ok") else "FAIL"; res["overlay"] = spec["overlay"]
    return res

def _lum(css):
    m = re.findall(r"[\d.]+", css or "")
    return (0.299 * float(m[0]) + 0.587 * float(m[1]) + 0.114 * float(m[2])) if len(m) >= 3 else None

def row_design(f, reg, rc, allow):
    """Reasons (FAIL) + notes from the DOM row details of one shot. Missing details = FAIL (fail closed)."""
    reasons, notes = [], []
    if not isinstance(reg, dict) or not reg.get("rows"): return reasons, notes
    items = reg.get("items")
    if items is None: return ["region detection failed: no per-row details in capture-regions.json (capture older than Gate B v6)"], notes
    vw = (reg.get("viewport") or [None])[0] or 0
    top = f.endswith("-top.png"); vh = (reg.get("viewport") or [0, 0])[1]
    need_logo = set(allow.get("logo_required_categories", ["hotel"]))
    bad = {}; missing = []; wanted = 0
    def add(k, i, it): bad.setdefault(k, []).append("%d:%s" % (i + 1, (it.get("name") or "?")[:24]))
    base_h = [x.get("base_row_h") for x in (rc.get("rows") or []) if x.get("base_row_h")]
    bh = min(base_h) if base_h else None
    design = fm(f, allow.get("row_design", ["hotels-*", "cars-*", "flights-*"]))   # approved row design applies to these lists
    for i, it in enumerate(items):
        b = it.get("box") or [0, 0, 0, 0]
        cut = top and b[1] + b[3] > vh            # row cut by the viewport bottom: size/layout not judged on the -top shot
        img = it.get("img") or {}
        real_logo = bool(img.get("loaded") and img.get("visible") and min(img.get("natural") or [0]) >= 8 and (img.get("box") or [0, 0, 0, 0])[2] >= 12) or bool(it.get("bgimg"))
        wants = it.get("cat") in need_logo or it.get("has_logo") == "1" or bool(it.get("logo_src"))
        if wants and not real_logo:
            # Craig 2026-10-08 8:39: an occasional missing logo is OK (depends on search finding one); a generic placeholder is not
            ph = ((it.get("chip") or {}).get("text") or "").strip()
            src = (img.get("src") or "") + " " + (it.get("bgimg") or "")
            if ph: add("generic placeholder shown instead of a logo ('%s')" % ph, i, it)
            elif re.search(r"placeholder|generic|default|category|fallback|icon", src, re.I): add("generic placeholder image shown instead of a logo", i, it)
            else: missing.append("%d:%s" % (i + 1, (it.get("name") or "?")[:24]))
        if wants: wanted += 1
        if not design: continue
        ch = it.get("chip")
        if not ch or not ch.get("visible"): add("no logo chip at the left of the row", i, it)
        elif ch["box"][0] - b[0] > 16 or not (20 <= ch["box"][2] <= 40): add("logo chip not at the approved place/size", i, it)
        ft = it.get("first_text")
        if not ft or not ft.get("visible") or ft["box"][2] < 24: add("name not visible", i, it)
        if b[0] < 0 or (vw and b[0] + b[2] > vw + 1): add("row wider than the %dpx screen (x %d..%d)" % (vw, b[0], b[0] + b[2]), i, it)
        rcx = it.get("right_ctrl")
        if not cut and (not rcx or (vw and rcx[0] + rcx[2] > vw + 1)): add("right-hand control missing or off-screen", i, it)
        if not cut and bh and not (bh - 1 <= b[3] <= 2.6 * bh): add("row height %dpx outside one-to-two lines of the approved %dpx row" % (b[3], bh), i, it)
        if it.get("cat") == "flight":
            t = (ft or {}).get("text") or ""
            if not ft or not ft.get("visible") or ft["box"][2] < 24 or not re.search(r"[A-Za-z]{3,}", t) or re.match(r"^\s*\d{1,2}:\d{2}", t):
                add("airline name missing", i, it)
    for k, v in bad.items(): reasons.append("%s on %d row(s): %s" % (k, len(v), ", ".join(v[:4]) + (" +%d" % (len(v) - 4) if len(v) > 4 else "")))
    if missing:
        msg = "logo missing (no logo found, no placeholder) on %d of %d row(s): %s" % (len(missing), wanted, ", ".join(missing[:4]))
        if len(missing) > 1 and len(missing) * 5 > wanted: reasons.append(msg + " (more than 1 in 5 rows)")
        else: notes.append(msg + " (allowed: occasional)")
    if not design: return reasons, notes
    # cheapest first
    prices = []
    for it in items:
        m = re.search(r"\$\s*([\d,]+(?:\.\d+)?)", it.get("price_text") or it.get("text") or "")
        prices.append(float(m.group(1).replace(",", "")) if m else None)
    nums = [p for p in prices if p is not None]
    if len(nums) >= 2:
        first_none = next((i for i, p in enumerate(prices) if p is None), len(prices))
        if any(p is not None for p in prices[first_none:]) or nums != sorted(nums):
            reasons.append("list does not start cheapest first (prices in order: %s)" % ", ".join("-" if p is None else "%g" % p for p in prices[:8]))
    else:
        notes.append("no prices shown on this list's rows; cheapest-first order can't be verified from the screen")
    srt = reg.get("sort") or []
    pb = [x for x in srt if x["text"].lower().startswith("price")]; nb = [x for x in srt if x["text"].lower().startswith("name")]
    if not pb and fm(f, allow.get("sort_required", ["hotels-*", "cars-*", "flights-*"])) and not top: reasons.append("price sort control missing")
    elif nb and _lum(pb[0]["bg"]) is not None and _lum(nb[0]["bg"]) is not None and not (_lum(pb[0]["bg"]) < _lum(nb[0]["bg"]) - 40 and "\u2191" in pb[0]["text"]):
        reasons.append("initial sort is not 'Price \u2191' (price ascending) as the active control")
    return reasons, notes

# capture-tool detection / pixel-faking markers in ADDED lines of a PR diff
DETECT = [
    (re.compile(r"min-height:\s*0\s*!important"), "matches the Gate B capture's injected full-page CSS (min-height:0!important)"),
    (re.compile(r"navigator\.webdriver|\bwebdriver\b", re.I), "checks navigator.webdriver (automation detection)"),
    (re.compile(r"HeadlessChrome|\bheadless\b", re.I), "checks for a headless browser"),
    (re.compile(r"\b(playwright|puppeteer|__pw_|__playwright)\b", re.I), "references the capture tool (Playwright/Puppeteer)"),
    (re.compile(r"userAgent[^\n]{0,80}(test|match|includes|indexOf)", re.I), "branches on the user agent"),
    (re.compile(r"build-stamp[^\n]{0,60}(display|visibility)|data-build-stamp\][^\n]{0,40}none", re.I), "reacts to the capture's build-stamp hiding"),

]
FAKE_ASSET = re.compile(r"^public/.*(day-map|footer-|pill-|budget-card|edge-|desc-\d|tab-labels/|header-(word|plate|glyph|mark)|sprite|cover)[^/]*\.(png|jpe?g|webp)$", re.I)
FAKE_CODE = re.compile(r"data-ts-[a-z-]*(sprite|cover)\b", re.I)

def scan_diff(repo, rng):
    """Findings for added lines / added image files in `git diff rng` (merge-base..head). Empty list = clean."""
    found = []
    try:
        names = subprocess.run(["git", "-C", repo, "diff", "--name-status", rng], capture_output=True, text=True, timeout=120).stdout
        diff = subprocess.run(["git", "-C", repo, "diff", "-U0", rng, "--", ".", ":!public/assets"], capture_output=True, text=True, timeout=120).stdout
    except Exception as e:
        return [{"what": "diff scan failed (%s): fail closed" % type(e).__name__, "where": rng}]
    fakes = [l.split("\t")[-1] for l in names.splitlines() if l[:1] in "AM" and FAKE_ASSET.search(l.split("\t")[-1])]
    if fakes:
        found.append({"what": "adds %d bitmap stand-ins for live UI (screenshot crops painted into the page)" % len(fakes), "where": ", ".join(fakes[:8]) + (" +%d" % (len(fakes) - 8) if len(fakes) > 8 else "")})
    cur = None
    for line in diff.splitlines():
        if line.startswith("+++ "): cur = line[6:] if line.startswith("+++ b/") else line[4:]; continue
        if not line.startswith("+") or line.startswith("+++"): continue
        if cur and re.search(r"(^|/)(test|tests|scripts)/|\.test\.|_test\.", cur): continue   # test files may mention these words
        for rx, why in DETECT:
            m = rx.search(line)
            if m:
                s = max(0, m.start() - 60); found.append({"what": why, "where": "%s: ...%s..." % (cur, line[1:][s:m.end() + 60].strip())}); break
        m = FAKE_CODE.search(line)
        if m and not any(x["what"].startswith("renders sprite") for x in found):
            found.append({"what": "renders sprite/cover overlays (data-ts-*-sprite/-cover) instead of real UI", "where": "%s: %s" % (cur, m.group(0))})
    seen, uniq = set(), []
    for x in found:
        k = (x["what"], x["where"][:80])
        if k not in seen: seen.add(k); uniq.append(x)
    return uniq[:12]

# ---- Gate B part 3b (Craig 2026-10-10): feature parity, timeline icon centring, row layout, description substance + AI judge
LIST_PREFIX = ("hotels", "cars", "flights", "restaurants", "stores", "events")
TAB_NAME = {"hotels": "Hotels", "cars": "Cars", "flights": "Flights", "restaurants": "Restaurants", "stores": "Stores", "events": "Events", "budget": "Budget", "daybyday": "Day-by-Day"}
DESC_MIN_WORDS = 30
JUDGE_CAT = {"hotels": "hotel", "flights": "flight", "cars": "car", "restaurants": "restaurant", "stores": "store", "events": "event"}
RUBRIC = {   # Craig 2026-10-10: per-category rubric. The description must say WHY people rate the thing the way they do, with specific facts.
    "restaurant": "best or signature dishes, ambiance, food quality, service, location, price level, what reviewers praise or criticize",
    "flight": "airline, layover(s) and where, total length, departure and arrival times, price, notable pros and cons",
    "hotel": "location and area and what is nearby, room quality, standout amenities, service, price level, who it suits, common praise or complaints",
    "car": "rental company, car class, pickup and drop-off location and hours, price, reputation (lines, upsells)",
    "store": "what it sells, what it is known for, price level, why visit",
    "event": "what it is, when, why it is worth it, price",
}
JUDGE_SCHEMA = {"type": "object", "properties": {"score": {"type": "integer", "minimum": 1, "maximum": 5},
                "missing": {"type": "array", "items": {"type": "string"}}, "generic": {"type": "boolean"}},
                "required": ["score", "missing", "generic"]}
# Craig 2026-10-14: the managing dr does the qualitative check.
# Keep the category rubric and score/generic thresholds; no Claude usage gate.
from managing_dr_judge import ManagingDrJudge, ROOT as JUDGE_CACHE
JUDGE_CAP = 60

def desc_words(t): return len(re.findall(r"\S+", str(t or "")))

class DescJudge(ManagingDrJudge):
    rubrics = RUBRIC


def row_layout(f, reg, vw, vh, top):
    """Craig 2026-10-10 (part 3): on the 1280 list screens each row reads [logo] [name] [price] [description]: the description sits on the
    name line, after the price, and fills the rest of the row. A row whose description is under its name fails."""
    if vw < 1000 or not f.startswith(LIST_PREFIX): return []
    bad, unfilled = [], []
    for it in reg.get("items") or []:
        d, nb, b = it.get("desc_box"), (it.get("first_text") or {}).get("box"), it.get("box") or [0, 0, 0, 0]
        if not d or not nb or not it.get("desc"): continue
        if top and vh and b[1] + b[3] > vh: continue   # row cut by the viewport bottom
        nm = (it.get("name") or "?")[:24]
        anchor = it.get("price_box") or nb
        on_line = abs((d[1] + d[3] / 2) - (nb[1] + nb[3] / 2)) <= 6
        if not on_line or d[0] < anchor[0] + anchor[2] - 2:
            bad.append(nm); continue
        limit = (it["right_ctrl"][0] if it.get("right_ctrl") else b[0] + b[2]) - 8
        avail = limit - d[0]
        if avail > 0 and d[2] < 0.6 * avail and len(it["desc"]) * 6 >= 0.6 * avail:
            unfilled.append("%s (uses %d of %d px)" % (nm, d[2], avail))
    out = []
    if bad: out.append("row layout: description not on the name line (%s)" % ", ".join(bad[:6]) + (" +%d" % (len(bad) - 6) if len(bad) > 6 else ""))
    if unfilled: out.append("row layout: description does not fill the row (%s)" % ", ".join(unfilled[:6]))
    return out

def timeline_checks(st):
    """Craig 2026-10-10 (part 3): each day-by-day timeline icon is vertically centred (0.5 px) with its item name's first line."""
    reasons = []
    for t in st.get("timeline") or []:
        if t.get("icon_cy") is None: reasons.append("timeline icon missing (fail closed): %s" % (t.get("title") or "?")[:40]); continue
        if t.get("title_cy") is None: reasons.append("timeline name line not recorded (fail closed): %s" % (t.get("title") or "?")[:40]); continue
        d = abs(t["icon_cy"] - t["title_cy"])
        if d > 0.5: reasons.append("timeline icon not centred with name: %s off by %.1f px" % ((t.get("title") or "?")[:40], d))
    return reasons

def feature_parity(f, st, n_pr, ref, label):
    """Craig 2026-10-10 (part 3): nothing the reference has may be missing on the PR (controls, header controls, timeline items and
    sub-notes, list rows). A tab whose reference has rows but whose PR shows none (or a Coming soon placeholder) FAILS."""
    if not isinstance(ref, dict) or not ref.get("ok") or "struct" not in ref: return ["feature parity: %s capture has no inventory (fail closed; re-capture needed)" % label]
    if not st or "controls" not in st: return ["feature parity: PR capture has no inventory (fail closed; re-capture needed)"]
    stem = f.split("-")[0]; out = []
    cand_c = set(st.get("controls") or []); ref_st = ref["struct"]
    for c in ref_st.get("header_controls") or []:
        if c not in cand_c: out.append("feature lost vs %s: %s: header control '%s'" % (label, f, c))
    for c in ref_st.get("controls") or []:
        if c not in cand_c and c not in (ref_st.get("header_controls") or []): out.append("feature lost vs %s: %s: control '%s'" % (label, f, c))
    cand_titles = {t.get("title") for t in st.get("timeline") or []}
    cand_notes = {n for t in st.get("timeline") or [] for n in t.get("notes") or []}
    for t in ref_st.get("timeline") or []:
        if t.get("title") not in cand_titles: out.append("feature lost vs %s: %s: timeline item '%s'" % (label, f, (t.get("title") or "?")[:50]))
        for n in t.get("notes") or []:
            if n not in cand_notes: out.append("feature lost vs %s: %s: timeline note '%s'" % (label, f, n[:60]))
    if stem in LIST_PREFIX:
        n_ref = len(ref.get("items") or [])
        if n_ref and n_pr == 0: out.append("%s list empty: %d fixture things, 0 rows%s" % (TAB_NAME[stem], n_ref, " (Coming soon placeholder shown)" if st.get("placeholders") else ""))
        elif n_ref and n_pr < n_ref: out.append("feature lost vs %s: %s: %d rows on %s, %d on the PR" % (label, f, n_ref, label, n_pr))
    return out[:14]

def structure_extras(f, reg, st, staging, judge, vw, vh, top):
    """Part 3b reasons for one structure-mode shot (see structure_check). staging = the staging capture's regions dict (or None)."""
    reasons = []
    reasons += timeline_checks(st) if f.startswith("daybyday") else []
    reasons += row_layout(f, reg, vw, vh, top)
    if staging is None: reasons.append("feature parity: staging capture not given (fail closed)")
    else:
        reasons += feature_parity(f, st, len(reg.get("items") or []), staging.get(f), "staging")
    if f.startswith(LIST_PREFIX) and not top:
        items = reg.get("items") or []
        short = [it for it in items if desc_words(it.get("desc")) < DESC_MIN_WORDS]
        if short: reasons.append("description too short: %s (%d words)" % ((short[0].get("name") or "?")[:40], desc_words(short[0].get("desc"))) + ("" if len(short) == 1 else " and %d more rows under %d words" % (len(short) - 1, DESC_MIN_WORDS)))
        cat = JUDGE_CAT.get(f.split("-")[0])
        for it in items:
            txt = it.get("desc")
            if not txt or not cat: continue
            if re.search(r"\bDocumented\b.*\boption\b", txt, re.I): continue   # template text: already FAILed by the generic-description check
            name = (it.get("name") or "?")[:40]
            # Ask #51(c)(3), 20261014-0530: an opaque Priceline car (no known rental brand) shows the Priceline logo, so no rental-company name is required
            opaque = cat == "car" and ("opaque" in str(it.get("name") or "").lower() or "priceline" in str(it.get("logo_src") or "").lower())
            rubric = RUBRIC["car"].replace("rental company, ", "", 1) + " (opaque Priceline row: no rental-brand name required)" if opaque else None
            v = judge.judge(cat, name, it.get("price_text"), txt, rubric=rubric) if judge else None
            if v is None: reasons.append("description quality not judged this run: %s (managing-dr receipt missing or invalid)" % name); continue
            if v["score"] < 4 or v.get("generic"):
                reasons.append("description quality %d/5: %s: missing %s" % (v["score"], name, ", ".join(v.get("missing") or ["(generic text)"])[:160]))
    return reasons

def structure_check(f, reg, manifest, staging=None, judge=None):
    """Craig 2026-10-08 12:27 PM PT: structure mode for issue #273/#274. Pixel compare is skipped; these named checks decide.
    Returns reasons (FAIL)."""
    reasons = []
    if not isinstance(reg, dict) or not reg.get("ok"): return ["structure: capture regions missing for %s (fail closed)" % f]
    st = reg.get("struct") or {}
    vw = (reg.get("viewport") or [0, 0])[0]; top = f.endswith("-top.png")
    hdr = st.get("header")
    if not st: reasons.append("structure: struct block missing in capture-regions.json (capture older than structure mode; fail closed)")
    if not hdr or not (hdr.get("text") or "").strip(): reasons.append("header: trip title missing")
    elif vw and not (0 <= hdr["box"][0] and hdr["box"][0] + hdr["box"][2] <= vw + 1): reasons.append("header: title outside the screen")
    tabs = st.get("tabs") or []
    if f.startswith(("hotels", "cars", "flights", "restaurants", "stores", "events", "budget")) and not tabs: reasons.append("tabs: none on a list screen")
    if f.startswith(("hotels", "flights")) and not (reg.get("items") or []): reasons.append("rows: none recorded")   # cars may be empty (rows_optional)
    if not tabs and not f.startswith(("hotels", "cars", "flights", "restaurants", "stores", "events", "budget")): reasons.append("tabs: no category tabs found")
    if tabs and not any(t.get("icon") for t in tabs): reasons.append("tab icons: no icon boxes recorded (fail closed)")
    if tabs:
        bad = [t["text"] for t in tabs if vw and not t.get("scrollable", True) and (t["box"][0] < -1 or t["box"][0] + t["box"][2] > vw + 1)]
        if len({t["text"].lower().split()[0] for t in tabs}) < 8: reasons.append("tabs: %d of 8 category tabs found (%s)" % (len(tabs), ", ".join(t["text"] for t in tabs)))
        if bad: reasons.append("tabs: off the screen: %s" % ", ".join(bad[:6]))
        if not any(t.get("active") for t in tabs): reasons.append("tabs: none pressed")
    if f.startswith("daybyday"):
        chips = st.get("chips") or []
        if not chips: reasons.append("day chips: none found")
        else:
            off = [c["text"] for c in chips if vw and not c.get("scrollable") and (c["box"][0] < -1 or c["box"][0] + c["box"][2] > vw + 1)]
            if off: reasons.append("day chips: cut off at the screen edge and not scrollable: %s" % ", ".join(off[:6]))
            if not any(c.get("active") for c in chips): reasons.append("day chips: none selected")
        if not top:
            # Craig 2026-10-10 (part 3, 9:20 AM PT): the map must be BELOW the itinerary (replaces the 2026-10-08 'itinerary under the map' rule).
            heads = st.get("day_headings") or []
            if not heads: reasons.append("itinerary: no day heading (fail closed)")
            itin, m = st.get("itinerary"), (reg.get("map") or {}).get("box")
            if not itin: reasons.append("itinerary: card box not recorded (fail closed)")
            elif m and m[1] < itin[1] + itin[3] - 2: reasons.append("map must be below the itinerary (map top %dpx, itinerary bottom %dpx)" % (m[1], itin[1] + itin[3]))
    if top and (st.get("overflow_px") or 0) > 1: reasons.append("overflow: page is %dpx wider than the %dpx screen" % (st["overflow_px"], vw))
    lg = (hdr or {}).get("logo")
    if not lg: reasons.append("header logo: missing")
    else:
        gb = lg.get("group") or lg["box"]; cx = gb[0] + gb[2] / 2
        if vw and abs(cx - vw / 2) > 2: reasons.append("header logo: not centred (centre x %.0f vs %d)" % (cx, vw / 2))
    if f.startswith(("hotels", "cars", "flights")):
        srt = reg.get("sort") or []; pb = [x for x in srt if str(x.get("text", "")).lower().startswith("price")]
        if not pb: reasons.append("price sort: no Price sort button")
        elif not any(x.get("pressed") for x in pb): reasons.append("price sort: Price is not the active sort")
        rr, nn = row_design(f, reg, {"rows": []}, {"logo_required_categories": ["hotel"], "row_design": ["hotels-*", "cars-*", "flights-*"]})
        reasons += [r for r in rr if "cheapest" in r]
    offc = []
    for i, it in enumerate(reg.get("items") or []):
        ch, b = it.get("chip") or {}, it.get("box") or [0, 0, 0, 0]
        if ch.get("visible") and abs((ch["box"][1] + ch["box"][3] / 2) - (b[1] + b[3] / 2)) > 6: offc.append("%d:%s" % (i + 1, (it.get("name") or "?")[:20]))
    if offc: reasons.append("row logos: not vertically centred on %d row(s): %s" % (len(offc), ", ".join(offc[:4])))
    # Craig 2026-10-10 part 2 (rejected PR 274 again): every row shows its price (list screens with a Price sort), a real logo
    # (no shared placeholder), and a description that says why you would or would not want it. Missing details fail closed.
    items = reg.get("items") or []
    if items and not top:
        if any(str(x.get("text", "")).lower().startswith("price") for x in (reg.get("sort") or [])):
            nop = [it for it in items if not re.search(r"\d", it.get("price_text") or "")]   # a bare "$" with no amount is no price (flight rows)
            if nop: reasons.append("price missing on %d of %d rows (%s): %s" % (len(nop), len(items), f, ", ".join((it.get("name") or "?")[:24] for it in nop[:4])))
        def real_logo(it):
            img = it.get("img") or {}
            return bool(img.get("loaded") and img.get("visible") and min(img.get("natural") or [0]) >= 8 and (img.get("box") or [0, 0, 0, 0])[2] >= 12) or bool(it.get("bgimg"))
        shared = {}
        for it in items:
            ct = ((it.get("chip") or {}).get("text") or "").strip()
            if ct and not real_logo(it): shared[ct] = shared.get(ct, 0) + 1
        if shared and max(shared.values()) >= 3:
            ct, n = max(shared.items(), key=lambda kv: kv[1])
            reasons.append("generic logo on %d of %d rows (%s): the same placeholder '%s' on every row" % (n, len(items), f, ct))
        tmpl = re.compile(r"\bDocumented\b.*\boption\b|\((hotel|restaurant|flight|car|store|event|tour|music|activity)\)\s*$", re.I)
        tm = [(it, tmpl.search(it.get("desc") or it.get("text") or "")) for it in items]; tm = [(it, m) for it, m in tm if m]
        if tm: reasons.append("generic description on %d of %d rows (%s): template text '%s'" % (len(tm), len(items), f, tm[0][1].group(0)[:60]))
        if any("desc" not in it for it in items): reasons.append("generic descriptions: capture has no row description field (fail closed; re-capture needed)")
        else:
            cnt = {}
            for it in items:
                d = norm_text(it.get("desc"))
                if d: cnt[d] = cnt.get(d, 0) + 1
            if cnt and max(cnt.values()) >= 3:
                d, n = max(cnt.items(), key=lambda kv: kv[1])
                reasons.append('generic descriptions: %d rows share "%s"' % (n, d[:60]))
            short = [it for it in items if len(norm_text(it.get("desc")).split()) < 6]
            if short: reasons.append("generic descriptions: %d of %d rows under 6 words (%s), too little to say why you'd want it: %s" % (len(short), len(items), f, ", ".join((it.get("name") or "?")[:24] for it in short[:3])))
    if f.startswith("budget") and not top:   # Craig 2026-10-10: every thing on any itinerary day must be a Budget row; an empty budget with itinerary things FAILS
        body = st.get("body_text")
        names = budget_names()
        if body is None: reasons.append("budget list: capture has no rendered text (fail closed)")
        elif names is None: reasons.append("budget list: itinerary fixture unreadable (fail closed)")
        else:
            flat = norm_text(body)
            miss = [n for n in names if norm_text(budget_label(n)) not in flat]
            if miss: reasons.append("budget list missing %d itinerary things: %s" % (len(miss), ", ".join(miss[:5])))
    vh = (reg.get("viewport") or [0, 0])[1]
    reasons += structure_extras(f, reg, st, staging, judge, vw, vh, top)   # Craig 2026-10-10 part 3b: parity, timeline, row layout, substance, judge
    errs = (manifest or {}).get("page_errors") or []
    mine = [e["msg"] for e in errs if e.get("w") == vw and e.get("kind") == "pageerror"]
    if mine: reasons.append("page errors: %s" % "; ".join(sorted(set(mine))[:3]))
    noise = ["%s%s" % (e["msg"], (" (" + e["url"] + ")") if e.get("url") else "") for e in errs if e.get("w") == vw and e.get("kind") != "pageerror"
             and not (e["msg"].startswith("Failed to load resource") and re.search(r"\.(png|jpe?g|webp|svg|gif|ico)(\?|$)|/tiles?/|logo|/api/shared/[^/]+/edit-access", e.get("url") or ""))]   # edit-access 404 = capture fixture token (harness), not the page
    if noise and not mine: reasons.append("page errors: console error: %s" % "; ".join(sorted(set(noise))[:2]))
    return reasons

# ---- Detail-page reviews (Craig 2026-10-10 16:08 PT, #289): every thing except flights and cars needs 4 real reviews in the review boxes.
# Each review: star rating shown, full text of 25+ words, no placeholder hint, not a copy of another review; reviewer name optional.
# The detail capture writes capture-regions.json[<file>]["detail"] = {"reviews": [{"stars", "text", "name"?}], "name", "price_text",
# "hours", "phone", "address", "itinerary_note", "happy_hour"}. Missing data fails closed. Flight and car detail pages are exempt.
DETAIL_RE = re.compile(r"^(activity|attraction|bar|hotel|restaurant|store|transport)-(390|1280)\.png$")
DETAIL_CAT = {"hotel": "hotel", "restaurant": "restaurant", "bar": "restaurant", "store": "store", "activity": "event", "attraction": "event", "transport": "event"}
REVIEWS_NEEDED, REVIEW_MIN_WORDS = 4, 25
DETAIL_FIELDS = ("hours", "phone", "address", "itinerary_note", "price_text")   # + "ratings" (hotel, restaurant, bar, store), "happy_hour" (bar, restaurant)
PLACEHOLDER_RE = re.compile(r"lorem|ipsum|placeholder|\btodo\b|\btbd\b|add a review|no reviews? yet|write a review|coming soon|\bxxx+\b", re.I)

# Craig 2026-10-10 16:13 PT correction: the summary is built from ALL information about the thing (its website, articles, social posts
# and posts about it, and the reviews as one input). It is stored as d["summary"] with d["sources"] = [{"kind", "url"}], kind in
# website | article | social | review. At least 2 distinct non-review sources (url) are required. The summary is NOT required to come from reviews.
SUMMARY_MIN_WORDS, SOURCES_NEEDED = 30, 2
SOURCE_KINDS = ("website", "article", "social")
# Craig 2026-10-10 18:25 PT: the reviews should colour the summary more than any other single factor. The judge gets the review texts
# and checks the summary against them; a summary that contradicts or ignores the reviews fails.
SUMMARY_RUBRIC = ("specific to this one thing (not generic or boilerplate); at least 30 words; covers quality, price, reputation, "
                  "key products or dishes, and overall appeal, each with specific facts. Facts may come from any source, not only reviews. "
                  "The reviews are the single biggest influence on the summary: the summary must be consistent with the reviews, with the same "
                  "overall sentiment, and must reflect the praised or criticised items the reviews name. A summary that contradicts or ignores the reviews fails.")

# Craig 2026-10-10 18:35 PT: the 4 shown reviews are a representative, balanced sample of ALL reviews found for the thing.
# The detail capture stores d["review_totals"] = {"count", "average", "histogram": [n1..n5]} over every review found (1-5 stars).
# Composites are allowed only when labelled "Composite of N reviews" with sources and no reviewer name or date.
AVG_ROUNDING_TOL, SHOWN_MEAN_TOL, CRITICAL_SHARE = 0.05, 0.5, 0.15   # avg may be rounded to one decimal; shown-mean and critical-share rules
REVIEW_SAMPLE_ASK = ("You check the 4 reviews shown for one place. They must be a balanced, representative sample of ALL reviews found: "
                     "their star ratings must match the real distribution given in Text, and together they must cover the main themes people raise "
                     "(quality, price, service and ambiance, or the category equivalents, plus the key products or dishes). Score 1-5 how well the "
                     "sample does this, with no cherry-picking. List in missing any main theme the sample leaves out. Set generic to false.")

def stars_num(v):
    m = re.search(r"\d+(?:\.\d+)?", str(v or ""))
    return float(m.group(0)) if m else None

def detail_reasons(f, reg, judge):
    """Reasons (FAIL) for one detail-page shot. reg = capture-regions.json entry for the file (or None). Fails closed on missing data."""
    if not isinstance(reg, dict): return ["detail: capture regions missing for %s (fail closed)" % f]
    d = reg.get("detail")
    if not isinstance(d, dict): return ["detail: capture has no review or field data (fail closed; re-capture needed)"]
    kind = f.split("-")[0]; name = (d.get("name") or kind)[:40]
    reviews, reasons, texts, seen = d.get("reviews") or [], [], [], set()
    if len(reviews) < REVIEWS_NEEDED: reasons.append("reviews: %d of %d needed on %s" % (len(reviews), REVIEWS_NEEDED, name))
    for i, rv in enumerate(reviews[:REVIEWS_NEEDED]):
        t, n = str(rv.get("text") or "").strip(), i + 1
        if rv.get("stars") in (None, "") or not re.search(r"\d", str(rv.get("stars"))): reasons.append("review %d: star rating not shown" % n)
        if desc_words(t) < REVIEW_MIN_WORDS: reasons.append("review %d: text %d words (need %d+)" % (n, desc_words(t), REVIEW_MIN_WORDS))
        if not t or PLACEHOLDER_RE.search(t): reasons.append("review %d: placeholder or empty text" % n)
        k = norm_text(t)
        if k in seen: reasons.append("review %d: duplicate of an earlier review" % n)
        seen.add(k); texts.append(t)
        if rv.get("composite"):   # a composite is a labelled summary of many real reviews, never a real customer's words
            if not re.match(r"Composite of \d+ (?:[A-Za-z/&, ]+ )?reviews\b", str(rv.get("label") or "")) or rv.get("name") or rv.get("date") or not rv.get("sources"):
                reasons.append("review %d: composite must be labelled 'Composite of N reviews' with sources and no reviewer name or date" % n)
    tot = d.get("review_totals") if isinstance(d.get("review_totals"), dict) else {}
    hist, count, avg = tot.get("histogram"), tot.get("count"), tot.get("average")
    totals_ok = (isinstance(count, int) and count >= REVIEWS_NEEDED and isinstance(avg, (int, float)) and 1 <= avg <= 5
                 and isinstance(hist, list) and len(hist) == 5 and all(isinstance(h, int) and h >= 0 for h in hist) and sum(hist) == count
                 and abs(sum((i + 1) * h for i, h in enumerate(hist)) / count - avg) <= AVG_ROUNDING_TOL + 1e-9)
    if not totals_ok: reasons.append("review totals: count, average and 1-5 star histogram missing or inconsistent (need every review found, at least %d)" % REVIEWS_NEEDED)
    else:
        shown = [stars_num(rv.get("stars")) for rv in reviews[:REVIEWS_NEEDED]]
        shown = [s for s in shown if s is not None]
        if shown and abs(sum(shown) / len(shown) - avg) > SHOWN_MEAN_TOL: reasons.append("review sample: shown mean %.1f vs real average %.1f on %s (must be within %.1f)" % (sum(shown) / len(shown), avg, name, SHOWN_MEAN_TOL))
        if (hist[0] + hist[1]) / count >= CRITICAL_SHARE and not any(s is not None and s <= 2 for s in shown):
            reasons.append("review sample: %d%% of real ratings are 1-2 stars but no shown review is critical on %s" % (round(100 * (hist[0] + hist[1]) / count), name))
    fields = list(DETAIL_FIELDS) + (["ratings"] if kind in ("hotel", "restaurant", "bar", "store") else []) + (["happy_hour"] if kind in ("bar", "restaurant") else [])
    empty = [x for x in fields if not str(d.get(x) or "").strip() or PLACEHOLDER_RE.search(str(d.get(x)))]
    if len(empty) * 2 > len(fields): reasons.append("detail fields: %d of %d show only placeholder or no data (%s)" % (len(empty), len(fields), ", ".join(empty)))
    summary = str(d.get("summary") or "").strip()
    if desc_words(summary) < SUMMARY_MIN_WORDS or PLACEHOLDER_RE.search(summary): reasons.append("summary: %d words or placeholder (need %d+ real words)" % (desc_words(summary), SUMMARY_MIN_WORDS))
    srcs = set()
    for s in d.get("sources") or []:
        u = str((s or {}).get("url") or "").strip()
        if (s or {}).get("kind") in SOURCE_KINDS and u: srcs.add(u.lower().rstrip("/"))
    if len(srcs) < SOURCES_NEEDED: reasons.append("sources: %d distinct website/article/social sources with a url (need %d+; reviews do not count)" % (len(srcs), SOURCES_NEEDED))
    if not reasons:   # the summary judge only runs on a summary that already passes the rules above
        if judge is None: reasons.append("summary not judged (no judge given; fail closed)")
        else:
            v = judge.judge(DETAIL_CAT.get(kind, "event"), name, d.get("price_text"), summary, rubric=SUMMARY_RUBRIC, scope="detail-summary", reviews=texts)
            if v is None: reasons.append("summary not judged this run (managing-dr receipt missing or invalid)")
            elif v["score"] < 4 or v.get("generic"): reasons.append("summary %d/5: %s: missing %s" % (v["score"], name, ", ".join(v.get("missing") or ["(generic text)"])[:160]))
            else:   # the AI judge checks the 4 shown reviews are a balanced sample of all reviews (themes covered, no cherry-picking)
                real = "Real totals: %d reviews, average %.1f, 1-5 star counts %s. Shown reviews: %s" % (count, avg, hist, " | ".join("[%s stars, %s] %s" % (rv.get("stars"), rv.get("label") or rv.get("source") or "review", t) for rv, t in zip(reviews[:REVIEWS_NEEDED], texts)))
                rvj = judge.judge(DETAIL_CAT.get(kind, "event"), name, d.get("price_text"), real, scope="detail-reviews", ask=REVIEW_SAMPLE_ASK)
                if rvj is None: reasons.append("review sample not judged this run (managing-dr receipt missing or invalid)")
                elif rvj["score"] < 4: reasons.append("review sample %d/5: %s: missing %s" % (rvj["score"], name, ", ".join(rvj.get("missing") or ["(no balance)"])[:160]))
    return reasons

def load_regions(cand_dir):
    try: return json.load(open(os.path.join(cand_dir, "capture-regions.json")))
    except Exception: return None

def check_dir(allow, reference, cand_dir, workdir, files=None, staging_dir=None, judge=None):
    regions = load_regions(cand_dir)
    if judge is not None and hasattr(judge, "bind_capture"):
        judge.bind_capture(cand_dir)
    staging = load_regions(staging_dir) if staging_dir else None
    files = files or sorted(f for f in os.listdir(reference) if f.endswith(".png"))
    out = {f: check_screen(allow, f, reference, cand_dir, workdir, regions) for f in files}
    for f, r in out.items():
        if DETAIL_RE.match(f):
            r.setdefault("reasons", []).extend(detail_reasons(f, (regions or {}).get(f), judge)); r["ok"] = bool(r.get("ok")) and not r["reasons"]; r["band"] = "PASS" if r["ok"] else "FAIL"
    if allow.get("mode") == "structure":
        try: manifest = json.load(open(os.path.join(cand_dir, "capture-manifest.json")))
        except Exception: manifest = {}
        for f, r in out.items():
            rr = structure_check(f, (regions or {}).get(f), manifest, staging, judge)
            r.setdefault("reasons", []).extend(rr); r["ok"] = not r["reasons"]; r["band"] = "PASS" if r["ok"] else "FAIL"
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--baselines", required=True); ap.add_argument("--candidates", required=True)
    ap.add_argument("--issue", default="273"); ap.add_argument("--allow", default=ALLOW_F); ap.add_argument("--out")
    ap.add_argument("--diff-range"); ap.add_argument("--repo")
    ap.add_argument("--staging", help="staging capture dir (the feature-parity reference; required in structure mode)")
    ap.add_argument("--judge-offline", action="store_true", help="read managing-dr receipts only; do not write pending requests")
    a = ap.parse_args()
    allow = json.load(open(a.allow))[a.issue]
    out = a.out or os.path.join("/tmp", "v6-" + os.path.basename(a.candidates.rstrip("/"))); os.makedirs(out, exist_ok=True)
    judge = DescJudge(offline=a.judge_offline) if allow.get("mode") == "structure" or any(DETAIL_RE.match(x) for x in os.listdir(a.baselines)) else None
    res = check_dir(allow, a.baselines, a.candidates, out, staging_dir=a.staging, judge=judge)
    flags = scan_diff(a.repo, a.diff_range) if a.diff_range and a.repo else []
    bad = [f for f, r in res.items() if not r["ok"]]
    jstats = {"judge_calls": judge.calls, "cache_hits": judge.hits, "not_judged": judge.skipped, "usage_gate": judge.gate} if judge else None
    print(json.dumps({"overall": "FAIL" if bad or flags else "PASS", "failing": len(bad), "screens": len(res), "code_flags": flags, "judge": jstats,
                      "per_screen": {f: {"ok": r["ok"], "reasons": r.get("reasons"), "residual_px": r.get("residual_px"), "rows": r.get("rows"),
                                         "icons": r.get("icons"), "allowed_pct": r.get("allowed_pct"), "notes": r.get("notes")} for f, r in res.items()}}, indent=1))

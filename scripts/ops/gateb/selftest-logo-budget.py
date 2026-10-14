#!/usr/bin/env python3
"""selftest-logo-budget.py: unit cases for the Gate B structure checks added 2026-10-10 (Craig rejected PR 274).
  T5 logo centring (pixels): an off-centre tab glyph FAILS, a centred one PASSES, a centred row chip PASSES, an off-centre chip FAILS.
  T6 budget completeness (restore_check.structure_check): all itinerary things present PASSES; some missing FAILS with the count;
     an empty budget (Trip total only) FAILS with every thing missing; no rendered text fails closed.
  T7 (Craig 2026-10-10 part 2) row price on Price-sorted lists, generic description (template / shared / under 6 words / no field
     = fail closed), generic logo by shared placeholder chip (python) and pixel-identical chip crops (mjs).
  T10-T14 (Craig 2026-10-10 part 3b): description substance (30 words), managing-dr judge (offline receipts), row layout on 1280, timeline icon
     centring with the name, map below the itinerary, feature parity vs staging. The judge never calls the model in selftests.
  T8 logo centred with the NAME (logo glyph centre vs the name line centre, 0.5 px).
Writes only under ~/tsv-gateb/selftest-logo-budget/. Prints one line per case and exits non-zero on any failure. Never posts anywhere."""
import json, os, struct, subprocess, sys, zlib
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import restore_check as rc
OUT = os.path.join(HERE, "selftest-logo-budget"); os.makedirs(OUT, exist_ok=True)
FAILS = []

def png(path, w, h, px):   # px(x, y) -> (r, g, b)
    raw = b"".join(b"\x00" + bytes(c for x in range(w) for c in px(x, y)) for y in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

def pill_image(path, w, pill, glyph, dark=False):
    """White screen, one rounded-ish pill (border #d1d5db, fill white or dark) and a grey emoji-like blob at glyph=(x, y0, x1, y1)."""
    px_, py_, pw, ph = pill; gx0, gy0, gx1, gy1 = glyph
    fill = (17, 24, 39) if dark else (255, 255, 255)
    def px(x, y):
        if px_ <= x < px_ + pw and py_ <= y < py_ + ph:
            if x in (px_, px_ + pw - 1) or y in (py_, py_ + ph - 1): return (209, 213, 219)
            if gx0 <= x < gx1 and gy0 <= y < gy1: return (120, 120, 120)
            return fill
        return (255, 255, 255)
    png(path, w, pill[1] + 80, px)

def run_check(f, spec_extra, img, w, h):
    base = os.path.join(OUT, "base-" + f); cand = os.path.join(OUT, "cand-" + f)
    pill_image(base, w, img["pill"], img["glyph"], img.get("dark", False)); pill_image(cand, w, img["pill"], img["glyph"], img.get("dark", False))
    tab = {"text": "Budget", "box": list(img["pill"]), "icon": list(img["icon"]), "active": True}
    tabs = [] if img.get("no_tab") else [tab]   # chip-only cases have no tab pill in frame
    spec = {"file": f, "structure": True, "need_regions": False, "top": True, "pending_masks": [], "max_allowed_pct": 100, "icon_search_px": 4,
            "overlay": os.path.join(OUT, "ov-" + f), "day_map": False, "map_below_fold": False, "day_mapped_places": None,
            "tab_boxes": tabs, "logo_chips": spec_extra.get("logo_chips", []), "regions": {"ok": True, "viewport": [w, h], "struct": {"tabs": tabs}, "items": []}}
    sp = os.path.join(OUT, "spec-" + f + ".json"); json.dump(spec, open(sp, "w"))
    p = subprocess.run(["node", os.path.join(HERE, "restore-check.mjs"), base, cand, sp], capture_output=True, text=True, cwd=HERE, timeout=300)
    res = json.loads(p.stdout.strip().splitlines()[-1])
    return [r for r in res.get("reasons", []) if r.startswith(("logo not vertically centred", "logo not centred with name", "generic logo"))]

def case(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (("  [" + detail + "]") if detail else ""))
    if not cond: FAILS.append(name)

# ---- T5 logo centring, pixels. 390 wide: pill 28 tall at y=20 (centre 34). Tolerance 1 px.
pill = (20, 20, 48, 28)
r = run_check("t5-centred-390.png", {}, {"pill": pill, "icon": (30, 26, 14, 14), "glyph": (30, 28, 44, 40)}, 390, 120)  # glyph rows 28..39, centre 34
case("T5a centred tab glyph PASSES", r == [], str(r))
r = run_check("t5-low-390.png", {}, {"pill": pill, "icon": (30, 26, 14, 14), "glyph": (30, 33, 44, 45)}, 390, 120)     # rows 33..44, centre 39 -> 5 px low
case("T5b off-centre tab glyph FAILS with named reason", len(r) == 1 and "tab Budget off by 5.0 px" in r[0], str(r))
r = run_check("t5-1px-390.png", {}, {"pill": pill, "icon": (30, 26, 14, 14), "glyph": (30, 29, 44, 40)}, 390, 120)     # rows 29..40, centre 35 -> 1 px, allowed
case("T5c 1 px off on 390 is within tolerance", r == [], str(r))
r = run_check("t5-2px-390.png", {}, {"pill": pill, "icon": (30, 26, 14, 14), "glyph": (30, 30, 44, 41)}, 390, 120)     # rows 30..41, centre 36 -> 2 px, FAIL
case("T5d 2 px off on 390 FAILS", len(r) == 1, str(r))
chip = [{"name": "Hotel A", "box": [20, 20, 48, 28]}]
r = run_check("t5-chip-off.png", {"logo_chips": chip}, {"pill": (20, 20, 48, 28), "icon": (200, 100, 5, 5), "glyph": (24, 33, 40, 46), "no_tab": True}, 390, 120)  # chip glyph rows 33..45, centre 39 vs chip centre 34 -> 5 px low
case("T5e off-centre row logo chip FAILS", any("row logo Hotel A off by" in x for x in r), str(r))

small = [{"name": "Flight A", "box": [20, 20, 16, 16]}]
r = run_check("t5-chip16-centred.png", {"logo_chips": small}, {"pill": (20, 20, 16, 16), "icon": (200, 100, 5, 5), "glyph": (24, 24, 32, 32), "no_tab": True}, 390, 120)
case("T5f centred 16 px emoji chip PASSES", r == [], str(r))
r = run_check("t5-chip16-low.png", {"logo_chips": small}, {"pill": (20, 20, 16, 16), "icon": (200, 100, 5, 5), "glyph": (24, 28, 32, 36), "no_tab": True}, 390, 120)
case("T5g 16 px emoji chip 4 px low FAILS", len(r) == 1 and "row logo Flight A off by" in r[0], str(r))

# ---- T6 budget completeness (python: structure_check on a budget screen)
names = rc.budget_names() or []
case("T6 fixture itinerary names loaded", len(names) > 0, "%d names" % len(names))
def budget_reasons(body):
    reg = {"ok": True, "viewport": [390, 844], "struct": {"header": {"logo": {"box": [184, 45, 22, 22], "group": [184, 0, 22, 0]}, "box": [20, 109, 350, 39], "text": "Trip"},
           "tabs": [{"icon": [28 + 54 * i, 289, 16, 16], "label": None, "text": t, "box": [12 + 54 * i, 283, 48, 28], "active": t == "Budget"} for i, t in enumerate(["Day-by-Day", "Flights", "Hotels", "Cars", "Restaurants", "Stores", "Events", "Budget"])],
           "chips": [], "day_headings": [], "page_errors": [], "doc_width": 390, "view_width": 390, "overflow_px": 0}, "map": None, "items": [], "rows": [], "sort": []}
    if body is not None: reg["struct"]["body_text"] = body
    return [x for x in rc.structure_check("budget-390.png", reg, {}) if x.startswith("budget list")]
full = "Trip total Timeline 240 USD Target 0 USD\n" + "\n".join(names)
r = budget_reasons(full)
case("T6a every itinerary thing in the budget PASSES", r == [], str(r))
r = budget_reasons(full.replace(names[0], "").replace(names[5], ""))
case("T6b two missing things FAIL with the count", r == ["budget list missing 2 itinerary things: %s" % ", ".join([names[0], names[5]])], str(r))
r = budget_reasons("Overall trip budget\nTrip total Timeline 0 USD Target 0 USD")
case("T6c empty budget FAILS: all %d things missing" % len(names), len(r) == 1 and r[0].startswith("budget list missing %d itinerary things" % len(names)), str(r)[:160])
r = budget_reasons(None)
case("T6d no rendered text fails closed", len(r) == 1 and "fail closed" in r[0], str(r))
# ask #51(c)(2): the Budget screen does not render the fixture's internal 'Flight option: ' prefix
flights = [n for n in names if n.startswith("Flight option: ")]
case("T6e fixture has Flight option names", len(flights) > 0, "%d names" % len(flights))
r = budget_reasons("\n".join(["Trip total"] + [rc.budget_label(n) for n in names]))
case("T6f prefix-stripped flight rows PASS", r == [], str(r)[:160])
r = budget_reasons("\n".join(["Trip total"] + [rc.budget_label(n) for n in names if n != flights[0]]))
case("T6g a flight truly absent still FAILS", r == ["budget list missing 1 itinerary things: %s" % flights[0]], str(r)[:160])

# ---- T7 row price + generic description + generic logo (python, structure_check on a list screen)
def row(name, price=None, desc="Boutique hotel in Midtown with a rooftop bar, suits couples", chip="", has_desc=True, real=False):
    it = {"name": name, "box": [16, 100, 358, 64], "cat": "hotel", "price_text": price, "chip": {"box": [27, 120, 16, 16], "visible": True, "text": chip},
          "img": {"loaded": True, "visible": True, "natural": [64, 64], "box": [27, 120, 32, 32], "src": "https://x/logo.png"} if real else None,
          "bgimg": None, "name": name, "first_text": {"text": name, "box": [49, 110, 98, 18], "visible": True}, "text": name + " " + desc}
    if has_desc: it["desc"] = desc
    return it
def list_reg(items, price_sort=True):
    srt = [{"text": "Price \u2191", "pressed": True, "bg": "rgb(17,24,39)"}, {"text": "Name", "pressed": False, "bg": "rgb(255,255,255)"}] if price_sort else []
    return {"ok": True, "viewport": [390, 844], "struct": {"header": {"logo": {"box": [184, 45, 22, 22], "group": [184, 0, 22, 0]}, "box": [20, 109, 350, 39], "text": "Trip"}, "tabs": []},
            "items": items, "rows": [{"base_row_h": 64}], "sort": srt, "map": None, "chips": []}
def list_reasons(items, price_sort=True, f="hotels-390.png", top=False):
    fn = f if not top else f.replace(".png", "-top.png")
    return rc.structure_check(fn, list_reg(items, price_sort), {})
names5 = ["Hotel %d" % i for i in range(5)]
priced = [row(n, price="$%d" % (200 + i), desc="Desc unique %d about the place and who it suits" % i) for i, n in enumerate(names5)]
r = list_reasons(priced)
case("T7a priced rows with distinct descriptions PASS the new checks", not [x for x in r if x.startswith(("price", "generic"))], str(r)[:200])
r = list_reasons([row(n, price=None, desc="Desc unique %d about the place and who it suits" % i) for i, n in enumerate(names5)])
case("T7b no price on 5 of 5 rows FAILS (Price sort on)", any(x.startswith("price missing on 5 of 5 rows") for x in r), str(r)[:200])
r = list_reasons([row(n, price=None, desc="Desc unique %d about the place and who it suits" % i) for i, n in enumerate(names5)], price_sort=False)
case("T7c no Price sort on the screen: no price rule", not any(x.startswith("price missing") for x in r), str(r)[:200])
tmpl = [row(n, price="$%d" % (200 + i), desc="Documented NYC option (hotel)") for i, n in enumerate(names5)]
r = list_reasons(tmpl)
case("T7d template 'Documented NYC option (hotel)' FAILS", any(x.startswith("generic description on 5 of 5 rows") for x in r) and any("share" in x for x in r), str(r)[:300])
short = [row(n, price="$%d" % (200 + i), desc="Hotel near Times Square") for i, n in enumerate(names5)]
r = list_reasons(short)
case("T7e 4-word descriptions FAIL as under 6 words", any("under 6 words" in x for x in r), str(r)[:200])
nofield = [row(n, price="$%d" % (200 + i), has_desc=False) for i, n in enumerate(names5)]
r = list_reasons(nofield)
case("T7f capture without a description field fails closed", any("no row description field" in x for x in r), str(r)[:200])
ph = [row(n, price="$%d" % (200 + i), desc="Desc unique %d about the place and who it suits" % i, chip="\U0001F9F3") for i, n in enumerate(names5)]
r = list_reasons(ph)
case("T7g shared placeholder chip on 5 of 5 rows FAILS (generic logo)", any(x.startswith("generic logo on 5 of 5 rows") for x in r), str(r)[:200])
mixed = [row(n, price="$%d" % (200 + i), desc="Desc unique %d about the place and who it suits" % i, chip="\U0001F9F3", real=(i < 3)) for i, n in enumerate(names5)]
r = list_reasons(mixed)
case("T7h placeholder only on rows without a real logo (2 of 5) PASSES", not any(x.startswith("generic logo") for x in r), str(r)[:200])
r = list_reasons([row(n, price="$", desc="Desc unique %d about the place and who it suits" % i) for i, n in enumerate(names5)])
case("T7j a bare '$' with no amount is no price (FAILS)", any(x.startswith("price missing on 5 of 5 rows") for x in r), str(r)[:200])
r = list_reasons(priced, top=True)
case("T7i the -top shot is not judged on rows", not [x for x in r if x.startswith(("price", "generic"))], str(r)[:200])

def chip_png(path, w, chips, px_for):   # chips: [(x, y, size)], px_for(i, dx, dy) -> rgb inside the chip
    def px(x, y):
        for i, (cx, cy, s) in enumerate(chips):
            if cx <= x < cx + s and cy <= y < cy + s: return px_for(i, x - cx, y - cy)
        return (255, 255, 255)
    png(path, w, 120, px)
def run_chips(f, chips, px_for, names=None):
    base = os.path.join(OUT, "base-" + f); cand = os.path.join(OUT, "cand-" + f)
    chip_png(base, 390, chips, px_for); chip_png(cand, 390, chips, px_for)
    lc = [{"name": (names or ["Row %d" % i for i in range(len(chips))])[i], "box": [cx, cy, s, s], "name_cy": None} for i, (cx, cy, s) in enumerate(chips)]
    spec = {"file": f, "structure": True, "need_regions": False, "top": True, "pending_masks": [], "max_allowed_pct": 100, "icon_search_px": 4,
            "overlay": os.path.join(OUT, "ov-" + f), "day_map": False, "map_below_fold": False, "day_mapped_places": None,
            "tab_boxes": [], "logo_chips": lc, "regions": {"ok": True, "viewport": [390, 120], "struct": {"tabs": []}, "items": []}}
    sp = os.path.join(OUT, "spec-" + f + ".json"); json.dump(spec, open(sp, "w"))
    p = subprocess.run(["node", os.path.join(HERE, "restore-check.mjs"), base, cand, sp], capture_output=True, text=True, cwd=HERE, timeout=300)
    res = json.loads(p.stdout.strip().splitlines()[-1])
    return res

# T8 logo centred with the name (pixels: glyph centre vs name line centre; 0.5 px). Chip 16 px at y=20 (box centre 28), glyph rows 24..31 (centre 28).
def name_case(f, name_cy):
    chip = [{"name": "Flight A", "box": [20, 20, 16, 16], "name_cy": name_cy}]
    return run_check(f, {"logo_chips": chip}, {"pill": (20, 20, 16, 16), "icon": (200, 100, 5, 5), "glyph": (24, 24, 32, 32), "no_tab": True}, 390, 120)
r = name_case("t8-name-ok.png", 28.0)
case("T8a logo centred with its name PASSES", r == [], str(r))
r = name_case("t8-name-0p4.png", 28.4)
case("T8b 0.4 px off the name line is within tolerance", r == [], str(r))
r = name_case("t8-name-off.png", 30.5)
case("T8c logo 2.5 px off the name line FAILS with the named reason", len(r) == 1 and r[0].startswith("logo not centred with name: Flight A off by 2.5 px"), str(r))

# T9 generic logo by pixels: 3 identical chip crops FAIL; 3 different crops PASS
def same_px(i, dx, dy): return (120, 120, 120) if (dx + dy) % 3 else (30, 30, 200)
def diff_px(i, dx, dy): return ((i * 80) % 256, (dx * 15) % 256, (dy * 15 + i) % 256) if (dx + dy) % 3 else (30, 30, 200)
chips3 = [(20, 20, 16), (60, 20, 16), (100, 20, 16)]
r = run_chips("t9-same.png", chips3, same_px, ["Hotel A", "Hotel B", "Hotel C"])
rr = [x for x in r.get("reasons", []) if x.startswith("generic logo")]
case("T9a three pixel-identical chip crops FAIL (generic logo)", len(rr) == 1 and "generic logo on 3 of 3 rows" in rr[0], str(r.get("reasons"))[:200])
r = run_chips("t9-diff.png", chips3, diff_px, ["Hotel A", "Hotel B", "Hotel C"])
rr = [x for x in r.get("reasons", []) if x.startswith("generic logo")]
case("T9b three different chip crops PASS", rr == [], str(r.get("reasons"))[:200])

# ---- T10 (Craig 2026-10-10 part 3b) description substance + managing-dr quality judge. Judge runs OFFLINE from a temp cache (no model calls).
JC = os.path.join(OUT, "selftest-dr-receipts")
RICH = ("Known for thin-crust pizza and late-night slices; the back room is dim and loud, which reviewers love, but weekend dinner service is slow "
        "and the bill runs about 45 dollars a head before drinks, with a short walk from the subway and a quieter room upstairs.")
GENERIC = ("A popular restaurant in the area that many people enjoy visiting for a meal, with good food and nice staff overall, "
           "and it is a fine place to spend a pleasant time with friends or family during your visit to the city and its many spots.")
SHORT = "Great pizza, nice vibe, good value."
FLIGHT = ("Southwest nonstop flight with cheap fares and a friendly crew, boarding is quick and the seats are comfortable on this route, "
          "you get two free checked bags and the arrival time suits a late afternoon start in the city.")
BISTRO = ("Thirty plus words of mostly fine copy about a bistro near the park with decent wine and a pleasant patio where guests linger over "
          "coffee and tell stories about the neighborhood history and the owners who run it.")
NOTJUDGED = ("Never judged text that has more than thirty words in it so the judge must say no to it, which is the case that fails closed here "
             "and it has enough words to get past the length rule on its own.")
from managing_dr_judge import atomic_json
import datetime

def put(cat, text, score, missing, generic):
    dj = rc.DescJudge(cache_path=JC, offline=True)
    name, price = ("Southwest", "$89") if cat == "flight" else ("Place A", "$120")
    req = dj.request(cat, name, price, text)
    rec = dict(req, reviewer="gpt", reviewed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
               reason="Synthetic unit-test fixture, not a production verdict", verdict={"score":score,"missing":missing,"generic":generic})
    atomic_json(os.path.join(JC, "verdicts", req["key"]+".json"), rec)
put("restaurant", RICH, 5, [], False)
put("restaurant", GENERIC, 2, ["best dishes", "ambiance", "price level"], True)
put("restaurant", SHORT, 3, ["best dishes", "ambiance"], False)
put("flight", FLIGHT, 3, ["layover", "total length"], False)
put("restaurant", BISTRO, 4, [], False)
def judge_offline(): return rc.DescJudge(cache_path=JC, offline=True, usage=False)
def rest_reg(items):
    return {"ok": True, "viewport": [390, 844], "struct": {"header": {"logo": {"box": [184, 45, 22, 22], "group": [184, 0, 22, 0]}, "box": [20, 109, 350, 39], "text": "Trip"}, "tabs": []},
            "items": items, "rows": [{"base_row_h": 64}], "sort": [{"text": "Price ↑", "pressed": True, "bg": "rgb(17,24,39)"}, {"text": "Name", "pressed": False, "bg": "rgb(255,255,255)"}], "map": None, "chips": []}
def judged(f, text, name="Place A", price="$120", judge=None):
    reg = rest_reg([row(name, price=price, desc=text)])
    return rc.structure_check(f, reg, {}, None, judge or judge_offline())
r = judged("restaurants-390.png", RICH)
case("T10a rich restaurant description PASSES (>=30 words, judge 5/5)", not [x for x in r if x.startswith(("description", "generic"))], str(r)[:240])
r = judged("restaurants-390.png", GENERIC)
case("T10b generic restaurant description FAILS (judge 2/5, generic)", any(x.startswith("description quality 2/5: Place A: missing best dishes") for x in r), str(r)[:240])
r = judged("restaurants-390.png", SHORT)
case("T10c short description FAILS (under 30 words)", any(x.startswith("description too short: Place A (6 words)") for x in r), str(r)[:240])
r = judged("flights-390.png", FLIGHT, "Southwest", "$89")
case("T10d flight with no layover or length FAILS (judge 3/5)", any(x.startswith("description quality 3/5: Southwest: missing layover, total length") for x in r), str(r)[:240])
r = judged("restaurants-390.png", BISTRO)
case("T10e judge 4/5 (the threshold) PASSES", not [x for x in r if x.startswith(("description quality", "description too short"))], str(r)[:240])
r = judged("restaurants-390.png", NOTJUDGED)
case("T10f uncached row with the judge offline is 'not judged', never a pass", any(x.startswith("description quality not judged this run: Place A") for x in r), str(r)[:240])
DJ = rc.DescJudge(cache_path=os.path.join(OUT, "missing-cache.json"), offline=True, usage=False)
case("T10g offline judge never calls the model", DJ.judge("restaurant", "x", None, "some text") is None and DJ.calls == 0)
DJ2 = rc.DescJudge(cache_path=os.path.join(OUT, "missing-dr-receipts"), offline=False, usage=True)
gated = DJ2.judge("restaurant", "x", None, "some uncached text here") is None and DJ2.calls == 0 and DJ2.gate == "managing dr judgment required"
case("T10h missing dr receipt fails closed without a Claude usage/model call", gated)

# ---- T11 row layout on 1280 (description on the name line, after the price, filling the row)
def row1280(name, price_box, desc_box, right, box=(96, 457, 1088, 64), desc="A description with plenty of substance here about the place and who it suits best"):
    it = row(name, price="$120", desc=desc)
    it.update({"box": list(box), "first_text": {"text": name, "box": [129, 468, 98, 18], "visible": True}, "price_box": price_box, "desc_box": desc_box, "right_ctrl": right})
    return it
def layout(items):
    return rc.row_layout("hotels-1280.png", {"items": items}, 1280, 800, False)
r = layout([row1280("Hotel A", [236, 468, 40, 18], [284, 468, 700, 18], [1108, 470, 65, 17])])
case("T11a description after the price on the name line PASSES", r == [], str(r))
r = layout([row1280("Hotel A", None, [129, 497, 1044, 15], [1108, 470, 65, 17])])
case("T11b description under the name FAILS with the named reason", len(r) == 1 and r[0].startswith("row layout: description not on the name line (Hotel A)"), str(r))
r = layout([row1280("Hotel A", [236, 468, 40, 18], [284, 468, 120, 18], [1108, 470, 65, 17], desc=" ".join(["word"] * 40))])
case("T11c description that does not fill the row FAILS", len(r) == 1 and r[0].startswith("row layout: description does not fill the row (Hotel A (uses 120 of"), str(r))
r = rc.row_layout("hotels-390.png", {"items": [row1280("Hotel A", None, [129, 497, 1044, 15], None)]}, 390, 844, False)
case("T11d 390 wide: layout not judged (the description wraps below)", r == [], str(r))

# ---- T12 timeline icon centring with the item name (0.5 px); the approved sub-note
def tl(title, icon_cy, title_cy, notes=()):
    return {"title": title, "title_box": [215, 966, 105, 18], "title_cy": title_cy, "icon": [186, 967, 21, 17], "icon_cy": icon_cy, "icon_text": "x", "row_box": [113, 961, 1054, 58], "notes": list(notes)}
r = rc.timeline_checks({"timeline": [tl("Travel to airport", 975.5, 975.5), tl("Sleep: Hotel Beacon", 1292.5, 1292.0)]})
case("T12a icons centred with the name (0.5 px) PASS", r == [], str(r))
r = rc.timeline_checks({"timeline": [tl("Check-in: Hotel Beacon", 1164.0, 1192.5, ["Conflict with Travel from airport"])]})
case("T12b icon 28.5 px off the name FAILS with the named reason", r == ["timeline icon not centred with name: Check-in: Hotel Beacon off by 28.5 px"], str(r))
r = rc.timeline_checks({"timeline": [tl("Travel to airport", None, 975.0)]})
case("T12c timeline icon missing fails closed", len(r) == 1 and "fail closed" in r[0], str(r))

# ---- T13 map must be below the itinerary (full day-by-day shot). Synthetic regions shaped like the capture.
TABS = [{"text": t, "box": [12 + 120 * i, 283, 110, 30], "icon": [20 + 120 * i, 290, 16, 16], "label": None, "active": t == "Day-by-Day"} for i, t in enumerate(
        ["Day-by-Day", "Flights", "Hotels", "Cars", "Restaurants", "Stores", "Events", "Budget"])]
def day_reg(map_box, itin_box):
    return {"ok": True, "viewport": [1280, 800], "map": {"box": map_box},
            "struct": {"header": {"logo": {"box": [629, 45, 22, 22], "group": [629, 0, 22, 0]}, "box": [20, 109, 1240, 39], "text": "Trip"}, "tabs": TABS,
                       "chips": [{"text": "Day 1", "box": [109, 391, 52, 31], "scrollable": True, "active": True}], "day_headings": [{"text": "Day 1", "box": [151, 898, 1016, 21]}],
                       "itinerary": itin_box, "page_errors": [], "doc_width": 1280, "view_width": 1280, "overflow_px": 0, "body_text": "x", "timeline": []},
            "items": [], "sort": [], "rows": [], "chips": []}
ITIN = [96, 881, 1088, 476]
r = [x for x in rc.structure_check("daybyday-1280.png", day_reg([96, 1380, 1088, 420], ITIN), {}) if "below" in x or "itinerary" in x]
case("T13a map below the itinerary PASSES", r == [], str(r))
r = [x for x in rc.structure_check("daybyday-1280.png", day_reg([96, 449, 1088, 420], ITIN), {}) if "below" in x]
case("T13b map above the itinerary FAILS: map must be below the itinerary", len(r) == 1 and r[0].startswith("map must be below the itinerary (map top 449px, itinerary bottom 1357px)"), str(r))
r = [x for x in rc.structure_check("daybyday-1280.png", day_reg([96, 1000, 1088, 420], ITIN), {}) if "below" in x]
case("T13c map overlapping the itinerary FAILS", len(r) == 1, str(r))

# ---- T14 feature parity vs staging (controls, header controls, timeline items and sub-notes, list rows, Coming soon)
def inv(controls, header, items=(), timeline=(), placeholders=()):
    st = {"controls": list(controls), "header_controls": list(header), "timeline": list(timeline), "placeholders": list(placeholders), "header": None, "tabs": [], "chips": []}
    return {"ok": True, "viewport": [390, 844], "struct": st, "items": [dict(row(n, price="$1", desc="x"), **{"name": n}) for n in items], "rows": [], "sort": []}
REF = inv(["Admin", "Keepsakes", "Hotels"], ["Admin", "Keepsakes"], ["Hotel A", "Hotel B", "Hotel C"],
          [{"title": "Check-in: Hotel Beacon", "notes": ["Approved short hotel note"]}])
def parity(cand):
    return [x for x in rc.structure_extras("hotels-390.png", dict(cand, rows=[], sort=[]), cand["struct"], {"hotels-390.png": REF}, None, 390, 844, False) if x.startswith(("feature", "Hotels"))]
r = parity(inv(["Admin", "Keepsakes", "Hotels"], ["Admin", "Keepsakes"], ["Hotel A", "Hotel B", "Hotel C"], [{"title": "Check-in: Hotel Beacon", "notes": ["Approved short hotel note"]}]))
case("T14a identical inventory PASSES", r == [], str(r))
r = parity(inv(["Admin", "Hotels"], ["Admin"], ["Hotel A", "Hotel B", "Hotel C"], [{"title": "Check-in: Hotel Beacon", "notes": ["Approved short hotel note"]}]))
case("T14b a lost header control FAILS (feature lost vs staging)", r == ["feature lost vs staging: hotels-390.png: header control 'Keepsakes'"], str(r))
r = parity(inv(["Admin", "Keepsakes", "Hotels"], ["Admin", "Keepsakes"], ["Hotel A", "Hotel B", "Hotel C"], [{"title": "Check-in: Hotel Beacon", "notes": []}]))
case("T14c a lost timeline sub-note FAILS (the approved hotel note)", any("timeline note 'Approved short hotel note'" in x for x in r), str(r))
r = parity(inv(["Admin", "Keepsakes", "Hotels"], ["Admin", "Keepsakes"], [], [{"title": "Check-in: Hotel Beacon", "notes": ["Approved short hotel note"]}], ["Coming soon"]))
case("T14d a list with 0 rows where staging has 3 FAILS (Coming soon shown)", any(x.startswith("Hotels list empty: 3 fixture things, 0 rows (Coming soon placeholder shown)") for x in r), str(r))
cand = inv(["Admin", "Keepsakes", "Hotels"], ["Admin", "Keepsakes"], ["Hotel A"], [{"title": "Check-in: Hotel Beacon", "notes": ["Approved short hotel note"]}])
r = [x for x in rc.structure_extras("hotels-390.png", dict(cand, rows=[], sort=[]), cand["struct"], {"hotels-390.png": REF}, None, 390, 844, False) if x.startswith(("feature", "Hotels"))]
case("T14f fewer rows on the PR than staging FAILS (1 of 3)", r == ["feature lost vs staging: hotels-390.png: 3 rows on staging, 1 on the PR"], str(r))
r = [x for x in rc.structure_extras("hotels-390.png", dict(inv([], []), rows=[], sort=[]), inv([], [])["struct"], None, None, 390, 844, False) if x.startswith("feature")]
case("T14e no staging capture given: fails closed", r == ["feature parity: staging capture not given (fail closed)"], str(r))

# ask #51(c)(3): an opaque Priceline car is judged without the rental-company requirement; a branded car keeps it
class FakeJudge:
    def __init__(self): self.rubrics = []
    def judge(self, cat, name, price, text, rubric=None, scope=None, reviews=None, ask=None):
        self.rubrics.append(rubric); return {"score": 5, "missing": [], "generic": False}
def car_rubrics(name, logo_src=None):
    it = row(name, price="$48", desc="Economy car picked up at the airport counter with hours on the desk sign and a flat daily price of 48 dollars with taxes included")
    it["cat"] = "car"
    if logo_src: it["logo_src"] = logo_src
    reg = list_reg([it]); j = FakeJudge()
    rc.structure_extras("cars-390.png", reg, reg["struct"], None, j, 390, 844, False)
    return j.rubrics
opq = car_rubrics("Priceline opaque Toyota Corolla", "https://www.priceline.com/favicon.ico")
case("T15a opaque Priceline car: no rental-company requirement, hours and price kept", len(opq) == 1 and opq[0] is not None and "rental company" not in opq[0] and "pickup and drop-off" in opq[0] and "price" in opq[0], str(opq)[:160])
brand = car_rubrics("Hertz Economy")
case("T15b branded car keeps the rental-company requirement", brand == [None], str(brand)[:160])

# 20261014-0530: the judge cache key includes an overridden rubric, so a default-rubric verdict is never served to the opaque-car rubric
jc = rc.DescJudge(cache_path=os.path.join(OUT,"rubric-dr-receipts"), offline=True, usage=False)
txt_k = "Economy car with hours on the desk sign, flat daily price and pickup at the airport counter, all stated in plain words here"
rq = jc.request("car", "n", None, txt_k)
atomic_json(os.path.join(str(jc.root), "verdicts", rq["key"]+".json"), dict(rq, reviewer="gpt", reviewed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), reason="Synthetic rubric unit-test fixture", verdict={"score":5,"missing":[],"generic":False}))
case("T15c default-rubric cache hit still served", jc.judge("car", "n", None, txt_k) is not None)
case("T15d overridden rubric is not served the default-rubric verdict", jc.judge("car", "n", None, txt_k, rubric="X") is None)

print("\nRESULT:", "ALL PASS" if not FAILS else "FAILED: " + ", ".join(FAILS))
sys.exit(1 if FAILS else 0)

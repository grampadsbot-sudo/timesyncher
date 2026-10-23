#!/usr/bin/env python3
"""Per-head Gate B capture fixture (claude-code 2026-10-14, chief dr decision).

The static NYC trip fixture (fixture-nyc/nyc-shared.json) has places 1-63 only, so a PR head whose VK data snapshot carries
rows 601-611 can never bind to it. This adds the head's own snapshot rows (the output of
scripts/regenerate_pr336_search_trip_fixture.mjs, i.e. the GATE_B_ROWS render) to the places list and to thingOverrides,
keyed by row id, so _capture_payload_faults can compare the capture against that same snapshot.
Nothing is relaxed here: the fault checks and vk_contract_check.py run unchanged on the result."""
import json, os, re, subprocess, sys, tempfile

def _norm_name(name):
    return re.sub(r"\s+", " ", str(name or "").replace("\u2019", "'")).strip().lower()

def _travel_cat(place):
    cat = str(place.get("category_name") or place.get("category") or "").lower()
    if cat in ("hotel", "flight", "car", "cars", "rental car"):
        return "car" if "car" in cat or cat == "rental car" else cat
    return ""

def _row_price(place, override):
    for raw in (override.get("price"), place.get("price")):
        if raw is None or raw == "":
            continue
        if isinstance(raw, (int, float)) and raw > 0:
            return float(raw)
        m = re.search(r"\d", str(raw))
        if m:
            return 1.0
    return 0.0

def prune_duplicate_travel_places(fx):
    """Drop legacy base rows when a later snapshot row shares the same travel name (Gate B coverage names)."""
    places = fx.get("places") or []
    overrides = fx.get("thingOverrides") or {}
    travel = {}
    for place in places:
        cat = _travel_cat(place)
        if not cat:
            continue
        key = (_norm_name(place.get("name")), cat)
        pid = int(place.get("id") or 0)
        ov = overrides.get("place:%s" % pid) or overrides.get(str(pid)) or {}
        score = (_row_price(place, ov), pid)
        prev = travel.get(key)
        if prev is None or score > prev[0]:
            travel[key] = (score, place)
    keep_ids = {p.get("id") for p in places if not _travel_cat(p)}
    keep_ids.update(p.get("id") for _, p in travel.values())
    drop = {p.get("id") for p in places if p.get("id") not in keep_ids}
    if not drop:
        return fx
    fx["places"] = [p for p in places if p.get("id") not in drop]
    for pid in drop:
        overrides.pop("place:%s" % pid, None)
        overrides.pop(str(pid), None)
    fx["thingOverrides"] = overrides
    return fx

def normalize_place_names(fx):
    for place in fx.get("places") or []:
        if place.get("name"):
            place["name"] = str(place["name"]).replace("\u2019", "'")
    return fx

def fill_budget(fixture, checkout, script_text, out):
    """Set budget[] to what `checkout`'s own syncSharedTripApiBudget() computes for `fixture` (claude-code 2026-10-14, #385 wiring).
    The driver is scripts/gateb_head_budget_lines.mjs as it stands on the base branch (`script_text`), run against the checkout's
    src/, so every head and base is fed the same driver and only its module differs. Nothing is typed by hand. `checkout` is a
    directory holding src/ (and node_modules for the module's imports). Raises on any driver failure: the caller fails closed."""
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "scripts"))
        driver = os.path.join(tmp, "scripts", "gateb_head_budget_lines.mjs")
        with open(driver, "w") as fh: fh.write(script_text)
        os.symlink(os.path.join(os.path.abspath(checkout), "src"), os.path.join(tmp, "src"))
        rc = subprocess.run(["node", driver, os.path.abspath(fixture)], cwd=tmp, capture_output=True, text=True, timeout=180)
    if rc.returncode: raise RuntimeError("budget driver failed rc=%d: %s" % (rc.returncode, (rc.stderr or "").strip()[-200:]))
    budget = json.loads(rc.stdout)
    if not isinstance(budget, list): raise ValueError("budget driver did not print a list")
    with open(fixture) as fh: fx = json.load(fh)
    fx["budget"] = budget
    with open(out, "w") as fh:
        json.dump(fx, fh, ensure_ascii=False, indent=1); fh.write("\n")
    return out

def build(base_fixture, snapshot, out):
    def norm_name(name):
        return re.sub(r"\s+", " ", str(name or "").replace("\u2019", "'")).strip().lower()

    def travel_cat(place):
        cat = str(place.get("category_name") or place.get("category") or "").lower()
        if cat in ("hotel", "flight", "car", "cars", "rental car"):
            return "car" if "car" in cat or cat == "rental car" else cat
        return ""

    def row_price(place, override):
        for raw in (override.get("price"), place.get("price")):
            if raw is None or raw == "":
                continue
            if isinstance(raw, (int, float)) and raw > 0:
                return float(raw)
            if re.search(r"\d", str(raw)):
                return 1.0
        return 0.0

    def prune_duplicate_travel_places(fx):
        places = fx.get("places") or []
        overrides = fx.get("thingOverrides") or {}
        travel = {}
        for place in places:
            cat = travel_cat(place)
            if not cat:
                continue
            key = (norm_name(place.get("name")), cat)
            pid = int(place.get("id") or 0)
            ov = overrides.get("place:%s" % pid) or overrides.get(str(pid)) or {}
            score = (row_price(place, ov), pid)
            prev = travel.get(key)
            if prev is None or score > prev[0]:
                travel[key] = (score, place)
        keep_ids = {p.get("id") for p in places if not travel_cat(p)}
        keep_ids.update(p.get("id") for _, p in travel.values())
        drop = {p.get("id") for p in places if p.get("id") not in keep_ids}
        if not drop:
            return fx
        fx["places"] = [p for p in places if p.get("id") not in drop]
        for pid in drop:
            overrides.pop("place:%s" % pid, None)
            overrides.pop(str(pid), None)
        fx["thingOverrides"] = overrides
        return fx

    with open(base_fixture) as fh: fx = json.load(fh)
    with open(snapshot) as fh: snap = json.load(fh)
    if not isinstance(snap, dict) or not snap: raise ValueError("data snapshot is empty or not an object")
    cats = {str(c.get("name", "")).lower(): c.get("id") for c in fx.get("categories", []) if isinstance(c, dict)}
    trip_id = (fx.get("trip") or {}).get("id", 1)
    places = [p for p in fx.get("places", []) if isinstance(p, dict)]
    have = {str(p.get("id")) for p in places}
    overrides = dict(fx.get("thingOverrides") or {})
    for rid in sorted(snap, key=lambda k: int(k)):
        src = snap[rid]
        if not isinstance(src, dict): raise ValueError("snapshot row %s is not an object" % rid)
        if str(rid) in have: raise ValueError("snapshot row %s collides with a base fixture place id" % rid)
        cat = str(src.get("category") or "").lower()
        places.append({"id": int(rid), "trip_id": trip_id, "name": src.get("title"), "description": src.get("description"),
                       "lat": src.get("lat"), "lng": src.get("lng"), "address": src.get("address") or None,
                       "category_id": cats.get(cat), "category_name": src.get("category"), "price": src.get("price"),
                       "currency": "USD", "website": src.get("url") or None, "reservation_status": "considering",
                       "duration_minutes": 60, "transport_mode": "walking"})
        key = "place:" + str(rid)
        if key in overrides or str(rid) in overrides:
            raise ValueError("snapshot row %s collides with a base fixture override" % rid)
        overrides[key] = {k: src[k] for k in ("title", "summary", "description", "logoUrl", "price", "lat", "lng", "reviews",
                                                   "sourceRecord", "externalId", "source", "url", "address", "category") if k in src}
    fx["places"] = places
    fx["thingOverrides"] = overrides
    fx = prune_duplicate_travel_places(fx)
    with open(out, "w") as fh:
        json.dump(fx, fh, ensure_ascii=False, indent=1); fh.write("\n")
    return out

if __name__ == "__main__":
    print(build(*sys.argv[1:4]))

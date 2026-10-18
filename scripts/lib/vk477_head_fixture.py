import json, os, re, subprocess, tempfile

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
        overrides[str(rid)] = {k: src[k] for k in ("title", "summary", "description", "logoUrl", "price", "lat", "lng", "reviews",
                                                   "sourceRecord", "externalId", "source", "url", "address", "category") if k in src}
    fx["places"] = places
    fx["thingOverrides"] = overrides
    with open(out, "w") as fh:
        json.dump(fx, fh, ensure_ascii=False, indent=1); fh.write("\n")
    return out


def _load_json_file(path):
    with open(path) as fh: return json.load(fh)


def _row_id(v):
    for k in ("id", "placeId", "rowId"):
        if v.get(k) is not None: return str(v.get(k))
    return ""


def _capture_rows(fixture_obj):
    if isinstance(fixture_obj, dict):
        if isinstance(fixture_obj.get("places"), list):
            return {str(p.get("id")): p for p in fixture_obj.get("places") if isinstance(p, dict) and p.get("id") is not None}
        for k in ("searchPlaces", "things", "rows"):
            if isinstance(fixture_obj.get(k), dict): return {str(rid): p for rid, p in fixture_obj[k].items() if isinstance(p, dict)}
            if isinstance(fixture_obj.get(k), list): return {_row_id(p): p for p in fixture_obj[k] if isinstance(p, dict) and _row_id(p)}
    return {}


def _data_text(v): return re.sub(r"\s+", " ", str(v or "")).strip()


def _blank(v):
    return v is None or v == "" or v == [] or v == {}


def _effective_capture_row(fixture_obj, rid, row):
    """Place row with blank fields filled from thingOverrides (top-level by id, or on the place)."""
    merged = dict(row) if isinstance(row, dict) else {}
    patches = []
    if isinstance(fixture_obj, dict):
        top = fixture_obj.get("thingOverrides")
        if isinstance(top, dict):
            hit = top.get(str(rid))
            if isinstance(hit, dict): patches.append(hit)
    inner = merged.get("thingOverrides")
    if isinstance(inner, dict):
        hit = inner.get(str(rid)) if isinstance(inner.get(str(rid)), dict) else None
        if hit: patches.append(hit)
        elif any(k in inner for k in ("summary", "description", "logoUrl", "price", "title", "name", "lat", "lng", "reviews", "sourceRecord")):
            patches.append(inner)
    for patch in patches:
        for k, v in patch.items():
            if not _blank(v) and _blank(merged.get(k)): merged[k] = v
    return merged


def _review_texts(p):
    if not isinstance(p, dict): return []
    src = p.get("sourceRecord") if isinstance(p.get("sourceRecord"), dict) else {}
    vals = []
    for obj in (p, src):
        for k in ("review1", "review2", "review3", "review4"):
            vals.append(_data_text(obj.get(k)).lower())
        reviews = obj.get("reviews")
        if isinstance(reviews, list):
            for x in reviews:
                if isinstance(x, dict): vals.append(_data_text(x.get("text") or x.get("review") or x.get("body")).lower())
                else: vals.append(_data_text(x).lower())
    return sorted(v for v in vals if v)


def _logo_text(p):
    if not isinstance(p, dict): return ""
    src = p.get("sourceRecord") if isinstance(p.get("sourceRecord"), dict) else {}
    return _data_text(p.get("logoUrl") or src.get("logoUrl") or src.get("logo") or src.get("faviconUrl"))


def _price_num(v):
    if v in (None, ""): return None
    try: return float(str(v).replace("$", "").replace(",", ""))
    except ValueError: return None


def _capture_payload_faults(snapshot_path, fixture_path):
    snap = _load_json_file(snapshot_path)
    if not isinstance(snap, dict) or not snap:
        return ["DATA-CONTRACT: data snapshot is empty or not an object"]
    fixture = _load_json_file(fixture_path)
    captured = _capture_rows(fixture)
    if not captured:
        return ["DATA-CONTRACT: captured fixture has no row payload to bind to the snapshot"]
    missing = sorted(str(k) for k in snap if str(k) not in captured)
    if missing:
        return ["DATA-CONTRACT: captured fixture missing snapshot rows: %s" % ", ".join(missing[:12])]
    faults = []
    for rid, src in snap.items():
        if not isinstance(src, dict):
            faults.append("DATA-CONTRACT: snapshot row %s is not an object" % rid); continue
        dst = _effective_capture_row(fixture, rid, captured.get(str(rid)) or {})
        src_name = _data_text(src.get("title") or src.get("name"))
        dst_name = _data_text(dst.get("title") or dst.get("name"))
        if src_name and dst_name.lower() != src_name.lower():
            faults.append("DATA-CONTRACT: captured row %s identity mismatch snapshot=%r capture=%r" % (rid, src_name, dst_name))
        for field in ("summary", "description"):
            src_v = _data_text(src.get(field))
            dst_v = _data_text(dst.get(field))
            if src_v and dst_v.lower() != src_v.lower():
                faults.append("DATA-CONTRACT: captured row %s %s mismatch" % (rid, field))
        src_logo, dst_logo = _logo_text(src), _logo_text(dst)
        if src_logo and dst_logo.lower() != src_logo.lower():
            faults.append("DATA-CONTRACT: captured row %s logo mismatch" % rid)
        src_price = _price_num(src.get("price"))
        if src_price is None and isinstance(src.get("sourceRecord"), dict):
            src_price = _price_num(src["sourceRecord"].get("price"))
        if src_price is not None:
            dst_price = _price_num(dst.get("price"))
            if dst_price is None and isinstance(dst.get("sourceRecord"), dict):
                dst_price = _price_num(dst["sourceRecord"].get("price"))
            if dst_price != src_price:
                faults.append("DATA-CONTRACT: captured row %s price mismatch snapshot=%r capture=%r" % (rid, src_price, dst_price))
        if src.get("lat") not in (None, "") and src.get("lng") not in (None, ""):
            try:
                if abs(float(src.get("lat")) - float(dst.get("lat"))) > 1e-4 or abs(float(src.get("lng")) - float(dst.get("lng"))) > 1e-4:
                    faults.append("DATA-CONTRACT: captured row %s coordinates mismatch" % rid)
            except (TypeError, ValueError):
                faults.append("DATA-CONTRACT: captured row %s coordinates missing" % rid)
        src_reviews, dst_reviews = _review_texts(src), _review_texts(dst)
        if src_reviews and src_reviews != dst_reviews:
            faults.append("DATA-CONTRACT: captured row %s reviews mismatch" % rid)
        if len(faults) >= 12: break
    return faults


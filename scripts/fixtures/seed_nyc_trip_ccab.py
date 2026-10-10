#!/usr/bin/env python3
"""One-off seed for local NYC screenshot run. Names and enrichment from nyc_ccab_place_enrichment.json."""
from __future__ import annotations
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path("/workspace")
DB = ROOT / "trek-src/server/data/travel.db"
TOKEN = "8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y"
ENRICHMENT_PATH = ROOT / "scripts/fixtures/nyc_ccab_place_enrichment.json"


def load_enrichment() -> dict[str, dict]:
    payload = json.loads(ENRICHMENT_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise SystemExit(f"Expected object in {ENRICHMENT_PATH}")
    return payload


def all_documented_names(enrichment: dict[str, dict]) -> list[str]:
    return sorted(enrichment.keys(), key=str.lower)


def infer_category(name: str, record: dict | None = None) -> str:
    if record and record.get("category"):
        return str(record["category"])
    t = name.lower()
    if re.search(r"\bflight\b|southwest|jetblue|united|delta|american|\blas\b|\bjfk\b|\blga\b|\bewr\b", t):
        return "flight"
    if re.search(r"rental car|car rental|hertz|avis|enterprise|budget rent|alamo", t):
        return "car"
    if re.search(r"whole foods|juice generation|grocery|market|store|pharmacy|zabar|tiffany|bergdorf|saks|nordstrom|macy|apple fifth|moma design|strand book|chelsea market|pure green", t):
        return "store"
    if re.search(r"hotel|marriott|hyatt|hilton|sheraton|motto|pod|romer|lucerne|wallace|beacon|arthouse|empire|manhattan club|towneplace|belleclaire|park central|manhattan at times", t):
        return "hotel"
    if re.search(r"restaurant|bistro|bar|wine|mexicano|smith|bodega|nobody told|amelie|dead poet", t):
        return "restaurant"
    if re.search(r"jazz|music|festival|vanguard|smoke|blue note|dizzy|birdland|gallery", t):
        return "music"
    if re.search(r"tour|statue|ellis|bus|boat|walking|audio history", t):
        return "tour"
    return "other"


def main() -> None:
    if not DB.exists():
        raise SystemExit(f"Database not found: {DB}. Start TREK server once to initialize schema.")
    if not ENRICHMENT_PATH.exists():
        raise SystemExit(f"Missing enrichment fixture: {ENRICHMENT_PATH}")

    enrichment = load_enrichment()
    names = all_documented_names(enrichment)
    if len(names) < 1:
        raise SystemExit("nyc_ccab_place_enrichment.json has no places")

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    existing = cur.execute("SELECT id FROM trips WHERE title = ?", ("Craig / Kim NYC June 2026",)).fetchone()
    if existing:
        trip_id = int(existing["id"])
        print(json.dumps({"status": "exists", "trip_id": trip_id, "token": TOKEN, "places": len(names)}))
        con.close()
        return

    admin = cur.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
    if not admin:
        raise SystemExit("No admin user in DB")
    admin_id = int(admin["id"])

    cur.execute(
        "INSERT INTO trips (user_id, title, description, start_date, end_date, currency) VALUES (?, ?, ?, ?, ?, ?)",
        (
            admin_id,
            "Craig / Kim NYC June 2026",
            "Las Vegas to New York · Jun 23–30, 2026 · UWS / Lincoln Center priority · planning options only",
            "2026-06-23",
            "2026-06-30",
            "USD",
        ),
    )
    trip_id = int(cur.lastrowid)

    day_ids: list[int] = []
    for i in range(8):
        d = f"2026-06-{23 + i}"
        cur.execute("INSERT INTO days (trip_id, day_number, date) VALUES (?, ?, ?)", (trip_id, i + 1, d))
        day_ids.append(int(cur.lastrowid))

    cur.execute(
        """INSERT INTO share_tokens
           (trip_id, token, created_by, share_map, share_bookings, share_packing, share_budget, share_collab, expires_at)
           VALUES (?, ?, ?, 1, 1, 1, 1, 0, NULL)""",
        (trip_id, TOKEN, admin_id),
    )

    cat_map = {
        "flight": 5,
        "hotel": 1,
        "restaurant": 2,
        "store": 4,
        "music": 6,
        "tour": 3,
        "car": 5,
        "other": 10,
    }

    for idx, name in enumerate(names):
        record = enrichment.get(name) or {}
        cat = infer_category(name, record)
        cat_id = cat_map.get(cat, 10)
        day_id = day_ids[idx % len(day_ids)]
        description = str(record.get("description") or record.get("summary") or "").strip()
        if not description:
            raise SystemExit(f"Missing description for documented place: {name}")
        price = record.get("price")
        website = record.get("website")
        logo_url = record.get("logoUrl")
        lat = record.get("lat")
        lng = record.get("lng")
        address = record.get("address")
        cur.execute(
            """INSERT INTO places (
                 trip_id, name, description, lat, lng, address, category_id, price, currency,
                 reservation_status, notes, website, transport_mode, image_url
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'considering', ?, ?, 'walking', ?)""",
            (
                trip_id,
                name,
                description,
                lat,
                lng,
                address,
                cat_id,
                price,
                description,
                website,
                logo_url,
            ),
        )
        place_id = int(cur.lastrowid)
        cur.execute(
            "INSERT INTO day_assignments (day_id, place_id, order_index) VALUES (?, ?, ?)",
            (day_id, place_id, idx % 5),
        )
        rtype = cat if cat in {"flight", "hotel", "restaurant"} else "activity"
        cur.execute(
            """INSERT INTO reservations (trip_id, day_id, place_id, title, status, type, needs_review)
               VALUES (?, ?, ?, ?, 'candidate', ?, 1)""",
            (trip_id, day_id, place_id, name, rtype),
        )

    con.commit()
    con.close()
    print(json.dumps({"status": "seeded", "trip_id": trip_id, "places": len(names), "token": TOKEN}))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""One-off seed for local NYC screenshot run. Names only from repo sources (see SOURCES in report)."""
from __future__ import annotations
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path("/workspace")
DB = ROOT / "trek-src/server/data/travel.db"
TOKEN = "8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y"

LINKS_FILES = [
    ROOT / "scripts/update_trek_official_links.py",
    ROOT / "scripts/fix_remaining_trek_links.py",
]

STORE_BASELINES = {
    "zabar's": "Zabar's",
    "tiffany & co. the landmark": "Tiffany & Co. The Landmark",
    "bergdorf goodman": "Bergdorf Goodman",
    "saks fifth avenue": "Saks Fifth Avenue",
    "nordstrom nyc flagship": "Nordstrom NYC Flagship",
    "macy's herald square": "Macy's Herald Square",
    "apple fifth avenue": "Apple Fifth Avenue",
    "moma design store - 53rd street": "MoMA Design Store - 53rd Street",
    "strand book store": "Strand Book Store",
    "chelsea market": "Chelsea Market",
}


def extract_link_script_names() -> list[str]:
    names: list[str] = []
    for path in LINKS_FILES:
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"'([^']+)'\s*:\s*'https?://", text):
            names.append(m.group(1))
    return names


def all_documented_names() -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for n in extract_link_script_names() + list(STORE_BASELINES.values()):
        key = n.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(n.strip())
    return sorted(out, key=str.lower)


def infer_category(name: str) -> str:
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

    names = all_documented_names()
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    existing = cur.execute("SELECT id FROM trips WHERE title = ?", ("Craig / Kim NYC June 2026",)).fetchone()
    if existing:
        trip_id = int(existing["id"])
        print(json.dumps({"status": "exists", "trip_id": trip_id, "token": TOKEN}))
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
        cat = infer_category(name)
        cat_id = cat_map.get(cat, 10)
        day_id = day_ids[idx % len(day_ids)]
        cur.execute(
            """INSERT INTO places (trip_id, name, description, category_id, currency, reservation_status, transport_mode)
               VALUES (?, ?, ?, ?, 'USD', 'considering', 'walking')""",
            (trip_id, name, f"Documented NYC option ({cat})", cat_id),
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

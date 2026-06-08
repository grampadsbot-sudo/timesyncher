#!/usr/bin/env python3
"""Export the local TREK SQLite DB into TimeSyncher Vacation hosted JSON.

This is a dry-run migration tool. It does not write to Neon/Postgres.
It preserves original SQLite table/id references in metadata so the later
import can be validated and debugged.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


CORE_TABLES = [
    "users",
    "trips",
    "days",
    "places",
    "reservations",
    "day_assignments",
    "day_notes",
    "budget_items",
    "shared_travel_thing_fields",
    "share_tokens",
    "share_token_overrides",
]


def row_dicts(conn: sqlite3.Connection, table: str) -> list[dict]:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()
    return [dict(row) for row in rows]


def table_count(conn: sqlite3.Connection, table: str) -> int:
    return int(conn.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0])


def source_meta(table: str, row: dict) -> dict:
    return {
        "sqlite_table": table,
        "sqlite_source_id": row.get("id"),
    }


def parse_json(value, fallback):
    if value in (None, ""):
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def split_name(value: str | None) -> tuple[str | None, str | None]:
    value = (value or "").strip()
    if not value:
        return None, None
    parts = value.split()
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def hosted_customer(user: dict) -> dict:
    first_name, last_name = split_name(user.get("username"))
    return {
        "source_key": f'users:{user["id"]}',
        "email": user.get("email"),
        "first_name": first_name,
        "last_name": last_name,
        "display_name": user.get("username"),
        "metadata": {
            **source_meta("users", user),
            "role": user.get("role"),
            "created_at": user.get("created_at"),
            "updated_at": user.get("updated_at"),
        },
    }


def hosted_trip(trip: dict) -> dict:
    return {
        "source_key": f'trips:{trip["id"]}',
        "customer_source_key": f'users:{trip["user_id"]}',
        "title": trip.get("title") or "Vacation",
        "destination": None,
        "start_date": trip.get("start_date"),
        "end_date": trip.get("end_date"),
        "party": {},
        "preferences": {
            "description": trip.get("description"),
            "currency": trip.get("currency"),
            "cover_image": trip.get("cover_image"),
        },
        "status": "migrated",
        "metadata": {
            **source_meta("trips", trip),
            "created_at": trip.get("created_at"),
            "updated_at": trip.get("updated_at"),
        },
    }


def thing_from_place(place: dict) -> dict:
    return {
        "source_key": f'places:{place["id"]}',
        "trip_source_key": f'trips:{place["trip_id"]}',
        "category": "place",
        "subtype": None,
        "title": place.get("name") or "Untitled place",
        "description": place.get("description"),
        "starts_at": None,
        "ends_at": None,
        "cost_estimate_cents": int(round(float(place.get("price") or 0) * 100)) if place.get("price") is not None else None,
        "currency": (place.get("currency") or "usd").lower(),
        "location": {
            "lat": place.get("lat"),
            "lng": place.get("lng"),
            "address": place.get("address"),
        },
        "links": [
            {"type": "website", "url": place.get("website")}
        ] if place.get("website") else [],
        "ratings": {},
        "metadata": {
            **source_meta("places", place),
            "phone": place.get("phone"),
            "google_place_id": place.get("google_place_id"),
            "image_url": place.get("image_url"),
            "notes": place.get("notes"),
            "reservation_status": place.get("reservation_status"),
            "reservation_notes": place.get("reservation_notes"),
            "reservation_datetime": place.get("reservation_datetime"),
            "place_time": place.get("place_time"),
            "end_time": place.get("end_time"),
            "duration_minutes": place.get("duration_minutes"),
            "transport_mode": place.get("transport_mode"),
            "osm_id": place.get("osm_id"),
            "route_geometry": place.get("route_geometry"),
        },
    }


def thing_from_reservation(reservation: dict) -> dict:
    return {
        "source_key": f'reservations:{reservation["id"]}',
        "trip_source_key": f'trips:{reservation["trip_id"]}',
        "category": reservation.get("type") or "reservation",
        "subtype": "reservation",
        "title": reservation.get("title") or "Untitled reservation",
        "description": reservation.get("notes"),
        "starts_at": reservation.get("reservation_time"),
        "ends_at": reservation.get("reservation_end_time"),
        "cost_estimate_cents": None,
        "currency": "usd",
        "location": {
            "name": reservation.get("location"),
        },
        "links": [],
        "ratings": {},
        "metadata": {
            **source_meta("reservations", reservation),
            "day_id": reservation.get("day_id"),
            "end_day_id": reservation.get("end_day_id"),
            "place_id": reservation.get("place_id"),
            "assignment_id": reservation.get("assignment_id"),
            "confirmation_number": reservation.get("confirmation_number"),
            "status": reservation.get("status"),
            "accommodation_id": reservation.get("accommodation_id"),
            "metadata": parse_json(reservation.get("metadata"), reservation.get("metadata")),
            "needs_review": reservation.get("needs_review"),
            "day_plan_position": reservation.get("day_plan_position"),
        },
    }


def hosted_budget_item(item: dict) -> dict:
    return {
        "source_key": f'budget_items:{item["id"]}',
        "trip_source_key": f'trips:{item["trip_id"]}',
        "source_thing_key": f'reservations:{item["reservation_id"]}' if item.get("reservation_id") else None,
        "category": item.get("category") or "Other",
        "label": item.get("name") or "Budget item",
        "amount_cents": int(round(float(item.get("total_price") or 0) * 100)),
        "currency": "usd",
        "metadata": {
            **source_meta("budget_items", item),
            "persons": item.get("persons"),
            "days": item.get("days"),
            "note": item.get("note"),
            "sort_order": item.get("sort_order"),
            "expense_date": item.get("expense_date"),
            "paid_by_user_id": item.get("paid_by_user_id"),
        },
    }


def hosted_support_notes(day_notes: list[dict], share_tokens: list[dict], overrides: list[dict]) -> list[dict]:
    notes = []
    for note in day_notes:
        notes.append({
            "source_key": f'day_notes:{note["id"]}',
            "trip_source_key": f'trips:{note["trip_id"]}',
            "actor": "migration",
            "note": note.get("text") or "",
            "metadata": {
                **source_meta("day_notes", note),
                "day_id": note.get("day_id"),
                "time": note.get("time"),
                "icon": note.get("icon"),
                "sort_order": note.get("sort_order"),
            },
        })
    for token in share_tokens:
        notes.append({
            "source_key": f'share_tokens:{token["id"]}',
            "trip_source_key": f'trips:{token["trip_id"]}',
            "actor": "migration",
            "note": "Migrated TREK share token metadata.",
            "metadata": {**source_meta("share_tokens", token), **token},
        })
    for override in overrides:
        notes.append({
            "source_key": f'share_token_overrides:{override["token"]}',
            "trip_source_key": None,
            "actor": "migration",
            "note": "Migrated TREK share token override metadata.",
            "metadata": {
                "sqlite_table": "share_token_overrides",
                "token": override.get("token"),
                "overrides": parse_json(override.get("overrides_json"), override.get("overrides_json")),
                "updated_at": override.get("updated_at"),
            },
        })
    return notes


def transform(data: dict[str, list[dict]]) -> dict:
    things = [thing_from_place(row) for row in data["places"]]
    things.extend(thing_from_reservation(row) for row in data["reservations"])
    return {
        "customers": [hosted_customer(row) for row in data["users"]],
        "trips": [hosted_trip(row) for row in data["trips"]],
        "trip_things": things,
        "budget_items": [hosted_budget_item(row) for row in data["budget_items"]],
        "support_notes": hosted_support_notes(
            data["day_notes"],
            data["share_tokens"],
            data["share_token_overrides"],
        ),
        "raw_core_tables": data,
    }


def validation_report(conn: sqlite3.Connection, hosted: dict, db_path: Path) -> dict:
    source_counts = {table: table_count(conn, table) for table in CORE_TABLES}
    hosted_counts = {
        key: len(value)
        for key, value in hosted.items()
        if isinstance(value, list)
    }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_db": str(db_path),
        "source_counts": source_counts,
        "hosted_counts": hosted_counts,
        "checks": {
            "customers_match_users": hosted_counts.get("customers") == source_counts.get("users"),
            "trips_match": hosted_counts.get("trips") == source_counts.get("trips"),
            "budget_items_match": hosted_counts.get("budget_items") == source_counts.get("budget_items"),
            "trip_things_match_places_plus_reservations": hosted_counts.get("trip_things") == source_counts.get("places", 0) + source_counts.get("reservations", 0),
        },
        "sample_keys": {
            "customer": hosted["customers"][0]["source_key"] if hosted["customers"] else None,
            "trip": hosted["trips"][0]["source_key"] if hosted["trips"] else None,
            "thing": hosted["trip_things"][0]["source_key"] if hosted["trip_things"] else None,
            "budget_item": hosted["budget_items"][0]["source_key"] if hosted["budget_items"] else None,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(args.db)
    data = {table: row_dicts(conn, table) for table in CORE_TABLES}
    hosted = transform(data)
    report = validation_report(conn, hosted, args.db)

    (args.out / "hosted-migration-bundle.json").write_text(json.dumps(hosted, indent=2, sort_keys=True) + "\n")
    (args.out / "validation-report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if all(report["checks"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PYTHON = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
db = sqlite3.connect(payload["dbPath"])
db.row_factory = sqlite3.Row
op = payload["op"]

def rows(sql, args=()):
    return [dict(r) for r in db.execute(sql, args).fetchall()]

if op == "init":
    db.executescript("""
      CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, description TEXT,
        start_date TEXT, end_date TEXT, currency TEXT
      );
      CREATE TABLE IF NOT EXISTS days (
        id INTEGER PRIMARY KEY, trip_id INTEGER, day_number INTEGER, date TEXT, title TEXT
      );
      CREATE TABLE IF NOT EXISTS places (
        id INTEGER PRIMARY KEY, trip_id INTEGER, name TEXT, description TEXT,
        reservation_status TEXT, place_time TEXT, notes TEXT
      );
      CREATE TABLE IF NOT EXISTS day_assignments (
        id INTEGER PRIMARY KEY, day_id INTEGER, place_id INTEGER, order_index INTEGER,
        assignment_time TEXT, notes TEXT
      );
      CREATE TABLE IF NOT EXISTS share_tokens (
        id INTEGER PRIMARY KEY, trip_id INTEGER, token TEXT
      );
    """)
    db.commit()
    print(json.dumps({"ok": True}))
elif op == "seed":
    trip = payload["trip"]
    db.execute("DELETE FROM day_assignments")
    db.execute("DELETE FROM places")
    db.execute("DELETE FROM days")
    db.execute("DELETE FROM share_tokens")
    db.execute("DELETE FROM trips")
    db.execute(
      "INSERT INTO trips (id, user_id, title, description, currency) VALUES (?, 1, ?, ?, 'USD')",
      (int(trip["trek_trip_id"]), trip["title"], trip.get("publicUrl") or ""),
    )
    days = {1: None, 2: None, 3: None}
    for num in (1, 2, 3):
        cur = db.execute("INSERT INTO days (trip_id, day_number, date, title) VALUES (?, ?, ?, ?)",
                         (int(trip["trek_trip_id"]), num, f"2026-07-0{num}", f"Day {num}"))
        days[num] = cur.lastrowid
    for item in trip.get("items") or []:
        cur = db.execute(
          "INSERT INTO places (trip_id, name, description, reservation_status, place_time, notes) VALUES (?, ?, ?, 'considering', ?, ?)",
          (int(trip["trek_trip_id"]), item["title"], item.get("location") or "", item.get("location") or "", item.get("id")),
        )
        place_id = cur.lastrowid
        day_num = int(item.get("day") or 1)
        db.execute(
          "INSERT INTO day_assignments (day_id, place_id, order_index, assignment_time, notes) VALUES (?, ?, 0, ?, ?)",
          (days.get(day_num) or days[1], place_id, item.get("location") or "", item.get("id")),
        )
    db.execute("INSERT INTO share_tokens (trip_id, token) VALUES (?, ?)", (int(trip["trek_trip_id"]), trip.get("token") or "las-vegas-strip-vacation"))
    db.commit()
    print(json.dumps({"ok": True, "trip_id": int(trip["trek_trip_id"])}))
elif op == "snapshot":
    trips = rows("SELECT id, title FROM trips ORDER BY id")
    places = rows("SELECT p.id, p.name, p.notes, d.day_number, da.id AS assignment_id FROM places p LEFT JOIN day_assignments da ON da.place_id=p.id LEFT JOIN days d ON d.id=da.day_id ORDER BY p.id")
    print(json.dumps({
      "row_ids": [str(t["id"]) for t in trips],
      "row_count": len(trips),
      "trips": trips,
      "places": places,
    }))
elif op == "apply":
    writes = payload.get("writes") or []
    item_moved = False
    for write in writes:
        title = write.get("title") or ""
        place = db.execute("SELECT id FROM places WHERE notes=? OR name=? ORDER BY id LIMIT 1", (write.get("item_id") or "", title)).fetchone()
        if write.get("op") == "move_thing" and place and write.get("to"):
            import re
            m = re.search(r"day\s*(\d+)", str(write["to"]), re.I)
            day_num = int(m.group(1)) if m else 1
            day = db.execute("SELECT id FROM days WHERE trip_id=(SELECT trip_id FROM places WHERE id=?) AND day_number=?", (place["id"], day_num)).fetchone()
            if day:
                db.execute("UPDATE day_assignments SET day_id=? WHERE place_id=?", (day["id"], place["id"]))
                item_moved = True
        elif write.get("op") == "remove_thing" and place:
            db.execute("DELETE FROM day_assignments WHERE place_id=?", (place["id"],))
            db.execute("DELETE FROM places WHERE id=?", (place["id"],))
            item_moved = True
        elif write.get("op") == "create_trek_row":
            pass
    db.commit()
    print(json.dumps({"ok": True, "itemMoved": item_moved}))
else:
    raise SystemExit("unknown op")
`;

function run(dbPath, op, extra = {}) {
  const result = spawnSync('python3', ['-c', PYTHON], {
    input: JSON.stringify({ dbPath, op, ...extra }),
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'trek fixture store failed');
  return JSON.parse(result.stdout);
}

export function createTrekFixtureStore({ dbPath, trip } = {}) {
  const resolved = dbPath || path.join(os.tmpdir(), `vacation-trek-verify-${process.pid}-${Date.now()}.db`);
  run(resolved, 'init');
  const trekTripId = Number(trip?.trek_trip_id || 41);
  const seedTrip = {
    trek_trip_id: trekTripId,
    title: trip?.title || 'Las Vegas Strip Vacation',
    publicUrl: trip?.publicUrl || '',
    token: trip?.token || 'las-vegas-strip-vacation',
    items: trip?.items || [],
  };
  if (seedTrip.items.length) run(resolved, 'seed', { trip: seedTrip });
  return {
    dbPath: resolved,
    snapshot() {
      const snap = run(resolved, 'snapshot');
      return { row_ids: snap.row_ids, row_count: snap.row_count, places: snap.places, trips: snap.trips };
    },
    applyWrites(writes) {
      return run(resolved, 'apply', { writes });
    },
    dispose() {
      try { fs.rmSync(resolved, { force: true }); } catch { /* ignore */ }
    },
  };
}

export function placeDay(snapshot, itemIdOrTitle) {
  const place = (snapshot.places || []).find((row) => row.notes === itemIdOrTitle || row.name === itemIdOrTitle);
  return place ? Number(place.day_number) : null;
}

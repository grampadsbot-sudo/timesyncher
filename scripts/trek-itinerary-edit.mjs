#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PUBLIC_BASE = 'https://vacation.timesyncher.com';

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function text(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

export function explicitShareToken(input = {}) {
  return text(input.token || input.shareToken || input.share_token, 180);
}

export function itemsFromValidatedWrites(writes = []) {
  return (Array.isArray(writes) ? writes : [])
    .map((write) => {
      const day = Number(String(write.to || write.day || '').match(/day\s*(\d+)/i)?.[1] || write.day || 0) || null;
      return {
        op: write.op,
        title: write.title,
        matchTitle: write.title,
        item_id: write.item_id,
        day,
        to: write.to,
        from: write.from,
        replacement: write.to,
      };
    })
    .filter((item) => item.op && (item.title || item.item_id));
}

const pythonCode = String.raw`
import datetime, json, sqlite3, sys, urllib.parse, urllib.request

payload = json.load(sys.stdin)
db_path = payload.get('dbPath') or '/home/timesyncher-agent/trek/runtime/data/travel.db'
db = sqlite3.connect(db_path)
db.row_factory = sqlite3.Row

def one(sql, args=()):
    return db.execute(sql, args).fetchone()

def all_rows(sql, args=()):
    return db.execute(sql, args).fetchall()

def run(sql, args=()):
    cur = db.execute(sql, args)
    return cur.lastrowid

def category_id(name, color, icon):
    row = one('SELECT id FROM categories WHERE lower(name)=lower(?) ORDER BY id LIMIT 1', (name,))
    if row:
        return int(row['id'])
    return int(run('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)', (name, color, icon)))

def txt(v,n=1000):
    return str(v or '').strip()[:n]

def valid_coord(lat, lng):
    try:
        lat = float(lat); lng = float(lng)
        return -90 <= lat <= 90 and -180 <= lng <= 180 and not (lat == 0 and lng == 0)
    except Exception:
        return False

def geocode_address(address):
    address = txt(address, 500)
    if not address:
        return (None, None)
    try:
        url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': address, 'format': 'jsonv2', 'limit': '1'})
        req = urllib.request.Request(url, headers={'User-Agent': 'TimeSyncherVacation/1.0 trek-itinerary-edit'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        if data:
            lat = float(data[0].get('lat')); lng = float(data[0].get('lon'))
            if valid_coord(lat, lng):
                return (lat, lng)
    except Exception:
        pass
    return (None, None)

def category_meta(kind):
    if kind == 'flight': return ('Transport', '#0f766e', 'Plane')
    if kind == 'hotel': return ('Hotel', '#2563eb', 'Hotel')
    if kind == 'restaurant': return ('Restaurant', '#dc2626', 'Utensils')
    if kind == 'store': return ('Store', '#d97706', 'ShoppingBag')
    if kind == 'car': return ('Car', '#0891b2', 'Car')
    if kind == 'family_event': return ('Attraction', '#7c3aed', 'MapPin')
    return ('Attraction', '#7c3aed', 'MapPin')

def find_trip(token, request_text):
    if token:
        row = one('SELECT trips.*, share_tokens.token AS share_token FROM share_tokens JOIN trips ON trips.id=share_tokens.trip_id WHERE share_tokens.token=? ORDER BY share_tokens.id LIMIT 1', (token,))
        if row:
            return row
    lower = (request_text or '').lower()
    if 'caldwell' in lower or 'davidson' in lower:
        row = one("SELECT trips.*, share_tokens.token AS share_token FROM trips JOIN share_tokens ON share_tokens.trip_id=trips.id WHERE lower(share_tokens.token)='the-davidson-family-trip' OR lower(trips.title) LIKE '%davidson%' OR lower(trips.description) LIKE '%caldwell%' ORDER BY trips.id DESC LIMIT 1")
        if row:
            return row
    return None

def ensure_days(trip_id, date_range):
    rows = all_rows('SELECT * FROM days WHERE trip_id=? ORDER BY day_number', (trip_id,))
    if date_range:
        start = datetime.date.fromisoformat(date_range['startDate'])
        end = datetime.date.fromisoformat(date_range['endDate'])
        count = (end - start).days + 1
        run('UPDATE trips SET start_date=?, end_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', (date_range['startDate'], date_range['endDate'], trip_id))
        existing_by_number = {int(row['day_number']): row for row in rows}
        for idx in range(1, count + 1):
            date = (start + datetime.timedelta(days=idx - 1)).isoformat()
            if idx in existing_by_number:
                run('UPDATE days SET date=?, title=COALESCE(title, ?) WHERE id=?', (date, '', existing_by_number[idx]['id']))
            else:
                run('INSERT INTO days (trip_id, day_number, date, title) VALUES (?, ?, ?, ?)', (trip_id, idx, date, ''))
        rows = all_rows('SELECT * FROM days WHERE trip_id=? ORDER BY day_number', (trip_id,))
    if not rows:
        today = datetime.date.today()
        for idx in range(1, 2):
            run('INSERT INTO days (trip_id, day_number, date, title) VALUES (?, ?, ?, ?)', (trip_id, idx, today.isoformat(), ''))
        rows = all_rows('SELECT * FROM days WHERE trip_id=? ORDER BY day_number', (trip_id,))
    return rows

def load_overrides(token):
    row = one('SELECT overrides_json FROM share_token_overrides WHERE token=?', (token,))
    if not row:
        return {}
    try:
        return json.loads(row['overrides_json'])
    except Exception:
        return {}

def save_field(token, thing_key, fields, overrides):
    overrides[thing_key] = fields
    run('CREATE TABLE IF NOT EXISTS shared_travel_thing_fields (token TEXT NOT NULL, thing_key TEXT NOT NULL, fields_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (token, thing_key))')
    run('CREATE TABLE IF NOT EXISTS share_token_overrides (token TEXT PRIMARY KEY, overrides_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
    run('INSERT INTO shared_travel_thing_fields (token, thing_key, fields_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(token, thing_key) DO UPDATE SET fields_json=excluded.fields_json, updated_at=CURRENT_TIMESTAMP', (token, thing_key, json.dumps(fields)))
    run('INSERT INTO share_token_overrides (token, overrides_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(token) DO UPDATE SET overrides_json=excluded.overrides_json, updated_at=CURRENT_TIMESTAMP', (token, json.dumps(overrides)))

def matching_place(trip_id, title):
    return one('SELECT * FROM places WHERE trip_id=? AND lower(name)=lower(?) ORDER BY id LIMIT 1', (trip_id, title))

def find_place_for_write(trip_id, item):
    item_id = txt(item.get('item_id'), 180)
    title = txt(item.get('title') or item.get('matchTitle'), 180)
    if item_id:
        row = one('SELECT * FROM places WHERE trip_id=? AND (notes=? OR cast(id as text)=?) ORDER BY id LIMIT 1', (trip_id, item_id, item_id))
        if row:
            return row
    if title:
        return matching_place(trip_id, title)
    return None

def apply_validated_write(trip_id, token, days, item, overrides):
    op = txt(item.get('op'), 40)
    if op == 'add_thing':
        return insert_or_update_item(trip_id, token, days, item, overrides)
    place = find_place_for_write(trip_id, item)
    if not place:
        raise RuntimeError('validated write target not found: ' + txt(item.get('title') or item.get('item_id'), 180))
    place_id = int(place['id'])
    if op == 'move_thing':
        day_num = int(item.get('day') or 1)
        if day_num < 1: day_num = 1
        if day_num > len(days): day_num = len(days)
        day_id = int(days[day_num - 1]['id'])
        run('DELETE FROM day_assignments WHERE place_id=?', (place_id,))
        order_row = one('SELECT COALESCE(MAX(order_index), -1) + 1 AS next_index FROM day_assignments WHERE day_id=?', (day_id,))
        run('INSERT INTO day_assignments (day_id, place_id, order_index, notes, reservation_status, assignment_time) VALUES (?, ?, ?, ?, ?, ?)', (day_id, place_id, int(order_row['next_index']), place['notes'] or '', 'considering', None))
        return {'action': 'moved', 'placeId': place_id, 'title': place['name'], 'day': day_num, 'op': op, 'category': item.get('category') or ''}
    if op == 'remove_thing':
        run('DELETE FROM day_assignments WHERE place_id=?', (place_id,))
        run("UPDATE places SET reservation_status=? WHERE id=?", ('eliminated', place_id))
        return {'action': 'removed', 'placeId': place_id, 'title': place['name'], 'op': op}
    if op == 'update_thing':
        new_title = txt(item.get('replacement') or item.get('to') or item.get('title'), 180)
        if new_title:
            run('UPDATE places SET name=? WHERE id=?', (new_title, place_id))
        return {'action': 'updated', 'placeId': place_id, 'title': new_title or place['name'], 'op': op}
    raise RuntimeError('unsupported validated write op: ' + op)

def insert_or_update_item(trip_id, token, days, item, overrides):
    kind = item.get('category') or 'event'
    cat_name, color, icon = category_meta(kind)
    cat_id = category_id(cat_name, color, icon)
    title = item['title']
    summary = item.get('summary') or 'Added from a TimeSyncher Vacation owner edit request.'
    place = matching_place(trip_id, title)
    address = txt(item.get('address'), 500)
    lat = item.get('lat')
    lng = item.get('lng')
    if not valid_coord(lat, lng) and address:
        lat, lng = geocode_address(address)
    has_coords = valid_coord(lat, lng)
    if place:
        place_id = int(place['id'])
        run("UPDATE places SET category_id=?, description=COALESCE(NULLIF(description, ''), ?), reservation_status=?, place_time=COALESCE(NULLIF(?, ''), place_time), notes=COALESCE(NULLIF(notes, ''), ?), address=COALESCE(NULLIF(?, ''), address), lat=COALESCE(?, lat), lng=COALESCE(?, lng), updated_at=CURRENT_TIMESTAMP WHERE id=?", (cat_id, summary, 'considering', item.get('time') or '', summary, address, float(lat) if has_coords else None, float(lng) if has_coords else None, place_id))
        action = 'updated'
    else:
        place_id = int(run('INSERT INTO places (trip_id, name, description, lat, lng, address, category_id, currency, reservation_status, place_time, duration_minutes, notes, transport_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (trip_id, title, summary, float(lat) if has_coords else None, float(lng) if has_coords else None, address or None, cat_id, 'USD', 'considering', item.get('time') or None, 90, summary, 'driving')))
        action = 'added'
    day_num = int(item.get('day') or 1)
    if day_num < 1: day_num = 1
    if day_num > len(days): day_num = len(days)
    day_id = int(days[day_num - 1]['id'])
    assignment = one('SELECT id FROM day_assignments WHERE day_id=? AND place_id=?', (day_id, place_id))
    order_row = one('SELECT COALESCE(MAX(order_index), -1) + 1 AS next_index FROM day_assignments WHERE day_id=?', (day_id,))
    if assignment:
        run("UPDATE day_assignments SET notes=?, reservation_status=?, assignment_time=COALESCE(NULLIF(?, ''), assignment_time) WHERE id=?", (summary, 'considering', item.get('time') or '', assignment['id']))
    else:
        run('INSERT INTO day_assignments (day_id, place_id, order_index, notes, reservation_status, assignment_time) VALUES (?, ?, ?, ?, ?, ?)', (day_id, place_id, int(order_row['next_index']), summary, 'considering', item.get('time') or None))
    fields = {
        'category': kind,
        'status': 'considering',
        'timeline': True,
        'startTime': item.get('time') or '',
        'summary': summary,
        'longDetails': summary,
        'price': '',
        'website': '',
        'travelTime': '',
        'sourceNote': 'Applied by TimeSyncher Vacation deterministic trip edit worker.',
    }
    if address:
        fields['address'] = address
    if has_coords:
        fields['lat'] = float(lat)
        fields['lng'] = float(lng)
        fields['latitude'] = float(lat)
        fields['longitude'] = float(lng)
    save_field(token, 'place:' + str(place_id), fields, overrides)
    return {'action': action, 'placeId': place_id, 'title': title, 'day': day_num, 'category': kind}

apply_validated_only = bool(payload.get('applyValidatedOnly'))
trip = find_trip(payload.get('token') or '', '' if apply_validated_only else (payload.get('requestText') or ''))
if not trip:
    raise RuntimeError('No target TREK trip/share token could be identified for this edit request.')
token = trip['share_token']
date_range = None if apply_validated_only else payload.get('dateRange')
days = ensure_days(int(trip['id']), date_range)
items = payload.get('items') or []
if apply_validated_only:
    if not items:
        raise RuntimeError('TREK edit requires pipeline validatedWrites; independent utterance re-parse is disabled.')
else:
    raise RuntimeError('TREK edit requires pipeline validatedWrites; independent utterance re-parse is disabled.')
overrides = load_overrides(token)
results = []
for item in items:
    results.append(apply_validated_write(int(trip['id']), token, days, item, overrides))
db.commit()
base = (payload.get('publicBase') or 'https://vacation.timesyncher.com').rstrip('/')
print(json.dumps({'ok': True, 'tripId': int(trip['id']), 'token': token, 'url': base + '/shared/' + token + '/', 'updatedItems': results, 'dateRangeApplied': date_range, 'operationCount': len(results)}))
`;

async function main() {
  const input = JSON.parse((await readStdin()) || '{}');
  const validatedWrites = Array.isArray(input.validatedWrites) ? input.validatedWrites : [];
  if (!validatedWrites.length) {
    throw new Error('TREK edit requires pipeline validatedWrites; independent utterance re-parse is disabled.');
  }
  const items = itemsFromValidatedWrites(validatedWrites);
  if (!items.length) {
    throw new Error('TREK edit requires pipeline validatedWrites; independent utterance re-parse is disabled.');
  }
  const payload = {
    token: explicitShareToken(input),
    applyValidatedOnly: true,
    requestText: '',
    items,
    dateRange: null,
    receivedAt: text(input.receivedAt || input.received_at || '', 80),
    publicBase: text(input.publicBase || process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE, 500).replace(/\/+$/, ''),
    dbPath: text(input.dbPath || process.env.TIMESYNCHER_TREK_DB_PATH || '', 500),
  };
  const result = spawnSync('python3', ['-c', pythonCode], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'TREK edit failed').trim());
  }
  const out = result.stdout.trim();
  if (!out) throw new Error('TREK edit returned no output');
  console.log(out);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}

#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

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

function slugFromText(value) {
  const match = text(value, 3000).match(/\/shared\/([^/?#\s]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function targetToken(input) {
  const requestText = text(input.requestText || input.request_text || '', 8000);
  const explicit = text(input.token || input.shareToken || input.share_token || slugFromText(requestText), 180);
  const mentionsDavidson = /\b(caldwell|davidson)\b/i.test(requestText);
  const mentionsOtherKnownTrip = /\b(las vegas|vegas|strip|jockey club|staycation|hawaii|waikiki|maui|kona|oahu)\b/i.test(requestText);
  if (explicit) {
    if (explicit === 'the-davidson-family-trip' && !mentionsDavidson && mentionsOtherKnownTrip) return '';
    return explicit;
  }
  if (mentionsDavidson) return 'the-davidson-family-trip';
  return '';
}

function inferCategory(title, requestText) {
  const hay = `${title} ${requestText}`.toLowerCase();
  if (/\bfamily_event\b|\bfamily event\b|grampa|grandpa|grandma|grandkid|homecooked|home-cooked|family|kids?|whiffle|tyler|torryn|keagan|cookout|reunion/.test(hay)) return 'family_event';
  if (/\bflight|southwest|delta|united|american|jetblue|airport|las|boi|jfk|lga|ewr\b/.test(hay)) return 'flight';
  if (/\bhotel|lodging|inn|suite|resort|marriott|hilton|hyatt\b/.test(hay)) return 'hotel';
  if (/\brestaurant|breakfast|lunch|dinner|brewery|griddle|taco|thai|pasta|bolognese|tortilla|food|meal\b/.test(hay)) return 'restaurant';
  if (/\bstore|farm|market|shopping|grocery|winery|wine\b/.test(hay)) return 'store';
  if (/\bgym|workout|fitness|planet fitness\b/.test(hay)) return 'workout';
  if (/\bhike|falls|park|topgolf|tour|museum|activity|event\b/.test(hay)) return 'event';
  return 'event';
}

function parseTime(value) {
  const source = text(value, 500);
  const match = source.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || source.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!match) return '';
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseDay(value) {
  const source = text(value, 500);
  const explicit = source.match(/\bday\s*(\d{1,2})\b/i);
  if (explicit) return Number(explicit[1]);
  const july = source.match(/\bjuly\s+(\d{1,2})\b/i);
  if (july) {
    const day = Number(july[1]);
    if (day >= 8 && day <= 13) return day - 7;
  }
  return null;
}

function parseAddress(value) {
  const source = text(value, 1000);
  const match = source.match(/\b(\d{2,6}\s+[A-Za-z0-9 .'-]+(?:street|st|avenue|ave|road|rd|court|ct|drive|dr|lane|ln|boulevard|blvd|way|place|pl)\b[^.\n]{0,120})/i);
  return match?.[1]?.replace(/[,;\s]+$/g, '').trim() || '';
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanTitle(value) {
  return text(value, 180)
    .replace(/^\s*(?:add|create|put|include|schedule)\s+/i, '')
    .replace(/^\s*(?:a\s+)?(?:family\s+event|event|timeline\s+item)\s+/i, '')
    .replace(/\s+(?:to|on|for)\s+(?:the\s+)?(?:caldwell|davidson|vacation|trip|itinerary)\b.*$/i, '')
    .replace(/\s+\b(?:to|on|for)\s+day\s+\d+\b.*$/i, '')
    .replace(/\s+\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b.*$/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[.;]+$/g, '')
    .trim();
}

function extractQuotedAdds(requestText) {
  const items = [];
  for (const match of requestText.matchAll(/\b(?:add|create|put|include|schedule)\b[^"'“”\n]*["'“”]([^"'“”]{3,160})["'“”][^\n]*/gi)) {
    items.push({ raw: match[0], title: cleanTitle(match[1]) });
  }
  return items;
}

function extractHotelCorrection(requestText) {
  const source = text(requestText, 1200);
  const match = source.match(/\b(?:hotel|lodging)\s+(?:was|is|at|will be|should be)\s+(?:the\s+)?([^.;\n]{3,120})/i)
    || source.match(/\b(?:staying|stayed)\s+at\s+(?:the\s+)?([^.;\n]{3,120})/i);
  if (!match) return [];
  const title = cleanTitle(match[1]).replace(/^the\s+/i, '');
  if (!title) return [];
  return [{ raw: match[0], title, category: 'hotel', day: 1, summary: `Customer specified the hotel/lodging as ${title}.` }];
}

function extractLineAdds(requestText, skipQuotedAdds = false) {
  if (skipQuotedAdds) return [];
  const lines = text(requestText, 8000)
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  const items = [];
  for (const line of lines) {
    if (!/\b(add|create|put|include|schedule)\b/i.test(line)) continue;
    const title = cleanTitle(line);
    if (title.length >= 3 && !/\b(vacation|trip|itinerary|timeline|changes?|updates?)$/i.test(title)) {
      items.push({ raw: line, title });
    }
  }
  return items;
}

function requiresBroadEditRunner(requestText, structuredItems) {
  if (structuredItems.length > 0) return false;
  const source = text(requestText, 8000).toLowerCase();
  const broadIntent = /\b(rename|title|description|access|share|member|family member|wife|husband|spouse|collaborator|permission|edit rights?|view rights?|remove|delete|keep|change|move|reorder|replace|make the shared website|shared website include)\b/.test(source);
  if (!broadIntent) return false;
  const simpleDateRepairOnly = parseDateRange({ requestText }) && !/\b(add|create|put|include|schedule|rename|title|description|access|share|member|collaborator|permission|remove|delete|move|reorder|replace)\b/.test(source);
  return !simpleDateRepairOnly;
}


const CALDWELL_FAMILY_HOME = {
  address: '12364 Nantes Court, Caldwell, ID 83607, United States',
  lat: 43.6182767,
  lng: -116.6397578,
};

function defaultFamilyAddress(category, requestText, token) {
  if (category !== 'family_event') return null;
  if (/\b(caldwell|davidson)\b/i.test(requestText) || token === 'the-davidson-family-trip') return CALDWELL_FAMILY_HOME;
  return null;
}

function editItems(input) {
  const requestText = text(input.requestText || input.request_text || '', 8000);
  const structured = Array.isArray(input.editItems) ? input.editItems : [];
  const quotedItems = extractQuotedAdds(requestText);
  if (requiresBroadEditRunner(requestText, [...structured, ...quotedItems])) {
    throw new Error('Request includes broad trip edit intent; use the Grok TREK agent edit runner.');
  }
  const requestAddress = parseAddress(requestText);
  const items = structured.map((item) => ({
    title: cleanTitle(item.title || item.name),
    raw: text(item.raw || item.title || item.name, 500),
    day: Number(item.day || item.dayNumber) || null,
    time: parseTime(item.time || item.startTime || ''),
    category: text(item.category || '', 40),
    summary: text(item.summary || item.details || '', 800),
    address: text(item.address || item.placeAddress || item.location || '', 500),
    lat: numberOrNull(item.lat ?? item.latitude),
    lng: numberOrNull(item.lng ?? item.longitude),
  })).filter((item) => item.title);
  items.push(...quotedItems, ...extractLineAdds(requestText, quotedItems.length > 0), ...extractHotelCorrection(requestText));
  const seen = new Set();
  const token = targetToken(input);
  return items
    .map((item) => {
      const category = item.category || inferCategory(item.title, requestText);
      const fallbackHome = defaultFamilyAddress(category, requestText, token);
      const address = item.address || parseAddress(item.raw || '') || requestAddress || fallbackHome?.address || '';
      return {
        ...item,
        day: item.day || parseDay(item.raw || requestText),
        time: item.time || parseTime(item.raw || ''),
        category,
        summary: item.summary || 'Added from a TimeSyncher Vacation owner edit request.',
        address,
        lat: item.lat ?? (address === fallbackHome?.address ? fallbackHome.lat : null),
        lng: item.lng ?? (address === fallbackHome?.address ? fallbackHome.lng : null),
      };
    })
    .filter((item) => {
      const key = item.title.toLowerCase();
      if (!item.title || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseDateRange(input) {
  const source = text(input.requestText || input.request_text || '', 5000);
  const match = source.match(/\bjuly\s+(\d{1,2})\s*(?:-|to|through|thru)\s*(?:july\s*)?(\d{1,2}),?\s*(20\d{2})\b/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const year = Number(match[3]);
  if (start < 1 || end < start || end > 31) return null;
  return { startDate: `${year}-07-${String(start).padStart(2, '0')}`, endDate: `${year}-07-${String(end).padStart(2, '0')}` };
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
    start_time = txt(item.get('time') or '', 40)
    try:
        duration_minutes = int(item.get('durationMinutes') or item.get('duration_minutes') or 90)
    except Exception:
        duration_minutes = 90
    if duration_minutes <= 0:
        duration_minutes = 90
    end_time = ''
    import re as _re
    m = _re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", start_time)
    if m:
        total = (int(m.group(1)) * 60) + int(m.group(2)) + duration_minutes
        end_time = f"{(total // 60) % 24:02d}:{total % 60:02d}"
        try:
            run('UPDATE places SET duration_minutes=?, end_time=COALESCE(NULLIF(?, ""), end_time) WHERE id=?', (duration_minutes, end_time, place_id))
        except Exception:
            run('UPDATE places SET duration_minutes=? WHERE id=?', (duration_minutes, place_id))
    assignment = one('SELECT id FROM day_assignments WHERE day_id=? AND place_id=?', (day_id, place_id))
    order_row = one('SELECT COALESCE(MAX(order_index), -1) + 1 AS next_index FROM day_assignments WHERE day_id=?', (day_id,))
    if assignment:
        run("UPDATE day_assignments SET notes=?, reservation_status=?, assignment_time=COALESCE(NULLIF(?, ''), assignment_time), assignment_end_time=COALESCE(NULLIF(?, ''), assignment_end_time) WHERE id=?", (summary, 'considering', start_time or '', end_time or '', assignment['id']))
    else:
        run('INSERT INTO day_assignments (day_id, place_id, order_index, notes, reservation_status, assignment_time, assignment_end_time) VALUES (?, ?, ?, ?, ?, ?, ?)', (day_id, place_id, int(order_row['next_index']), summary, 'considering', start_time or None, end_time or None))
    fields = {
        'category': kind,
        'status': 'considering',
        'timeline': True,
        'startTime': start_time or '',
        'endTime': end_time or '',
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


def parse_hhmm(value):
  import re
  s=str(value or "")
  m=re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", s)
  if not m: return None
  return (int(m.group(1))*60)+int(m.group(2))

def hhmm(total):
  total=int(total)%(24*60)
  return f"{(total//60):02d}:{(total%60):02d}"

def parse_travel_minutes(value, default=0):
  s=txt(value,40)
  if s=="": return int(default)
  try:
    n=int(float(s))
    return n if n>=0 else int(default)
  except Exception:
    return int(default)

def venue_key(place_row, fields):
  name=txt(place_row["name"] if place_row else "",180).lower()
  address=""
  try:
    address=txt((fields or {}).get("address") or (place_row["address"] if place_row is not None and "address" in place_row.keys() else ""),240).lower()
  except Exception:
    address=txt((fields or {}).get("address") or "",240).lower()
  lat=(fields or {}).get("lat") if isinstance(fields,dict) else None
  lng=(fields or {}).get("lng") if isinstance(fields,dict) else None
  try:
    if lat is None and place_row is not None and "lat" in place_row.keys(): lat=place_row["lat"]
    if lng is None and place_row is not None and "lng" in place_row.keys(): lng=place_row["lng"]
  except Exception:
    pass
  if lat is not None and lng is not None:
    try: return "coord:%s,%s" % (round(float(lat),4), round(float(lng),4))
    except Exception: pass
  if address: return "addr:"+address
  return "name:"+name

def travel_floor_minutes(prev_row, prev_fields, cur_row, cur_fields):
  if venue_key(prev_row, prev_fields) == venue_key(cur_row, cur_fields):
    return 0
  existing = parse_travel_minutes((cur_fields or {}).get("travelTime"), -1)
  if existing > 0: return existing
  return 15

def normalize_trip_schedule(trip_id, token):
  day_rows_local = rows("SELECT id, day_number FROM days WHERE trip_id=? ORDER BY day_number", (trip_id,))
  changed = 0
  for day in day_rows_local:
    day_id=int(day["id"])
    items=[]
    qrows = rows("""
      SELECT da.id AS assignment_id, da.place_id, da.order_index, da.assignment_time, da.assignment_end_time,
             da.reservation_status, p.name, p.address, p.lat, p.lng, p.place_time, p.end_time, p.duration_minutes
      FROM day_assignments da
      JOIN places p ON p.id=da.place_id
      WHERE da.day_id=?
    """, (day_id,))
    for raw in qrows:
      row = dict(raw) if not isinstance(raw, dict) else raw
      start=parse_hhmm(row.get("assignment_time") or row.get("place_time") or "")
      if start is None: continue
      try: dur=int(row.get("duration_minutes") or 90)
      except Exception: dur=90
      if dur<=0: dur=90
      end=parse_hhmm(row.get("assignment_end_time") or row.get("end_time") or "")
      if end is None or end <= start: end = start + dur
      fields={}
      key="place:"+str(int(row["place_id"]))
      frow=one("SELECT fields_json FROM shared_travel_thing_fields WHERE token=? AND thing_key=?",(token,key))
      if frow:
        try:
          fdict = dict(frow) if not isinstance(frow, dict) else frow
          fields=json.loads(fdict.get("fields_json") or fdict["fields_json"]) or {}
        except Exception:
          fields={}
      items.append({"row":row,"start":start,"end":end,"dur":dur,"fields":fields,"key":key})
    if not items:
      continue
    items.sort(key=lambda it: (it["start"], int(it["row"].get("order_index") or 0), int(it["row"]["assignment_id"])))
    prev=None
    for idx,it in enumerate(items):
      it["fields"] = dict(it["fields"] or {})
      if prev is not None:
        floor=travel_floor_minutes(prev["row"], prev["fields"], it["row"], it["fields"])
        min_start = prev["end"] + floor
        if it["start"] < min_start:
          it["start"] = min_start
          it["end"] = it["start"] + it["dur"]
          if it["end"] >= 24*60:
            it["end"] = 24*60 - 1
            it["start"] = max(0, it["end"] - it["dur"])
        it["fields"]["travelTime"] = str(int(floor))
      else:
        if it["fields"].get("travelTime") in (None,""):
          it["fields"]["travelTime"]="0"
      start_s=hhmm(it["start"]); end_s=hhmm(it["end"])
      db.execute("UPDATE day_assignments SET order_index=?, assignment_time=?, assignment_end_time=? WHERE id=?",(idx,start_s,end_s,int(it["row"]["assignment_id"])))
      try:
        db.execute("UPDATE places SET place_time=?, end_time=?, duration_minutes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",(start_s,end_s,it["dur"],int(it["row"]["place_id"])))
      except Exception:
        db.execute("UPDATE places SET place_time=?, duration_minutes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",(start_s,it["dur"],int(it["row"]["place_id"])))
      fields=it["fields"]
      fields["startTime"]=start_s
      fields["endTime"]=end_s
      status=str(fields.get("status") or "").lower()
      if status in ("","considering","tbd") and start_s:
        if str(fields.get("timeline", True)).lower() not in ("false","0","no"):
          fields["status"]="scheduled"
      db.execute("INSERT INTO shared_travel_thing_fields (token,thing_key,fields_json,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(token,thing_key) DO UPDATE SET fields_json=excluded.fields_json, updated_at=CURRENT_TIMESTAMP",(token,it["key"],json.dumps(fields)))
      try:
        ovr=load_overrides() if "load_overrides" in globals() else {}
      except Exception:
        ovr={}
      if isinstance(ovr, dict):
        ovr[it["key"]] = fields
        try:
          db.execute("INSERT INTO share_token_overrides (token,overrides_json,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(token) DO UPDATE SET overrides_json=excluded.overrides_json, updated_at=CURRENT_TIMESTAMP",(token,json.dumps(ovr)))
        except Exception:
          pass
      changed += 1
      prev=it
  return changed

trip = find_trip(payload.get('token') or '', payload.get('requestText') or '')
if not trip:
    raise RuntimeError('No target TREK trip/share token could be identified for this edit request.')
token = trip['share_token']
date_range = payload.get('dateRange')
days = ensure_days(int(trip['id']), date_range)
items = payload.get('items') or []
if not items and not date_range:
    raise RuntimeError('No supported deterministic edit operations were parsed from the request.')
overrides = load_overrides(token)
results = []
for item in items:
    results.append(insert_or_update_item(int(trip['id']), token, days, item, overrides))
if results:
  try:
    normalize_trip_schedule(int(trip['id']), token)
  except Exception as _norm_err:
    raise RuntimeError('schedule normalize failed: '+str(_norm_err))
db.commit()
base = (payload.get('publicBase') or 'https://vacation.timesyncher.com').rstrip('/')
print(json.dumps({'ok': True, 'tripId': int(trip['id']), 'token': token, 'url': base + '/shared/' + token + '/', 'updatedItems': results, 'dateRangeApplied': date_range, 'operationCount': len(results) + (1 if date_range else 0)}))
`;

async function main() {
  const input = JSON.parse((await readStdin()) || '{}');
  const payload = {
    token: targetToken(input),
    requestText: text(input.requestText || input.request_text || '', 8000),
    items: editItems(input),
    dateRange: parseDateRange(input),
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

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});

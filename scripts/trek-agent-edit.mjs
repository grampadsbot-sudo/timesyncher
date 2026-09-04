#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PUBLIC_BASE = 'https://vacation.timesyncher.com';
const DEFAULT_DB_PATH = '/home/timesyncher-agent/trek/runtime/data/travel.db';

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function text(value, max = 8000) {
  return String(value || '').trim().slice(0, max);
}

function parseJson(value) {
  const source = text(value, 200000);
  try { return JSON.parse(source); } catch {}
  const fenced = source.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1]);
  for (let idx = source.lastIndexOf('{'); idx >= 0; idx = source.lastIndexOf('{', idx - 1)) {
    try { return JSON.parse(source.slice(idx)); } catch {}
  }
  throw new Error(`Expected JSON output, got: ${source.slice(-1000)}`);
}

function runPython(payload, code) {
  const result = spawnSync('python3', ['-c', code], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(text(result.stderr || result.stdout || 'python helper failed', 1400));
  return parseJson(result.stdout);
}

const applyCode = String.raw`
import datetime, json, sqlite3, sys, urllib.parse, urllib.request
payload=json.load(sys.stdin)
db_path=payload.get("dbPath") or "/home/timesyncher-agent/trek/runtime/data/travel.db"
token=payload["token"]
ops=payload.get("operations") or []
db=sqlite3.connect(db_path)
db.row_factory=sqlite3.Row

def one(sql,args=()):
  return db.execute(sql,args).fetchone()
def rows(sql,args=()):
  return db.execute(sql,args).fetchall()
def run(sql,args=()):
  cur=db.execute(sql,args)
  return cur.lastrowid
def txt(v,n=1000):
  return str(v or "").strip()[:n]
def boolint(v):
  return 1 if v is True or str(v).lower() in ("1","true","yes","on") else 0
def valid_coord(lat,lng):
  try:
    lat=float(lat); lng=float(lng)
    return -90 <= lat <= 90 and -180 <= lng <= 180 and not (lat == 0 and lng == 0)
  except Exception:
    return False
def geocode_address(address):
  address=txt(address,500)
  if not address: return (None,None)
  try:
    url="https://nominatim.openstreetmap.org/search?"+urllib.parse.urlencode({"q":address,"format":"jsonv2","limit":"1"})
    req=urllib.request.Request(url,headers={"User-Agent":"TimeSyncherVacation/1.0 trek-agent-edit"})
    with urllib.request.urlopen(req,timeout=8) as resp:
      data=json.loads(resp.read().decode("utf-8"))
    if data:
      lat=float(data[0].get("lat")); lng=float(data[0].get("lon"))
      if valid_coord(lat,lng): return (lat,lng)
  except Exception:
    pass
  return (None,None)
CALDWELL_FAMILY_ADDRESS = "12364 Nantes Court, Caldwell, ID 83607, United States"
CALDWELL_FAMILY_LAT = 43.6182767
CALDWELL_FAMILY_LNG = -116.6397578

def op_location(op):
  address=txt(op.get("address") or (op.get("fields") or {}).get("address"),500) if isinstance(op.get("fields"),dict) else txt(op.get("address"),500)
  lat=op.get("lat", op.get("latitude")); lng=op.get("lng", op.get("longitude"))
  if not address and txt(op.get("category"),80).lower() in ("family_event", "family event"):
    address = CALDWELL_FAMILY_ADDRESS
    lat = lat if valid_coord(lat,lng) else CALDWELL_FAMILY_LAT
    lng = lng if valid_coord(lat,lng) else CALDWELL_FAMILY_LNG
  if not valid_coord(lat,lng) and isinstance(op.get("fields"),dict):
    lat=op["fields"].get("lat", op["fields"].get("latitude")); lng=op["fields"].get("lng", op["fields"].get("longitude"))
  if not valid_coord(lat,lng) and address:
    lat,lng=geocode_address(address)
  return address, lat, lng, valid_coord(lat,lng)
def category_id(kind):
  mapping={
    "flight": ("Transport","#0f766e","Plane"),
    "hotel": ("Hotel","#2563eb","Hotel"),
    "restaurant": ("Restaurant","#dc2626","Utensils"),
    "store": ("Store","#d97706","ShoppingBag"),
    "family_event": ("Attraction","#7c3aed","MapPin"),
    "event": ("Attraction","#7c3aed","MapPin"),
    "tour": ("Attraction","#7c3aed","MapPin"),
    "transport": ("Transport","#0f766e","Car"),
    "other": ("Attraction","#7c3aed","MapPin"),
  }
  name,color,icon=mapping.get(txt(kind,40), mapping["event"])
  row=one("SELECT id FROM categories WHERE lower(name)=lower(?) ORDER BY id LIMIT 1",(name,))
  if row: return int(row["id"])
  return int(run("INSERT INTO categories (name,color,icon) VALUES (?,?,?)",(name,color,icon)))
def parse_time(v):
  import re
  s=txt(v,80)
  m=re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b",s,re.I)
  if m:
    h=int(m.group(1)); minute=int(m.group(2) or 0); mer=m.group(3).lower()
    if mer=="pm" and h<12: h+=12
    if mer=="am" and h==12: h=0
    return f"{h:02d}:{minute:02d}"
  m=re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b",s)
  return f"{int(m.group(1)):02d}:{int(m.group(2)):02d}" if m else ""
trip=one("SELECT trips.*, share_tokens.token FROM share_tokens JOIN trips ON trips.id=share_tokens.trip_id WHERE share_tokens.token=?",(token,))
if not trip: raise RuntimeError("target trip not found")
trip_id=int(trip["id"])
def day_rows():
  ds=rows("SELECT * FROM days WHERE trip_id=? ORDER BY day_number",(trip_id,))
  if ds: return ds
  run("INSERT INTO days (trip_id,day_number,date,title) VALUES (?,?,?,?)",(trip_id,1,datetime.date.today().isoformat(),""))
  return rows("SELECT * FROM days WHERE trip_id=? ORDER BY day_number",(trip_id,))
def day_for(n):
  ds=day_rows()
  try: idx=max(1,min(len(ds),int(n or 1)))-1
  except Exception: idx=0
  return ds[idx], idx+1
def find_place(op):
  key=txt(op.get("matchTitle") or op.get("title"),180).lower()
  if not key: return None
  exact=one("SELECT * FROM places WHERE trip_id=? AND lower(name)=lower(?) ORDER BY id LIMIT 1",(trip_id,key))
  if exact: return exact
  like=one("SELECT * FROM places WHERE trip_id=? AND lower(name) LIKE ? ORDER BY id LIMIT 1",(trip_id,"%"+key+"%"))
  return like
def load_overrides():
  row=one("SELECT overrides_json FROM share_token_overrides WHERE token=?",(token,))
  if not row: return {}
  try: return json.loads(row["overrides_json"])
  except Exception: return {}
overrides=load_overrides()
def save_fields(place_id, fields):
  db.execute("CREATE TABLE IF NOT EXISTS shared_travel_thing_fields (token TEXT NOT NULL, thing_key TEXT NOT NULL, fields_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (token, thing_key))")
  db.execute("CREATE TABLE IF NOT EXISTS share_token_overrides (token TEXT PRIMARY KEY, overrides_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  key="place:"+str(place_id)
  current={}
  row=one("SELECT fields_json FROM shared_travel_thing_fields WHERE token=? AND thing_key=?",(token,key))
  if row:
    try: current=json.loads(row["fields_json"])
    except Exception: current={}
  current.update({k:v for k,v in fields.items() if v is not None})
  overrides[key]=current
  db.execute("INSERT INTO shared_travel_thing_fields (token,thing_key,fields_json,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(token,thing_key) DO UPDATE SET fields_json=excluded.fields_json, updated_at=CURRENT_TIMESTAMP",(token,key,json.dumps(current)))
  db.execute("INSERT INTO share_token_overrides (token,overrides_json,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(token) DO UPDATE SET overrides_json=excluded.overrides_json, updated_at=CURRENT_TIMESTAMP",(token,json.dumps(overrides)))
def assign(place_id, day_num, time, status, notes):
  d, actual=day_for(day_num)
  existing=one("SELECT id FROM day_assignments WHERE day_id=? AND place_id=?",(int(d["id"]),place_id))
  if existing:
    db.execute("UPDATE day_assignments SET assignment_time=COALESCE(NULLIF(?,''),assignment_time), reservation_status=COALESCE(NULLIF(?,''),reservation_status), notes=COALESCE(NULLIF(?,''),notes) WHERE id=?",(time,status,notes,int(existing["id"])))
  else:
    order=one("SELECT COALESCE(MAX(order_index),-1)+1 AS next_index FROM day_assignments WHERE day_id=?",(int(d["id"]),))["next_index"]
    db.execute("INSERT INTO day_assignments (day_id,place_id,order_index,notes,reservation_status,assignment_time) VALUES (?,?,?,?,?,?)",(int(d["id"]),place_id,int(order),notes,status or "considering",time or None))
  return actual
updated=[]; access=[]
for op in ops:
  kind=txt(op.get("op"),40)
  if kind=="set_trip_fields":
    sets=[]; args=[]
    for field,col in [("title","title"),("description","description"),("startDate","start_date"),("endDate","end_date")]:
      if op.get(field):
        sets.append(col+"=?"); args.append(txt(op.get(field),500))
    if sets:
      sets.append("updated_at=CURRENT_TIMESTAMP"); args.append(trip_id)
      db.execute("UPDATE trips SET "+",".join(sets)+" WHERE id=?",args); updated.append({"action":"set_trip_fields","title":txt(op.get("title") or op.get("description") or "trip fields",180)})
  elif kind=="set_share_flags":
    fields=[]
    for k,col in [("shareMap","share_map"),("shareBookings","share_bookings"),("sharePacking","share_packing"),("shareBudget","share_budget"),("shareCollab","share_collab")]:
      if k in op: fields.append((col,boolint(op.get(k))))
    if fields:
      db.execute("UPDATE share_tokens SET "+",".join(c+"=?" for c,v in fields)+" WHERE token=?", [v for c,v in fields]+[token])
      access.append({"action":"set_share_flags","target":token,"fields":dict(fields)})
  elif kind in ("add_member","remove_member"):
    ident=txt(op.get("email") or op.get("username"),240)
    user=one("SELECT * FROM users WHERE lower(email)=lower(?) OR lower(username)=lower(?)",(ident,ident))
    if not user: raise RuntimeError("Cannot change member access; no existing TREK user matched "+ident)
    if kind=="add_member":
      db.execute("INSERT OR IGNORE INTO trip_members (trip_id,user_id,invited_by) VALUES (?,?,?)",(trip_id,int(user["id"]),int(trip["user_id"])))
    else:
      db.execute("DELETE FROM trip_members WHERE trip_id=? AND user_id=?",(trip_id,int(user["id"])))
    access.append({"action":kind,"target":ident})
  elif kind=="add_thing":
    title=txt(op.get("title"),180)
    if not title: raise RuntimeError("add_thing missing title")
    cat=txt(op.get("category") or "event",40)
    summary=txt(op.get("summary") or op.get("details") or "Added from a TimeSyncher Vacation edit request.",1000)
    status=txt(op.get("status") or "considering",40)
    tm=parse_time(op.get("time"))
    address, lat, lng, has_coords = op_location(op)
    place_id=run("INSERT INTO places (trip_id,name,description,lat,lng,address,category_id,currency,reservation_status,place_time,duration_minutes,notes,website) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",(trip_id,title,summary,float(lat) if has_coords else None,float(lng) if has_coords else None,address or None,category_id(cat),"USD",status,tm or None,90,txt(op.get("details") or summary,2000),txt(op.get("website"),500) or None))
    actual=assign(place_id,op.get("day") or 1,tm,status,summary)
    fields={"category":cat,"status":status,"timeline":True,"startTime":tm,"summary":summary,"longDetails":txt(op.get("details") or summary,3000),"price":txt(op.get("price"),120),"website":txt(op.get("website"),500),"sourceNote":"Applied by TimeSyncher Vacation broad edit worker."}
    if address: fields["address"] = address
    if has_coords:
      fields["lat"] = float(lat); fields["lng"] = float(lng); fields["latitude"] = float(lat); fields["longitude"] = float(lng)
    fields.update(op.get("fields") if isinstance(op.get("fields"),dict) else {})
    save_fields(place_id,fields)
    updated.append({"action":"added","placeId":place_id,"title":title,"day":actual,"category":cat})
  elif kind in ("update_thing","move_thing","delete_thing"):
    p=find_place(op)
    if not p: raise RuntimeError(kind+" target not found: "+txt(op.get("matchTitle") or op.get("title"),180))
    pid=int(p["id"]); cat=txt(op.get("category"),40)
    if kind=="delete_thing":
      for d in day_rows(): db.execute("DELETE FROM day_assignments WHERE day_id=? AND place_id=?",(int(d["id"]),pid))
      db.execute("UPDATE places SET reservation_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",("eliminated",pid))
      save_fields(pid,{"timeline":False,"status":"eliminated"})
      updated.append({"action":"removed_from_timeline","placeId":pid,"title":p["name"],"category":cat or ""})
    else:
      sets=[]; args=[]
      if op.get("title"): sets.append("name=?"); args.append(txt(op.get("title"),180))
      if op.get("summary") or op.get("details"): sets.append("description=?"); args.append(txt(op.get("details") or op.get("summary"),2000))
      if cat: sets.append("category_id=?"); args.append(category_id(cat))
      if op.get("status"): sets.append("reservation_status=?"); args.append(txt(op.get("status"),40))
      tm=parse_time(op.get("time"))
      if tm: sets.append("place_time=?"); args.append(tm)
      if op.get("website"): sets.append("website=?"); args.append(txt(op.get("website"),500))
      address, lat, lng, has_coords = op_location(op)
      if address: sets.append("address=?"); args.append(address)
      if has_coords:
        sets.append("lat=?"); args.append(float(lat))
        sets.append("lng=?"); args.append(float(lng))
      if sets:
        sets.append("updated_at=CURRENT_TIMESTAMP"); args.append(pid)
        db.execute("UPDATE places SET "+",".join(sets)+" WHERE id=?",args)
      if kind=="move_thing" or op.get("day") or tm:
        assign(pid,op.get("day") or 1,tm,txt(op.get("status"),40),txt(op.get("summary") or op.get("details"),1000))
      fields={}
      for src,dst in [("category","category"),("status","status"),("summary","summary"),("details","longDetails"),("price","price"),("website","website")]:
        if op.get(src): fields[dst]=op.get(src)
      address, lat, lng, has_coords = op_location(op)
      if address: fields["address"] = address
      if has_coords:
        fields["lat"] = float(lat); fields["lng"] = float(lng); fields["latitude"] = float(lat); fields["longitude"] = float(lng)
      if tm: fields["startTime"]=tm
      if fields: save_fields(pid,fields)
      updated.append({"action":"updated" if kind=="update_thing" else "moved","placeId":pid,"title":txt(op.get("title") or p["name"],180),"category":cat})
db.commit()
print(json.dumps({"ok":True,"updatedItems":updated,"accessChanges":access,"operationCount":len(updated)+len(access)}))
`;

function applyOperations({ dbPath, token, operations }) {
  return runPython({ dbPath, token, operations }, applyCode);
}

function operationsFromValidatedWrites(writes = []) {
  return (Array.isArray(writes) ? writes : [])
    .map((write) => {
      const day = Number(String(write.to || write.day || '').match(/day\s*(\d+)/i)?.[1] || write.day || 0) || 1;
      const op = write.op === 'remove_thing' ? 'delete_thing' : write.op;
      return {
        op,
        title: write.title,
        matchTitle: write.title,
        day,
        item_id: write.item_id,
      };
    })
    .filter((item) => item.op && (item.title || item.item_id));
}

async function main() {
  const input = JSON.parse((await readStdin()) || '{}');
  const validatedWrites = Array.isArray(input.validatedWrites) ? input.validatedWrites : [];
  if (!validatedWrites.length) {
    throw new Error('TREK agent edit requires pipeline validatedWrites; utterance planning is disabled.');
  }
  const token = text(input.token || input.shareToken || input.share_token, 180);
  if (!token) throw new Error('No target shared trip token could be identified for broad TREK edit.');
  const publicBase = text(input.publicBase || process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE, 500).replace(/\/+$/, '');
  const dbPath = text(input.dbPath || process.env.TIMESYNCHER_TREK_DB_PATH || DEFAULT_DB_PATH, 500);
  const operations = operationsFromValidatedWrites(validatedWrites);
  if (!operations.length) {
    throw new Error('TREK agent edit requires pipeline validatedWrites; utterance planning is disabled.');
  }
  const applied = applyOperations({ dbPath, token, operations });
  const url = `${publicBase}/shared/${encodeURIComponent(token)}/`;
  console.log(JSON.stringify({
    ok: true,
    mode: 'validated_trek_agent_edit',
    token,
    url,
    summary: 'Applied pipeline planned_writes only.',
    plannedOperations: operations,
    updatedItems: applied.updatedItems || [],
    accessChanges: applied.accessChanges || [],
    operationCount: applied.operationCount || operations.length,
    verification: { changed: true, source: 'pipeline-planned-writes-only' },
  }));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}

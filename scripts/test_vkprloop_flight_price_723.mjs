import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// #723: gateb_coverage flight rows match airline+route+departure on the list tab
// when the fixture full name is not a line. Budget tab and hotels stay name-only.
// That changes which heads fail the price rule. It does not add a PR-loop transition.

const FIXTURE = `
import re
def _flight_key(name):
    m = re.match(r"^(?:flight option:\\s*)?(.+?)\\s+([A-Z]{3})\\s*(?:-|→)\\s*([A-Z]{3})\\b.*?(\\d{2}:\\d{2})\\s*[-–]", str(name or "").strip(), re.I)
    return (m.group(1).strip().lower(), "%s-%s" % (m.group(2).upper(), m.group(3).upper()), m.group(4)) if m else None
def _flight_screen_blocks(text):
    lines = [line.strip() for line in text.split("\\n")]
    out, start = {}, 0
    for i, line in enumerate(lines):
        m = re.match(r"^Airline:\\s*(.+?);\\s*Route:\\s*([A-Z]{3}-[A-Z]{3})", line)
        if not m: continue
        block = lines[start:i + 1]
        times = [b for b in block if re.match(r"^\\d{1,2}:\\d{2}\\s*(am|pm)$", b, re.I)]
        start = i + 1
        if not times: continue
        hh, mm, ap = re.match(r"(\\d{1,2}):(\\d{2})\\s*(am|pm)", times[0], re.I).groups()
        hour = int(hh) % 12 + (12 if ap.lower() == "pm" else 0)
        out.setdefault((m.group(1).strip().lower(), m.group(2).upper(), "%02d:%s" % (hour, mm)), block)
    return out
def _segments(text, names):
    lines = [line.strip() for line in text.split("\\n")]
    idx = [(i, line) for i, line in enumerate(lines) if line in names]
    seg = {}
    for k, (i, name) in enumerate(idx):
        j = idx[k + 1][0] if k + 1 < len(idx) else len(lines)
        seg.setdefault(name, lines[i + 1:j])
    return seg
def apply_list(tab, names, cat):
    seg = _segments(tab, names)
    if cat == "flight":
        fblocks = _flight_screen_blocks(tab)
        for n in names:
            k = _flight_key(n)
            if k and not seg.get(n) and k in fblocks: seg[n] = fblocks[k]
    return seg
`;

const MUTANT = FIXTURE.replace(
  'if k and not seg.get(n) and k in fblocks: seg[n] = fblocks[k]',
  'if False and k and not seg.get(n) and k in fblocks: seg[n] = fblocks[k]',
);

const PROBE = String.raw `
import json, sys
src = sys.stdin.read()
ns = {}
exec(src, ns)
key = ns["_flight_key"]
blocks = ns["_flight_screen_blocks"]
apply = ns["apply_list"]
flight = "Flight option: Southwest LAS-LGA 2026-06-23 05:05-15:45"
priced = "Southwest\n$412\n5:05 am\n3:45 pm\nAirline: Southwest; Route: LAS-LGA\n"
clocks = "\n".join([
    "12:05 am",
    "Airline: Delta; Route: LAX-SFO",
    "12:00 pm",
    "Airline: JetBlue; Route: BOS-MIA",
    "12:00 am",
    "Airline: Night; Route: AAA-BBB",
])
named = priced + flight + "\nno dollars\n"
out = {
    "southwest": list(key(flight)),
    "arrow": list(key("Southwest LAS \u2192 LGA 05:05\u201315:45")),
    "united": list(key("United Airlines JFK-SFO 14:30-17:45")),
    "hotel": key("Hotel Something"),
    "clocks": [list(k) for k in blocks(clocks)],
    "priced": any("$" in line for line in apply(priced, {flight}, "flight").get(flight, [])),
    "unpriced": any("$" in line for line in apply(priced.replace("$412", "no price"), {flight}, "flight").get(flight, [])),
    "miss": flight in apply("just a heading\n", {flight}, "flight"),
    "keep_exact": any("$" in line for line in apply(named, {flight}, "flight").get(flight, [])),
    "hotel_not_flight": any("$" in line for line in apply(priced, {flight}, "hotel").get(flight, [])),
}
json.dump(out, sys.stdout)
`;

function runProbe(src) {
  const probe = spawnSync('python3', ['-c', PROBE], { input: src, encoding: 'utf8' });
  assert.equal(probe.status, 0, (probe.stderr || probe.stdout || 'probe failed').trim());
  return JSON.parse(probe.stdout);
}

function assertReport(report, label) {
  assert.deepEqual(report.southwest, ['southwest', 'LAS-LGA', '05:05'], label);
  assert.deepEqual(report.arrow, ['southwest', 'LAS-LGA', '05:05'], label);
  assert.deepEqual(report.united, ['united airlines', 'JFK-SFO', '14:30'], label);
  assert.equal(report.hotel, null, label);
  assert.deepEqual(report.clocks, [
    ['delta', 'LAX-SFO', '00:05'],
    ['jetblue', 'BOS-MIA', '12:00'],
    ['night', 'AAA-BBB', '00:00'],
  ], label);
  assert.equal(report.priced, true, `${label}: list tab counts a matched row with a price`);
  assert.equal(report.unpriced, false, `${label}: a matched row with no price stays unpriced`);
  assert.equal(report.miss, false, `${label}: no airline row does not invent a segment`);
  assert.equal(report.keep_exact, false, `${label}: a real name line is not replaced by the flight key`);
  assert.equal(report.hotel_not_flight, false, `${label}: hotels do not use the flight key`);
}

function dispatchRoot() {
  const candidates = [
    process.env.TSV_DISPATCH,
    '/home/ubishere9995/tsv-dispatch',
    path.join(os.homedir(), 'tsv-dispatch'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'gateb_coverage.py')) && fs.existsSync(path.join(dir, 'formal', 'VKPrLoop.tla'))) {
      return dir;
    }
  }
  return null;
}

assertReport(runProbe(FIXTURE), 'fixture');
assert.throws(() => assertReport(runProbe(MUTANT), 'mutant'), /list tab counts a matched row with a price/);

const root = dispatchRoot();
if (root) {
  const live = fs.readFileSync(path.join(root, 'gateb_coverage.py'), 'utf8');
  assert.match(live, /if cat == "flight":/);
  assert.match(live, /if k and not seg\.get\(n\) and k in fblocks: seg\[n\] = fblocks\[k\]/);
  const integrated = spawnSync('python3', ['-c', `
import importlib.util, json, os, tempfile, sys
p = sys.argv[1]
spec = importlib.util.spec_from_file_location("gc", p)
gc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gc)
flight = "Flight option: Southwest LAS-LGA 2026-06-23 05:05-15:45"
tab = "Southwest\\n$412\\n5:05 am\\n3:45 pm\\nAirline: Southwest; Route: LAS-LGA\\n"
def run(body, budget, cat):
    d = tempfile.mkdtemp()
    regs = {
        "%s-1280.png" % ("flights" if cat == "flight" else "hotels"): {"struct": {"body_text": body}, "items": []},
        "budget-1280.png": {"struct": {"body_text": budget}},
    }
    json.dump(regs, open(os.path.join(d, "capture-regions.json"), "w"))
    fx = os.path.join(d, "fx.json")
    json.dump({"places": [{"name": flight, "category_name": cat}]}, open(fx, "w"))
    r = gc.check(d, fx)
    key = "%s-1280" % cat
    return {"priced_list": r["counts"][key]["priced_list"], "priced_budget": r["counts"][key]["priced_budget"],
            "fails": r["fails"]}
priced = run(tab, "", "flight")
bare = run(tab.replace("$412", "no price"), "", "flight")
miss = run("just a heading\\n", "", "flight")
exact = run(tab + flight + "\\nno dollars\\n", flight + "\\n$9\\n", "flight")
hotel = run(tab, "", "hotel")
# Mutant: empty screen blocks restore the pre-H2 miss on a priced row.
gc._flight_screen_blocks = lambda text: {}
mutant = run(tab, "x", "flight")
json.dump({"priced": priced, "bare": bare, "miss": miss, "exact": exact, "hotel": hotel, "mutant": mutant}, sys.stdout)
`, root + '/gateb_coverage.py'], { encoding: 'utf8' });
  assert.equal(integrated.status, 0, (integrated.stderr || integrated.stdout || 'live check failed').trim());
  const liveReport = JSON.parse(integrated.stdout);
  assert.equal(liveReport.priced.priced_list, 1);
  assert.equal(liveReport.priced.priced_budget, 0, 'budget tab still matches the fixture name only');
  assert.ok(liveReport.priced.fails.some((line) => line.startsWith('price budget-1280:')));
  assert.equal(liveReport.priced.fails.some((line) => line.includes('flights-1280 list')), false);
  assert.equal(liveReport.bare.priced_list, 0);
  assert.ok(liveReport.bare.fails.some((line) => line.includes('flights-1280 list')));
  assert.equal(liveReport.miss.priced_list, 0);
  assert.equal(liveReport.exact.priced_list, 0, 'an existing name segment is not replaced');
  assert.equal(liveReport.exact.priced_budget, 1);
  assert.equal(liveReport.hotel.priced_list, 0, 'hotels do not use the flight key');
  assert.equal(liveReport.mutant.priced_list, 0, 'without the screen-block fallback the priced row is a miss');

  const tla = fs.readFileSync(path.join(root, 'formal', 'VKPrLoop.tla'), 'utf8');
  assert.match(tla, /gateb_coverage\.check flight price match \(H2, 10\/26\)/);
  assert.match(tla, /flight's list-tab segment/);
  assert.match(tla, /Budget-tab\n\\* prices still match the fixture name only/);
  assert.match(tla, /No new state, transition, guard, round budget, or invariant/);
  const check = spawnSync('python3', ['formal/manifest.py', 'check'], { cwd: root, encoding: 'utf8' });
  assert.equal(check.status, 0, (check.stdout || check.stderr || 'manifest drift').trim());
  console.log('vkprloop flight price #723: live spec in sync');
} else {
  console.log('vkprloop flight price #723: fixture ok (no local tsv-dispatch)');
}

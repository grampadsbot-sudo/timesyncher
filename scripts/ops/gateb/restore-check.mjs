// restore-check.mjs: Gate B v6 rules for restore / new-look PRs (dr eggbot 2026-10-08 ~9 AM PT, after the #274 d832b42 false PASS).
// usage: node restore-check.mjs <baseline.png> <candidate.png> <spec.json>      -> prints one JSON verdict
// spec = {file, regions (capture-regions.json entry for this shot, candidate coords), rows_allowed, need_regions, top (viewport shot),
//         pending_masks:[{box:[x,y,w,h], why}], max_allowed_pct: 25, icon_search_px: 4, overlay: path}
// Rules (fail closed, model-free):
//  * Same width as the baseline. Everything outside the list rows must match pixel-for-pixel (pixelmatch threshold 0.1,
//    includeAA false = Gate B's 0 px rule), except inside icon boxes (checked separately) and pending masks (logged).
//  * Lists (Craig 2026-10-08: no fixed row count, more options is better): the list area is excluded from the pixel compare and
//    each row is checked against the approved row DESIGN from the DOM in restore_check.py. The image segmentation must agree
//    with the DOM row count (detection sanity). The list's height change is carried to everything below; below the first list
//    a pixel counts only if it also differs at offset +-1 px (sub-pixel row heights). Icons inside lists are row logos (DOM-checked).
//  * Icons: translation only. The candidate glyph must equal the baseline glyph (same size, 0 px residual at the best offset
//    within +-icon_search_px horizontally / within its row or button vertically). Added, removed, scaled or redrawn = FAIL.
//  * Allowed area (icon boxes + pending masks; NOT the DOM-checked list) may not exceed max_allowed_pct of the screen.
//  * Only what a user sees is compared: x < the viewport width (390 / 1280). Wider documents are reported, rows overflowing fail in restore_check.py.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [baseF, candF, specF] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specF, 'utf8'));
const out = { file: spec.file, ok: false, reasons: [], notes: [] };
const done = () => { out.ok = out.reasons.length === 0; console.log(JSON.stringify(out)); process.exit(0); };
let B, C;
try { B = PNG.sync.read(fs.readFileSync(baseF)); C = PNG.sync.read(fs.readFileSync(candF)); }
catch (e) { out.reasons.push('baseline or candidate unreadable: ' + e.message); done(); }
out.base_size = [B.width, B.height]; out.cand_size = [C.width, C.height];
const THR = 0.1, MAXD = 35215 * THR * THR, SEG_D = 25;
const Y = (r, g, b) => r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
const I = (r, g, b) => r * 0.59597799 - g * 0.27417610 - b * 0.32180189;
const Q = (r, g, b) => r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
function delta(a, i, b, j) {
  let r1 = a[i], g1 = a[i + 1], b1 = a[i + 2], a1 = a[i + 3], r2 = b[j], g2 = b[j + 1], b2 = b[j + 2], a2 = b[j + 3];
  if (a1 < 255) { a1 /= 255; r1 = 255 + (r1 - 255) * a1; g1 = 255 + (g1 - 255) * a1; b1 = 255 + (b1 - 255) * a1; }
  if (a2 < 255) { a2 /= 255; r2 = 255 + (r2 - 255) * a2; g2 = 255 + (g2 - 255) * a2; b2 = 255 + (b2 - 255) * a2; }
  const y = Y(r1, g1, b1) - Y(r2, g2, b2), ii = I(r1, g1, b1) - I(r2, g2, b2), q = Q(r1, g1, b1) - Q(r2, g2, b2);
  return 0.5053 * y * y + 0.299 * ii * ii + 0.1957 * q * q;
}
const W = Math.max(B.width, C.width), Hb = B.height, Hc = C.height;
if (B.width !== C.width) out.notes.push(`document width ${C.width}px vs baseline ${B.width}px (only x < viewport width is compared)`);
const padW = (P) => { const o = Buffer.alloc(W * P.height * 4, 255); for (let y = 0; y < P.height; y++) P.data.copy(o, y * W * 4, y * P.width * 4, (y + 1) * P.width * 4); return o; };
const Bd = padW(B), Cd = padW(C);
const px = (y, x) => (y * W + x) * 4;
const r = spec.regions;
const VW = (r && r.viewport && r.viewport[0]) || W;
// structure mode (Craig 2026-10-08 12:27 PM PT): no pixel compare at all; only the map colour rule runs
// Named map failures (GBrain bot-admin request claude-manager-pr274-osm-brief-20261009-1515). The colour rule still decides
// PASS/FAIL; tile-log.json (capture.mjs, next to capture-regions.json) only decides the WORDING of a colour failure:
//  - "map tiles did not load (host X, status Y)": no tile loaded before this screen, or a tile request came back non-200 / failed
//  - "map shows an error/deny tile": the tiles came back 200 but the map box is one flat colour (<= 1 hue bucket)
// No tile log next to the candidate -> null, and the existing colour message is used.
function mapFailName(buckets, frac) {
  const f = spec.tile_log || path.join(path.dirname(candF), 'tile-log.json');
  if (!fs.existsSync(f)) return null;
  let log; try { log = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; }
  const want = path.basename(candF);
  const shot = (log.shots || []).find((s) => s.shot === want && (s.w == null || s.w === VW));
  const cut = shot && shot.t_ms != null ? shot.t_ms : Infinity;   // only tile requests made before this screenshot
  const tiles = (log.requests || []).filter((q) => (q.w == null || q.w === VW) && (q.t_ms == null || q.t_ms <= cut));
  const isImg = (q) => /^image\//i.test(q.content_type || '');
  const got = tiles.filter((q) => q.status === 200 && isImg(q));
  const bad = tiles.filter((q) => !(q.status === 200 && isImg(q)));
  const loaded = shot && shot.loaded_before_shot != null ? shot.loaded_before_shot : got.length;
  if (loaded === 0 || bad.length) {
    const hosts = [...new Set(bad.map((q) => q.host))].join(',') || 'none';
    const sts = [...new Set(bad.map((q) => String(q.status === 0 ? (q.failure || 'failed') : q.status)))].join(',') || 'none (no tile requests)';
    return `map tiles did not load (host ${hosts}, status ${sts})`;
  }
  if (buckets <= 1) return `map box is one hue (${buckets} hue bucket(s), ${(frac * 100).toFixed(1)}% saturated) though ${got.length} tile(s) came back 200 image/png: a deny/error tile or plain standard-OSM styling; the colour rule cannot tell which`;
  return null;
}
function mapStyle() {
if (spec.map_box) {
  const [mx, my, mw, mh] = spec.map_box.map((v) => Math.round(v));
  const x0 = Math.max(0, mx), y0 = Math.max(0, my), x1 = Math.min(W, mx + mw), y1 = Math.min(Hc, my + mh);
  const n = Math.max(1, (x1 - x0) * (y1 - y0));
  const hues = new Array(12).fill(0); let sat = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const k = (y * W + x) * 4, r = Cd[k] / 255, g = Cd[k + 1] / 255, b = Cd[k + 2] / 255;
    const M = Math.max(r, g, b), m = Math.min(r, g, b), vv = M, ss = M ? (M - m) / M : 0;
    if (ss >= 0.15 && vv >= 0.25) { sat++; let h = 0; const d = M - m; if (M === r) h = ((g - b) / d) % 6; else if (M === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; hues[(Math.round((h / 6) * 12) + 12) % 12]++; }
  }
  const counted = Math.ceil((x1 - x0) / 2) * Math.ceil((y1 - y0) / 2);
  const buckets = hues.filter((c) => c >= 0.005 * counted).length, frac = sat / counted;
  out.map = { box: [mx, my, mw, mh], hue_buckets: buckets, sat_frac: +frac.toFixed(3) };
  // structure mode (GBrain request claude-manager-pr274-maprule-brief-20261009-1710): the colour numbers are info only; mapEvidence() decides
  if (!spec.structure && (buckets < 4 || frac < 0.05)) out.reasons.push(mapFailName(buckets, frac) || `day-by-day map is not the colourful styled map (hue buckets ${buckets}, saturated ${(frac * 100).toFixed(1)}%; need >=4 buckets and >=5% saturated, the bar of the Dialog PDF map; plain gray/beige tiles or an error tile fail this)`);
}
}
// Evidence-based day-map rule, structure mode only (GBrain request claude-manager-pr274-maprule-brief-20261009-1710). PASS when the
// map box exists, at least 8 tiles came back 200 image/png from *.tile.openstreetmap.org before this shot, those tiles have at least
// 4 distinct byte sizes (real tiles vary; deny/error tiles repeat), and at least 1 leaflet marker is visible. Reasons are named.
function mapEvidence() {
  // GBrain request claude-manager-pr274-maprule-fix-20261009-1710b: the -top viewport shots skip the map rule (the map is below the fold there)
  if (spec.map_below_fold) { out.notes.push('map below the fold; judged on the full shot'); return; }
  if (!spec.day_map) return;
  if (!spec.map_box) { out.reasons.push('no day map rendered'); return; }
  const f = spec.tile_log || path.join(path.dirname(candF), 'tile-log.json');
  const want = path.basename(candF);
  let log = null; try { log = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { log = null; }
  const shot = log && (log.shots || []).find((s) => s.shot === want && (s.w == null || s.w === VW));
  if (!shot) { out.reasons.push('map tiles did not load (no tile log entry for this shot)'); return; }
  const cut = shot.t_ms != null ? shot.t_ms : Infinity;
  const tiles = (log.requests || []).filter((q) => (q.w == null || q.w === VW) && (q.t_ms == null || q.t_ms <= cut));
  const isImg = (q) => /^image\//i.test(q.content_type || '');
  const isOsm = (q) => /\.tile\.openstreetmap\.org$/i.test(q.host || '');
  const ok = tiles.filter((q) => q.status === 200 && isImg(q) && isOsm(q));
  const wrong = tiles.filter((q) => q.status === 200 && isImg(q) && !isOsm(q));
  const bad = tiles.filter((q) => !(q.status === 200 && isImg(q) && isOsm(q)));
  const sizes = new Map(); for (const q of ok) sizes.set(q.bytes, (sizes.get(q.bytes) || 0) + 1);
  const maxSame = Math.max(0, ...sizes.values());
  const pins = shot.markers || 0;
  // pins are required only when the captured day has a place with coordinates in the fixture (null = unknown, fail closed)
  const pinsRequired = spec.day_mapped_places == null || spec.day_mapped_places > 0;
  out.map_evidence = { osm_200: ok.length, distinct_tile_bytes: sizes.size, most_identical_tile: maxSame, markers: pins, wrong_host_200: wrong.length, day_mapped_places: spec.day_mapped_places ?? null, pins_required: pinsRequired };
  if (ok.length < 8) {
    if (wrong.length) out.reasons.push(`tiles from wrong host ${[...new Set(wrong.map((q) => q.host))].join(',')} (expected tile.openstreetmap.org)`);
    else {
      const hosts = [...new Set(bad.map((q) => q.host))].join(',') || 'none';
      const sts = [...new Set(bad.map((q) => String(q.status === 0 ? (q.failure || 'failed') : q.status)))].join(',') || 'none (no tile requests)';
      out.reasons.push(`map tiles did not load (host ${hosts}, status ${sts}; ${ok.length} of 8 needed came back 200 from tile.openstreetmap.org)`);
    }
    return;
  }
  if (sizes.size < 4) out.reasons.push(`tiles look like error/deny tiles (${maxSame} identical)`);
  if (!pinsRequired) out.notes.push('pins not checked: fixture day has no mapped places');
  else if (pins < 1) out.reasons.push('no pins visible');
}
// Logo centring (Craig 2026-10-10): category tab pills use the same ink mass-centre metric as vacation-client shell-layout
// (weighted Y centroid, threshold 18, alpha in the weight). Row logo chips keep ink-bbox vertical centre (unchanged).
// Tolerance: 0.5 px for tab pills and row chips. Scrolled-out-of-view tabs are not judged; no drawable ink fails closed.
function logoCentres() {
  const INK_BBOX_THR = 24;
  const MASS_THR = 18;
  const TAB_TOL = 0.5;
  const CHIP_TOL = 0.5;
  const bad = [];
  const nameBad = [];
  out.logo_centres = [];

  function insetBox(box, inset) {
    const [cx, cy, cw, ch] = box;
    const x0 = Math.round(cx + inset);
    const x1 = Math.round(cx + cw - 1 - inset);
    const y0 = Math.round(cy + inset);
    const y1 = Math.round(cy + ch - 1 - inset);
    return { cx, cy, cw, ch, x0, x1, y0, y1 };
  }

  function ringBackground(x0, x1, y0, y1) {
    const ring = new Map();
    const addRing = (x, y) => {
      const k = (y * W + x) * 4;
      const key = `${Cd[k]},${Cd[k + 1]},${Cd[k + 2]}`;
      ring.set(key, (ring.get(key) || 0) + 1);
    };
    for (let x = x0; x <= x1; x += 1) {
      addRing(x, y0);
      addRing(x, y1);
    }
    for (let y = y0; y <= y1; y += 1) {
      addRing(x0, y);
      addRing(x1, y);
    }
    let bgKey = null;
    let bgN = -1;
    for (const [key, n] of ring) {
      if (n > bgN) {
        bgN = n;
        bgKey = key;
      }
    }
    return bgKey.split(',').map(Number);
  }

  function inkBboxCenterY(x0, x1, y0, y1, gx0, gx1, bg) {
    let mn = null;
    let mx = null;
    for (let y = Math.max(0, y0); y <= Math.min(Hc - 1, y1); y += 1) {
      for (let x = Math.max(0, gx0); x <= Math.min(VW - 1, gx1); x += 1) {
        const k = (y * W + x) * 4;
        if (Math.max(Math.abs(Cd[k] - bg[0]), Math.abs(Cd[k + 1] - bg[1]), Math.abs(Cd[k + 2] - bg[2])) > INK_BBOX_THR) {
          if (mn === null || y < mn) mn = y;
          if (mx === null || y > mx) mx = y;
        }
      }
    }
    if (mn === null) return null;
    return { gc: (mn + mx + 1) / 2, glyph_y: [mn, mx], metric: 'ink-bbox' };
  }

  function massCentreY(x0, x1, y0, y1, gx0, gx1, bg) {
    let sumY = 0;
    let mass = 0;
    for (let y = Math.max(0, y0); y <= Math.min(Hc - 1, y1); y += 1) {
      for (let x = Math.max(0, gx0); x <= Math.min(VW - 1, gx1); x += 1) {
        const k = (y * W + x) * 4;
        const a = Cd[k + 3];
        if (a < 16) continue;
        const dr = Math.abs(Cd[k] - bg[0]);
        const dg = Math.abs(Cd[k + 1] - bg[1]);
        const db = Math.abs(Cd[k + 2] - bg[2]);
        if (dr + dg + db < MASS_THR) continue;
        const weight = (dr + dg + db) * (a / 255);
        sumY += y * weight;
        mass += weight;
      }
    }
    if (mass <= 0) return null;
    return { gc: sumY / mass, mass, metric: 'mass-centre' };
  }

  function judgeContainer(entry, measureFn, tol) {
    const { where, box, gx, gw, inset, name, name_cy: nameCy } = entry;
    const { cx, cy, cw, ch, x0, x1, y0, y1 } = insetBox(box, inset);
    const bg = ringBackground(x0, x1, y0, y1);
    const gx0 = Math.max(x0, Math.round(gx - 3));
    const gx1 = Math.min(x1, Math.round(gx + gw + 3));
    const measured = measureFn(x0, x1, y0, y1, gx0, gx1, bg);
    if (!measured) {
      bad.push(`${where} (no glyph drawn)`);
      out.logo_centres.push({ where, ink: false });
      return;
    }
    const cc = cy + ch / 2;
    const off = +(measured.gc - cc).toFixed(1);
    out.logo_centres.push({ where, off, ...measured });
    if (Math.abs(off) > tol) {
      bad.push(`${where} off by ${Math.abs(off).toFixed(1)} px (${off > 0 ? 'low' : 'high'}, tolerance ${tol} px)`);
    }
    if (nameCy != null) {
      const no = +(measured.gc - nameCy).toFixed(1);
      if (Math.abs(no) > CHIP_TOL) {
        nameBad.push(`${name || '?'} off by ${Math.abs(no).toFixed(1)} px (${no > 0 ? 'logo low' : 'logo high'} vs name, tolerance ${CHIP_TOL} px)`);
      }
    }
  }

  for (const t of spec.tab_boxes || []) {
    if (!t.icon || !t.box || t.box[0] < 0 || t.box[0] + t.box[2] > VW) continue;
    judgeContainer(
      { where: `tab ${t.text}`, box: t.box, gx: t.icon[0], gw: t.icon[2], inset: 3 },
      massCentreY,
      TAB_TOL,
    );
  }
  for (const c of spec.logo_chips || []) {
    if (!c.box || c.box[0] < 0 || c.box[0] + c.box[2] > VW) continue;
    judgeContainer(
      {
        where: `row logo ${c.name || '?'}`,
        box: c.box,
        gx: c.box[0],
        gw: c.box[2],
        inset: 1,
        name: c.name,
        name_cy: c.name_cy,
      },
      inkBboxCenterY,
      CHIP_TOL,
    );
  }
  if (bad.length) out.reasons.push(`logo not vertically centred: ${bad.join('; ')}`);
  if (nameBad.length) out.reasons.push(`logo not centred with name: ${nameBad.join('; ')}`);
}
// Craig 2026-10-10: "generic logo". 3 or more row logo chips on one screen with pixel-identical crops = the same placeholder on every row.
function genericLogos() {
  const chips = (spec.logo_chips || []).filter((c) => c.box && c.box[2] > 0 && c.box[3] > 0 && c.box[0] >= 0 && c.box[0] + c.box[2] <= VW);
  out.generic_logo = { rows: chips.length, groups: [] };
  if (chips.length < 3) return;
  const groups = new Map();
  for (const c of chips) {
    const [bx, by, bw, bh] = c.box; let h = 0x811c9dc5;   // FNV-1a over the RGB of every pixel in the chip box
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      if (x < 0 || y < 0 || x >= W || y >= Hc) { h = Math.imul(h ^ 0xff, 0x01000193); continue; }
      const k = (y * W + x) * 4; for (let j = 0; j < 3; j++) h = Math.imul(h ^ Cd[k + j], 0x01000193);
    }
    const key = (h >>> 0).toString(16); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(c.name || '?');
  }
  const same = [...groups.values()].sort((a, b) => b.length - a.length);
  out.generic_logo.groups = same.map((g) => g.length);
  if (same[0].length >= 3) out.reasons.push(`generic logo on ${same[0].length} of ${chips.length} rows (${spec.file}): the same picture on every row (${same[0].slice(0, 3).map((n) => n.slice(0, 24)).join(', ')})`);
}
if (spec.structure) { mapStyle(); mapEvidence(); logoCentres(); genericLogos(); done(); }
if (spec.need_regions && !(r && r.ok)) { out.reasons.push('region detection failed: ' + ((r && r.error) || 'no capture-regions entry for this shot')); done(); }

// ---- masks (candidate coords): icon boxes + pending masks
const mask = new Uint8Array(W * Hc); let maskPx = 0;
const addMask = (x, y, w, h) => { const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(Hc, Math.ceil(y + h)); for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const k = yy * W + xx; if (!mask[k]) { mask[k] = 1; maskPx++; } } };
const icons0 = ((r && r.icons) || []).map(([x, y, w, h]) => { const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(C.width, x + w), y1 = Math.min(Hc, y + h); return x1 - x0 >= 4 && y1 - y0 >= 4 ? [x0, y0, x1 - x0, y1 - y0] : null; }).filter(Boolean);
const icons = icons0;
for (const [x, y, w, h] of icons) addMask(x - 1, y, w + 2, h);
for (const m of spec.pending_masks || []) { addMask(...m.box); out.notes.push(`pending mask ${JSON.stringify(m.box)}: ${m.why}`); }
// logo boxes (Craig 2026-10-08 8:41: logos must show everywhere; where the approved baseline itself is wrong, e.g. a blank header
// plate, the box is judged by rule instead of pixel-equal: logo present, centred in the viewport, same size as the reference screen's)
for (const m of spec.logo_boxes || []) addMask(...m.box);

// ---- row segmentation
function bgColor(D, x0, x1, y0, y1) {          // most common colour in a strip
  const cnt = new Map(); let best = null, bc = 0;
  for (let y = Math.max(0, y0); y < y1; y++) for (let x = Math.max(0, x0); x < x1; x++) { const k = px(y, x), key = (D[k] << 16) | (D[k + 1] << 8) | D[k + 2]; const c = (cnt.get(key) || 0) + 1; cnt.set(key, c); if (c > bc) { bc = c; best = k; } }
  return best == null ? null : Buffer.from(D.subarray(best, best + 4));
}
function segments(D, H, x0, x1, y0, y1, bg) {
  // light card borders (#f0f0f0 on #f8fafc) sit below pixelmatch's threshold, so row segmentation uses a finer one
  const blank = (y) => { for (let x = x0; x < x1; x++) if (delta(D, px(y, x), bg, 0) > SEG_D) return false; return true; };
  const segs = []; let s = -1;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) { const b = blank(y); if (!b && s < 0) s = y; if (b && s >= 0) { if (y - s >= 4) segs.push([s, y]); s = -1; } }
  if (s >= 0 && Math.min(H, y1) - s >= 4) segs.push([s, Math.min(H, y1)]);
  return segs;
}
// mapB[yc] = baseline line shown at candidate line yc; -1 = list line (DOM-checked, not pixel-compared), -2 = no baseline source (white)
const mapB = new Int32Array(Hc).fill(-2);
let yc = 0, off = 0, listTop0 = null, added = 0;
const rowInfo = [];
const groups = spec.rows_allowed && r && r.rows ? [...r.rows].sort((a, b) => a.box[1] - b.box[1]) : [];
if (spec.rows_allowed && r && !groups.length && !spec.rows_optional) out.reasons.push('region detection failed: no list rows found on a screen whose rows are checked');
const lineCost = (yb, yc2, cols) => {          // differing px on one line, +-1 px horizontal AA tolerance, capped
  let n = 0;
  for (const x of cols) {
    const kb = px(yb, x), kc = px(yc2, x);
    if (delta(Bd, kb, Cd, kc) <= MAXD) continue;
    if (x > 0 && delta(Bd, kb, Cd, kc - 4) <= MAXD) continue;
    if (x < W - 1 && delta(Bd, kb, Cd, kc + 4) <= MAXD) continue;
    if (++n >= 40) break;
  }
  return n;
};
let listPx = 0;
const listBands = [];
for (const g of groups) {
  // Craig 2026-10-08: NO fixed row count (more options is better). The list area is not pixel-compared to the baseline; each
  // row is checked against the approved row DESIGN from the DOM (restore_check.py: real logo, layout, right-hand control,
  // inside the screen width, airline names, cheapest first). Everything above and below the list stays pixel-exact, with
  // the list's height change carried to everything below.
  const [gx, gy, gw, gh] = g.box;
  const top = Math.max(gy - 1, yc);
  for (let y = yc; y < top && y < Hc; y++) mapB[y] = y - off;
  if (listTop0 == null) listTop0 = top;
  const bTop = top - off, x0 = Math.max(0, gx), x1 = Math.min(W, gx + gw);
  const bgC = bgColor(Cd, Math.max(0, gx - 8), Math.max(1, gx - 2), gy, Math.min(Hc, gy + gh)) || Buffer.from([255, 255, 255, 255]);
  const bgB = bgColor(Bd, Math.max(0, gx - 8), Math.max(1, gx - 2), bTop, Math.min(Hb, bTop + gh)) || bgC;
  const cEnd = Math.min(Hc, gy + gh + 1);
  const cs = segments(Cd, Hc, x0, x1, top, Math.min(Hc, cEnd + 1), bgC);
  if (cs.length !== g.n) out.reasons.push(`row detection failed: ${cs.length} rows in the image vs ${g.n} list rows in the DOM`);
  const gapsC = cs.slice(1).map((s2, i) => s2[0] - cs[i][1]);
  const maxGap = gapsC.length ? Math.max(...gapsC) + 3 : 30;
  const bs = [];
  const chs = cs.map((s2) => s2[1] - s2[0]), hMin = chs.length ? Math.min(...chs) : 0, hMax = chs.length ? Math.max(...chs) : 1e9;
  // a baseline segment belongs to the list only if it is close to the previous row AND row-sized (stops at a footer/caption line)
  for (const s2 of segments(Bd, Hb, x0, Math.min(B.width, x1), bTop, Hb, bgB)) { if (bs.length && s2[0] - bs[bs.length - 1][1] > maxGap) break; if (!bs.length && s2[0] - bTop > maxGap) break;
    const h2 = s2[1] - s2[0]; if (chs.length && (h2 < 0.6 * hMin || h2 > 2.6 * hMax)) break; bs.push(s2); }
  if (!bs.length) out.reasons.push('the approved baseline has no list where this screen has one (list added?)');
  // rows' padding below the last ink line is invisible in segments: carry the candidate's trailing padding to the baseline
  const tailC = cs.length ? Math.max(0, cEnd - cs[cs.length - 1][1]) : 0;
  const bEnd = bs.length ? bs[bs.length - 1][1] + tailC : bTop;
  const hs = bs.map((s2) => s2[1] - s2[0]).sort((p, q) => p - q);
  rowInfo.push({ dom_rows: g.n, screen_rows: cs.length, baseline_rows: bs.length, base_row_h: hs.length ? hs[Math.floor(hs.length / 2)] : null,
                 base_row_h_min: hs[0] ?? null, cand_row_h: cs.map((s2) => s2[1] - s2[0]), list_box: g.box });
  for (let y = top; y < cEnd; y++) { mapB[y] = -1; listPx += W; }
  listBands.push([top, cEnd]);
  off = cEnd - bEnd; yc = cEnd;
}
for (let y = yc; y < Hc; y++) mapB[y] = y - off;
out.dh = off;
if (!spec.top && groups.length && Hb - off > Hc + 1) out.reasons.push(`page is ${Hb - off - Hc}px shorter than the baseline below the list (content missing)`);

// ---- aligned baseline image in candidate coordinates (+ the +-1 px variants below the first list)
const build = (sh) => {
  const A = Buffer.alloc(W * Hc * 4, 255);
  for (let y = 0; y < Hc; y++) {
    let s = mapB[y];
    if (s === -1) { Cd.copy(A, y * W * 4, y * W * 4, (y + 1) * W * 4); continue; }
    if (s >= 0 && sh && listTop0 != null && y >= listTop0) s += sh;
    if (s >= 0 && s < Hb) Bd.copy(A, y * W * 4, s * W * 4, (s + 1) * W * 4);
  }
  return A;
};
const pm = (A) => { const d = Buffer.alloc(W * Hc * 4); pixelmatch(A, Cd, d, W, Hc, { threshold: THR, includeAA: false, diffMask: true, diffColor: [255, 0, 0], aaColor: [255, 255, 0] }); return d; };
const isd = (d, i) => d[i * 4 + 3] && d[i * 4] === 255 && d[i * 4 + 1] === 0;
const D0 = pm(build(0)), tol = listTop0 != null;
const Du = tol ? pm(build(-1)) : null, Dd = tol ? pm(build(1)) : null;
let resid = 0, rAbove = 0, rList = 0, rBelow = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
const O = new PNG({ width: W, height: Hc });
for (let i = 0; i < W * Hc; i++) {
  const y = Math.floor(i / W), x = i % W, k = i * 4;
  let d = isd(D0, i);
  if (mapB[y] === -1 || x >= VW) d = false;
  if (d && tol && y >= listTop0 && !(isd(Du, i) && isd(Dd, i))) d = false;
  if (d && mask[i]) d = false;
  const g = Math.round(0.3 * Cd[k] + 0.59 * Cd[k + 1] + 0.11 * Cd[k + 2]) * 0.5 + 110;
  let rr = g, gg = g, bb = g;
  if (mask[i]) { gg = Math.min(255, g + 40); rr = g - 20; bb = g - 20; }
  if (mapB[y] === -1) { bb = Math.min(255, g + 40); d = false; }
  if (d) { resid++; rr = 255; gg = 0; bb = 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    if (listTop0 == null || y < listTop0) rAbove++; else if (y < yc) rList++; else rBelow++; }
  O.data[k] = rr; O.data[k + 1] = gg; O.data[k + 2] = bb; O.data[k + 3] = 255;
}
if (spec.overlay) fs.writeFileSync(spec.overlay, PNG.sync.write(O));
out.residual_px = resid; out.residual = { above_list: rAbove, list_rows: rList, below_list: rBelow };
if (resid) out.reasons.push(`${resid} px differ from the approved baseline outside the icon boxes after row alignment (above list ${rAbove}, between lists ${rList}, below ${rBelow}; box x${bx0}-${bx1} y${by0}-${by1})`);
out.rows = rowInfo;

// ---- icons: translation only
function glyph(D, x0, y0, w, h, Wd, Hd) {      // bbox of non-background ink, ignoring uniform lines (borders)
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); const x1 = Math.min(Wd, x0 + w), y1 = Math.min(Hd, y0 + h);
  const bg = bgColor(D, x0, x1, y0, y1); if (!bg) return null;
  let gx0 = 1e9, gy0 = 1e9, gx1 = -1, gy1 = -1;
  for (let y = y0; y < y1; y++) {
    let uniform = true; for (let x = x0 + 1; x < x1; x++) if (delta(D, px(y, x), D, px(y, x0)) > MAXD) { uniform = false; break; }
    if (uniform) continue;
    for (let x = x0; x < x1; x++) if (delta(D, px(y, x), bg, 0) > MAXD) { if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (y < gy0) gy0 = y; if (y > gy1) gy1 = y; }
  }
  return gx1 < 0 ? null : { x: gx0, y: gy0, w: gx1 - gx0 + 1, h: gy1 - gy0 + 1 };
}
const S = spec.icon_search_px ?? 4;
const iconRes = [];
for (const [x, y, w, h] of icons) {
  const cyy = y + h / 2; if (listBands.some(([t, e]) => cyy >= t && cyy < e)) continue;
  const gc = glyph(Cd, x, y, w, h, W, Hc);
  // the same box in baseline coords (through the row alignment)
  let by0b = 1e9, by1b = -1; for (let yy = y; yy < y + h && yy < Hc; yy++) { const s = mapB[yy]; if (s >= 0) { if (s < by0b) by0b = s; if (s > by1b) by1b = s; } }
  if (by1b < 0) { by0b = y - off; by1b = y - off + h - 1; }
  const gb = glyph(Bd, x, by0b, w, by1b - by0b + 1, W, Hb);
  const rec = { box: [x, y, w, h], cand: gc, base: gb };
  if (!gc) { if (gb) rec.why = 'icon missing (the baseline has one here)'; else rec.ok = true; iconRes.push(rec); continue; }
  // translation search: candidate glyph (+1 px margin) vs the baseline, dx +-S, dy anywhere inside the row/button box +-S
  let bestN = 1e9, bestOff = null;
  for (let ty = by0b - S; ty <= by1b - gc.h + 1 + S; ty++) for (let tx = gc.x - S; tx <= gc.x + S; tx++) {
    let n = 0;
    for (let yy = -1; yy <= gc.h && n < bestN; yy++) for (let xx = -1; xx <= gc.w; xx++) {
      const cy = gc.y + yy, cx = gc.x + xx, bY = ty + yy, bX = tx + xx;
      if (cy < 0 || cy >= Hc || cx < 0 || cx >= W) continue;
      if (bY < 0 || bY >= Hb || bX < 0 || bX >= W) { n++; continue; }
      if (delta(Cd, px(cy, cx), Bd, px(bY, bX)) > MAXD) n++;
    }
    if (n < bestN) { bestN = n; bestOff = [gc.x - tx, gc.y - (ty + off)]; }
  }
  rec.residual = bestN; rec.moved = bestOff;
  if (bestN === 0) rec.ok = true;
  else if (!gb) rec.why = `icon added (${gc.w}x${gc.h}px; the baseline has none here)`;
  else if (gb.w !== gc.w || gb.h !== gc.h) rec.why = `icon resized/redrawn: ${gc.w}x${gc.h}px vs baseline ${gb.w}x${gb.h}px (only re-centering is allowed)`;
  else rec.why = `icon glyph differs: ${bestN} px at the best offset (recoloured or a different glyph)`;
  iconRes.push(rec);
}
const badIcons = iconRes.filter((i) => !i.ok);
out.icons = { checked: iconRes.length, bad: badIcons.length, moved: iconRes.filter((i) => i.ok && i.moved && (i.moved[0] || i.moved[1])).length };
if (badIcons.length) { out.reasons.push(`${badIcons.length} of ${iconRes.length} icons changed beyond re-centering: ` + [...new Set(badIcons.map((i) => i.why))].slice(0, 3).join('; ')); out.bad_icons = badIcons.slice(0, 6).map((i) => ({ box: i.box, why: i.why })); }
for (const m of spec.logo_boxes || []) {
  const [x, y, w, h] = m.box, g = glyph(Cd, x, y, w, h, W, Hc);
  let rg = null;
  try { const R = PNG.sync.read(fs.readFileSync(m.ref)); const Rd = Buffer.alloc(W * R.height * 4, 255); for (let yy = 0; yy < R.height; yy++) R.data.copy(Rd, yy * W * 4, yy * R.width * 4, (yy * R.width + Math.min(R.width, W)) * 4); rg = glyph(Rd, x, y, w, h, W, R.height); } catch (e) { rg = null; }
  const tag = `logo box ${JSON.stringify(m.box)} (${m.why || 'judged by rule'})`;
  if (!g) { out.reasons.push(`${tag}: logo missing (nothing drawn)`); continue; }
  const cx = g.x + g.w / 2;
  if (Math.abs(cx - VW / 2) > 2) out.reasons.push(`${tag}: logo not centred (centre x ${cx.toFixed(1)} vs ${VW / 2})`);
  if (!rg) out.reasons.push(`${tag}: reference logo on ${m.ref.split('/').pop()} not found (fail closed)`);
  else if (Math.abs(rg.w - g.w) > 1 || Math.abs(rg.h - g.h) > 1) out.reasons.push(`${tag}: logo ${g.w}x${g.h}px vs ${rg.w}x${rg.h}px on ${m.ref.split('/').pop()}`);
  else out.notes.push(`${tag}: logo present, centred, ${g.w}x${g.h}px like ${m.ref.split('/').pop()}`);
}
// ---- map style (Craig 2026-10-08 12:20 PM PT): the day-by-day map must be the colourful styled map the Dialog PDF
// packs show, not plain gray/beige fallback tiles or an error tile. Colour variety over the map region, calibrated on the
// Day map from dialog pack r6 (screenshot-journey.pdf p17, 2026-09-26): the styled map scores 7 hue buckets / 0.32 saturated
// (worst quarter 4 / 0.05); plain OSM and Carto error tiles score 1 / 0.60 and 0 / 0.01. Bar: >=4 buckets and >=0.05 saturated.
mapStyle();
// ---- allowed-area cap
out.allowed_pct = +(100 * maskPx / (W * Hc)).toFixed(2);
out.list_pct = +(100 * listPx / (W * Hc)).toFixed(2);
if (out.allowed_pct > (spec.max_allowed_pct ?? 25)) out.reasons.push(`allowed regions cover ${out.allowed_pct}% of the screen (cap ${spec.max_allowed_pct ?? 25}%)`);
done();

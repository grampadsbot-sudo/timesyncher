

import { chromium } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prepareTimelineReplay } from './timeline-replay.mjs';
import { applyMergedTimeline, dayCaptureShotNames, mergeDayTimelines } from './day-traversal.mjs';
const [,, outdir] = process.argv;
const BASE = process.env.TSV_CAPTURE_BASE || 'https://vacation-staging.timesyncher.com';
const TOKEN = 'gateb-fixture-replay';
const API_ORIGIN = process.env.TSV_CAPTURE_API_ORIGIN || '';
const FIXTURE = process.env.TSV_CAPTURE_FIXTURE || '/home/ubishere9995/tsv-dispatch/fixture-nyc/nyc-shared.json';
if (!outdir) { console.error('usage: capture.mjs <outdir>'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
const fixtureBytes = fs.readFileSync(FIXTURE);
const { payload, timelineReplay } = prepareTimelineReplay(fixtureBytes);

const TABS = [
  ['daybyday', ['Day-by-Day']], ['flights', ['Flights']], ['hotels', ['Hotels']], ['cars', ['Cars']],
  ['restaurants', ['Restaurants']], ['stores', ['Stores']], ['events', ['Events', 'The Rest']], ['budget', ['Budget']],
];
const VIEWPORTS = [[1280, 800], [390, 844]];
const STAMP_CSS = 'footer[data-build-stamp]{display:none!important}';
const FULLPAGE_CSS = 'html,html body,html #root{height:auto!important;min-height:0!important;overflow:visible!important;display:block!important}';
const manifest = { base: BASE, api_origin: API_ORIGIN || null, capture_route: 'fixture-replay', fixture: FIXTURE, started: new Date().toISOString(), shots: [], notes: [], page_errors: [] };
function sha256File(p) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
  catch { return null; }
}

manifest.fixture_sha256 = timelineReplay.source_fixture_sha256;
manifest.timeline_replay = timelineReplay;
const dataSnapshot = process.env.TSV_DATA_SNAPSHOT || '';
if (dataSnapshot) {
  manifest.data_snapshot = dataSnapshot;
  manifest.data_snapshot_sha256 = sha256File(dataSnapshot);
}

const MAP_TIMEOUT_MS = Number(process.env.TSV_CAPTURE_MAP_TIMEOUT_MS || 15000);
const STABLE_MS = 600, SETTLE_MS = 300;
async function mapState(page) {
  return page.evaluate(() => {
    const maps = [...document.querySelectorAll('.leaflet-container')].filter((m) => m.offsetWidth && m.offsetHeight);
    if (!maps.length) return { maps: 0, ready: true, sig: '' };
    let ready = true, sig = [], pending = 0, levels = 0, anim = false;
    for (const m of maps) {
      if (m.querySelector('.leaflet-zoom-anim, .leaflet-pan-anim') || m.classList.contains('leaflet-zoom-anim')) anim = true;
      const imgs = [...m.querySelectorAll('img.leaflet-tile')];
      for (const i of imgs) {
        const ok = i.complete && i.classList.contains('leaflet-tile-loaded') && (i.style.opacity === '' || Number(i.style.opacity) >= 1);
        if (!ok) pending++;
        sig.push(i.src.slice(-60) + (ok ? '+' : '-'));
      }
      const lv = [...m.querySelectorAll('.leaflet-tile-container')].filter((c) => c.querySelector('img.leaflet-tile'));
      levels = Math.max(levels, lv.length);
    }
    ready = !anim && pending === 0 && levels <= 1;
    return { maps: maps.length, ready, pending, levels, anim, sig: sig.sort().join('|') };
  });
}
async function rasterMaps(page) {

  const n = await page.evaluate(() => { const ms = [...document.querySelectorAll('.leaflet-container')].filter((m) => m.offsetWidth && m.offsetHeight); ms.forEach((m) => m.scrollIntoView({ block: 'center', inline: 'nearest' })); return ms.length; });
  if (!n) return 0;
  await page.waitForTimeout(250);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => { for (const el of [document.scrollingElement, document.getElementById('root'), ...document.querySelectorAll('#root *')]) if (el && (el.scrollTop || el.scrollLeft)) { el.scrollTop = 0; el.scrollLeft = 0; } window.scrollTo(0, 0); });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return n;
}
async function waitForMap(page, label) {
  const t0 = Date.now(); let last = null, stableSince = 0, st = null;
  await rasterMaps(page);
  while (Date.now() - t0 < MAP_TIMEOUT_MS) {
    st = await mapState(page);
    if (!st.maps) return;
    if (st.ready && st.sig === last) { if (Date.now() - stableSince >= STABLE_MS) break; }
    else { stableSince = Date.now(); }
    last = st.sig;
    await page.waitForTimeout(150);
  }
  const timedOut = Date.now() - t0 >= MAP_TIMEOUT_MS;
  try { await page.waitForLoadState('networkidle', { timeout: timedOut ? 1000 : 5000 }); } catch (e) { void e; }
  try { await page.evaluate(async () => { await Promise.all([...document.querySelectorAll('.leaflet-container img.leaflet-tile')].map((i) => i.decode().catch((err) => { void err; }))); }); } catch (e) { void e; }
  await page.waitForTimeout(SETTLE_MS);
  const ms = Date.now() - t0;
  manifest.map_waits = manifest.map_waits || {};
  manifest.map_waits[label] = ms;
  if (timedOut) manifest.notes.push(`${label}: map tiles not settled after ${MAP_TIMEOUT_MS} ms (pending ${st && st.pending}, levels ${st && st.levels}, anim ${st && st.anim}); shot taken anyway`);
}

const ROW_SEL = 'li[data-list-row]';
const ICON_SEL = '[data-ts-logo-chip], [data-ts-category-tab-icon]';
const regions = {};
async function recordRegions(page, shot, full) {
  try {
    regions[shot] = await page.evaluate(([rowSel, iconSel, full]) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const vis = (r) => r.width > 0 && r.height > 0 && (full || (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw));
      const box = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      const rowEls = [...document.querySelectorAll(rowSel)].filter((e) => vis(e.getBoundingClientRect()));
      const groups = new Map();
      for (const e of rowEls) { const k = e.parentElement; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e.getBoundingClientRect()); }
      const rows = [...groups.values()].map((rs) => { const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), rr = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom)); return { box: [Math.round(l), Math.round(t), Math.round(rr - l), Math.round(b - t)], n: rs.length }; });
      const icons = [...document.querySelectorAll(iconSel)].map((e) => {
        const r = e.getBoundingClientRect(); if (!vis(r)) return null;
        const c = (e.closest('li[data-list-row]') || e.closest('button') || e.parentElement).getBoundingClientRect();
        return [Math.round(r.left), Math.round(Math.min(r.top, c.top)), Math.round(r.width), Math.round(Math.max(r.bottom, c.bottom) - Math.min(r.top, c.top))];
      }).filter(Boolean);

      const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
      const items = rowEls.map((li) => {
        const rb = li.getBoundingClientRect();
        const chip = li.querySelector('[data-ts-logo-chip]');
        const img = chip ? chip.querySelector('img') : li.querySelector('img');
        let bgimg = null; if (chip && !img) { for (const e of [chip, ...chip.querySelectorAll('*')]) { const b = getComputedStyle(e).backgroundImage; if (b && b !== 'none') { bgimg = b.slice(0, 160); break; } } }
        const nameEl = li.querySelector('[data-ts-list-row-name]');
        const firstText = nameEl ? [...nameEl.querySelectorAll('span,strong')].find((e) => !e.children.length && e.textContent.trim()) : null;
        const ctrls = [...li.querySelectorAll('button, label, a, select, input, [title], [role=button]')].filter((e) => e !== li.querySelector('button[aria-label="Open thing details"]') && visible(e));
        const right = ctrls.map((e) => e.getBoundingClientRect()).filter((r) => r.left >= rb.left + rb.width * 0.5).sort((a, b) => b.right - a.right)[0] || null;
        const priceEl = [...li.querySelectorAll('span')].find((e) => !e.children.length && /^\s*\$/.test(e.textContent));
        const nmTxt = nameEl ? (nameEl.textContent || '').trim() : '';

        const descLine = (() => { const ls = (li.innerText || '').split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s && s !== nmTxt && !/^\$/.test(s) && !/^(Add price|Timeline|Open details|Remove|Edit|Move)\b/i.test(s) && !/^D\d+$/.test(s) && !/^[\d\s:apm\u2013\-]+$/i.test(s) && s.split(' ').length >= 2); ls.sort((a, b) => b.length - a.length); return ls.length ? ls[0].slice(0, 1200) : null; })();
        return {
          box: box(rb), cat: li.dataset.thingCategory || null, has_logo: li.dataset.hasLogo ?? null, logo_src: li.dataset.logoSrc ?? null,
          chip: chip ? { box: box(chip.getBoundingClientRect()), visible: visible(chip), text: (chip.innerText || '').trim().slice(0, 8) } : null,
          img: img ? { src: (img.currentSrc || img.src || '').slice(0, 200), loaded: img.complete && img.naturalWidth > 0, natural: [img.naturalWidth, img.naturalHeight], box: box(img.getBoundingClientRect()), visible: visible(img) } : null,
          bgimg,
          name: nameEl ? (nameEl.textContent || '').trim().slice(0, 120) : null,
          first_text: firstText ? { text: firstText.textContent.trim().slice(0, 80), box: box(firstText.getBoundingClientRect()), visible: visible(firstText) } : null,
          right_ctrl: right ? box(right) : null,
          price_text: priceEl ? priceEl.textContent.trim().slice(0, 30) : null,

          desc: descLine,
          desc_box: descLine ? (() => { const el = [...li.querySelectorAll('*')].find((e) => !e.children.length && (e.textContent || '').replace(/\s+/g, ' ').trim() === descLine && visible(e)); return el ? box(el.getBoundingClientRect()) : null; })() : null,

          price_box: priceEl && visible(priceEl) ? box(priceEl.getBoundingClientRect()) : null,
          text: (li.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
        };
      });
      const pageErrors = [...document.querySelectorAll('[data-ts-trip-map-error], [role=alert]')].filter(visible).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160)).filter(Boolean).slice(0, 6);
      const docW = document.documentElement.scrollWidth, viewW = window.innerWidth;
      const headerEl = document.querySelector('header') || document.querySelector('h1');
      const h1El = document.querySelector('h1');
      const h1r0 = h1El ? h1El.getBoundingClientRect() : null;
      const hLogo = (headerEl ? [...headerEl.querySelectorAll('img, svg, [role=img], [data-ts-header-logo]')].find((e) => visible(e) && (!h1El || e.getBoundingClientRect().bottom <= h1El.getBoundingClientRect().top + 2) && e.getBoundingClientRect().width >= 12) : null) || [...document.querySelectorAll('#root img, #root svg, #root [role=img]')].find((e) => visible(e) && h1r0 && e.getBoundingClientRect().bottom <= h1r0.top + 4 && e.getBoundingClientRect().width >= 12) || null;
      const hBrand = (() => { let el = hLogo ? hLogo.parentElement : null; while (el && el !== headerEl && el.getBoundingClientRect().width < window.innerWidth * 0.7) { const kids = [...el.children].filter(visible); if (kids.length >= 2 && kids.some((k) => !k.contains(hLogo) && (k.innerText || '').trim())) return kids; el = el.parentElement; } return null; })();
      const hGroup = hBrand ? hBrand.map((e) => e.getBoundingClientRect()) : null;
      const header = headerEl ? { logo: hLogo ? { box: box(hLogo.getBoundingClientRect()), group: hGroup && hGroup.length ? [Math.round(Math.min(...hGroup.map((r) => r.left)) * 100) / 100, 0, Math.round((Math.max(...hGroup.map((r) => r.right)) - Math.min(...hGroup.map((r) => r.left))) * 100) / 100, 0] : null, group_kind: hGroup && hGroup.length ? 'brand-row' : null } : null, box: box(headerEl.getBoundingClientRect()), text: (document.querySelector('h1') ? document.querySelector('h1').innerText : '').trim().slice(0, 120) } : null;
      const tabParts = (b) => {
        let icon = null, label = null; const ic = b.querySelector('[data-ts-category-tab-icon], img, svg');
        if (ic && visible(ic)) icon = box(ic.getBoundingClientRect());
        const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let nd; const lr = [], ir = [];
        while ((nd = tw.nextNode())) { const t = nd.textContent; if (!t.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(nd); const rr = rg.getBoundingClientRect(); if (!rr.width || !rr.height) continue; (/[A-Za-z]/.test(t) ? lr : ir).push(rr); }
        if (!icon && ir.length) icon = box(ir[0]); if (lr.length) label = box(lr[0]);
        return { icon, label };
      };
      const tabs = [...document.querySelectorAll('button')].filter((b) => visible(b) && /^\W*(day-by-day|flights|hotels|cars|restaurants|stores|events|the rest|budget)$/i.test(((b.getAttribute('aria-label') || b.innerText || b.title || '')).replace(/\s+/g, ' ').trim())).map((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { ...tabParts(b), text: (b.getAttribute('aria-label') || b.innerText || '').trim().slice(0, 30), box: box(r), active: (b.getAttribute('aria-pressed') === 'true') || /active|selected/i.test(b.className) || (cs.backgroundColor === 'rgb(17, 24, 39)' && cs.color === 'rgb(255, 255, 255)') }; });
      const chips = [...document.querySelectorAll('button')].filter((b) => visible(b) && /^day\s+\d/i.test((b.innerText || '').trim())).map((b) => { const r = b.getBoundingClientRect(); const sc = (el) => { for (let p = el.parentElement; p && p.id !== 'root'; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return true; } return false; }; return { text: b.innerText.trim().slice(0, 12), box: box(r), scrollable: sc(b), active: b.getAttribute('aria-pressed') === 'true' || /active/i.test(b.className) || getComputedStyle(b).backgroundColor === 'rgb(17, 24, 39)' }; });
      const dayHeadings = [...document.querySelectorAll('#root *')].filter((e) => !e.children.length && !e.closest('button') && /^day\s+\d+$/i.test((e.textContent || '').trim()) && visible(e)).slice(0, 12).map((e) => ({ text: e.textContent.trim(), box: box(e.getBoundingClientRect()) }));

      const bodyText = ((document.querySelector('#root') || document.body).innerText || '').slice(0, 40000);

      const tl = document.querySelector('[data-ts-day-timeline]');
      const firstLine = (el) => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let nd; while ((nd = tw.nextNode())) { if (!nd.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(nd); const rs = [...rg.getClientRects()].filter((r) => r.width && r.height); if (rs.length) return box(rs[0]); } return box(el.getBoundingClientRect()); };
      const firstLineCy = (el) => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let nd; while ((nd = tw.nextNode())) { if (!nd.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(nd); const rs = [...rg.getClientRects()].filter((r) => r.width && r.height); if (rs.length) return +(rs[0].top + rs[0].height / 2).toFixed(2); } const r = el.getBoundingClientRect(); return +(r.top + r.height / 2).toFixed(2); };
      const titleBlock = (el) => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let nd, t = Infinity, b = -Infinity, l = Infinity, r = -Infinity; while ((nd = tw.nextNode())) { if (!nd.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(nd); for (const q of rg.getClientRects()) { if (!q.width || !q.height) continue; t = Math.min(t, q.top); b = Math.max(b, q.bottom); l = Math.min(l, q.left); r = Math.max(r, q.right); } } if (t === Infinity) { const q = el.getBoundingClientRect(); t = q.top; b = q.bottom; l = q.left; r = q.right; } return [+l.toFixed(2), +t.toFixed(2), +(r - l).toFixed(2), +(b - t).toFixed(2)]; };

      const baselineProbes = [];
      const baselineContext = document.createElement('canvas').getContext('2d');
      const recordBaseline = (el, target, key, probeKey, textNode = null) => {
        target[key] = null; target[probeKey] = null;
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let nd = textNode || tw.nextNode(); nd; nd = textNode ? null : tw.nextNode()) {
          if (!nd.textContent.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(nd);
          const q = [...rg.getClientRects()].find((r) => r.width && r.height);
          if (!q) continue;
          const parent = nd.parentElement;
          baselineContext.font = getComputedStyle(parent).font;
          const ascent = baselineContext.measureText(nd.textContent).fontBoundingBoxAscent;
          target[key] = Number.isFinite(ascent) ? +(q.top + ascent).toFixed(2) : null;
          baselineProbes.push(() => {
            const probe = document.createElement('span');
            probe.style.cssText = 'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline;line-height:0';

            try { parent.insertBefore(probe, nd); target[probeKey] = +probe.getBoundingClientRect().top.toFixed(2); }
            finally { probe.remove(); }
          });
          break;
        }
      };

      const timeLines = (t) => { let item = null; for (let p = t.parentElement; p && p !== tl; p = p.parentElement) { if (p.querySelectorAll('[data-ts-timeline-title]').length !== 1) break; item = p; } if (!item) return []; const out = []; const tw = document.createTreeWalker(item, NodeFilter.SHOW_TEXT); let nd; while ((nd = tw.nextNode())) { if (t.contains(nd)) continue; const tx = (nd.textContent || '').replace(/\s+/g, ' ').trim(); if (!/^\d{1,2}:\d{2}\s?(am|pm)$/i.test(tx)) continue; const rg = document.createRange(); rg.selectNodeContents(nd); const q = [...rg.getClientRects()].find((r) => r.width && r.height); if (!q) continue; const line = { text: tx, box: [+q.left.toFixed(2), +q.top.toFixed(2), +q.width.toFixed(2), +q.height.toFixed(2)], cy: +(q.top + q.height / 2).toFixed(2) }; recordBaseline(nd.parentElement, line, 'baseline', 'baseline_probe', nd); out.push(line); } return out; };
      const timeline = tl ? [...tl.querySelectorAll('[data-ts-timeline-title]')].filter(visible).map((t) => {
        let row = null, icon = null;
        for (let p = t.parentElement; p && p !== tl; p = p.parentElement) {
          if (p.querySelectorAll('[data-ts-timeline-title]').length !== 1) break;

          const ic = [...p.querySelectorAll('[data-ts-timeline-icon], [data-ts-tab-emoji]')].find((e) => visible(e) && !t.contains(e));
          if (ic) { icon = ic; row = p; break; }
        }
        const title = (t.textContent || '').replace(/\s+/g, ' ').trim();
        const notes = row ? (row.innerText || '').split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x && x !== title && !/^\d{1,2}:\d{2}\s?(am|pm)$/i.test(x) && !/^[\p{Extended_Pictographic}️‍\s]+$/u.test(x)) : [];
        const ir = icon ? icon.getBoundingClientRect() : null, tb = firstLine(t), tcy = firstLineCy(t);
        const tbk = titleBlock(t);
        const item = { title: title.slice(0, 80), title_box: tb, title_cy: tcy, title_block: tbk, title_block_cy: +(tbk[1] + tbk[3] / 2).toFixed(2), conflict: notes.some((x) => /^conflict with /i.test(x)), icon: ir ? box(ir) : null, icon_cy: ir ? +(ir.top + ir.height / 2).toFixed(2) : null, icon_text: icon ? (icon.textContent || '').trim().slice(0, 4) : null, row_box: row ? box(row.getBoundingClientRect()) : null, notes: notes.slice(0, 6).map((x) => x.slice(0, 120)), time_lines: timeLines(t) };
        recordBaseline(t, item, 'title_baseline', 'title_baseline_probe');
        return item;
      }) : [];
      const itinerary = tl && visible(tl) ? box(tl.getBoundingClientRect()) : null;
      const nameOf = (e) => ((e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, 40);
      const ctrlEls = [...document.querySelectorAll('button, a[href], [role=button]')].filter(visible);
      const tabTop = tabs.length ? Math.min(...tabs.map((t) => t.box[1])) : Infinity;
      const controls = [...new Set(ctrlEls.map(nameOf).filter((n) => n && !/^\d/.test(n)))].sort();
      const header_controls = [...new Set(ctrlEls.filter((e) => e.getBoundingClientRect().top < tabTop).map(nameOf).filter((n) => n && !/^\d/.test(n)))].sort();
      const placeholders = [...new Set((document.body.innerText || '').split('\n').map((x) => x.trim()).filter((x) => /coming soon/i.test(x)).map((x) => x.slice(0, 120)))];
      const struct = { header, tabs, chips, day_headings: dayHeadings, page_errors: pageErrors, doc_width: docW, view_width: viewW, overflow_px: Math.max(0, docW - viewW), body_text: bodyText, timeline, itinerary, controls, header_controls, placeholders };
      const sortBtns = [...document.querySelectorAll('button')].filter((b) => /^(name|price)\b/i.test((b.innerText || '').trim()) && visible(b)).map((b) => { const cs = getComputedStyle(b); return { text: b.innerText.trim(), pressed: (b.getAttribute('aria-pressed') === 'true') || (cs.backgroundColor === 'rgb(17, 24, 39)' && cs.color === 'rgb(255, 255, 255)'), bg: cs.backgroundColor, color: cs.color }; });
      const mapEl = [...document.querySelectorAll('.leaflet-container, .mapboxgl-map')].find((e) => vis(e.getBoundingClientRect()));
      const result = { ok: true, full, viewport: [vw, vh], struct, map: mapEl ? { box: box(mapEl.getBoundingClientRect()) } : null, row_selector: rowSel, icon_selector: iconSel, rows, row_count: rowEls.length, icons, icon_count: icons.length, rows_bottom: rows.length ? Math.max(...rows.map((g) => g.box[1] + g.box[3])) : null, items, sort: sortBtns, doc_width: document.documentElement.scrollWidth };

      for (const measure of baselineProbes) measure();
      return result;
    }, [ROW_SEL, ICON_SEL, full]);
  } catch (e) { regions[shot] = { ok: false, error: String(e.message || e).split('\n')[0] }; }
}

const TILE_RE = /\/\d{1,2}\/\d{1,7}\/\d{1,7}(@2x)?\.(png|jpe?g|webp)$/i;
const T0 = Date.now();
const tileLog = { requests: [], shots: [] };
function watchTiles(page, w) {
  page.on('response', async (resp) => {
    try {
      if (resp.request().resourceType() !== 'image') return;
      const u = new URL(resp.url()); if (!TILE_RE.test(u.pathname)) return;
      const h = resp.headers(); let bytes = Number(h['content-length']);
      if (!Number.isFinite(bytes)) { try { bytes = (await resp.body()).length; } catch { bytes = null; } }
      tileLog.requests.push({ w, host: u.host, status: resp.status(), content_type: h['content-type'] || null, bytes, t_ms: Date.now() - T0 });
    } catch (e) { void e; }
  });
  page.on('requestfailed', (req) => {
    try {
      if (req.resourceType() !== 'image') return;
      const u = new URL(req.url()); if (!TILE_RE.test(u.pathname)) return;
      tileLog.requests.push({ w, host: u.host, status: 0, failure: (req.failure() || {}).errorText || 'failed', content_type: null, bytes: 0, t_ms: Date.now() - T0 });
    } catch (e) { void e; }
  });
}
async function discoverTripDayChips(page) {
  return page.evaluate(() => {
    const chips = [...document.querySelectorAll('button')].filter((b) => /^day\s+\d/i.test((b.innerText || '').trim()));
    return chips.map((b) => {
      const m = /day\s+(\d+)/i.exec(b.innerText);
      return { n: m ? parseInt(m[1], 10) : 0, text: b.innerText.trim().slice(0, 32) };
    }).filter((c) => c.n > 0).sort((a, b) => a.n - b.n);
  });
}
async function activateTripDayChip(page, dayNum) {
  const ok = await page.evaluate((want) => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.innerText || '').trim();
      if (!/^day\s+\d/i.test(t)) continue;
      const m = /day\s+(\d+)/i.exec(t);
      if (m && parseInt(m[1], 10) === want) {
        b.click();
        return true;
      }
    }
    return false;
  }, dayNum);
  if (!ok) throw new Error(`day chip not found: Day ${dayNum}`);
  await page.waitForTimeout(900);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}
async function captureTabPair(page, w, topShot, fullShot) {
  await waitForMap(page, topShot.replace(/\.png$/, ''));
  await recordTileShot(page, w, topShot);
  await recordRegions(page, topShot, false);
  await page.screenshot({ path: path.join(outdir, topShot), animations: 'disabled' });
  const h = await page.addStyleTag({ content: FULLPAGE_CSS });
  await page.waitForTimeout(300);
  const fullStem = fullShot.replace(/\.png$/, '');
  await waitForMap(page, fullStem);
  await recordTileShot(page, w, fullShot);
  await recordRegions(page, fullShot, true);
  await page.screenshot({ path: path.join(outdir, fullShot), fullPage: true, animations: 'disabled' });
  await h.evaluate((n) => n.remove());
  await page.waitForTimeout(200);
  return [topShot, fullShot];
}

async function recordTileShot(page, w, shot) {
  try {

    const dom = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('.leaflet-container img.leaflet-tile')];
      const pins = [...document.querySelectorAll('.leaflet-container .leaflet-marker-icon')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      return { total: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, markers: pins.length };
    });
    const t = Date.now() - T0;
    const got = tileLog.requests.filter((q) => q.w === w && q.status === 200 && /^image\//i.test(q.content_type || '')).length;

    const sizes = new Set(tileLog.requests.filter((q) => q.w === w && q.t_ms <= t && q.status === 200 && /^image\//i.test(q.content_type || '') && q.bytes != null).map((q) => q.bytes));
    tileLog.shots.push({ shot, w, loaded_before_shot: dom.loaded, dom_tiles_total: dom.total, dom_tiles_loaded: dom.loaded, status200_so_far: got, markers: dom.markers, distinct_tile_bytes: sizes.size, t_ms: t });
  } catch (e) { void e; }
}

const browser = await chromium.launch();
let failed = 0;
try {
  for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Los_Angeles' });
    const page = await ctx.newPage();
    watchTiles(page, w);

    page.on('pageerror', (e) => manifest.page_errors.push({ w, kind: 'pageerror', msg: String(e.message || e).slice(0, 200) }));
    page.on('console', (m) => { if (m.type() === 'error') manifest.page_errors.push({ w, kind: 'console', msg: m.text().slice(0, 200), url: ((m.location() || {}).url || '').slice(0, 200) }); });
    await page.route((u) => u.pathname.startsWith('/api/shared/'), (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.replace(/\/+$/, '') === `/api/shared/${TOKEN}`) return route.fulfill({ status: 200, contentType: 'application/json', body: payload });
      return route.continue();
    });
    if (API_ORIGIN) {
      await page.route((u) => u.origin === new URL(BASE).origin && u.pathname.startsWith('/api/') && u.pathname.replace(/\/+$/, '') !== `/api/shared/${TOKEN}`, async (route) => {
        const u = new URL(route.request().url());
        try { const r = await route.fetch({ url: API_ORIGIN + u.pathname + u.search }); return route.fulfill({ response: r }); }
        catch (e) { return route.fulfill({ status: 502, body: 'api passthrough failed' }); }
      });
    }
    await page.goto(`${BASE}/shared/${TOKEN}`, { waitUntil: 'load', timeout: 90000 });
    try { await page.getByRole('button', { name: 'Flights', exact: true }).first().waitFor({ timeout: 60000 }); }
    catch (e) { try { await page.screenshot({ path: path.join(outdir, '_capture-failed.png'), fullPage: true }); } catch (shotErr) { void shotErr; } throw e; }
    if (!manifest.build) manifest.build = await page.evaluate(() => { const e = document.querySelector('footer[data-build-stamp]'); return e ? e.innerText.trim() : (document.querySelector('meta[name=timesyncher-build]') || {}).content || null; });

    await page.waitForTimeout(800);
    const y0 = await page.evaluate(() => document.querySelector('h1').getBoundingClientRect().top);
    await page.mouse.move(Math.floor(w / 2), Math.floor(h * 0.6)); await page.mouse.wheel(0, 500); await page.waitForTimeout(700);
    const y1 = await page.evaluate(() => document.querySelector('h1').getBoundingClientRect().top);
    manifest[`scrolls_${w}`] = y1 < y0;
    if (!(y1 < y0)) manifest.notes.push(`viewport ${w}: page did NOT scroll on mouse wheel (h1 top ${Math.round(y0)} -> ${Math.round(y1)}); possible staging bug`);

    await page.mouse.move(0, 0);
    await page.reload({ waitUntil: 'load', timeout: 90000 });
    try { await page.getByRole('button', { name: 'Flights', exact: true }).first().waitFor({ timeout: 60000 }); }
    catch (e) { try { await page.screenshot({ path: path.join(outdir, '_capture-failed.png'), fullPage: true }); } catch (shotErr) { void shotErr; } throw e; }
    await page.waitForTimeout(800);
    await page.evaluate(() => { for (const el of [document.scrollingElement, document.getElementById('root'), ...document.querySelectorAll('#root *')]) if (el && el.scrollTop) el.scrollTop = 0; });
    await page.addStyleTag({ content: STAMP_CSS });
    manifest.day_traversal = manifest.day_traversal || { policy: 'trip-days-v1', by_viewport: {} };
    for (const [stem, labels] of TABS) {
      const name = `${stem}-${w}`;
      try {
        let btn = null, used = null;
        for (const l of labels) { const b = page.getByRole('button', { name: new RegExp(`^\\W*${l}$`) }).first(); if (await b.count()) { btn = b; used = l; break; } }
        if (!btn) throw new Error(`tab not found: ${labels.join('/')}`);
        if (used !== labels[0]) manifest.notes.push(`${stem}: tab labelled "${used}" on this build (baseline "${labels[0]}")`);
        await btn.click();
        await page.waitForTimeout(1200);
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        if (stem === 'daybyday') {
          const chips = await discoverTripDayChips(page);
          const dayNums = chips.length ? chips.map((c) => c.n) : [1];
          const dayRuns = [];
          for (const dayNum of dayNums) {
            if (chips.length) await activateTripDayChip(page, dayNum);
            const [topShot, fullShot] = dayCaptureShotNames(dayNum, w);
            const shots = await captureTabPair(page, w, topShot, fullShot);
            manifest.shots.push(...shots);
            const fullReg = regions[fullShot];
            dayRuns.push({
              day: dayNum,
              chip: chips.find((c) => c.n === dayNum) || null,
              shots,
              timeline_titles: (fullReg && fullReg.struct && fullReg.struct.timeline || []).map((t) => t.title),
            });
          }
          manifest.day_traversal.by_viewport[w] = { chips, days: dayRuns };
          const merged = mergeDayTimelines(dayRuns.map((d) => ({ timeline: (regions[d.shots[1]] && regions[d.shots[1]].struct && regions[d.shots[1]].struct.timeline) || [] })));
          applyMergedTimeline(regions, w, merged);
          manifest.day_traversal.by_viewport[w].merged_timeline_titles = merged.map((t) => t.title);
        } else {
          const shots = await captureTabPair(page, w, `${name}-top.png`, `${name}.png`);
          manifest.shots.push(...shots);
        }
      } catch (e) { failed++; manifest.notes.push(`${name}: FAILED ${String(e.message || e).split('\n')[0]}`); }
    }
    await ctx.close();
  }
} finally { await browser.close(); }

const tileSum = {};
for (const q of tileLog.requests) { const k = `${q.host} ${q.status}`; tileSum[k] = (tileSum[k] || 0) + 1; }
manifest.tile_hosts = tileSum;
if (tileLog.shots.length && !tileLog.requests.some((q) => q.status === 200)) manifest.notes.push('no map tile came back 200 in this capture (see tile-log.json)');
fs.writeFileSync(path.join(outdir, 'tile-log.json'), JSON.stringify({ base: BASE, requests: tileLog.requests, shots: tileLog.shots, summary: tileSum }, null, 1));
manifest.finished = new Date().toISOString();
fs.writeFileSync(path.join(outdir, 'capture-manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(outdir, 'capture-regions.json'), JSON.stringify(regions, null, 1));
console.log(JSON.stringify({ shots: manifest.shots.length, failed, build: manifest.build, notes: manifest.notes }));
process.exit(failed ? 1 : 0);

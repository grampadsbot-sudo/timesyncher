#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { offlineParseItineraryEditIntent, resolvePlaceByQuery, runChatItineraryEditTurn } from '../src/vacation/chat-itinerary-edit.mjs';
import { buildDayTimeline } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';
import { webAccessCookieName } from '../src/vacation/web-access.mjs';

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const linkFile = process.argv[2];
  if (!linkFile) throw new Error('usage: node scripts/chat_edit_live_probe.mjs <copy-link-file>');
  const link = fs.readFileSync(path.resolve(linkFile), 'utf8').trim();
  const slugMatch = link.match(/\/shared\/([^/?#]+)/);
  const slug = slugMatch ? decodeURIComponent(slugMatch[1]) : '';
  if (!slug) throw new Error('slug_missing_from_link');
  const sessionPath = path.join(path.dirname(path.resolve(linkFile)), 'owner-session-token.txt');
  const webToken = fs.existsSync(sessionPath) ? fs.readFileSync(sessionPath, 'utf8').trim() : '';
  if (!webToken) throw new Error('owner-session-token.txt missing beside link file');
  const trekBase = String(process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'http://127.0.0.1:3911').replace(/\/+$/, '');
  const cookieHeader = `${webAccessCookieName()}=${encodeURIComponent(webToken)}`;
  const db = {
    calls: [],
    tag: (parts, ...values) => {
      void values;
      const sql = String(parts?.[0] || '');
      this.calls.push(sql);
      return Promise.resolve([]);
    },
  };
  db.query = db.tag;
  const trip = { id: '00000000-0000-4000-8000-00000000d001', metadata: { sharedToken: slug } };
  const httpReq = { headers: { cookie: cookieHeader } };
  const fetchPayload = async (s) => {
    const res = await fetch(`${trekBase}/api/shared/${encodeURIComponent(s)}/?probe=${Date.now()}`, {
      headers: { accept: 'application/json', cookie: cookieHeader },
    });
    if (!res.ok) throw new Error(`payload_fetch_${res.status}`);
    return res.json();
  };
  const putOverrides = async ({ slug: s, overrides }) => {
    const res = await fetch(`${trekBase}/api/shared/${encodeURIComponent(s)}/overrides`, {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({ overrides }),
    });
    if (!res.ok) throw new Error(`put_failed_${res.status}`);
  };
  process.env.CHAT_ITINERARY_EDIT_OFFLINE_PARSE = '1';
  const { default: cfg } = await import('../config/chat-itinerary-edit-trips.mjs');
  if (!cfg.allowlist.includes(slug)) {
    const merged = {
      allowlist: [...cfg.allowlist, slug],
      demo_locked: [...(cfg.demo_locked || [])],
    };
    const tmpPath = path.join(os.tmpdir(), `chat-itinerary-edit-trips-${process.pid}.json`);
    fs.writeFileSync(tmpPath, `${JSON.stringify(merged, null, 2)}\n`);
    process.env.CHAT_ITINERARY_EDIT_TRIPS_CONFIG = tmpPath;
  }
  const turn1 = await runChatItineraryEditTurn({
    db,
    trip,
    customerTurn: 'move dinner at Carbone to 8:30 PM on Day 2',
    httpReq,
    env: process.env,
    fetchPayload,
    putOverrides,
    extractIntent: offlineParseItineraryEditIntent,
  });
  if (!turn1.applied) throw new Error(`turn1_not_applied ${turn1.reason}`);
  let payload = await fetchPayload(slug);
  const carbone = payload.places?.find((p) => /carbone/i.test(p.name || p.title || ''));
  const day2 = payload.days?.find((d) => Number(d.day_number) === 2);
  const key = carbone ? `place:${carbone.id}` : '';
  const time = key && day2 ? payload.thingOverrides?.[key]?.perDaySchedule?.[String(day2.id)]?.startTime : '';
  if (parseTime(time) !== '20:30') throw new Error(`carbone_time_${time}`);
  const turn2 = await runChatItineraryEditTurn({
    db,
    trip,
    customerTurn: 'add a bar hop before that dinner on Day 2',
    httpReq,
    env: process.env,
    fetchPayload,
    putOverrides,
    extractIntent: offlineParseItineraryEditIntent,
  });
  if (!turn2.applied) throw new Error(`turn2_not_applied ${turn2.reason}`);
  payload = await fetchPayload(slug);
  const day2row = payload.days?.find((d) => Number(d.day_number) === 2);
  const entries = buildDayTimeline(payload, day2row);
  const anchor = resolvePlaceByQuery(payload, 'Carbone');
  const anchorEntry = entries.find((e) => String(e.place?.id) === String(anchor.place?.id));
  const barEntry = entries.find((e) => /bar|cocktail|wine/i.test(`${e.place?.name || ''}`));
  if (!anchorEntry || anchorEntry.startLabel !== '20:30') throw new Error('timeline_verify_anchor');
  if (!barEntry || entries.indexOf(barEntry) >= entries.indexOf(anchorEntry)) throw new Error('timeline_verify_bar');
  process.stdout.write('chat_edit_live_probe: ok\n');
}

function parseTime(raw) {
  let s = String(raw || '').trim().toLowerCase();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});

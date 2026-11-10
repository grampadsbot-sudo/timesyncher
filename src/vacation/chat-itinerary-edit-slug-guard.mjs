import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../config/chat-itinerary-edit-trips.json');
const DEMO_LOCKED_SLUG = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function loadChatItineraryEditConfig(env = process.env) {
  const override = clean(env.CHAT_ITINERARY_EDIT_TRIPS_CONFIG, 400);
  const filePath = override || CONFIG_PATH;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const allowlist = Array.isArray(parsed.allowlist) ? parsed.allowlist.map((s) => clean(s, 240)).filter(Boolean) : [];
    const demoLocked = Array.isArray(parsed.demo_locked) ? parsed.demo_locked.map((s) => clean(s, 240)).filter(Boolean) : [];
    return { allowlist, demoLocked, filePath };
  } catch (error) {
    return { allowlist: [], demoLocked: [DEMO_LOCKED_SLUG], filePath, error: String(error?.message || error) };
  }
}

export function shareSlugEditGuardDecision(slug, config = null) {
  const cfg = config || loadChatItineraryEditConfig();
  const token = clean(slug, 240);
  if (!token) return { ok: false, reason: 'missing_slug' };
  if (cfg.demoLocked.includes(token)) {
    return { ok: false, reason: 'demo_locked' };
  }
  if (!cfg.allowlist.includes(token)) {
    return { ok: false, reason: 'not_allowlisted' };
  }
  return { ok: true, reason: null };
}

import { cleanText } from './http.mjs';
import { asArray, isoDateOnly } from './mcp-read.mjs';

const DRAFT_SECTIONS = [
  ['flights', 'flight'],
  ['hotels', 'hotel'],
  ['cars', 'car'],
  ['restaurants', 'restaurant'],
  ['stores', 'store'],
  ['things_to_do', 'activity'],
  ['notes', 'note'],
  ['unscheduled_things', 'activity'],
];

const MONTH_LOOKUP = (() => {
  const map = new Map();
  const longFmt = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
  const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
  for (let m = 0; m < 12; m += 1) {
    const sample = new Date(Date.UTC(2000, m, 15, 12, 0, 0));
    map.set(longFmt.format(sample).toLowerCase(), m + 1);
    map.set(shortFmt.format(sample).toLowerCase(), m + 1);
  }
  map.set('sept', 9);
  return map;
})();

const WEEKDAY_LOOKUP = (() => {
  const map = new Map();
  const longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });
  const shortFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
  for (let d = 0; d < 7; d += 1) {
    const sample = new Date(Date.UTC(2000, 0, 2 + d, 12, 0, 0));
    map.set(longFmt.format(sample).toLowerCase(), d);
    map.set(shortFmt.format(sample).toLowerCase(), d);
  }
  map.set('tues', 2);
  map.set('thur', 4);
  map.set('thurs', 4);
  return map;
})();

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'to', 'on', 'at', 'in', 'of', 'for', 'from', 'with', 'into', 'this', 'that',
  'my', 'our', 'is', 'was', 'be', 'it', 'and', 'or', 'move', 'put', 'place', 'attach', 'assign',
  'drop', 'remove', 'delete', 'change', 'set', 'make', 'update', 'rescue', 'keep', 'save', 'add',
  'day', 'photo', 'photos', 'picture', 'image', 'video', 'videos', 'clip', 'file', 'media',
  'preview', 'import', 'vacation', 'item', 'stop', 'saved', 'later', 'wont', 'imported',
]);

function tokenizePreviewQuery(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

export function formatDayFriendly(day) {
  const num = Number(day?.day_number || 0);
  const iso = isoDateOnly(day?.date);
  if (!iso) return num ? `Day ${num}` : 'that day';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const friendly = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0))
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : iso;
  return num ? `Day ${num} · ${friendly}` : friendly;
}

export function formatClock12(clock24) {
  const m = String(clock24 || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return String(clock24 || '');
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

export function vacationDateSummary(days) {
  if (!days.length) return 'this vacation';
  if (days.length === 1) return formatDayFriendly(days[0]);
  return `${formatDayFriendly(days[0])} through ${formatDayFriendly(days[days.length - 1])}`;
}

export function sectionForCategory(category) {
  const key = String(category || '').toLowerCase();
  if (key === 'flight') return 'flights';
  if (key === 'hotel' || key === 'lodging') return 'hotels';
  if (key === 'car') return 'cars';
  if (key === 'restaurant') return 'restaurants';
  if (key === 'store') return 'stores';
  if (key === 'note') return 'notes';
  return 'things_to_do';
}

export function parseClockTime(text) {
  const atMatch = String(text || '').match(/\b(?:at|to|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    || String(text || '').match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    || String(text || '').match(/\b(?:at|to|for)\s+(\d{1,2}):(\d{2})\b/i);
  if (!atMatch) return null;
  let hour = Number(atMatch[1]);
  const minute = Number(atMatch[2] || 0);
  const meridiem = String(atMatch[3] || '').toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseDayTarget(text, days) {
  const value = String(text || '');
  if (/\b(?:saved\s+for\s+later|unscheduled)\b/i.test(value)) {
    return { found: true, unscheduled: true, day: null };
  }
  const dayNumMatch = value.match(/\bday\s+(\d{1,2})\b/i);
  if (dayNumMatch) {
    const n = Number(dayNumMatch[1]);
    const match = days.find((d, idx) => Number(d.day_number || idx + 1) === n);
    if (match) return { found: true, day: match, unscheduled: false };
    return { found: true, outOfRange: true, requested: `Day ${n}` };
  }
  const isoMatch = value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const match = days.find((d) => isoDateOnly(d.date) === isoMatch[1]);
    if (match) return { found: true, day: match, unscheduled: false };
    return { found: true, outOfRange: true, requested: isoMatch[1] };
  }
  for (const m of value.matchAll(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/gi)) {
    const mon = MONTH_LOOKUP.get(m[1].toLowerCase());
    if (!mon) continue;
    const dom = Number(m[2]);
    if (dom < 1 || dom > 31) continue;
    const baseYear = Number(String(days[0]?.date || '2026').slice(0, 4)) || 2026;
    const year = m[3] ? Number(m[3]) : baseYear;
    const candidate = `${year}-${String(mon).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;
    const match = days.find((d) => isoDateOnly(d.date) === candidate);
    if (match) return { found: true, day: match, unscheduled: false };
    return { found: true, outOfRange: true, requested: m[0] };
  }
  for (const w of value.matchAll(/\b([a-z]{3,9})\b/gi)) {
    const targetDow = WEEKDAY_LOOKUP.get(w[1].toLowerCase());
    if (targetDow === undefined) continue;
    const matches = days.filter((d) => {
      const iso = isoDateOnly(d.date);
      if (!iso) return false;
      const [y, m, dd] = iso.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, dd, 12, 0, 0)).getUTCDay() === targetDow;
    });
    if (matches.length === 1) return { found: true, day: matches[0], unscheduled: false };
  }
  return { found: false, day: null, unscheduled: false };
}

export function collectDraftEntries(draft) {
  const entries = [];
  for (const [section, defaultCategory] of DRAFT_SECTIONS) {
    const list = asArray(draft?.[section]);
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item || typeof item !== 'object' || !cleanText(item.title, 200)) continue;
      const isUnscheduled = section === 'unscheduled_things' || item.unscheduled === true || !isoDateOnly(item.day_date || item.check_in || item.starts_at);
      entries.push({
        section,
        index: i,
        item,
        ref: cleanText(item.ref, 120) || `${section}-${i}`,
        title: cleanText(item.title, 200),
        category: cleanText(item.category, 60) || defaultCategory,
        day_date: isUnscheduled ? null : (isoDateOnly(item.day_date || item.check_in || item.starts_at) || null),
        scheduled: !isUnscheduled,
      });
    }
  }
  return entries;
}

export function matchDraftEntry(text, entries, { dayDate = null, mealWord = '' } = {}) {
  const lower = String(text || '').toLowerCase();
  const queryTokens = tokenizePreviewQuery(text);
  const pool = dayDate ? entries.filter((e) => e.day_date === dayDate) : entries;
  const scored = [];
  for (const entry of pool) {
    const titleLower = entry.title.toLowerCase();
    let score = 0;
    if (titleLower && lower.includes(titleLower)) score += 100 + titleLower.length;
    const titleTokens = tokenizePreviewQuery(entry.title);
    for (const tok of titleTokens) {
      if (queryTokens.includes(tok)) score += 35;
      else if (lower.includes(tok) && tok.length >= 4) score += 25;
    }
    if (entry.ref && lower.includes(entry.ref.toLowerCase())) score += 80;
    const descBlob = `${entry.title} ${entry.item.description || ''} ${entry.item.notes || ''}`.toLowerCase();
    if (mealWord === 'lunch' && (entry.category === 'restaurant' || /\blunch|brunch|cafe\b/.test(descBlob))) {
      score += /\blunch|brunch|12:|13:|11:/.test(`${descBlob} ${entry.item.starts_at || ''} ${entry.item.start_time || ''}`) ? 40 : 20;
    }
    if (mealWord === 'dinner' && (entry.category === 'restaurant' || /\bdinner|supper|bistro|steakhouse\b/.test(descBlob))) {
      score += /\bdinner|17:|18:|19:|20:|21:/.test(`${descBlob} ${entry.item.starts_at || ''} ${entry.item.start_time || ''}`) ? 40 : 25;
    }
    if (mealWord === 'breakfast' && (entry.category === 'restaurant' || /\bbreakfast|coffee|espresso|bakery\b/.test(descBlob))) {
      score += 30;
    }
    if (/\b(?:bookshop|bookstore|shop|store)\b/i.test(lower) && entry.category === 'store') score += 30;
    if (/\bhotel|inn|lodge|resort\b/i.test(lower) && entry.category === 'hotel') score += 30;
    if (/\bflight|airline\b/i.test(lower) && entry.category === 'flight') score += 30;
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return { entry: null, ambiguous: false, candidates: [] };
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return { entry: null, ambiguous: true, candidates: scored.slice(0, 3).map((s) => s.entry) };
  }
  return { entry: scored[0].entry, ambiguous: false, candidates: [scored[0].entry] };
}

export function findReferencedLiveOnlyThing(text, liveThings, draftEntries) {
  const lower = String(text || '').toLowerCase();
  const draftTitles = new Set(draftEntries.map((e) => e.title.toLowerCase()));
  for (const row of asArray(liveThings)) {
    const title = cleanText(row?.title, 200);
    if (!title || draftTitles.has(title.toLowerCase())) continue;
    if (lower.includes(title.toLowerCase())) return row;
    const tokens = tokenizePreviewQuery(title).filter((t) => t.length >= 4);
    if (tokens.length >= 2 && tokens.every((t) => lower.includes(t))) return row;
  }
  return null;
}

export function matchPreviewMedia(text, preview, { preferSkipped = false, selectedMediaId = '' } = {}) {
  const imported = asArray(preview?.media).map((m) => ({ ...m, isSkipped: false }));
  const skipped = asArray(preview?.skipped_media).map((m) => ({ ...m, isSkipped: true }));
  const all = [...skipped, ...imported];
  if (selectedMediaId) {
    const direct = all.find((m) => String(m.media_id) === String(selectedMediaId));
    if (direct) return { media: direct, ambiguous: false, candidates: [direct] };
  }
  const lower = String(text || '').toLowerCase();
  const wantsVideo = /\b(video|videos|clip|footage)\b|\.mp4|\.mov|\.webm/i.test(lower);
  const wantsPhoto = /\b(photo|photos|picture|pic|image)\b|\.jpe?g|\.png|\.webp|\.heic/i.test(lower);
  const kindFiltered = all.filter((m) => {
    if (wantsVideo && !wantsPhoto) return m.media_kind === 'video';
    if (wantsPhoto && !wantsVideo) return m.media_kind !== 'video';
    return true;
  });
  const pool = kindFiltered.length ? kindFiltered : all;
  const queryTokens = tokenizePreviewQuery(text);
  const scored = [];
  for (const m of pool) {
    let score = 0;
    const filename = String(m.filename || '').toLowerCase();
    const caption = String(m.caption || '').toLowerCase();
    const attachedTitle = String(m.attached_thing_title || '').toLowerCase();
    if (m.media_id && lower.includes(String(m.media_id).toLowerCase())) score += 120;
    if (filename && lower.includes(filename)) score += 110;
    for (const tok of tokenizePreviewQuery(filename.replace(/\.[a-z0-9]{2,5}$/i, ''))) {
      if (queryTokens.includes(tok) || (tok.length >= 4 && lower.includes(tok))) score += 45;
    }
    for (const tok of tokenizePreviewQuery(caption)) {
      if (queryTokens.includes(tok) || (tok.length >= 4 && lower.includes(tok))) score += 35;
    }
    if (attachedTitle && lower.includes(attachedTitle)) score += 40;
    else {
      for (const tok of tokenizePreviewQuery(attachedTitle)) {
        if (tok.length >= 4 && lower.includes(tok)) score += 20;
      }
    }
    if (m.attached_day_number && new RegExp(`\\bday\\s+${m.attached_day_number}\\b`, 'i').test(lower) && !preferSkipped) {
      score += 15;
    }
    if (preferSkipped && m.isSkipped && score > 0) score += 10;
    if (score > 0) scored.push({ media: m, score });
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
    return { media: scored[0].media, ambiguous: false, candidates: [scored[0].media] };
  }
  const skippedPool = pool.filter((m) => m.isSkipped);
  const ordPool = preferSkipped && skippedPool.length ? skippedPool : pool;
  if (/\b(first|1st)\b/i.test(lower) && ordPool.length >= 1) return { media: ordPool[0], ambiguous: false, candidates: [ordPool[0]] };
  if (/\b(second|2nd)\b/i.test(lower) && ordPool.length >= 2) return { media: ordPool[1], ambiguous: false, candidates: [ordPool[1]] };
  if (/\blast\b/i.test(lower) && ordPool.length >= 1) return { media: ordPool[ordPool.length - 1], ambiguous: false, candidates: [ordPool[ordPool.length - 1]] };
  if (preferSkipped && skippedPool.length === 1) return { media: skippedPool[0], ambiguous: false, candidates: [skippedPool[0]] };
  if (pool.length === 1) return { media: pool[0], ambiguous: false, candidates: [pool[0]] };
  return { media: null, ambiguous: true, candidates: (preferSkipped && skippedPool.length ? skippedPool : pool).slice(0, 4) };
}

export function updateIsoTimestamp(existingIso, nextDate, nextClock24) {
  const date = isoDateOnly(nextDate) || isoDateOnly(existingIso);
  if (!date) return existingIso || null;
  const raw = String(existingIso || '');
  const timePart = raw.match(/T(\d{2}:\d{2}:\d{2})/)?.[1] || '12:00:00';
  const offsetPart = raw.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] || 'Z';
  const clock = nextClock24 ? `${nextClock24}:00` : timePart;
  return `${date}T${clock}${offsetPart}`;
}

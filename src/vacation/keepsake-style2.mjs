import { timelineIcon, printThingIconHtml, isAirplaneGlyph, isVideoMediaUrl } from './timeline-icons.mjs';
import { applyCapturedLogos, captureThingLogo } from './thing-logo-capture.mjs';
import { isPhotoBinding, isVideoBinding, toPublicBinding } from './thing-media-bind.mjs';

const BOILERPLATE_RE = /brought together your day-by-day plan, meals, shows, shopping, hotels, and saved notes/i;

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(value) {
  return String(value || '').trim();
}

function paragraphs(value) {
  return text(value)
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function absUrl(value, origin = '') {
  const raw = text(value);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  if (!origin) return raw;
  return new URL(raw, origin).toString();
}

function placeOverride(shared, place) {
  const overrides = shared.thingOverrides || {};
  return overrides[`place:${place.id}`] || {};
}

function displayName(place, override) {
  return text(override.title || place.name || place.title || 'Untitled');
}

function storyText(place, override) {
  return text(override.story || place.story || '');
}

function realTripSummary(shared = {}) {
  const overrides = shared.thingOverrides || {};
  const stored = text(overrides.__keepsakeSummary);
  if (stored && !BOILERPLATE_RE.test(stored)) return stored;
  const trip = shared.trip || {};
  const description = text(trip.description);
  if (description && !BOILERPLATE_RE.test(description)) return description;
  const stories = (shared.places || [])
    .map((place) => storyText(place, placeOverride(shared, place)))
    .filter(Boolean);
  if (stories.length) {
    return `Anniversary trip notes from ${trip.title || 'this vacation'}: ${stories.length} saved stor${stories.length === 1 ? 'y' : 'ies'} already on the itinerary.`;
  }
  return `${trip.title || 'This vacation'} — day-by-day plan with meals, lodging, and flights.`;
}

function storyCoverIsSafePhoto(cover, media = []) {
  if (!cover?.url || cover.kind !== 'photo') return false;
  const row = media.find((item) => item.publicUrl === cover.url) || { publicUrl: cover.url };
  return isPhotoBinding(row) && !isVideoBinding(row) && !isVideoMediaUrl(cover.url);
}

function pickStoryCover(media = [], logoUrl = '') {
  const photo = media.find((row) => isPhotoBinding(row) && row.publicUrl);
  if (photo) return { kind: 'photo', url: photo.publicUrl };
  const logo = text(logoUrl);
  if (logo && !isVideoMediaUrl(logo)) return { kind: 'logo', url: logo };
  return { kind: 'none', url: '' };
}

function listStories(shared, bindings, origin) {
  const byPlace = new Map();
  for (const raw of bindings) {
    const binding = toPublicBinding(raw);
    if (!binding.thingId) continue;
    const list = byPlace.get(binding.thingId) || [];
    list.push(binding);
    byPlace.set(binding.thingId, list);
  }
  const stories = [];
  for (const place of shared.places || []) {
    const override = placeOverride(shared, place);
    const story = storyText(place, override);
    const media = (byPlace.get(Number(place.id)) || []).filter((row) => row.publicUrl);
    if (!story && !media.length) continue;
    const resolved = timelineIcon(place, override);
    const logoUrl = absUrl(captureThingLogo(place, override), origin);
    const mapped = media.map((row) => ({
      ...row,
      publicUrl: absUrl(row.publicUrl, origin),
    }));
    stories.push({
      thingId: Number(place.id),
      title: displayName(place, override),
      story,
      media: mapped,
      cover: pickStoryCover(mapped, logoUrl),
      resolved,
      logoUrl,
      place,
      override,
    });
  }
  return stories;
}

function groupedPlaces(shared) {
  const groups = new Map();
  for (const place of shared.places || []) {
    const override = placeOverride(shared, place);
    const resolved = timelineIcon(place, override);
    const label = resolved.isFlight ? 'Flights' : (
      resolved.type === 'hotel' ? 'Hotels'
        : resolved.type === 'restaurant' || resolved.type === 'bar' ? 'Restaurants'
          : resolved.type === 'store' || resolved.type === 'shopping' ? 'Stores'
            : resolved.type === 'car' || resolved.type === 'transport' ? 'Transport'
              : 'The rest'
    );
    const list = groups.get(label) || [];
    list.push({ place, override, resolved });
    groups.set(label, list);
  }
  return [...groups.entries()];
}

function dayRows(shared) {
  const days = Array.isArray(shared.days) ? [...shared.days].sort((a, b) => Number(a.day_number) - Number(b.day_number)) : [];
  const assignments = shared.assignments && typeof shared.assignments === 'object' ? shared.assignments : {};
  return days.map((day) => {
    const rows = Array.isArray(assignments[String(day.id)]) ? assignments[String(day.id)] : [];
    const items = rows.map((row) => {
      const place = row.place || (shared.places || []).find((item) => Number(item.id) === Number(row.place_id || row.place?.id)) || {};
      const override = placeOverride(shared, place);
      return {
        time: text(place.place_time || row.assignment_time || override.startTime || ''),
        title: displayName(place, override),
        place,
        override,
        resolved: timelineIcon(place, override, ''),
      };
    });
    return { day, items };
  });
}

function iconHtml(place, override) {
  const resolved = timelineIcon(place, override);
  const html = printThingIconHtml(place, { ...override, logoUrl: override.logoUrl || place.captured_logo_url || place.logoUrl }, '');
  if (!resolved.isFlight && isAirplaneGlyph(resolved.icon)) {
    throw new Error(`Airplane leaked for non-flight ${displayName(place, override)}`);
  }
  return html;
}

function styleBlock() {
  return `<style>
    @page { size: Letter; margin: 12mm 12mm 14mm; }
    html, body { margin: 0; background: white; }
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; color: #111827; }
    .page { padding: 8px 4px 28px; box-sizing: border-box; }
    .keepsake-report { break-after: auto; }
    .keepsake-list-page, .keepsake-day { break-before: page; page-break-before: always; }
    .print-brand { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px; color: #6b7280; }
    h1 { font-size: 28px; margin: 0 0 6px; }
    h2 { font-size: 18px; margin: 0 0 12px; }
    .muted { color: #6b7280; font-size: 12px; margin: 0 0 10px; }
    .keepsake-summary { font-size: 13px; line-height: 1.55; color: #334155; margin: 10px 0 14px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 12px 0 16px; }
    .summary-stat { border: 1px solid #e5e7eb; border-radius: 14px; padding: 10px; background: #f8fafc; }
    .summary-stat strong { display: block; font-size: 20px; color: #111827; }
    .stories-gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 8px 0 4px; }
    .story-card { border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; background: #fff; break-inside: avoid; }
    .story-card .cover { width: 100%; height: 140px; object-fit: cover; background: #111; display: block; }
    .story-card .cover-fallback { width: 100%; height: 140px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
    .story-card .cover-fallback img, .story-card .cover-fallback .thing-emoji { width: 48px; height: 48px; font-size: 28px; border: 0; background: transparent; }
    .story-card .thing-head { display: grid; grid-template-columns: 28px 1fr; gap: 8px; align-items: center; padding: 10px 12px 0; }
    .story-card .body { padding: 8px 12px 12px; }
    .story-card h3 { margin: 0; font-size: 14px; }
    .story-card p { margin: 6px 0 0; font-size: 11.5px; line-height: 1.45; color: #334155; white-space: pre-wrap; }
    .logo-list { columns: 2; column-gap: 18px; margin: 0 0 16px; padding: 0; list-style: none; }
    .logo-list li { break-inside: avoid; display: flex; align-items: center; gap: 8px; font-size: 12px; margin: 0 0 7px; }
    .tiny-logo, .thing-emoji { width: 22px; height: 22px; object-fit: contain; border-radius: 6px; background: #f8fafc; border: 1px solid #e5e7eb; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
    .time-row { display: grid; grid-template-columns: 56px 22px 1fr; gap: 7px; margin: 0 0 6px; font-size: 11px; }
    .time { font-weight: 700; text-align: right; padding-top: 2px; }
    .timeline-title { font-weight: 600; padding-top: 1px; }
    .no-print { margin: 0 0 16px; }
    .no-print a, .no-print button { font: 600 13px/1 system-ui; color: #1a1408; background: #f5d37b; border: 0; border-radius: 999px; padding: 10px 14px; text-decoration: none; cursor: pointer; }
    @media print { .no-print { display: none; } }
  </style>`;
}

export function buildStyle2Model(sharedInput = {}, bindings = [], origin = '') {
  const shared = applyCapturedLogos(sharedInput);
  const trip = shared.trip || {};
  const stories = listStories(shared, bindings, origin);
  const groups = groupedPlaces(shared);
  const days = dayRows(shared);
  const flights = (shared.places || []).filter((place) => timelineIcon(place, placeOverride(shared, place)).isFlight);
  const summary = realTripSummary(shared);
  const airplaneAudit = [];
  for (const place of shared.places || []) {
    const override = placeOverride(shared, place);
    const resolved = timelineIcon(place, override);
    if (isAirplaneGlyph(resolved.icon) && !resolved.isFlight) {
      airplaneAudit.push(displayName(place, override));
    }
  }
  for (const story of stories) {
    if (!story.resolved.isFlight && isAirplaneGlyph(story.resolved.icon)) {
      airplaneAudit.push(`story:${story.title}`);
    }
    if (story.cover.kind === 'photo' && !storyCoverIsSafePhoto(story.cover, story.media)) {
      airplaneAudit.push(`story-cover-video:${story.title}`);
    }
  }
  return {
    shared,
    trip,
    stories,
    groups,
    days,
    flights,
    summary,
    isBoilerplate: BOILERPLATE_RE.test(summary),
    airplaneAudit,
    origin,
  };
}

export function renderStyle2Html(sharedInput = {}, bindings = [], options = {}) {
  const origin = text(options.origin || '');
  const token = text(options.shareToken || '');
  const model = buildStyle2Model(sharedInput, bindings, origin);
  if (model.airplaneAudit.length) {
    throw new Error(`Airplane glyph leaked onto non-flights: ${model.airplaneAudit.join(', ')}`);
  }

  const stats = [
    ['Places', String((model.shared.places || []).length)],
    ['Stories', String(model.stories.length)],
    ['Days', String(model.days.length || 0)],
    ['Flights', String(model.flights.length)],
  ].map(([label, value]) => `<div class="summary-stat"><strong>${esc(value)}</strong>${esc(label)}</div>`).join('');

  const storyCards = model.stories.map((story) => {
    const type = story.resolved.isFlight ? 'flight' : story.resolved.type;
    const mark = iconHtml(story.place, story.override);
    if (!story.resolved.isFlight && isAirplaneGlyph(story.resolved.icon)) {
      throw new Error(`Airplane leaked on story card ${story.title}`);
    }
    const cover = story.cover;
    const fallback = `<div class="cover-fallback" data-cover-fallback="1">${mark}</div>`;
    if (cover.kind === 'photo' && !storyCoverIsSafePhoto(cover, story.media)) {
      throw new Error(`Video used as story-card image for ${story.title}`);
    }
    const mediaHtml = storyCoverIsSafePhoto(cover, story.media)
      ? `<img class="cover" data-cover-kind="photo" src="${esc(cover.url)}" alt="${esc(story.title)}" onerror="this.replaceWith(this.nextElementSibling)" />${fallback}`
      : (cover.kind === 'logo' && cover.url && !isVideoMediaUrl(cover.url)
        ? `<div class="cover-fallback" data-cover-kind="logo" data-cover-fallback="1"><img src="${esc(cover.url)}" alt="" /></div>`
        : fallback);
    const excerpt = paragraphs(story.story).slice(0, 2).join('\n\n');
    return `<article class="story-card" data-story-card="1" data-thing-id="${esc(story.thingId)}" data-icon-type="${esc(type)}"><div class="thing-head">${mark}<h3>${esc(story.title)}</h3></div>${mediaHtml}<div class="body">${excerpt ? `<p>${esc(excerpt)}</p>` : ''}</div></article>`;
  }).join('') || '<p class="muted">No saved stories yet.</p>';

  const page1 = `<section class="page keepsake-report" data-page="1" data-style="2">
    <div class="print-brand">TimeSyncher · Journey Book · Style 2</div>
    <h1>${esc(model.trip.title || 'Vacation')}</h1>
    <p class="muted">${esc([model.trip.start_date, model.trip.end_date].filter(Boolean).join(' – ') || 'Oct 9–12 anniversary weekend')} · ${esc(token || 'shared trip')}</p>
    <p class="muted">Trip summary</p>
    ${paragraphs(model.summary).map((part) => `<div class="keepsake-summary">${esc(part)}</div>`).join('')}
    <div class="summary-grid">${stats}</div>
    <h2>Saved stories</h2>
    <div class="stories-gallery" data-stories-up-front="1">${storyCards}</div>
  </section>`;

  const listPages = model.groups.map(([label, rows]) => {
    const items = rows.map(({ place, override }) => (
      `<li data-thing-id="${esc(place.id)}" data-icon-type="${esc(timelineIcon(place, override).type)}">${iconHtml(place, override)}<span>${esc(displayName(place, override))}</span></li>`
    )).join('');
    return `<section class="page keepsake-report keepsake-list-page"><div class="print-brand">TimeSyncher · Style 2</div><h2>${esc(label)}</h2><ul class="logo-list">${items}</ul></section>`;
  }).join('');

  const dayPages = model.days.map(({ day, items }) => {
    const rows = items.map((item) => (
      `<div class="time-row" data-icon-type="${esc(item.resolved.type)}"><div class="time">${esc(item.time || 'TBD')}</div>${iconHtml(item.place, item.override)}<div class="timeline-title">${esc(item.title)}</div></div>`
    )).join('') || '<p class="muted">No timeline-tagged stops.</p>';
    return `<section class="page keepsake-day"><div class="print-brand">TimeSyncher · Style 2</div><h2>Day ${esc(day.day_number || '')}</h2>${rows}</section>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(model.trip.title || 'Journey Book')} · Style 2</title>
  ${styleBlock()}
</head>
<body>
  <div class="no-print">
    <a href="/shared/${encodeURIComponent(token)}/">← Shared itinerary</a>
    <button type="button" onclick="window.print()">Save as PDF</button>
  </div>
  ${page1}
  ${listPages}
  ${dayPages}
</body>
</html>`;
}

export { BOILERPLATE_RE, realTripSummary, listStories, pickStoryCover, isPhotoBinding };

import { timelineIcon, printThingIconHtml, isAirplaneGlyph, isVideoMediaUrl, timelineCategoryIcon } from './timeline-icons.mjs';
import { applyCapturedLogos, captureThingLogo } from './thing-logo-capture.mjs';
import { isPhotoBinding, isVideoBinding, toPublicBinding } from './thing-media-bind.mjs';
import { backfillAssignments, includePrintMaps, itineraryMinThings } from './itinerary-minimums.mjs';
import { qrSvg } from './qr-svg.mjs';

export const PRODUCT_SOT_SLUG = 'bot-admin/messages/time-syncher/style-2-journey-book-product-standard-20260910';
export const PRODUCT_SOT_ALIAS = 'bot-admin/messages/time-syncher/style-2-journey-book-standard';
export const PRODUCT_SOT_RECEIPT = 'bot-admin/receipts/cos-style-2-journey-book-product-standard-20260910';

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
  if (media.some((row) => isVideoBinding(row))) return { kind: 'video', url: '' };
  const logo = text(logoUrl);
  if (logo && !isVideoMediaUrl(logo)) return { kind: 'logo', url: logo };
  return { kind: 'none', url: '' };
}

function bindingsByPlace(bindings = [], origin = '') {
  const byPlace = new Map();
  for (const raw of bindings) {
    const binding = toPublicBinding(raw);
    if (!binding.thingId || !binding.publicUrl) continue;
    const row = { ...binding, publicUrl: absUrl(binding.publicUrl, origin) };
    const list = byPlace.get(binding.thingId) || [];
    list.push(row);
    byPlace.set(binding.thingId, list);
  }
  return byPlace;
}

function listStories(shared, bindings, origin) {
  const byPlace = bindingsByPlace(bindings, origin);
  const stories = [];
  for (const place of shared.places || []) {
    const override = placeOverride(shared, place);
    const story = storyText(place, override);
    const media = byPlace.get(Number(place.id)) || [];
    if (!story && !media.length) continue;
    const resolved = timelineIcon(place, override);
    const logoUrl = absUrl(captureThingLogo(place, override), origin);
    stories.push({
      thingId: Number(place.id),
      title: displayName(place, override),
      story,
      media,
      photos: media.filter((row) => isPhotoBinding(row)),
      videos: media.filter((row) => isVideoBinding(row)),
      cover: pickStoryCover(media, logoUrl),
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

function formatClock(value) {
  const raw = text(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${meridiem}`;
}

function mediaForPlace(byPlace, place) {
  return byPlace.get(Number(place.id)) || [];
}

function dayRows(shared, byPlace) {
  const days = Array.isArray(shared.days) ? [...shared.days].sort((a, b) => Number(a.day_number) - Number(b.day_number)) : [];
  const assignments = shared.assignments && typeof shared.assignments === 'object' ? shared.assignments : {};
  return days.map((day) => {
    const rows = Array.isArray(assignments[String(day.id)]) ? assignments[String(day.id)] : [];
    const items = rows.map((row) => {
      const place = row.place || (shared.places || []).find((item) => Number(item.id) === Number(row.place_id || row.place?.id)) || {};
      const override = placeOverride(shared, place);
      const media = mediaForPlace(byPlace, place);
      return {
        time: formatClock(place.place_time || row.assignment_time || override.startTime || '') || 'TBD',
        endTime: formatClock(override.endTime || place.end_time || ''),
        title: displayName(place, override),
        notes: text(override.summary || override.longDetails || place.description || place.notes || ''),
        place,
        override,
        resolved: timelineIcon(place, override, ''),
        media,
        photos: media.filter((item) => isPhotoBinding(item)),
        videos: media.filter((item) => isVideoBinding(item)),
      };
    });
    return { day, items };
  });
}

function iconHtml(place, override) {
  const resolved = timelineIcon(place, override);
  const logoUrl = captureThingLogo(place, override);
  const html = printThingIconHtml(place, { ...override, logoUrl: override.logoUrl || logoUrl }, '');
  if (!resolved.isFlight && isAirplaneGlyph(resolved.icon)) {
    throw new Error(`Airplane leaked for non-flight ${displayName(place, override)}`);
  }
  return html;
}

function timelineDotHtml(place, override) {
  const resolved = timelineIcon(place, override);
  const icon = resolved.isFlight ? '✈️' : timelineCategoryIcon(resolved.type);
  if (!resolved.isFlight && isAirplaneGlyph(icon)) {
    throw new Error(`Airplane leaked on itinerary row ${displayName(place, override)}`);
  }
  return `<div class="timeline-dot" data-icon-type="${esc(resolved.type)}">${icon}</div>`;
}

function videoPlayUrl(row, origin) {
  return absUrl(row.publicUrl, origin);
}

function videoQrBlock(row, title, origin) {
  const href = videoPlayUrl(row, origin);
  return `<figure class="video-qr" data-video-qr="1" data-binding-id="${esc(row.id || '')}"><a href="${esc(href)}">${qrSvg(href, { size: 92 })}</a><figcaption>Scan for video${title ? ` · ${esc(title)}` : ''}</figcaption></figure>`;
}

function photoImg(url, title, className = 'cover') {
  return `<img class="${className}" data-cover-kind="photo" src="${esc(url)}" alt="${esc(title)}" />`;
}

function styleBlock() {
  return `<style>
    @page { size: Letter; margin: 10mm; }
    html, body { margin: 0; background: white; }
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; color: #111827; }
    .page { padding: 8px 4px 22px; box-sizing: border-box; position: relative; }
    .keepsake-report { break-after: auto; page-break-after: auto; }
    .keepsake-list-page, .keepsake-day, .daily-page { break-before: page; page-break-before: always; }
    .print-brand { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px; color: #6b7280; }
    h1 { font-size: 25px; margin: 0 0 6px; }
    h2 { font-size: 18px; margin: 0 0 12px; }
    .muted { color: #6b7280; font-size: 12px; margin: 0 0 10px; }
    .keepsake-summary { font-size: 13px; line-height: 1.55; color: #334155; margin: 10px 0 14px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 12px 0 16px; }
    .summary-stat { border: 1px solid #e5e7eb; border-radius: 14px; padding: 10px; background: #f8fafc; }
    .summary-stat strong { display: block; font-size: 20px; color: #111827; }
    .logo-list { columns: 2; column-gap: 18px; margin: 0 0 16px; padding: 0; list-style: none; }
    .logo-list li { break-inside: avoid; display: flex; align-items: center; gap: 8px; font-size: 12px; margin: 0 0 7px; }
    .tiny-logo, .thing-emoji { width: 22px; height: 22px; object-fit: contain; border-radius: 6px; background: #f8fafc; border: 1px solid #e5e7eb; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
    .recap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .story-card { border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; background: #fff; break-inside: avoid; }
    .story-card h3 { margin: 0; padding: 12px 12px 0; font-size: 14px; }
    .story-card .story-gap { height: 10px; }
    .story-card .cover { width: 100%; height: 150px; object-fit: cover; background: #111; display: block; }
    .story-card .body { padding: 8px 12px 12px; }
    .story-card p { margin: 6px 0 0; font-size: 11.5px; line-height: 1.45; color: #334155; white-space: pre-wrap; }
    .video-qr { margin: 0 12px 10px; text-align: center; }
    .video-qr svg, .video-qr img { width: 92px; height: 92px; display: inline-block; }
    .video-qr figcaption { font-size: 10px; color: #64748b; margin-top: 4px; }
    .daily-grid { display: grid; grid-template-columns: 38% 1fr; gap: 14px; align-items: start; }
    .daily-left { align-self: start; }
    .daily-itinerary { border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; margin: 0 0 10px; }
    .daily-itinerary-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    .day-badge { width: 28px; height: 28px; border-radius: 50%; background: #111827; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .daily-itinerary-body { padding: 10px 12px; }
    .time-row { display: grid; grid-template-columns: 56px 18px 1fr 36px; gap: 7px; margin: 0; font-size: 10.5px; break-inside: avoid; align-items: start; }
    .time { font-weight: 700; color: #111827; text-align: right; padding-top: 2px; }
    .end-time { font-weight: 500; color: #9ca3af; }
    .timeline-rail { display: flex; flex-direction: column; align-items: center; }
    .timeline-dot { font-size: 13px; line-height: 1; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; }
    .timeline-line { width: 2px; min-height: 29px; background: #d1d5db; margin-top: 3px; }
    .timeline-title { font-weight: 600; padding-top: 1px; }
    .row-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: 6px; background: #111; display: block; }
    .row-thumb-qr { width: 32px; height: 32px; }
    .row-thumb-qr svg { width: 32px; height: 32px; display: block; }
    .daily-details { display: grid; grid-template-columns: 1fr; gap: 10px; min-width: 0; }
    .thing { break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; margin: 0; }
    .thing-head { display: grid; grid-template-columns: 34px 1fr; gap: 10px; align-items: center; }
    .thing-logo, .thing .thing-emoji { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; background: #f8fafc; border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center; }
    .thing h3 { font-size: 14px; margin: 0; }
    .thing p { font-size: 11px; line-height: 1.45; margin: 8px 0 0; }
    .thing-media { display: flex; gap: 8px; margin-top: 8px; align-items: flex-start; }
    .thing-media img { width: 72px; height: 54px; object-fit: cover; border-radius: 8px; }
    .no-print { margin: 0 0 16px; }
    .no-print a, .no-print button { font: 600 13px/1 system-ui; color: #1a1408; background: #f5d37b; border: 0; border-radius: 999px; padding: 10px 14px; text-decoration: none; cursor: pointer; }
    @media print { .no-print { display: none; } .page { padding: 0; } }
  </style>`;
}

export function buildStyle2Model(sharedInput = {}, bindings = [], origin = '', env = process.env) {
  const logos = applyCapturedLogos(sharedInput);
  const filled = backfillAssignments(logos, env);
  const shared = filled.shared;
  const byPlace = bindingsByPlace(bindings, origin);
  const trip = shared.trip || {};
  const stories = listStories(shared, bindings, origin);
  const groups = groupedPlaces(shared);
  const days = dayRows(shared, byPlace);
  const flights = (shared.places || []).filter((place) => timelineIcon(place, placeOverride(shared, place)).isFlight);
  const summary = realTripSummary(shared);
  const videos = [];
  for (const rows of byPlace.values()) {
    for (const row of rows) {
      if (isVideoBinding(row)) videos.push(row);
    }
  }
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
    videos,
    summary,
    isBoilerplate: BOILERPLATE_RE.test(summary),
    airplaneAudit,
    origin,
    includeMaps: includePrintMaps(shared, env),
    minThings: filled.minThings,
    placeCount: filled.placeCount,
    assignedCount: filled.assignedCount,
    shortfall: filled.shortfall,
  };
}

function directoryItems(shared) {
  return (shared.places || []).map((place) => {
    const override = placeOverride(shared, place);
    const resolved = timelineIcon(place, override);
    return `<li data-thing-id="${esc(place.id)}" data-icon-type="${esc(resolved.type)}">${iconHtml(place, override)}<span>${esc(displayName(place, override))}</span></li>`;
  }).join('');
}

function storyCardHtml(story, origin) {
  const type = story.resolved.isFlight ? 'flight' : story.resolved.type;
  if (!story.resolved.isFlight && isAirplaneGlyph(story.resolved.icon)) {
    throw new Error(`Airplane leaked on story card ${story.title}`);
  }
  const photos = story.photos.map((row) => photoImg(row.publicUrl, story.title)).join('');
  const qrs = story.videos.map((row) => videoQrBlock(row, story.title, origin)).join('');
  if (story.cover.kind === 'photo' && !storyCoverIsSafePhoto(story.cover, story.media)) {
    throw new Error(`Video used as story-card image for ${story.title}`);
  }
  const excerpt = paragraphs(story.story).slice(0, 2).join('\n\n');
  return `<article class="story-card" data-story-card="1" data-story-media-only="1" data-thing-id="${esc(story.thingId)}" data-icon-type="${esc(type)}"><h3>${esc(story.title)}</h3><div class="story-gap" data-story-gap="1"></div>${photos}${qrs}<div class="body">${excerpt ? `<p>${esc(excerpt)}</p>` : ''}</div></article>`;
}

function rowThumbHtml(item, origin) {
  const photo = item.photos[0];
  if (photo) {
    return `<img class="row-thumb" data-row-thumb="1" src="${esc(photo.publicUrl)}" alt="" />`;
  }
  if (item.videos[0]) {
    return `<div class="row-thumb-qr" data-row-thumb="1" data-row-video-qr="1">${qrSvg(videoPlayUrl(item.videos[0], origin), { size: 32 })}</div>`;
  }
  return '<span data-row-thumb="0"></span>';
}

function dailyPageHtml(model, dayBlock, origin) {
  const day = dayBlock.day;
  const dateLabel = day.date
    ? new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    : '';
  const rows = dayBlock.items.map((item, index) => {
    const type = item.resolved.isFlight ? 'flight' : item.resolved.type;
    return `<div class="time-row" data-icon-type="${esc(type)}" data-thing-id="${esc(item.place.id || '')}"><div class="time">${esc(item.time)}${item.endTime ? `<br /><span class="end-time">${esc(item.endTime)}</span>` : ''}</div><div class="timeline-rail">${timelineDotHtml(item.place, item.override)}${index < dayBlock.items.length - 1 ? '<div class="timeline-line"></div>' : ''}</div><div class="timeline-title">${esc(item.title)}</div>${rowThumbHtml(item, origin)}</div>`;
  }).join('') || '<p class="muted">No timeline-tagged things yet for this day.</p>';

  const details = dayBlock.items.map((item) => {
    const type = item.resolved.isFlight ? 'flight' : item.resolved.type;
    const photos = item.photos.slice(0, 2).map((row) => `<img src="${esc(row.publicUrl)}" alt="" data-row-thumb="1" />`).join('');
    const qrs = item.videos.map((row) => videoQrBlock(row, item.title, origin)).join('');
    const notes = item.notes ? `<p>${esc(item.notes)}</p>` : '';
    return `<article class="thing daily-thing" data-thing-id="${esc(item.place.id || '')}" data-icon-type="${esc(type)}"><div class="thing-head">${iconHtml(item.place, item.override)}<div><h3>${esc(item.title)}</h3></div></div>${notes}<div class="thing-media">${photos}${qrs}</div></article>`;
  }).join('');

  return `<section class="page daily-page keepsake-day" data-print-ready="daily" data-day="${esc(day.day_number || '')}">
    <div class="print-brand">TimeSyncher · Journey Book · Style 2</div>
    <h1>${esc(model.trip.title || 'Trip')}</h1>
    <div class="daily-grid">
      <aside class="daily-left">
        <div class="daily-itinerary">
          <div class="daily-itinerary-head">
            <div class="day-badge">${esc(day.day_number || '')}</div>
            <div><h2 style="margin:0">${esc(day.title || `Day ${day.day_number || ''}`)}</h2>${dateLabel ? `<div class="muted">${esc(dateLabel)}</div>` : ''}</div>
          </div>
          <div class="daily-itinerary-body">${rows}</div>
        </div>
      </aside>
      <main class="daily-details">${details}</main>
    </div>
  </section>`;
}

export function renderStyle2Html(sharedInput = {}, bindings = [], options = {}) {
  const origin = text(options.origin || '');
  const token = text(options.shareToken || '');
  const model = buildStyle2Model(sharedInput, bindings, origin, options.env || process.env);
  if (model.airplaneAudit.length) {
    throw new Error(`Airplane glyph leaked onto non-flights: ${model.airplaneAudit.join(', ')}`);
  }

  const stats = [
    ['Places', String(model.placeCount)],
    ['Stories', String(model.stories.length)],
    ['Days', String(model.days.length || 0)],
    ['Flights', String(model.flights.length)],
  ].map(([label, value]) => `<div class="summary-stat"><strong>${esc(value)}</strong>${esc(label)}</div>`).join('');

  const storyCards = model.stories.map((story) => storyCardHtml(story, origin)).join('') || '<p class="muted">No saved stories yet.</p>';

  const page1 = `<section class="page keepsake-report" data-page="1" data-style="2">
    <div class="print-brand">TimeSyncher · Journey Book · Style 2</div>
    <h1>${esc(model.trip.title || 'Vacation')}</h1>
    <p class="muted">${esc([model.trip.start_date, model.trip.end_date].filter(Boolean).join(' – ') || 'Oct 9–12 anniversary weekend')} · ${esc(token || 'shared trip')}</p>
    <p class="muted">Trip summary</p>
    ${paragraphs(model.summary).map((part) => `<div class="keepsake-summary">${esc(part)}</div>`).join('')}
    <p class="keepsake-summary">You visited ${model.placeCount} places across this vacation.</p>
    <div class="summary-grid">${stats}</div>
    <h2>Trip directory</h2>
    <ul class="logo-list" data-trip-directory="1">${directoryItems(model.shared)}</ul>
  </section>`;

  const storiesPage = `<section class="page keepsake-report keepsake-list-page" data-stories-up-front="1">
    <div class="print-brand">TimeSyncher · Journey Book · Style 2</div>
    <h2>Saved stories</h2>
    <div class="recap-grid">${storyCards}</div>
  </section>`;

  const dayPages = model.days.map((block) => dailyPageHtml(model, block, origin)).join('');

  const listPages = model.groups.map(([label, rows]) => {
    const items = rows.map(({ place, override }) => (
      `<li data-thing-id="${esc(place.id)}" data-icon-type="${esc(timelineIcon(place, override).type)}">${iconHtml(place, override)}<span>${esc(displayName(place, override))}</span></li>`
    )).join('');
    return `<section class="page keepsake-report keepsake-list-page" data-post-itinerary="1"><div class="print-brand">TimeSyncher · Style 2</div><h2>${esc(label)}</h2><ul class="logo-list">${items}</ul></section>`;
  }).join('');

  const mapsPage = model.includeMaps
    ? `<section class="page daily-map-page" data-maps="included"><div class="print-brand">TimeSyncher · Style 2</div><h2>Maps</h2><p class="muted">Maps follow trip print config.</p></section>`
    : `<section hidden data-maps="omitted"></section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(model.trip.title || 'Journey Book')} · Style 2</title>
  <meta name="timesyncher-product-sot" content="${esc(PRODUCT_SOT_SLUG)}" />
  <meta name="timesyncher-product-sot-alias" content="${esc(PRODUCT_SOT_ALIAS)}" />
  <meta name="timesyncher-product-receipt" content="${esc(PRODUCT_SOT_RECEIPT)}" />
  ${styleBlock()}
</head>
<body data-style="2" data-sole-layout="1" data-product-sot="${esc(PRODUCT_SOT_SLUG)}" data-product-sot-alias="${esc(PRODUCT_SOT_ALIAS)}" data-product-receipt="${esc(PRODUCT_SOT_RECEIPT)}" data-min-things="${esc(model.minThings)}" data-place-count="${esc(model.placeCount)}" data-assigned-count="${esc(model.assignedCount)}">
  <div class="no-print">
    <a href="/shared/${encodeURIComponent(token)}/">← Shared itinerary</a>
    <button type="button" onclick="window.print()">Save as PDF</button>
  </div>
  ${page1}
  ${storiesPage}
  ${dayPages}
  ${listPages}
  ${mapsPage}
</body>
</html>`;
}

export { BOILERPLATE_RE, realTripSummary, listStories, pickStoryCover, isPhotoBinding };

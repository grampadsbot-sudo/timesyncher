import { cleanText } from './http.mjs';

const OTHER_THINGS_BUCKET = 'Other ' + 'Thi' + 'ngs';

/** Customer-facing labels for live search progress counts in the vacation app shell. */
export function searchProgressDisplayLabel(category = '') {
  const cat = cleanText(category, 40).toLowerCase();
  if (cat === 'restaurant') return 'Restaurants';
  if (cat === 'store') return 'Stores';
  if (cat === 'flight') return 'Flights';
  if (cat === 'hotel') return 'Hotels';
  if (cat === 'car') return 'Cars';
  if (['activity', 'tour', 'event', 'transport', 'decision', 'note'].includes(cat)) return 'Activities';
  if (!cat) return '';
  return 'Activities';
}

export function placeProgressIdentity(place = {}) {
  const ref = place?.sourceRef && typeof place.sourceRef === 'object' ? place.sourceRef : null;
  const provider = String(ref?.source || place?.source || '').trim();
  const id = String(ref?.id || place?.externalId || place?.metadata?.externalId || '').trim();
  if (provider && id) return `${provider}:${id}`;
  const title = cleanText(place?.title || place?.name, 240);
  const cat = String(place?.category || '').trim().toLowerCase();
  if (!title) return '';
  return `${cat}:${title.toLowerCase()}`;
}

export function countPlacesByDisplayLabel(places = [], seenIdentities = new Set()) {
  const counts = {};
  const order = [];
  const seen = seenIdentities instanceof Set ? seenIdentities : new Set();
  for (const place of Array.isArray(places) ? places : []) {
    const identity = placeProgressIdentity(place);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    const label = searchProgressDisplayLabel(place?.category);
    if (!label) continue;
    if (!counts[label]) {
      counts[label] = 0;
      order.push(label);
    }
    counts[label] += 1;
  }
  return { counts, order, seen };
}

export function emptySearchProgress(jobId = '') {
  return {
    jobId: cleanText(jobId, 80),
    seq: 0,
    stage: 'idle',
    counts: {},
    typeOrder: [],
    seenIdentities: [],
    eventIds: [],
    updatedAt: null,
    error: null,
    websiteReady: false,
  };
}

export function normalizeSearchProgress(raw) {
  if (!raw || typeof raw !== 'object') return emptySearchProgress();
  const counts = raw.counts && typeof raw.counts === 'object' ? { ...raw.counts } : {};
  const typeOrder = Array.isArray(raw.typeOrder) ? [...raw.typeOrder] : Object.keys(counts);
  return {
    jobId: cleanText(raw.jobId, 80),
    seq: Number.isFinite(Number(raw.seq)) ? Number(raw.seq) : 0,
    stage: cleanText(raw.stage, 40) || 'idle',
    counts,
    typeOrder,
    seenIdentities: Array.isArray(raw.seenIdentities) ? raw.seenIdentities.slice(0, 5000) : [],
    eventIds: Array.isArray(raw.eventIds) ? raw.eventIds.slice(0, 500) : [],
    updatedAt: raw.updatedAt || null,
    error: raw.error ? cleanText(raw.error, 500) : null,
    websiteReady: raw.websiteReady === true,
  };
}

/**
 * Apply one producer snapshot. Dedupes by eventId and place identity; ignores stale jobId.
 */
export function applySearchProgressEvent(current, {
  jobId,
  eventId,
  stage = null,
  places = [],
  error = null,
  websiteReady = null,
  now = new Date().toISOString(),
} = {}) {
  const nextJobId = cleanText(jobId, 80);
  let state = normalizeSearchProgress(current);
  if (nextJobId && state.jobId && state.jobId !== nextJobId) {
    state = emptySearchProgress(nextJobId);
  } else if (nextJobId && !state.jobId) {
    state.jobId = nextJobId;
  }
  const eid = cleanText(eventId, 120);
  if (eid && state.eventIds.includes(eid)) {
    return { changed: false, progress: state };
  }
  const seen = new Set(state.seenIdentities);
  const counts = { ...state.counts };
  const typeOrder = [...state.typeOrder];
  for (const place of Array.isArray(places) ? places : []) {
    const identity = placeProgressIdentity(place);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    const label = searchProgressDisplayLabel(place?.category);
    if (!label) continue;
    if (!typeOrder.includes(label)) typeOrder.push(label);
    counts[label] = (counts[label] || 0) + 1;
  }
  const nextStage = stage ? cleanText(stage, 40) : state.stage;
  const next = {
    ...state,
    jobId: nextJobId || state.jobId,
    seq: state.seq + 1,
    stage: nextStage,
    counts,
    typeOrder,
    seenIdentities: [...seen],
    eventIds: eid ? [...state.eventIds, eid] : state.eventIds,
    updatedAt: now,
    error: error != null ? cleanText(error, 500) || null : state.error,
    websiteReady: nextStage === 'failed' || nextStage === 'cancelled'
      ? false
      : (websiteReady === null ? state.websiteReady : websiteReady === true),
  };
  return { changed: true, progress: next };
}

export function searchProgressForClient(progress) {
  const state = normalizeSearchProgress(progress);
  if (!state.jobId && state.stage === 'idle') return null;
  return {
    jobId: state.jobId,
    seq: state.seq,
    stage: state.stage,
    counts: state.counts,
    typeOrder: state.typeOrder,
    updatedAt: state.updatedAt,
    error: state.error,
    websiteReady: state.websiteReady,
    buildingLabel: state.stage === 'building' ? 'Building itinerary…' : null,
  };
}

export async function loadTripSearchProgress(db, tripId) {
  if (!db || !tripId) return emptySearchProgress();
  const rows = await db`
    select metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const meta = rows[0]?.metadata && typeof rows[0].metadata === 'object' ? rows[0].metadata : {};
  return normalizeSearchProgress(meta.searchProgress);
}

async function persistTripSearchProgress(db, tripId, progress) {
  if (!db || !tripId) return null;
  const payload = normalizeSearchProgress(progress);
  await db`
    update trips
    set metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{searchProgress}',
      ${JSON.stringify(payload)}::jsonb,
      true
    ),
    updated_at = now()
    where id = ${tripId}
  `;
  return payload;
}

export async function initTripSearchProgress(db, tripId, jobId) {
  const progress = {
    ...emptySearchProgress(jobId),
    stage: 'searching',
    updatedAt: new Date().toISOString(),
  };
  return persistTripSearchProgress(db, tripId, progress);
}

export async function recordSearchProgressPlaces(db, tripId, {
  jobId,
  eventId,
  stage = 'searching',
  places = [],
  error = null,
  websiteReady = null,
} = {}) {
  const current = await loadTripSearchProgress(db, tripId);
  const applied = applySearchProgressEvent(current, {
    jobId,
    eventId,
    stage,
    places,
    error,
    websiteReady,
  });
  if (!applied.changed) return applied.progress;
  return persistTripSearchProgress(db, tripId, applied.progress);
}

export async function syncSearchProgressStage(db, tripId, { publicUrl = '' } = {}) {
  const progress = await loadTripSearchProgress(db, tripId);
  if (!progress.jobId || progress.stage === 'failed' || progress.stage === 'cancelled') return progress;
  const hasUrl = Boolean(String(publicUrl || '').trim());
  let stage = progress.stage;
  if (hasUrl) {
    stage = 'ready';
  } else if (Object.keys(progress.counts || {}).length > 0) {
    stage = 'building';
  } else if (!stage || stage === 'idle') {
    stage = 'searching';
  }
  if (stage === progress.stage && progress.websiteReady === hasUrl) return progress;
  return persistTripSearchProgress(db, tripId, {
    ...progress,
    stage,
    websiteReady: hasUrl,
    seq: progress.seq + 1,
    updatedAt: new Date().toISOString(),
  });
}

export async function refreshSearchProgressFromTripThings(db, tripId, { jobId, stage = 'searching' } = {}) {
  const rows = await db`
    select category, title, metadata, source
    from trip_things
    where trip_id = ${tripId}
  `;
  const places = rows.map((row) => {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const ref = meta.sourceRef && typeof meta.sourceRef === 'object' ? meta.sourceRef : null;
    return {
      category: row.category,
      title: row.title,
      source: row.source || meta.source || '',
      sourceRef: ref,
      externalId: meta.externalId || ref?.id || '',
    };
  });
  return recordSearchProgressPlaces(db, tripId, {
    jobId,
    eventId: `trip-things:${places.length}:${stage}`,
    stage,
    places,
  });
}

export function throttleUiCounts(lastSnapshot, nextSnapshot, minIntervalMs = 1000) {
  const lastAt = lastSnapshot?.updatedAt ? Date.parse(lastSnapshot.updatedAt) : 0;
  const nextAt = nextSnapshot?.updatedAt ? Date.parse(nextSnapshot.updatedAt) : Date.now();
  if (!Number.isFinite(lastAt) || nextAt - lastAt >= minIntervalMs) return nextSnapshot;
  if (JSON.stringify(lastSnapshot?.counts || {}) !== JSON.stringify(nextSnapshot?.counts || {})) {
    return { ...nextSnapshot, counts: nextSnapshot.counts };
  }
  return lastSnapshot;
}

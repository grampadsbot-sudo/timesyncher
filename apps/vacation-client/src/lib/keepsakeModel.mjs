/** Keepsake / journey report sections from shared trip JSON (clean-room; no TREK bundle). */

import { tabCategoryKey, placeName, placesForCategoryTab } from './listTabModel.mjs';
import {
  buildDayTimeline,
  mapPlacesForTimeline,
  sortedDays,
} from './dayTimelineModel.mjs';
import {
  boundMediaForPlace,
  isPhotoMedia,
  isVideoMedia,
  savedStoryFlagActive,
} from './keepsakeMedia.mjs';

const BOILERPLATE_RE =
  /brought together your day-by-day plan, meals, shows, shopping, hotels, and saved notes/i;

function text(value) {
  return String(value ?? '').trim();
}

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function storedPrintSettings(trip) {
  const raw = trip?.thingOverrides?.__keepsakePrintSettings;
  return raw && typeof raw === 'object' ? raw : {};
}

function queryFlag(params, key) {
  const value = params.get(key);
  if (value == null || value === '') return null;
  return value !== '0' && value.toLowerCase() !== 'false';
}

function mapsOffDays(params) {
  const raw = text(params.get('ksMapOff'));
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;]/)
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
}

/** @param {import('../types/sharedTrip.ts').SharedTripPayload} trip */
export function resolveKeepsakePrintFlags(trip, searchParams = new URLSearchParams()) {
  const stored = storedPrintSettings(trip);
  const mapsStored = stored.maps && typeof stored.maps === 'object' ? stored.maps : {};
  const mapOff = mapsOffDays(searchParams);

  const flag = (storedKey, queryKey, defaultOn = true) => {
    const q = queryFlag(searchParams, queryKey);
    if (q === false) return false;
    if (stored[storedKey] === false) return false;
    if (stored[storedKey] === true) return true;
    return defaultOn;
  };

  return {
    logo: flag('logo', 'ksLogo'),
    summary: flag('summary', 'ksSummary'),
    eventSummary: flag('eventSummary', 'ksEventSummary'),
    stories: flag('stories', 'ksStories'),
    restaurants: flag('restaurants', 'ksRestaurants'),
    rest: flag('rest', 'ksRest'),
    stores: flag('stores', 'ksStores'),
    dayMapEnabled(dayNumber) {
      if (mapOff.has(Number(dayNumber))) return false;
      const key = String(dayNumber);
      if (mapsStored[key] === false || mapsStored[dayNumber] === false) return false;
      return true;
    },
  };
}

export function keepsakeStyleFromSearch(searchParams = new URLSearchParams()) {
  const style = text(searchParams.get('style'));
  if (style === '2' || style === 'style-2') return 2;
  if (style === '1' || style === 'style-1') return 1;
  const pdfReport = text(searchParams.get('pdfReport'));
  if (/style-2|keepsake-style-2/i.test(pdfReport)) return 2;
  return 1;
}

export function isKeepsakeJourneyLocation(pathname = '', searchParams = new URLSearchParams()) {
  if (/\/shared\/[^/]+\/journey\/?$/i.test(pathname)) return true;
  if (searchParams.get('journey') === '1') return true;
  if (searchParams.get('printMode') === 'report') return true;
  return false;
}

/** @param {import('../types/sharedTrip.ts').SharedTripPayload} trip */
export function tripSummaryText(trip) {
  const overrides = trip?.thingOverrides || {};
  const stored = text(overrides.__keepsakeSummary);
  if (stored && !BOILERPLATE_RE.test(stored)) return stored;
  const description = text(trip?.trip?.description);
  if (description && !BOILERPLATE_RE.test(description)) return description;
  return '';
}

function storyText(place, override) {
  const raw = override.story ?? place.story;
  if (raw === true) return '';
  return text(raw);
}

function storyMediaForPlace(trip, place) {
  const bound = boundMediaForPlace(place);
  if (bound.length) return bound;
  const id = Number(place.id);
  const top = [];
  for (const row of trip?.media || []) {
    if (!row || typeof row !== 'object') continue;
    const thingId = Number(row.thingId ?? row.thing_id ?? row.place_id);
    if (thingId === id) top.push(row);
  }
  return boundMediaForPlace({ ...place, bound_media: top });
}

/** @param {import('../types/sharedTrip.ts').SharedTripPayload} trip */
export function savedStories(trip) {
  const stories = [];
  for (const place of trip?.places || []) {
    const override = overrideFor(trip, place);
    if (!savedStoryFlagActive(place, override)) continue;
    const story = storyText(place, override);
    const media = storyMediaForPlace(trip, place);
    const photos = media.filter((row) => isPhotoMedia(row));
    const videos = media.filter((row) => isVideoMedia(row));
    if (!story && !photos.length && !videos.length) continue;
    stories.push({
      id: place.id,
      title: placeName(place),
      story,
      media,
      photos,
      videos,
      logoUrl: text(override.logoUrl || place.logoUrl),
    });
  }
  return stories;
}

/** @param {import('../types/sharedTrip.ts').SharedTripPayload} trip */
export function eventExperienceCount(trip) {
  return placesForCategoryTab(trip, 'events').length;
}

/** @param {import('../types/sharedTrip.ts').SharedTripPayload} trip */
export function directorySection(trip, tab, label) {
  const places = placesForCategoryTab(trip, tab);
  if (!places.length) return null;
  return {
    label,
    tab,
    items: places.map((place) => ({ id: place.id })),
  };
}

/** @param {import('../types/sharedTrip.ts').SharedTripPayload} trip */
export function itineraryStatBuckets(trip) {
  const buckets = [
    ['Flights', placesForCategoryTab(trip, 'flights')],
    ['Hotels', placesForCategoryTab(trip, 'hotels')],
    ['Restaurants', placesForCategoryTab(trip, 'restaurants')],
    ['Stores', placesForCategoryTab(trip, 'stores')],
    ['The rest', placesForCategoryTab(trip, 'events')],
  ];
  return buckets
    .map(([label, places]) => ({ label, count: places.length }))
    .filter((row) => row.count > 0);
}

/** @param {import('../types/sharedTrip.ts').SharedTripPayload} trip */
export function buildKeepsakeDayPages(trip) {
  const days = sortedDays(trip);
  return days.map((day) => {
    const timeline = buildDayTimeline(trip, day);
    const mapPlaces = mapPlacesForTimeline(trip, timeline);
    return {
      day,
      timeline,
      mapPlaces,
    };
  });
}

/**
 * @param {import('../types/sharedTrip.ts').SharedTripPayload} trip
 * @param {URLSearchParams} [searchParams]
 */
export function buildKeepsakeViewModel(trip, searchParams = new URLSearchParams()) {
  const flags = resolveKeepsakePrintFlags(trip, searchParams);
  const style = keepsakeStyleFromSearch(searchParams);
  const summary = tripSummaryText(trip);
  const events = eventExperienceCount(trip);
  const stories = savedStories(trip);
  const dayPages = buildKeepsakeDayPages(trip);

  const sections = [];

  if (flags.summary && summary) {
    sections.push({ kind: 'summary', summary });
  }

  if (flags.eventSummary && events > 0) {
    sections.push({
      kind: 'event-summary',
      count: events,
      label: `You experienced ${events} ${events === 1 ? 'event' : 'events'} this vacation.`,
    });
  }

  if (flags.stories && stories.length) {
    sections.push({ kind: 'stories', stories });
  }

  const stats = itineraryStatBuckets(trip);
  if (flags.summary && stats.length) {
    sections.push({ kind: 'stats', stats });
  }

  const mapPages = [];
  for (const page of dayPages) {
    const dayNumber = Number(page.day.day_number ?? 0);
    if (!flags.dayMapEnabled(dayNumber)) continue;
    if (!page.mapPlaces.length) continue;
    mapPages.push({
      dayNumber,
      dayTitle: text(page.day.title) || (dayNumber ? `Day ${dayNumber}` : 'Day'),
      places: page.mapPlaces,
    });
  }
  if (mapPages.length) {
    sections.push({ kind: 'daily-maps', maps: mapPages });
  }

  if (dayPages.length) {
    sections.push({ kind: 'daily-itinerary', days: dayPages });
  }

  const restaurants = directorySection(trip, 'restaurants', 'Restaurants');
  if (flags.restaurants && restaurants) sections.push({ kind: 'directory', ...restaurants });

  const rest = directorySection(trip, 'events', 'Shows, Tours and the Rest');
  if (flags.rest && rest) sections.push({ kind: 'directory', ...rest });

  const stores = directorySection(trip, 'stores', 'Stores');
  if (flags.stores && stores) sections.push({ kind: 'directory', ...stores });

  return {
    style,
    flags,
    tripTitle: text(trip?.trip?.title) || 'Vacation',
    sections,
    logoSection: flags.logo,
    placeCount: (trip?.places || []).length,
  };
}

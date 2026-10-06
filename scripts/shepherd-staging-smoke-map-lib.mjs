/** Map / budget grading for staging smoke (browser + offline). */

import { budgetGateAllowedAmounts } from '../src/vacation/shared-trip-api-budget.mjs';
import { prepareSharedTripForLiveApp } from '../src/vacation/shared-trip-live-tab-lists.mjs';

const MAUI_MAP_BOUNDS = {
  latMin: 20.5,
  latMax: 21.1,
  lngMin: -156.75,
  lngMax: -155.95,
};

/**
 * Runs in the browser (Puppeteer page.evaluate). Keep Product DOM hooks centralized here.
 */
export function evaluateTripMapInPage() {
  const unresolved = !!document.querySelector('[data-map-center-unresolved]');
  const container = document.querySelector('.leaflet-container, .mapboxgl-map');
  const dataCenter = container?.getAttribute('data-center') || container?.getAttribute('data-map-center') || null;
  const dataBounds = container?.getAttribute('data-bounds') || container?.getAttribute('data-map-bounds') || null;

  function centerFromBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') return null;
    if (typeof bounds.getCenter === 'function') {
      const c = bounds.getCenter();
      return { lat: c.lat, lng: c.lng };
    }
    if (Array.isArray(bounds) && bounds.length >= 2) {
      const a = bounds[0];
      const b = bounds[1];
      if (Array.isArray(a) && Array.isArray(b)) {
        return { lat: (a[1] + b[1]) / 2, lng: (a[0] + b[0]) / 2 };
      }
    }
    return null;
  }

  let engine = 'none';
  let lat = null;
  let lng = null;
  let zoom = null;
  let bounds = null;
  let centerStatus = 'missing';

  const leafletEl = document.querySelector('.leaflet-container');
  const leaflet = leafletEl?._leaflet_map;
  if (leafletEl) {
    engine = 'leaflet';
    if (leaflet && typeof leaflet.getCenter === 'function') {
      const c = leaflet.getCenter();
      lat = c.lat;
      lng = c.lng;
      zoom = leaflet.getZoom?.() ?? null;
      bounds = leaflet.getBounds?.() || null;
      centerStatus = 'verified';
    } else {
      centerStatus = 'unverified';
    }
  }

  const mapboxEl = document.querySelector('.mapboxgl-map');
  if (mapboxEl && engine === 'none') {
    const mapbox = mapboxEl.mapbox || mapboxEl._mapbox_map || window.mapboxMap;
    if (mapbox && typeof mapbox.getCenter === 'function') {
      engine = 'mapbox';
      const c = mapbox.getCenter();
      lat = typeof c.lat === 'function' ? c.lat() : c.lat;
      lng = typeof c.lng === 'function' ? c.lng() : c.lng;
      zoom = mapbox.getZoom?.() ?? null;
      bounds = mapbox.getBounds?.() || null;
      centerStatus = 'verified';
    } else {
      engine = 'mapbox';
      centerStatus = 'unverified';
    }
  }

  if (centerStatus !== 'verified' && dataCenter) {
    try {
      const parsed = JSON.parse(dataCenter);
      if (parsed?.lat != null && parsed?.lng != null) {
        lat = Number(parsed.lat);
        lng = Number(parsed.lng);
        centerStatus = 'data-attribute';
      }
    } catch {
      const parts = dataCenter.split(',').map(Number);
      if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
        lat = parts[0];
        lng = parts[1];
        centerStatus = 'data-attribute';
      }
    }
  }

  const boundsCenter = centerFromBounds(bounds);
  if (centerStatus === 'unverified' && boundsCenter) {
    lat = boundsCenter.lat;
    lng = boundsCenter.lng;
    centerStatus = 'bounds-derived';
  }

  const mounted = Boolean(container) && engine !== 'none';
  return {
    engine,
    mounted,
    lat,
    lng,
    zoom,
    centerStatus,
    unresolved,
    dataCenter,
    dataBounds,
  };
}

export function mapWithinMaui(state, bounds = MAUI_MAP_BOUNDS) {
  const lat = Number(state?.lat);
  const lng = Number(state?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= bounds.latMin && lat <= bounds.latMax && lng >= bounds.lngMin && lng <= bounds.lngMax;
}

export function gradeMapBar(mapState, consoleErrors = []) {
  const signals = (consoleErrors || []).filter((t) => /map_center_unresolved|map_mount_failed/.test(t));
  const mounted = Boolean(mapState?.mounted);
  const unresolved = Boolean(mapState?.unresolved);
  const verified = mapState?.centerStatus === 'verified' || mapState?.centerStatus === 'bounds-derived';
  const inMaui = verified && mapWithinMaui(mapState);
  const pass = mounted && !unresolved && signals.length === 0 && inMaui;
  return {
    pass,
    mounted,
    unresolved,
    signals,
    centerStatus: mapState?.centerStatus || 'missing',
    inMaui,
  };
}

/** Product shared /shared/<slug>/ Plan tab: Leaflet + Product #165 map hooks. */
export function evaluateLeafletProductMapInPage() {
  const hooksTried = [];
  const unresolved = !!document.querySelector('[data-map-center-unresolved]');
  const mapError = !!document.querySelector('[data-ts-trip-map-error]');
  const leafletEl = document.querySelector('.leaflet-container');
  hooksTried.push('dom:.leaflet-container');

  let lat = null;
  let lng = null;
  let zoom = null;
  let bounds = null;
  let centerStatus = 'unverified';
  let centerSource = null;
  let engine = 'none';
  let mapMountFailed = false;

  function parseLatLngPair(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return { lat: Number(parsed[0]), lng: Number(parsed[1]) };
      }
      if (parsed && typeof parsed === 'object') {
        const la = Number(parsed.lat ?? parsed.latitude);
        const ln = Number(parsed.lng ?? parsed.longitude ?? parsed.lon);
        if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
      }
    } catch {
      const parts = String(raw).split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n));
      if (parts.length >= 2) return { lat: parts[0], lng: parts[1] };
    }
    return null;
  }

  function parseBounds(raw) {
    if (!raw) return null;
    try {
      const b = JSON.parse(raw);
      if (b && typeof b === 'object') return b;
    } catch {
      const parts = String(raw).split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n));
      if (parts.length >= 4) {
        return { south: parts[0], west: parts[1], north: parts[2], east: parts[3] };
      }
    }
    return null;
  }

  if (leafletEl) {
    engine = leafletEl.getAttribute('data-ts-map-engine') || 'leaflet';
    const dataCenterRaw = leafletEl.getAttribute('data-ts-map-center');
    const dataZoomRaw = leafletEl.getAttribute('data-ts-map-zoom');
    const dataBoundsRaw = leafletEl.getAttribute('data-ts-map-bounds');
    hooksTried.push('dom:data-ts-map-center|data-ts-map-zoom|data-ts-map-bounds|data-ts-map-engine');

    if (dataCenterRaw) {
      const parsed = parseLatLngPair(dataCenterRaw);
      if (parsed) {
        lat = parsed.lat;
        lng = parsed.lng;
        centerSource = 'data-ts-map-center';
        centerStatus = 'verified';
      }
    } else {
      mapMountFailed = true;
    }

    if (dataZoomRaw != null && dataZoomRaw !== '') {
      const z = Number(dataZoomRaw);
      if (Number.isFinite(z)) zoom = z;
    }
    if (dataBoundsRaw) {
      bounds = parseBounds(dataBoundsRaw);
    }
  }

  const tsTripMap = window.__tsTripMap;
  if (tsTripMap && typeof tsTripMap === 'object') {
    hooksTried.push('window:__tsTripMap');
    if (tsTripMap.engine) engine = String(tsTripMap.engine);
    const c = tsTripMap.center || tsTripMap.mapCenter;
    if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))) {
      lat = Number(c.lat);
      lng = Number(c.lng);
      centerSource = centerSource || '__tsTripMap';
      centerStatus = 'verified';
      mapMountFailed = false;
    }
    if (tsTripMap.bounds) bounds = tsTripMap.bounds;
    if (tsTripMap.zoom != null) zoom = tsTripMap.zoom;
  }

  const map = leafletEl?._leaflet_map;
  if (centerStatus !== 'verified' && map && typeof map.getCenter === 'function') {
    hooksTried.push('leaflet:_leaflet_map.getCenter');
    const c = map.getCenter();
    lat = c.lat;
    lng = c.lng;
    zoom = typeof map.getZoom === 'function' ? map.getZoom() : zoom;
    centerSource = centerSource || 'leaflet_instance';
    centerStatus = 'verified';
    mapMountFailed = false;
    const b = typeof map.getBounds === 'function' ? map.getBounds() : null;
    if (b && typeof b.getNorth === 'function') {
      bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      };
    }
  }

  if (centerStatus !== 'verified' && bounds && typeof bounds === 'object') {
    const north = Number(bounds.north ?? bounds.maxLat);
    const south = Number(bounds.south ?? bounds.minLat);
    const east = Number(bounds.east ?? bounds.maxLng);
    const west = Number(bounds.west ?? bounds.minLng);
    if ([north, south, east, west].every(Number.isFinite)) {
      lat = (north + south) / 2;
      lng = (east + west) / 2;
      centerSource = centerSource || 'bounds-derived';
      centerStatus = 'bounds-derived';
      mapMountFailed = false;
    }
  }

  return {
    engine,
    mounted: Boolean(leafletEl),
    mapInstance: Boolean(map),
    lat,
    lng,
    zoom,
    bounds,
    unresolved,
    mapError,
    mapMountFailed,
    centerStatus,
    centerSource,
    hooksTried,
  };
}

export function gradeLeafletProductMap(mapState, consoleErrors = []) {
  const signals = (consoleErrors || []).filter((t) => /map_center_unresolved|map_mount_failed|map_/.test(t));
  if (mapState?.mapMountFailed) signals.push('map_mount_failed');
  const verified = mapState?.centerStatus === 'verified' || mapState?.centerStatus === 'bounds-derived';
  const inMaui = verified && mapWithinMaui({ lat: mapState?.lat, lng: mapState?.lng });
  const pass = Boolean(mapState?.mounted)
    && verified
    && !mapState?.unresolved
    && !mapState?.mapError
    && !mapState?.mapMountFailed
    && signals.length === 0
    && inMaui;
  return {
    pass,
    inMaui,
    signals,
    unresolved: mapState?.unresolved,
    mapError: mapState?.mapError,
    mapMountFailed: mapState?.mapMountFailed,
    centerStatus: mapState?.centerStatus || 'unverified',
    centerSource: mapState?.centerSource || null,
    hooksTried: mapState?.hooksTried || [],
  };
}


function addAllowedAmount(allowed, n) {
  if (!Number.isFinite(n)) return;
  allowed.add(n);
  allowed.add(Math.round(n * 100) / 100);
}

export function budgetHardcodedHits(pageText, budgetLines = [], shared = null) {
  const allowed = new Set();
  if (shared) {
    const prepared = prepareSharedTripForLiveApp(shared);
    for (const n of budgetGateAllowedAmounts(prepared)) {
      addAllowedAmount(allowed, n);
    }
  } else {
    for (const b of budgetLines || []) {
      addAllowedAmount(allowed, Number(b.total_price ?? b.amount ?? b.total));
    }
  }
  const hits = [];
  const re = /\$\s*([\d,]+(?:\.\d{2})?)/g;
  let m;
  const hay = String(pageText || '');
  while ((m = re.exec(hay)) !== null) {
    const num = Number(String(m[1]).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    if (allowed.size === 0) {
      if (num === 0) continue;
      hits.push({ amount: num, raw: m[0], reason: 'no_budget_lines_but_visible_amount' });
      continue;
    }
    if (!allowed.has(num) && !allowed.has(Math.round(num))) {
      hits.push({ amount: num, raw: m[0], reason: 'amount_not_in_api_budget' });
    }
  }
  return hits;
}


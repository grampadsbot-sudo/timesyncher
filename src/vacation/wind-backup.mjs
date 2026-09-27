/** Wind backup from NWS, then Open-Meteo. No canned pool sentence when the forecast is missing. */

const WEATHER_CACHE_MS = 3 * 60 * 60 * 1000;
const cache = new Map();

export function clearWindCache() {
  cache.clear();
}

export function windBackupSentence(readings = []) {
  const ranked = readings
    .filter((reading) => Number.isFinite(Number(reading.windMph)) && String(reading.name || '').trim())
    .map((reading) => ({ name: String(reading.name).trim(), windMph: Number(reading.windMph) }))
    .sort((a, b) => a.windMph - b.windMph || a.name.localeCompare(b.name));
  if (!ranked.length) return '';
  const calm = ranked[0];
  const speed = Math.round(calm.windMph);
  if (calm.windMph <= 15) return `The wind backup is ${calm.name}, where the forecast wind is ${speed} mph.`;
  return `The forecast is windy. The wind backup is ${calm.name} at ${speed} mph, and the house pool is the last resort.`;
}

function dayStamp(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function inTripWindow(iso, startDate, endDate) {
  const day = dayStamp(iso);
  const start = dayStamp(startDate);
  if (!day || !start) return false;
  const end = dayStamp(endDate) || start;
  return day >= start && day <= end;
}

function mphFromNws(text) {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*mph/i);
  return match ? Number(match[1]) : null;
}

async function readJson(response) {
  if (!response?.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function fetchOptions(options, timeoutMs) {
  const next = { ...(options || {}) };
  if (timeoutMs > 0 && !next.signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    next.signal = AbortSignal.timeout(timeoutMs);
  }
  return next;
}

async function nwsWindMph(fetchImpl, { lat, lng }, userAgent, dates, timeoutMs) {
  const points = await readJson(await fetchImpl(`https://api.weather.gov/points/${lat},${lng}`, fetchOptions({
    headers: { 'User-Agent': userAgent, Accept: 'application/geo+json' },
  }, timeoutMs)));
  const hourly = points?.properties?.forecastHourly;
  if (!hourly) return null;
  const forecast = await readJson(await fetchImpl(hourly, fetchOptions({
    headers: { 'User-Agent': userAgent, Accept: 'application/geo+json' },
  }, timeoutMs)));
  const periods = Array.isArray(forecast?.properties?.periods) ? forecast.properties.periods : [];
  const start = dayStamp(dates.startDate);
  const chosen = start
    ? periods.find((period) => inTripWindow(period.startTime, dates.startDate, dates.endDate))
    : periods[0];
  return chosen ? mphFromNws(chosen.windSpeed) : null;
}

function forecastDays(startDate, now) {
  const start = dayStamp(startDate);
  if (!start) return 1;
  const days = Math.ceil((new Date(`${start}T00:00:00Z`).getTime() - now) / 86400000) + 1;
  if (!Number.isFinite(days) || days < 1) return 1;
  return Math.min(16, days);
}

async function openMeteoWindMph(fetchImpl, { lat, lng }, dates, timeoutMs, now) {
  const days = forecastDays(dates.startDate, now);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=wind_speed_10m&forecast_days=${days}&timezone=UTC`;
  const body = await readJson(await fetchImpl(url, fetchOptions({ headers: { Accept: 'application/json' } }, timeoutMs)));
  const times = body?.hourly?.time || [];
  const speeds = body?.hourly?.wind_speed_10m || [];
  const start = dayStamp(dates.startDate);
  const index = start ? times.findIndex((time) => inTripWindow(time, dates.startDate, dates.endDate)) : 0;
  if (index < 0 || !Number.isFinite(Number(speeds[index]))) return null;
  return Number(speeds[index]) / 1.609;
}

export async function lookupWindBackup(points = [], {
  fetchImpl = fetch,
  userAgent = 'TimeSyncherVacation/1.0 (vacation-staging.timesyncher.com)',
  now = Date.now(),
  startDate = '',
  endDate = '',
  timeoutMs = 2500,
} = {}) {
  const usable = points.filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) && point.name);
  if (!usable.length) return '';
  const dates = { startDate, endDate };
  const key = [
    usable.map((point) => `${point.name}:${Number(point.lat).toFixed(3)},${Number(point.lng).toFixed(3)}`).join('|'),
    dayStamp(startDate) || 'now',
    dayStamp(endDate) || '',
  ].join('|');
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const readings = [];
  const work = (async () => {
    for (const point of usable) {
      let windMph = null;
      try {
        windMph = await nwsWindMph(fetchImpl, point, userAgent, dates, timeoutMs);
      } catch {
        windMph = null;
      }
      if (windMph === null) {
        try {
          windMph = await openMeteoWindMph(fetchImpl, point, dates, timeoutMs, now);
        } catch {
          windMph = null;
        }
      }
      if (windMph !== null) readings.push({ name: point.name, windMph });
    }
    return windBackupSentence(readings);
  })();
  let sentence = '';
  try {
    sentence = await Promise.race([
      work,
      new Promise((resolve) => {
        setTimeout(() => resolve(''), Math.max(1, timeoutMs));
      }),
    ]);
  } catch {
    sentence = '';
  }
  if (sentence) cache.set(key, { expiresAt: now + WEATHER_CACHE_MS, value: sentence });
  return sentence || '';
}

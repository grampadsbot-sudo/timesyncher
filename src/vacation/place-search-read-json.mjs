import { PlaceSearchError } from './place-search-error.mjs';
import { isNominatimOpenStreetMapUrl } from './place-search-geocode.mjs';

export const PLACE_SEARCH_PROVIDER_READ_TIMEOUT_MS = 22_000;

export function resolvePlaceSearchProviderReadTimeoutMs(env = process.env, override = null) {
  if (Number.isFinite(Number(override)) && Number(override) > 0) return Number(override);
  const text = String(env?.PLACE_SEARCH_PROVIDER_READ_TIMEOUT_MS ?? '').trim();
  if (text) {
    const parsed = Number.parseInt(text, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return PLACE_SEARCH_PROVIDER_READ_TIMEOUT_MS;
}

function failRead(message) {
  console.error(message);
  throw new PlaceSearchError(message, 'source_failed');
}

function abortErrorMessage(error) {
  if (error?.name === 'AbortError') return true;
  const message = String(error?.message || error || '');
  return /aborted|abort/i.test(message);
}

function raceWithAbort(promise, signal, label) {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new PlaceSearchError(`${label} aborted`, 'source_failed'));
  }
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(new PlaceSearchError(`${label} aborted`, 'source_failed'));
      }, { once: true });
    }),
  ]);
}

export async function placeSearchReadJson(fetchImpl, url, { headers, method, body, label, timeoutMs = null, signal = null } = {}) {
  if (isNominatimOpenStreetMapUrl(url)) {
    throw new PlaceSearchError(
      'Nominatim HTTP must use the nominatim gateway (throttle + cache)',
      'nominatim_bypass',
    );
  }
  const waitMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : 0;
  const controller = new AbortController();
  let timer = null;
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const readLabel = String(label || 'source');
  const failSourceTimedOut = () => {
    if (waitMs > 0) failRead(`${readLabel} timed out after ${waitMs}ms`);
    failRead(`${readLabel} aborted`);
  };
  const work = (async () => {
    let response;
    try {
      response = await fetchImpl(url, {
        method: method || 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': 'TimeSyncherVacation/1.0',
          ...(headers || {}),
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) failSourceTimedOut();
      failRead(`${readLabel} request failed: ${error.message || error}`);
    }
    if (!response?.ok) {
      let detail = '';
      try {
        detail = typeof response.text === 'function'
          ? await raceWithAbort(response.text(), controller.signal, readLabel)
          : '';
      } catch (error) {
        if (controller.signal.aborted || abortErrorMessage(error)) failSourceTimedOut();
        detail = '';
      }
      const httpStatus = Number(response?.status);
      const message = `${readLabel} failed: HTTP ${response?.status || 'no status'} ${String(detail).slice(0, 300)}`.trim();
      const error = new PlaceSearchError(message, 'source_failed');
      if (Number.isFinite(httpStatus)) error.httpStatus = httpStatus;
      console.error(message);
      throw error;
    }
    try {
      return await raceWithAbort(response.json(), controller.signal, readLabel);
    } catch (error) {
      if (controller.signal.aborted || abortErrorMessage(error)) failSourceTimedOut();
      failRead(`${readLabel} returned invalid JSON: ${error.message || error}`);
    }
  })();
  try {
    if (waitMs > 0) {
      return await Promise.race([
        work,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new PlaceSearchError(`${readLabel} timed out after ${waitMs}ms`, 'source_failed'));
          }, waitMs);
        }),
      ]);
    }
    return await work;
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

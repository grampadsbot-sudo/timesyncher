import { finalizeServedSharedTripPayload } from '../../../../src/vacation/shared-trip-served-page.mjs';
import type { SharedTripPayload } from '../types/sharedTrip';

export function normalizeServedSharedTripPayload(data: SharedTripPayload): SharedTripPayload {
  return finalizeServedSharedTripPayload(data) as SharedTripPayload;
}

export function shareTokenFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('token') || params.get('slug') || '';
  if (fromQuery.trim()) return fromQuery.trim();
  const match = window.location.pathname.match(/\/shared\/([^/]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}

const TRIP_LOAD_TIMEOUT_MS = 30_000;

export async function loadSharedTrip(token: string): Promise<SharedTripPayload> {
  const slug = token.replace(/^\/+|\/+$/g, '');
  if (!slug) {
    throw new Error('This share link is missing a trip token.');
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TRIP_LOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`/api/shared/${encodeURIComponent(slug)}/`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Trip load timed out. Check your connection and try again.');
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    let message = `Trip load failed (${response.status})`;
    try {
      const body = (await response.json()) as { customerMessage?: string };
      if (body.customerMessage) message = body.customerMessage;
    } catch {
      void 0;
    }
    throw new Error(message);
  }
  let data: SharedTripPayload;
  try {
    data = (await response.json()) as SharedTripPayload;
  } catch {
    throw new Error('Trip data could not be read. Try again in a moment.');
  }
  if (!data || !Array.isArray(data.places)) {
    throw new Error('Invalid trip payload from API');
  }
  return normalizeServedSharedTripPayload(data);
}

import type { SharedTripPayload } from '../types/sharedTrip';

export function shareTokenFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('token') || params.get('slug') || '';
  if (fromQuery.trim()) return fromQuery.trim();
  const match = window.location.pathname.match(/\/shared\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function loadSharedTrip(token: string): Promise<SharedTripPayload> {
  const slug = token.replace(/^\/+|\/+$/g, '');
  if (!slug) {
    throw new Error('Missing share token. Open vacation-app-next.html?token=<publicSlug>');
  }
  const response = await fetch(`/api/shared/${encodeURIComponent(slug)}/`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    let message = `Trip load failed (${response.status})`;
    try {
      const body = (await response.json()) as { customerMessage?: string };
      if (body.customerMessage) message = body.customerMessage;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const data = (await response.json()) as SharedTripPayload;
  if (!data || !Array.isArray(data.places)) {
    throw new Error('Invalid trip payload from API');
  }
  return data;
}

import { classifyAppFailure } from './backends.mjs';
import { hostIsBanned } from './fetch-guard.mjs';

function appUrl(origin, token, tripId) {
  const url = new URL('/api/vacation-itinerary', origin);
  url.searchParams.set('app', '1');
  url.searchParams.set('session', token);
  url.searchParams.set('tripId', tripId);
  return url;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return { ok: false, error: 'unreadable response', status: response.status };
  }
}

export async function playCustomerTurns(story, { origin, token, tripId, fetchImpl, hosts }) {
  const allowed = new URL(origin).origin;
  const send = async (url, body) => {
    const href = String(url);
    if (hostIsBanned(href, hosts) || new URL(href).origin !== allowed) throw new Error('refused: harness fetch left staging');
    const started = Date.now();
    const response = await fetchImpl(href, {
      method: body ? 'POST' : 'GET',
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(180000),
    });
    return { status: response.status, body: await readJson(response), wall_ms: Date.now() - started };
  };
  const versionUrl = new URL('/api/version', allowed);
  const start = await send(versionUrl);
  const liveShaStart = String(start.body?.sha || '');
  const endpoint = appUrl(allowed, token, tripId);
  await send(endpoint);
  const timings = [];
  for (let index = 0; index < story.turns.length; index += 1) {
    const turn = story.turns[index];
    const payload = { tripId, text: turn.text, modality: turn.modality };
    if (turn.modality === 'voice') payload.voiceFixture = turn.voice_fixture;
    const draft = await send(endpoint, payload);
    const final = draft.body?.status === 'interim' ? await send(endpoint, { action: 'finish-rewrite', tripId }) : draft;
    const reason = classifyAppFailure(final.status, final.body) || classifyAppFailure(draft.status, draft.body);
    timings.push({ n: index + 1, wall_ms: draft.wall_ms + (final === draft ? 0 : final.wall_ms), http_status: final.status });
    if (reason) {
      const end = await send(versionUrl);
      return { reason, waveStop: true, timings, liveShaStart, liveShaEnd: String(end.body?.sha || '') };
    }
  }
  const end = await send(versionUrl);
  return { reason: '', waveStop: false, timings, liveShaStart, liveShaEnd: String(end.body?.sha || '') };
}

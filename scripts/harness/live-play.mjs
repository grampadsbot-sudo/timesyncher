import { classifyAppFailure } from './backends.mjs';
import { hostIsBanned } from './fetch-guard.mjs';
import { redactExchangeBody } from './redact.mjs';

function appUrl(origin, token, tripId, method) {
  const url = new URL('/api/vacation-itinerary', origin);
  url.searchParams.set('app', '1');
  url.searchParams.set('session', token);
  if (method !== 'POST' && tripId) url.searchParams.set('tripId', tripId);
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

export function buildTurnPayload(turn, tripId) {
  const voice = turn.modality === 'voice';
  const payload = {
    tripId,
    text: turn.text,
    attachments: [],
    voiceMode: voice,
    browserTranscription: voice,
  };
  if (turn.voice_fixture) payload.voiceFixture = turn.voice_fixture;
  return payload;
}

export function replyModelStamp(body) {
  return {
    modelId: String(body?.modelId || '').trim(),
    responseModel: String(body?.responseModel || body?.model?.responseModel || '').trim(),
  };
}

function openerClientTurn(turn) {
  const live = turn?.payload?.liveTranscript && typeof turn.payload.liveTranscript === 'object' ? turn.payload.liveTranscript : {};
  return live.fixedOpener === true
    || turn?.fixedOpener === true
    || live.replyProducer === 'vacation-app-onboarding-opener'
    || turn?.replyProducer === 'vacation-app-onboarding-opener'
    || live?.jev?.reason === 'fixed_onboarding_opener'
    || turn?.jev?.reason === 'fixed_onboarding_opener';
}

export function ruledReplyCount(body) {
  if (!Array.isArray(body?.turns)) return null;
  return body.turns.filter((turn) => {
    if (openerClientTurn(turn)) return false;
    const live = turn?.payload?.liveTranscript && typeof turn.payload.liveTranscript === 'object' ? turn.payload.liveTranscript : {};
    const modelId = String(turn?.modelId || turn?.responseModel || live.modelId || live.model?.responseModel || '').trim();
    const speaker = String(turn?.speaker || turn?.role || '');
    return speaker === 'app' && Boolean(modelId);
  }).length;
}

export function turnFailure(status, body) {
  const billing = classifyAppFailure(status, body);
  if (billing) return billing;
  if (status === 404) return 'session-not-found';
  const code = String(body?.code || '').trim();
  if (code) return code;
  if (body?.eula && body.eula.accepted === false) return 'eula_not_accepted';
  if (body?.ok === false || status >= 400) return 'turn-not-stored';
  return '';
}

function replyText(body) {
  return String(body?.reply || '').trim();
}

function storedTurns(body) {
  return Array.isArray(body?.turns) ? body.turns.length : 0;
}

function itineraryCount(body) {
  return Array.isArray(body?.itinerary) ? body.itinerary.length : 0;
}

function tripFields(body) {
  const trip = body?.trip && typeof body.trip === 'object' ? body.trip : {};
  return {
    tripId: String(trip.id || body?.tripId || ''),
    shareToken: String(trip.shareToken || trip.publicSlug || ''),
  };
}

export async function playCustomerTurns(story, { origin, token, tripId, fetchImpl, hosts, waitMs = 0, secrets = [] }) {
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
  const finish = async (reason, extra) => {
    const end = await send(versionUrl);
    return {
      reason,
      waveStop: reason === 'payment-required' || reason === 'credit-exhausted',
      timings: extra.timings || [],
      liveShaStart,
      liveShaEnd: String(end.body?.sha || ''),
      storedTurns: extra.storedTurns || 0,
      itineraryCount: extra.itineraryCount || 0,
      tripId: extra.tripId || tripId || '',
      shareToken: extra.shareToken || '',
      detail: extra.detail || reason,
      exchange: extra.exchange || null,
    };
  };
  let endpoint = appUrl(allowed, token, tripId, 'GET');
  const opened = await send(endpoint);
  const openedFailure = turnFailure(opened.status, opened.body);
  if (openedFailure) return finish(openedFailure, { detail: opened.body?.error || openedFailure });
  const openedRuled = ruledReplyCount(opened.body);
  let seen = openedRuled == null ? storedTurns(opened.body) : openedRuled;
  let currentTrip = tripFields(opened.body).tripId || tripId || '';
  let shareToken = tripFields(opened.body).shareToken;
  let items = itineraryCount(opened.body);
  const timings = [];
  for (let index = 0; index < story.turns.length; index += 1) {
    const turn = story.turns[index];
    const turnStarted = Date.now();
    const timeline = [];
    const note = (kind, sent) => {
      timeline.push({
        kind,
        offset_ms: Math.max(0, Date.now() - turnStarted),
        status: sent.status,
        wall_ms: sent.wall_ms,
        body: redactExchangeBody(sent.body, secrets),
      });
    };
    endpoint = appUrl(allowed, token, currentTrip, 'POST');
    const draft = await send(endpoint, buildTurnPayload(turn, currentTrip));
    note('post', draft);
    const final = draft.body?.status === 'interim' ? await send(endpoint, { action: 'finish-rewrite', tripId: currentTrip }) : draft;
    if (final !== draft) note('finish-rewrite', final);
    const failure = turnFailure(final.status, final.body) || turnFailure(draft.status, draft.body);
    timings.push({ n: index + 1, wall_ms: draft.wall_ms + (final === draft ? 0 : final.wall_ms), http_status: final.status });
    const failedBody = final.body?.ok === false || final.status >= 400 ? final.body : draft.body;
    const exchange = {
      post_status: (final.body?.ok === false || final.status >= 400 ? final : draft).status,
      body: redactExchangeBody(failedBody, secrets),
      polls: timeline.filter((entry) => entry.kind === 'poll'),
      timeline,
    };
    if (failure) return finish(failure, { timings, storedTurns: seen, itineraryCount: items, tripId: currentTrip, shareToken, detail: final.body?.error || draft.body?.error || failure, exchange: failure === 'turn-not-stored' ? exchange : null });
    let reply = replyText(final.body) || replyText(draft.body);
    const stamp = replyModelStamp(final.body?.reply ? final.body : draft.body);
    const nextTrip = tripFields(final.body).tripId || tripFields(draft.body).tripId;
    if (nextTrip) currentTrip = nextTrip;
    shareToken = tripFields(final.body).shareToken || tripFields(draft.body).shareToken || shareToken;
    if (!reply && waitMs > 0) {
      const deadline = Date.now() + waitMs;
      while (!reply && Date.now() < deadline) {
        await new Promise((resolve) => { setTimeout(resolve, 250); });
        const history = await send(appUrl(allowed, token, currentTrip, 'GET'));
        note('poll', history);
        reply = replyText(history.body);
        const polled = ruledReplyCount(history.body);
        if ((polled == null ? storedTurns(history.body) : polled) > seen) reply = reply || 'stored';
        items = Math.max(items, itineraryCount(history.body));
      }
    }
    const history = await send(appUrl(allowed, token, currentTrip, 'GET'));
    const ruled = ruledReplyCount(history.body);
    const count = ruled == null ? storedTurns(history.body) : ruled;
    items = Math.max(items, itineraryCount(final.body), itineraryCount(draft.body), itineraryCount(history.body));
    shareToken = tripFields(history.body).shareToken || shareToken;
    if (tripFields(history.body).tripId) currentTrip = tripFields(history.body).tripId;
    if (reply && !stamp.modelId && !stamp.responseModel) {
      return finish('reply-not-from-rules', { timings, storedTurns: count, itineraryCount: items, tripId: currentTrip, shareToken, detail: 'scripted line reply had no modelId from vacation-app-reply-rules' });
    }
    if (!reply || (ruled != null ? count <= seen : (Array.isArray(history.body?.turns) && count <= seen))) {
      return finish('reply-not-stored', { timings, storedTurns: count, itineraryCount: items, tripId: currentTrip, shareToken, detail: 'scripted line produced no stored reply' });
    }
    seen = ruled != null || Array.isArray(history.body?.turns) ? count : seen + 1;
  }
  const end = await send(versionUrl);
  return {
    reason: '',
    waveStop: false,
    timings,
    liveShaStart,
    liveShaEnd: String(end.body?.sha || ''),
    storedTurns: seen,
    itineraryCount: items,
    tripId: currentTrip,
    shareToken,
    detail: '',
    exchange: null,
  };
}

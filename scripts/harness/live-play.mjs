import { isPlanningErrorReply } from '../../src/vacation/chat-plan-persist.mjs';
import { classifyAppFailure, isSpendLimitReason, redactUrls, spendLimitDetail } from './backends.mjs';
import { personaSeed, speakCustomer, tripSurvey } from './customer-live.mjs';
import { hostIsBanned } from './fetch-guard.mjs';
import { redactExchangeBody } from './redact.mjs';
import { historyWindowFull, latestStoredAppTurn, ruledReplyCount, storedAppTurnChanged } from './app-history.mjs';

export const PLANNING_FALLBACK_ABORT_LIMIT = 3;
export const STORED_TURN_PROBE_DELAYS_MS = Object.freeze([0, 10000, 20000]);

export function storedTurnProbeDelays(value) {
  const list = Array.isArray(value) ? value : STORED_TURN_PROBE_DELAYS_MS;
  const delays = list.map((ms) => Math.max(0, Number(ms) || 0)).slice(0, 6);
  return delays.length ? delays : [0];
}

function timeoutLikeFailure(status, body) {
  const code = String(body?.error?.code ?? body?.code ?? '').trim();
  const message = String(body?.error?.message ?? body?.error ?? '').trim();
  return status === 504 || code === '504' || /timed? ?out|aborted|FUNCTION_INVOCATION_TIMEOUT|An error occurred with your deployment/i.test(message);
}

export function isPlanningFallbackTurn(reply, body = null) {
  if (isPlanningErrorReply(reply)) return true;
  const disposition = String(body?.quality?.disposition || body?.jevDisposition || '').trim().toLowerCase();
  return disposition === 'planning_error_stored';
}

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

export { ruledReplyCount };

function redactExchangeUrls(value, depth = 0) {
  if (depth > 8) return value;
  if (typeof value === 'string') return redactUrls(value);
  if (Array.isArray(value)) return value.map((item) => redactExchangeUrls(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactExchangeUrls(item, depth + 1)]));
  }
  return value;
}

export function turnFailure(status, body) {
  const billing = classifyAppFailure(status, body);
  if (billing) return billing;
  if (status === 404) return 'session-not-found';
  const code = String(body?.code || '').trim();
  if (code) return code;
  if (String(body?.error || '').trim() === 'first_intake_reply_flagged') return 'first-intake-reply-flagged';
  if (body?.eula && body.eula.accepted === false) return 'eula_not_accepted';
  if (body?.ok === false || status >= 400) return 'turn-not-stored';
  return '';
}

function replyText(body) {
  return String(body?.reply || '').trim();
}

function isScriptedProductReply(reply) {
  const text = String(reply || '');
  return /doesn'?t book reservations directly/i.test(text)
    || /set up your AI for reservations/i.test(text)
    || /ready to import into/i.test(text)
    || /from your AI/i.test(text);
}

function storedTurns(body) {
  return Array.isArray(body?.turns) ? body.turns.length : 0;
}

function itineraryCount(body) {
  return Array.isArray(body?.itinerary) ? body.itinerary.length : 0;
}

const DOLLAR_AMOUNT_RE = /\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?\b/;
const PLAN_PRICE_CONTEXT_RE = /\b(?:plan|household(?:\s+plan)?|seat|collaborator|per\s+year|annual(?:ly)?|yearly|subscription|membership|unlimited\s+vacations|upgrade|pricing|price|one[\s-]time|per\s+vacation)\b/i;
const CUSTOMER_PRICE_REF_RE = /\$\s*\d|\b(?:price|pricing|fee|plan|household\s+plan|per\s+year|annual|yearly|subscription|coupon|unlimited\s+vacations)\b/i;
const CUSTOMER_PRICE_STANCE_RE = /\b(?:sounds?\s+(?:good|fair|reasonable|steep|high|great|doable|affordable|fine)|works?\s+for\s+us|too\s+(?:much|expensive|steep|high|pricey)|reasonable|affordable|steep|expensive|pricey|fair|good\s+value|makes?\s+sense|sign(?:ing)?\s+up|go\s+(?:for|with)|we(?:'ll| will)\s+(?:take|pass|skip|think|stick|go|buy|upgrade)|i(?:'ll| will)\s+(?:take|pass|skip|think|stick|go|buy|upgrade)|no\s+thanks|not\s+right\s+now|maybe\s+later|hold\s+off|skip\s+(?:it|that|the\s+plan)|happy\s+to\s+pay|ready\s+to\s+pay)\b/i;

export function appStatedPlanPricing(text) {
  const body = String(text || '');
  return DOLLAR_AMOUNT_RE.test(body) && PLAN_PRICE_CONTEXT_RE.test(body);
}

function customerPriceReaction(text) {
  const body = String(text || '');
  if (!body.trim()) return false;
  if (DOLLAR_AMOUNT_RE.test(body) && CUSTOMER_PRICE_STANCE_RE.test(body)) return true;
  return CUSTOMER_PRICE_REF_RE.test(body) && CUSTOMER_PRICE_STANCE_RE.test(body);
}

export function pricingReactionCaptured(customerTurns) {
  const turns = Array.isArray(customerTurns) ? customerTurns : [];
  const appPriceIndex = turns.findIndex((turn) => turn?.role === 'app' && appStatedPlanPricing(turn.text));
  if (appPriceIndex < 0) return false;
  return turns
    .slice(appPriceIndex + 1)
    .some((turn) => turn?.role === 'customer' && turn?.odd !== true && customerPriceReaction(turn.text));
}

export function chatGoalsReached({ itineraryCount: items, customerTurns, index, maxTurns, pricing } = {}) {
  const cap = Math.max(1, Number(maxTurns) || 100);
  const atCap = Number(index) + 1 >= cap;
  const pricingOk = pricing === true || pricingReactionCaptured(customerTurns);
  const itineraryOk = Number(items) > 0;
  return { itineraryOk, pricingOk, atCap, done: itineraryOk && pricingOk };
}

function tripFields(body) {
  const trip = body?.trip && typeof body.trip === 'object' ? body.trip : {};
  return {
    tripId: String(trip.id || body?.tripId || ''),
    shareToken: String(trip.shareToken || trip.publicSlug || ''),
  };
}

function initialOpenerTurns(body) {
  if (!Array.isArray(body?.turns)) return [];
  return body.turns
    .filter((turn) => String(turn?.speaker || turn?.role || '') === 'app')
    .map((turn) => ({ role: 'app', text: String(turn?.body ?? turn?.text ?? '').trim() }))
    .filter((turn) => Boolean(turn.text));
}

export async function playCustomerTurns(story, { origin, token, tripId, fetchImpl, hosts, waitMs = 0, secrets = [], liveCustomer = false, customerAsk = null, customerLanes = null, maxTurns = 0, probeDelaysMs = null, sleepImpl = null, afterCustomerTurn = null }) {
  const probeDelays = storedTurnProbeDelays(probeDelaysMs);
  const sleep = typeof sleepImpl === 'function' ? sleepImpl : (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  const allowed = new URL(origin).origin;
  let webAccessToken = '';
  const rememberWebAccess = (response) => {
    const headers = response?.headers;
    if (!headers) return;
    const listed = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
    for (const raw of listed) {
      const match = String(raw || '').match(/ts_vacation_web_access=([^;]+)/i);
      if (!match) continue;
      const value = decodeURIComponent(match[1]);
      if (!value) continue;
      webAccessToken = value;
      if (Array.isArray(secrets) && !secrets.includes(value)) secrets.push(value);
    }
  };
  const send = async (url, body) => {
    const href = String(url);
    if (hostIsBanned(href, hosts) || new URL(href).origin !== allowed) throw new Error('refused: harness fetch left staging');
    const started = Date.now();
    const headers = { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) };
    if (webAccessToken) {
      headers.cookie = `ts_vacation_web_access=${encodeURIComponent(webAccessToken)}`;
      headers['x-timesyncher-web-access-token'] = webAccessToken;
    }
    const response = await fetchImpl(href, {
      method: body ? 'POST' : 'GET',
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(180000),
    });
    rememberWebAccess(response);
    return { status: response.status, body: await readJson(response), wall_ms: Date.now() - started };
  };
  const versionUrl = new URL('/api/version', allowed);
  const start = await send(versionUrl);
  const liveShaStart = String(start.body?.sha || '');
  const planningFallbackTurns = [];
  let consecutiveFallbacks = 0;
  const fallbackSummary = () => ({ count: planningFallbackTurns.length, turns: [...planningFallbackTurns] });
  const rescuedTurns = [];
  const rescuedSummary = () => ({
    count: rescuedTurns.length,
    turns: rescuedTurns.map((row) => row.n),
    timeouts: rescuedTurns.filter((row) => row.timeout).length,
    details: rescuedTurns.map((row) => ({ ...row })),
  });
  const finish = async (reason, extra) => {
    const end = await send(versionUrl);
    const turns = extra.customerTurns || [];
    return {
      reason,
      waveStop: isSpendLimitReason(reason),
      timings: extra.timings || [],
      liveShaStart,
      liveShaEnd: String(end.body?.sha || ''),
      storedTurns: extra.storedTurns || 0,
      itineraryCount: extra.itineraryCount || 0,
      tripId: extra.tripId || tripId || '',
      shareToken: extra.shareToken || '',
      detail: extra.detail || reason,
      exchange: extra.exchange || null,
      webAccessCookie: Boolean(webAccessToken),
      customerTurns: turns,
      customerTurnCount: turns.filter((turn) => turn.role === 'customer').length,
      pricingReactionCaptured: pricingReactionCaptured(turns),
      planningFallbacks: fallbackSummary(),
      rescuedTimeouts: rescuedSummary(),
    };
  };
  let endpoint = appUrl(allowed, token, tripId, 'GET');
  const opened = await send(endpoint);
  const openedFailure = turnFailure(opened.status, opened.body);
  if (openedFailure) {
    const spend = isSpendLimitReason(openedFailure);
    return finish(openedFailure, { detail: spend ? spendLimitDetail(openedFailure, opened.body) : opened.body?.error || openedFailure });
  }
  const openedRuled = ruledReplyCount(opened.body);
  let seen = openedRuled == null ? storedTurns(opened.body) : openedRuled;
  let seenRuledApp = latestStoredAppTurn(opened.body, { ruledOnly: true });
  let seenApp = latestStoredAppTurn(opened.body);
  const openerTurns = initialOpenerTurns(opened.body);
  let currentTrip = tripFields(opened.body).tripId || tripId || '';
  let shareToken = tripFields(opened.body).shareToken;
  let items = itineraryCount(opened.body);
  const timings = [];
  const persona = personaSeed(story);
  const customerTurns = [];
  let lastReply = openerTurns.at(-1)?.text || '';
  let travelSummary = opened.body?.travelSummary ?? null;
  const limit = liveCustomer ? Math.max(1, Number(maxTurns) || persona.goals.length || 4) : story.turns.length;
  for (let index = 0; index < limit; index += 1) {
    let turn = story.turns[index];
    let customerCost = null;
    let customerModel = '';
    if (liveCustomer) {
      const priorForModel = [...openerTurns, ...customerTurns];
      const spoken = await speakCustomer({ persona, appReply: lastReply, index, transcript: priorForModel, travelSummary, ask: customerAsk, order: customerLanes });
      customerCost = spoken.cost;
      customerModel = spoken.model;
      turn = { speaker: persona.name, modality: 'text', text: spoken.text, odd: spoken.kind !== 'goal' };
      customerTurns.push({ role: 'customer', text: spoken.text, model: customerModel, cost: customerCost, odd: turn.odd === true });
    }
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
    if (failure) {
      if (failure === 'turn-not-stored') {
        const failedSent = final.body?.ok === false || final.status >= 400 ? final : draft;
        const probes = [];
        exchange.probes = probes;
        let probe = null;
        let probeCount = 0;
        let storedApp = null;
        let storedReplyGrew = false;
        for (let attempt = 0; attempt < probeDelays.length; attempt += 1) {
          if (probeDelays[attempt] > 0) await sleep(probeDelays[attempt]);
          probe = await send(appUrl(allowed, token, currentTrip, 'GET'));
          probeCount = ruledReplyCount(probe.body) ?? 0;
          storedApp = latestStoredAppTurn(probe.body);
          storedReplyGrew = Boolean(storedApp?.text) && (
            storedAppTurnChanged(probe.body, seenApp, { ruledOnly: false })
            || (!historyWindowFull(probe.body) && probeCount > seen)
          );
          probes.push({
            kind: 'probe',
            attempt: attempt + 1,
            delay_ms: probeDelays[attempt],
            offset_ms: Math.max(0, Date.now() - turnStarted),
            status: probe.status,
            wall_ms: probe.wall_ms,
            stored_reply: Boolean(storedReplyGrew && storedApp?.text),
          });
          if (storedReplyGrew && storedApp?.text) break;
        }
        if (storedReplyGrew && storedApp?.text) {
          rescuedTurns.push({
            n: index + 1,
            http_status: failedSent.status,
            post_wall_ms: draft.wall_ms + (final === draft ? 0 : final.wall_ms),
            timeout: timeoutLikeFailure(failedSent.status, failedSent.body),
            probe_attempts: probes.length,
            app_turn_index: storedApp.turnIndex || null,
            probes: probes.map((row) => ({ ...row })),
          });
          timings[timings.length - 1].rescued_by_probe = probes.length;
        }
        if (storedReplyGrew && storedApp?.text) {
          seen = historyWindowFull(probe.body) ? Math.max(seen + 1, probeCount) : probeCount;
          seenRuledApp = latestStoredAppTurn(probe.body, { ruledOnly: true }) || seenRuledApp;
          seenApp = storedApp;
          items = Math.max(items, itineraryCount(probe.body));
          shareToken = tripFields(probe.body).shareToken || shareToken;
          if (tripFields(probe.body).tripId) currentTrip = tripFields(probe.body).tripId;
          lastReply = storedApp.text;
          travelSummary = probe.body?.travelSummary ?? draft.body?.travelSummary ?? travelSummary;
          const isFallback = isPlanningFallbackTurn(storedApp.text, storedApp);
          customerTurns.push({ role: 'app', text: storedApp.text, model: storedApp.model, cost: storedApp.cost, planningFallback: isFallback });
          if (afterCustomerTurn && index < 5) {
            await afterCustomerTurn({ tripId: currentTrip, turn: index + 1, text: turn.text, webAccessToken });
          }
          if (isFallback) {
            planningFallbackTurns.push(storedApp.turnIndex || (index + 1));
            consecutiveFallbacks += 1;
            if (consecutiveFallbacks >= PLANNING_FALLBACK_ABORT_LIMIT) {
              return finish('planning-fallback-x3', { timings, storedTurns: seen, itineraryCount: items, tripId: currentTrip, shareToken, detail: '3 consecutive planning fallback replies', customerTurns });
            }
          } else {
            consecutiveFallbacks = 0;
          }
          const reachedAfterStored = chatGoalsReached({ itineraryCount: items, customerTurns, index, maxTurns: limit });
          if (liveCustomer && reachedAfterStored.done && (!afterCustomerTurn || index + 1 >= 5)) break;
          continue;
        }
      }
      if (isSpendLimitReason(failure)) {
        const wallBody = classifyAppFailure(final.status, final.body) ? final.body : draft.body;
        return finish(failure, { timings, storedTurns: seen, itineraryCount: items, tripId: currentTrip, shareToken, detail: spendLimitDetail(failure, wallBody), exchange: redactExchangeUrls(exchange), customerTurns });
      }
      return finish(failure, { timings, storedTurns: seen, itineraryCount: items, tripId: currentTrip, shareToken, detail: final.body?.error || draft.body?.error || failure, exchange: failure === 'turn-not-stored' || failure === 'first-intake-reply-flagged' ? exchange : null, customerTurns });
    }
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
        const polledFull = historyWindowFull(history.body);
        if ((!polledFull && (polled == null ? storedTurns(history.body) : polled) > seen)
          || (polled != null && storedAppTurnChanged(history.body, seenRuledApp))) reply = reply || 'stored';
        items = Math.max(items, itineraryCount(history.body));
      }
    }
    const history = await send(appUrl(allowed, token, currentTrip, 'GET'));
    const ruled = ruledReplyCount(history.body);
    const count = ruled == null ? storedTurns(history.body) : ruled;
    items = Math.max(items, itineraryCount(final.body), itineraryCount(draft.body), itineraryCount(history.body));
    shareToken = tripFields(history.body).shareToken || shareToken;
    if (tripFields(history.body).tripId) currentTrip = tripFields(history.body).tripId;
    lastReply = reply || lastReply;
    travelSummary = final.body?.travelSummary ?? history.body?.travelSummary ?? draft.body?.travelSummary ?? travelSummary;
    const replyBody = final.body?.reply ? final.body : draft.body;
    const isFallback = isPlanningFallbackTurn(reply, replyBody);
    customerTurns.push({ role: 'app', text: reply, model: stamp.modelId || stamp.responseModel, cost: final.body?.cost || draft.body?.cost || null, planningFallback: isFallback });
    const upsell = isScriptedProductReply(reply);
    if (reply && !stamp.modelId && !stamp.responseModel && !upsell && !isFallback) {
      return finish('reply-not-from-rules', { timings, storedTurns: count, itineraryCount: items, tripId: currentTrip, shareToken, detail: 'scripted line reply had no modelId from vacation-app-reply-rules', customerTurns });
    }
    const windowFull = historyWindowFull(history.body);
    const countGrew = ruled != null ? count > seen : (!Array.isArray(history.body?.turns) || count > seen);
    const identityStored = ruled != null && storedAppTurnChanged(history.body, seenRuledApp, { replyBody });
    const storedGrew = identityStored || (!windowFull && countGrew);
    if (!reply || !storedGrew) {
      if (!reply || (!upsell && !isFallback)) {
        return finish('reply-not-stored', { timings, storedTurns: windowFull ? seen : count, itineraryCount: items, tripId: currentTrip, shareToken, detail: 'scripted line produced no stored reply', customerTurns });
      }
    } else {
      seen = windowFull ? Math.max(seen + 1, count) : (ruled != null ? count : seen + 1);
    }
    seenRuledApp = latestStoredAppTurn(history.body, { ruledOnly: true }) || seenRuledApp;
    seenApp = latestStoredAppTurn(history.body) || seenApp;
    if (afterCustomerTurn && index < 5) {
      await afterCustomerTurn({ tripId: currentTrip, turn: index + 1, text: turn.text, webAccessToken });
    }
    if (isFallback) {
      const fallbackTurnIndex = Number(replyBody?.appTurnIndex || latestStoredAppTurn(history.body)?.turnIndex) || (index + 1);
      planningFallbackTurns.push(fallbackTurnIndex);
      consecutiveFallbacks += 1;
      if (consecutiveFallbacks >= PLANNING_FALLBACK_ABORT_LIMIT) {
        return finish('planning-fallback-x3', { timings, storedTurns: seen, itineraryCount: items, tripId: currentTrip, shareToken, detail: '3 consecutive planning fallback replies', customerTurns });
      }
    } else {
      consecutiveFallbacks = 0;
    }
    const reached = chatGoalsReached({ itineraryCount: items, customerTurns, index, maxTurns: limit });
    if (liveCustomer && reached.done && (!afterCustomerTurn || index + 1 >= 5)) break;
  }
  if (liveCustomer && items === 0) {
    const confirm = {
      speaker: persona.name,
      modality: 'text',
      text: 'Yes, please import or save that plan onto our itinerary. Give my family edit access to the website. Do not set up booking.',
    };
    endpoint = appUrl(allowed, token, currentTrip, 'POST');
    const draft = await send(endpoint, buildTurnPayload(confirm, currentTrip));
    const final = draft.body?.status === 'interim' ? await send(endpoint, { action: 'finish-rewrite', tripId: currentTrip }) : draft;
    if (waitMs > 0) {
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        await new Promise((resolve) => { setTimeout(resolve, 250); });
        const history = await send(appUrl(allowed, token, currentTrip, 'GET'));
        items = Math.max(items, itineraryCount(history.body), itineraryCount(final.body), itineraryCount(draft.body));
        if (items > 0) break;
      }
    } else {
      const history = await send(appUrl(allowed, token, currentTrip, 'GET'));
      items = Math.max(items, itineraryCount(history.body), itineraryCount(final.body), itineraryCount(draft.body));
    }
  }
  const end = await send(versionUrl);
  const customerTurnCount = customerTurns.filter((turn) => turn.role === 'customer').length;
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
    customerTurns,
    survey: liveCustomer ? tripSurvey(persona, customerTurns) : null,
    qaRating: 'slot',
    webAccessCookie: Boolean(webAccessToken),
    customerTurnCount,
    pricingReactionCaptured: pricingReactionCaptured(customerTurns),
    planningFallbacks: fallbackSummary(),
    rescuedTimeouts: rescuedSummary(),
    hitTurnCap: liveCustomer && customerTurnCount >= limit,
  };
}

import { boundedAwait } from './bounded-await.mjs';
import { datedMentions } from './live-app-turn.mjs';

export const VERCEL_FUNCTION_LIMIT_MS = 60_000;
export const DEFAULT_TURN_POST_BUDGET_MS = 45_000;
const DEFAULT_POST_REPLY_RESERVE_MS = 3_000;
const DEFAULT_MIN_SEARCH_SLICE_MS = 1_500;
export const DEFAULT_ACTIVITY_COMMIT_TIMEOUT_MS = 8_000;
const DEFAULT_PLACE_REFRESH_UNTOUCHED_MAX = 12;
const DEFAULT_PLACE_REFRESH_UNTOUCHED_SLICE_MS = 12_000;
const CHAT_PLACE_REFRESH_JOB_TYPE = 'chat_place_refresh';

function positiveIntFromEnv(env, key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env?.[key];
  if (raw == null || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function placeRefreshUntouchedMax(env = process.env) {
  return positiveIntFromEnv(env, 'VK_TURN_REFRESH_UNTOUCHED_MAX', DEFAULT_PLACE_REFRESH_UNTOUCHED_MAX, { min: 0, max: 100 });
}

export function placeRefreshUntouchedSliceMs(env = process.env) {
  return positiveIntFromEnv(env, 'VK_TURN_REFRESH_UNTOUCHED_SLICE_MS', DEFAULT_PLACE_REFRESH_UNTOUCHED_SLICE_MS, { min: 0, max: 40_000 });
}

function attemptedAtMs(thing) {
  const raw = thing?.metadata?.placeRefreshAttemptedAt;
  const ms = raw ? Date.parse(String(raw)) : NaN;
  return Number.isFinite(ms) ? ms : -Infinity;
}

export function orderPlaceRefreshRotation(things = []) {
  return (Array.isArray(things) ? things : [])
    .map((thing, index) => ({ thing, index, at: attemptedAtMs(thing) }))
    .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at - b.at))
    .map((row) => row.thing);
}

export function turnPostBudgetMs(env = process.env, explicitMs = null) {
  const explicit = Number(explicitMs);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(Math.max(100, Math.round(explicit)), VERCEL_FUNCTION_LIMIT_MS - 5_000);
  }
  const fromEnv = Number(env?.VK_TURN_POST_BUDGET_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(Math.max(500, Math.round(fromEnv)), VERCEL_FUNCTION_LIMIT_MS - 5_000);
  }
  return DEFAULT_TURN_POST_BUDGET_MS;
}

export function createTurnPostBudget({
  startedAt = Date.now(),
  budgetMs = null,
  reserveMs = null,
  minSearchSliceMs = null,
  env = process.env,
} = {}) {
  const start = Number(startedAt) > 0 && Number.isFinite(Number(startedAt)) ? Number(startedAt) : Date.now();
  const totalBudgetMs = turnPostBudgetMs(env, budgetMs);
  const finalizeReserveMs = reserveMs != null && Number.isFinite(Number(reserveMs))
    ? Math.max(0, Math.min(Math.round(Number(reserveMs)), Math.floor(totalBudgetMs * 0.5)))
    : Math.min(DEFAULT_POST_REPLY_RESERVE_MS, Math.floor(totalBudgetMs * 0.15));
  const maxEnrichmentMs = Math.max(0, totalBudgetMs - finalizeReserveMs);
  const minSliceMs = minSearchSliceMs != null && Number.isFinite(Number(minSearchSliceMs))
    ? Math.max(25, Math.round(Number(minSearchSliceMs)))
    : Math.min(DEFAULT_MIN_SEARCH_SLICE_MS, Math.max(50, Math.floor(maxEnrichmentMs * 0.2)));
  const deadlineMs = start + totalBudgetMs;
  const enrichmentDeadlineMs = start + maxEnrichmentMs;

  const elapsedMs = (now = Date.now()) => Math.max(0, now - start);
  const remainingMs = (now = Date.now()) => Math.max(0, deadlineMs - now);
  const enrichmentRemainingMs = (now = Date.now()) => Math.max(0, enrichmentDeadlineMs - now);
  const hasEnrichmentBudget = (minMs = minSliceMs, now = Date.now()) => enrichmentRemainingMs(now) >= Math.max(1, Number(minMs) || 1);
  const stepTimeoutMs = (capMs, now = Date.now()) => {
    const cap = Number.isFinite(Number(capMs)) && Number(capMs) > 0 ? Number(capMs) : maxEnrichmentMs;
    return Math.max(0, Math.min(cap, enrichmentRemainingMs(now)));
  };

  return {
    startedAt: start,
    totalBudgetMs,
    finalizeReserveMs,
    minSliceMs,
    deadlineMs,
    enrichmentDeadlineMs,
    elapsedMs,
    remainingMs,
    enrichmentRemainingMs,
    hasEnrichmentBudget,
    stepTimeoutMs,
    snapshot(now = Date.now()) {
      return {
        totalBudgetMs,
        finalizeReserveMs,
        elapsedMs: elapsedMs(now),
        remainingMs: remainingMs(now),
        enrichmentRemainingMs: enrichmentRemainingMs(now),
      };
    },
  };
}

export function wrapBoundedPlaceSearch(searchImpl, budget, { onDeferred = null } = {}) {
  if (typeof searchImpl !== 'function' || !budget) return searchImpl;
  return async (args = {}) => {
    const remaining = budget.enrichmentRemainingMs();
    const label = String(args?.relevanceTarget || args?.propertyName || args?.queries?.[0]?.target || '').trim();
    if (remaining < budget.minSliceMs) {
      onDeferred?.({ title: label, reason: 'budget_exhausted', remainingMs: remaining });
      return {
        places: [],
        outcomeStatus: 'budget_deferred',
        deferred: true,
        reason: 'budget_exhausted',
        providers: [],
      };
    }
    return boundedAwait(
      (async () => searchImpl(args))(),
      remaining,
      () => {
        onDeferred?.({ title: label, reason: 'search_budget_timeout', remainingMs: 0 });
        return {
          places: [],
          outcomeStatus: 'budget_deferred',
          deferred: true,
          reason: 'search_budget_timeout',
          providers: [],
        };
      },
    );
  };
}

export function wrapBoundedFetch(fetchImpl, budget) {
  if (typeof fetchImpl !== 'function' || !budget) return fetchImpl;
  return async (url, init = {}) => {
    const remaining = budget.enrichmentRemainingMs();
    if (remaining < 50) {
      const error = new Error('turn post budget exhausted before fetch');
      error.name = 'AbortError';
      error.code = 'turn_post_budget_exhausted';
      throw error;
    }
    let signal = init?.signal;
    try {
      const timeoutSignal = AbortSignal.timeout(remaining);
      signal = signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeoutSignal])
        : (signal || timeoutSignal);
    } catch {
      signal = init?.signal;
    }
    const nextInit = { ...init, ...(signal ? { signal } : {}) };
    const result = await boundedAwait(
      (async () => fetchImpl(url, nextInit))(),
      remaining + 25,
      () => ({ __budgetTimedOut: true }),
    );
    if (result?.__budgetTimedOut) {
      const error = new Error('turn post budget exceeded during fetch');
      error.name = 'TimeoutError';
      error.code = 'turn_post_budget_exhausted';
      throw error;
    }
    return result;
  };
}

function unsupportedTestSql(error) {
  return /Unhandled test SQL|unexpected sql/i.test(String(error?.message || error || ''));
}

export async function recordDeferredPlaceRefresh(db, {
  tripId,
  requestId = null,
  destinationHint = '',
  deferredThings = [],
  untouchedUnresolved = [],
  deferredSteps = [],
  reason = 'turn_post_budget',
} = {}) {
  const fromThisTurn = Array.isArray(deferredThings) ? deferredThings.filter(Boolean) : [];
  const untouched = Array.isArray(untouchedUnresolved) ? untouchedUnresolved.filter(Boolean) : [];
  const steps = [...new Set((Array.isArray(deferredSteps) ? deferredSteps : []).map((s) => String(s || '').trim()).filter(Boolean))];
  if (!fromThisTurn.length && !untouched.length && !steps.length) {
    return {
      deferred: false,
      reason: null,
      deferredThisTurnCount: 0,
      untouchedUnresolvedCount: 0,
      totalPendingCount: 0,
      thingIds: [],
      titles: [],
      deferredSteps: [],
      workerJobId: null,
    };
  }

  const thingIds = [];
  const seenIds = new Set();
  const titles = [];
  const seenTitles = new Set();
  for (const item of [...fromThisTurn, ...untouched]) {
    const id = String(item?.thingId || item?.id || '').trim();
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      thingIds.push(id);
    }
    const title = String(item?.title || '').trim();
    const key = title.toLowerCase();
    if (title && !seenTitles.has(key)) {
      seenTitles.add(key);
      titles.push(title);
    }
  }

  const recordedAt = new Date().toISOString();
  const jobInput = {
    tripId: tripId || null,
    requestId: requestId || null,
    destinationHint: String(destinationHint || '').trim(),
    thingIds: thingIds.slice(0, 100),
    titles: titles.slice(0, 50),
    deferredThisTurnCount: fromThisTurn.length,
    untouchedUnresolvedCount: untouched.length,
    deferredSteps: steps,
    reason,
    recordedAt,
  };

  let workerJobId = null;
  if (typeof db === 'function' && tripId) {
    try {
      const existing = await db`
        select id, input
        from worker_jobs
        where trip_id = ${tripId}
          and job_type = ${CHAT_PLACE_REFRESH_JOB_TYPE}
          and status in ('pending', 'retry')
        order by created_at desc
        limit 1
      `;
      if (existing?.[0]?.id) {
        const prevInput = existing[0].input && typeof existing[0].input === 'object' ? existing[0].input : {};
        await db`
          update worker_jobs
          set input = ${{ ...prevInput, ...jobInput }},
              updated_at = now()
          where id = ${existing[0].id}
        `;
        workerJobId = String(existing[0].id);
      } else {
        const inserted = await db`
          insert into worker_jobs (request_id, trip_id, job_type, priority, input)
          values (${null}, ${tripId}, ${CHAT_PLACE_REFRESH_JOB_TYPE}, ${200}, ${jobInput})
          returning id
        `;
        if (inserted?.[0]?.id) workerJobId = String(inserted[0].id);
      }
    } catch (error) {
      if (!unsupportedTestSql(error)) {
        console.error('deferred_place_refresh_worker_job_failed', String(error?.message || error).slice(0, 240));
      }
    }

    try {
      await db`
        update trips
        set metadata = coalesce(metadata, '{}'::jsonb) || ${{
          deferredPlaceRefresh: {
            pending: true,
            reason,
            deferredThisTurnCount: fromThisTurn.length,
            untouchedUnresolvedCount: untouched.length,
            totalPendingCount: Math.max(thingIds.length, titles.length),
            thingIds: jobInput.thingIds,
            titles: jobInput.titles,
            deferredSteps: steps,
            workerJobId,
            updatedAt: recordedAt,
          },
        }},
            updated_at = now()
        where id = ${tripId}
      `;
    } catch (error) {
      if (!unsupportedTestSql(error)) {
        console.error('deferred_place_refresh_trip_meta_failed', String(error?.message || error).slice(0, 240));
      }
    }
  }

  return {
    deferred: true,
    reason,
    deferredThisTurnCount: fromThisTurn.length,
    untouchedUnresolvedCount: untouched.length,
    totalPendingCount: Math.max(thingIds.length, titles.length),
    thingIds: jobInput.thingIds,
    titles: jobInput.titles,
    deferredSteps: steps,
    workerJobId,
    recordedAt,
  };
}

export async function clearDeferredPlaceRefresh(db, tripId) {
  if (typeof db !== 'function' || !tripId) return;
  try {
    await db`
      update trips
      set metadata = coalesce(metadata, '{}'::jsonb) || ${{
        deferredPlaceRefresh: { pending: false, totalPendingCount: 0, thingIds: [], titles: [], updatedAt: new Date().toISOString() },
      }},
          updated_at = now()
      where id = ${tripId}
        and metadata->'deferredPlaceRefresh'->>'pending' = 'true'
    `;
  } catch (error) {
    if (!unsupportedTestSql(error)) {
      console.error('deferred_place_refresh_clear_failed', String(error?.message || error).slice(0, 240));
    }
  }
}

function commitSentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function sentenceNamesThing(title, sentence) {
  const name = String(title || '').trim();
  if (name.length < 2) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(String(sentence || ''));
}

export function needsActivityCommitDecisions(things, text) {
  const list = Array.isArray(things) ? things : [];
  if (!list.length) return false;
  return commitSentences(text).some((sentence) => datedMentions(sentence).length > 0
    && list.some((thing) => sentenceNamesThing(thing?.title, sentence)));
}

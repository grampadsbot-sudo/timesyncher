import { boundedAwait } from './bounded-await.mjs';
import {
  isChatIntakeGeocodableThing,
  refreshUnresolvedChatIntakePlaces,
  rowNeedsPlaceSearch,
  unresolvedChatIntakePlaceThing,
} from './chat-intake-place-persist.mjs';
import { searchIntakeLodgingPlaces } from './intake-lodging-search.mjs';
import { searchPlaces } from './place-search.mjs';
import { insertIntakeTripThingRow, insertTripThing } from './trip-things.mjs';
import {
  DEFAULT_ACTIVITY_COMMIT_TIMEOUT_MS,
  clearDeferredPlaceRefresh,
  createTurnPostBudget,
  needsActivityCommitDecisions,
  orderPlaceRefreshRotation,
  placeRefreshUntouchedMax,
  placeRefreshUntouchedSliceMs,
  recordDeferredPlaceRefresh,
  wrapBoundedFetch,
  wrapBoundedPlaceSearch,
} from './turn-post-budget.mjs';

export const POST_STEP_SKIPPED = Symbol('post_step_skipped');

export async function boundedPostStep(run, postStartedMs, { capMs = 2000, env = process.env } = {}) {
  const budget = createTurnPostBudget({ startedAt: postStartedMs, env });
  const remaining = budget.remainingMs();
  if (remaining <= 200) return POST_STEP_SKIPPED;
  const pending = (async () => run())();
  return boundedAwait(pending, Math.min(capMs, remaining), () => POST_STEP_SKIPPED);
}

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function timeoutLike(error) {
  return /timeout|abort|budget/i.test(`${error?.name || ''} ${error?.message || ''}`);
}

export function createPostReplyWork({
  db,
  tripId,
  requestId = null,
  postStartedMs = null,
  postBudgetMs = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const startedAt = Date.now();
  const budget = createTurnPostBudget({
    startedAt: Number(postStartedMs) > 0 ? Number(postStartedMs) : startedAt,
    budgetMs: postBudgetMs,
    env,
  });
  const timings = {
    activityCommitsMs: 0,
    placeRefreshMs: 0,
    placeRefreshAttempted: 0,
    placeRefreshUntouchedAttempted: 0,
    placeRefreshUnresolvedTotal: 0,
    deferredRecordMs: 0,
    totalMs: 0,
    budgetMs: budget.totalBudgetMs,
    startedAfterPostMs: budget.elapsedMs(startedAt),
  };
  const deferredThings = [];
  const deferredSteps = [];
  const untouchedLeft = [];
  const changedThings = [];
  let untouchedAttempted = 0;
  const boundedFetch = wrapBoundedFetch(fetchImpl, budget);

  const deferThing = (entry, reason) => deferredThings.push({ thingId: entry.thingId || null, title: entry.title, category: entry.category || 'activity', reason });

  async function insertDeferred({ title, category, description = '', metadata = {}, startsAt = null }) {
    const unresolved = unresolvedChatIntakePlaceThing({
      title,
      category,
      description,
      metadata: { ...metadata, source: metadata?.source, placeRefreshDeferred: true },
      startsAt,
    });
    const written = unresolved ? await insertTripThing(db, { tripId, requestId, thing: unresolved, env }) : null;
    return written?.id || null;
  }

  async function insertThing(conn, args = {}) {
    const category = args.category || 'activity';
    const needsSearch = Boolean(cleanTitle(args.destinationHint)) && isChatIntakeGeocodableThing({ category });
    if (needsSearch && !budget.hasEnrichmentBudget()) {
      const id = await insertDeferred(args);
      deferThing({ thingId: id, title: args.title, category }, 'budget_exhausted');
      return id;
    }
    let deferred = false;
    const searchPlacesImpl = wrapBoundedPlaceSearch(args.searchPlacesImpl || searchPlaces, budget, { onDeferred: () => { deferred = true; } });
    const id = await insertIntakeTripThingRow(conn, { ...args, searchPlacesImpl, fetchImpl: wrapBoundedFetch(args.fetchImpl || fetchImpl, budget) });
    if (deferred) deferThing({ thingId: id, title: args.title, category }, 'search_budget_timeout');
    return id;
  }

  function lodgingSearch(searchImpl) {
    return wrapBoundedPlaceSearch(searchImpl || searchIntakeLodgingPlaces, budget, {
      onDeferred: (info) => deferThing({ title: info.title, category: 'hotel' }, info.reason),
    });
  }

  function lodging(persistFn) {
    return async (conn, id, reqId, lodgingWanted, options = {}) => {
      if (budget.hasEnrichmentBudget()) {
        return persistFn(conn, id, reqId, lodgingWanted, {
          ...options,
          fetchImpl: wrapBoundedFetch(options.fetchImpl || fetchImpl, budget),
          searchImpl: lodgingSearch(options.searchImpl),
        });
      }
      const have = new Set((options.existingThings || []).map((item) => cleanTitle(item?.title).toLowerCase()));
      for (const stay of Array.isArray(lodgingWanted) ? lodgingWanted : []) {
        const title = cleanTitle(stay?.name || stay?.title);
        if (!title || have.has(title.toLowerCase())) continue;
        have.add(title.toLowerCase());
        const thingId = await insertDeferred({ title, category: 'hotel', metadata: { source: 'chat_extraction' } });
        deferThing({ thingId, title, category: 'hotel' }, 'budget_exhausted');
      }
      return { saved: [], misses: [], lookups: [], lodgingOutcome: null };
    };
  }

  async function activityCommits(things, text, commitFn, understanding) {
    const started = Date.now();
    try {
      if (!needsActivityCommitDecisions(things, text)) return {};
      if (understanding) return await commitFn(text, { understanding });
      const timeoutMs = Math.min(DEFAULT_ACTIVITY_COMMIT_TIMEOUT_MS, budget.remainingMs() - Math.floor(budget.finalizeReserveMs / 2));
      if (timeoutMs < 200) {
        deferredSteps.push('activity_commit_decisions');
        return { __ask: true, error: 'activity_commit_budget_exhausted' };
      }
      const signal = AbortSignal.timeout(timeoutMs);
      const pending = (async () => commitFn(text, { signal }))();
      const decided = await boundedAwait(pending, timeoutMs, () => ({ __ask: true, __timedOut: true, error: 'activity_commit_budget_timeout' }));
      if (decided?.__timedOut) deferredSteps.push('activity_commit_decisions');
      return decided;
    } catch (error) {
      if (timeoutLike(error)) deferredSteps.push('activity_commit_decisions');
      throw error;
    } finally {
      timings.activityCommitsMs = Date.now() - started;
    }
  }

  function changed(thing, id) {
    changedThings.push({ ...thing, id: thing?.id || id });
    return id;
  }

  async function refreshOne(thing, text, destinationHint, searchBase) {
    let deferred = false;
    await refreshUnresolvedChatIntakePlaces(db, {
      tripId,
      requestId: null,
      text,
      things: [{ ...thing, metadata: { ...(thing.metadata || {}), placeRefreshAttemptedAt: new Date().toISOString() } }],
      destinationHint,
      env,
      fetchImpl: boundedFetch,
      searchImpl: wrapBoundedPlaceSearch(searchBase, budget, { onDeferred: () => { deferred = true; } }),
    });
    return deferred;
  }

  let pendingDestination = '';

  async function refreshPlaces({ text = '', current = [], next = [], destinationHint = '', searchPlacesImpl = null } = {}) {
    const started = Date.now();
    const searchBase = typeof searchPlacesImpl === 'function' ? searchPlacesImpl : searchPlaces;
    pendingDestination = String(destinationHint || '').trim();
    const currentIds = new Set(current.map((thing) => String(thing?.id || '')).filter(Boolean));
    const changedIds = new Set(changedThings.map((thing) => String(thing.id || '')));
    const changedUnresolved = changedThings.filter((thing) => rowNeedsPlaceSearch(thing));
    const untouched = orderPlaceRefreshRotation(next.filter((thing) => {
      const id = String(thing?.id || '');
      return id && currentIds.has(id) && !changedIds.has(id) && rowNeedsPlaceSearch(thing);
    }));
    const untouchedMax = placeRefreshUntouchedMax(env);
    const sliceDeadline = Date.now() + placeRefreshUntouchedSliceMs(env);
    const queue = [...changedUnresolved.map((thing) => ({ thing, isChanged: true })), ...untouched.map((thing) => ({ thing, isChanged: false }))];
    const retried = [];
    let attempted = 0;
    for (const { thing, isChanged } of queue) {
      const entry = { thingId: thing.id || null, title: thing.title, category: thing.category || 'activity' };
      if (!budget.hasEnrichmentBudget()) {
        if (isChanged) deferThing(entry, 'budget_exhausted');
        else untouchedLeft.push(entry);
        continue;
      }
      if (!isChanged && (untouchedAttempted >= untouchedMax || Date.now() >= sliceDeadline)) {
        untouchedLeft.push(entry);
        continue;
      }
      if (!isChanged) untouchedAttempted += 1;
      attempted += 1;
      const deferred = await refreshOne(thing, text, destinationHint, searchBase);
      if (deferred && isChanged) deferThing(entry, 'search_budget_timeout');
      else if (deferred) retried.push(entry);
    }
    untouchedLeft.push(...retried);
    timings.placeRefreshMs = Date.now() - started;
    timings.placeRefreshAttempted = attempted;
    timings.placeRefreshUntouchedAttempted = untouchedAttempted;
    timings.placeRefreshUnresolvedTotal = queue.length;
  }

  async function finish(itinerary) {
    let deferredWork = { deferred: false, deferredThisTurnCount: 0, untouchedUnresolvedCount: 0, totalPendingCount: 0, thingIds: [], titles: [], deferredSteps: [], workerJobId: null };
    const started = Date.now();
    if (deferredThings.length || deferredSteps.length || untouchedLeft.length) {
      deferredWork = await recordDeferredPlaceRefresh(db, {
        tripId,
        requestId,
        destinationHint: pendingDestination,
        deferredThings,
        untouchedUnresolved: untouchedLeft,
        deferredSteps,
        reason: deferredThings.length || deferredSteps.length ? 'turn_post_budget' : 'untouched_unresolved_rotation',
      });
    } else if (untouchedAttempted > 0) {
      await clearDeferredPlaceRefresh(db, tripId);
    }
    timings.deferredRecordMs = Date.now() - started;
    timings.totalMs = Date.now() - startedAt;
    const out = Array.isArray(itinerary) ? itinerary : [];
    out.deferredWork = deferredWork;
    out.postReplyTimings = { ...timings };
    return out;
  }

  return {
    budget,
    timings,
    fetchImpl: boundedFetch,
    insertThing,
    lodging,
    lodgingSearch,
    activityCommits,
    changed,
    refreshPlaces,
    finish,
  };
}

import { firstPassSearchLimit } from './keepsake-list-minimums.mjs';
import { PlaceSearchError } from './place-search-error.mjs';

/** Matches `vercel.json` `api/[...route].mjs` maxDuration (seconds). */
export const VACATION_ITINERARY_ROUTE_MAX_MS = 60_000;

/** Brave/OSM/Nominatim, reply, and gates before/after relevance inside one POST. */
const PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS = 35_000;

const DEFAULT_PER_CALL_TIMEOUT_MS = 20_000;
const DEFAULT_JUDGE_CONCURRENCY = 3;

function envTrimmed(env, key) {
  const raw = env?.[key];
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
}

function parsePositiveIntEnv(env, key, { defaultValue, label }) {
  const text = envTrimmed(env, key);
  if (!text) return defaultValue;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer; got ${JSON.stringify(text)}`);
  }
  return parsed;
}

export function jevRelevanceStageBudgetMs(env = process.env) {
  const routeMax = parsePositiveIntEnv(env, 'VACATION_ITINERARY_ROUTE_MAX_MS', {
    defaultValue: VACATION_ITINERARY_ROUTE_MAX_MS,
    label: 'VACATION_ITINERARY_ROUTE_MAX_MS',
  });
  const reserve = parsePositiveIntEnv(env, 'PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS', {
    defaultValue: PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS,
    label: 'PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS',
  });
  const budget = routeMax - reserve;
  if (budget < 5_000) {
    throw new Error(`relevance stage budget ${budget}ms is too small (route ${routeMax}ms minus reserve ${reserve}ms)`);
  }
  return budget;
}

export function jevRelevanceJudgeTimeoutMs(env = process.env) {
  return parsePositiveIntEnv(env, 'JEV_RELEVANCE_JUDGE_TIMEOUT_MS', {
    defaultValue: DEFAULT_PER_CALL_TIMEOUT_MS,
    label: 'JEV_RELEVANCE_JUDGE_TIMEOUT_MS',
  });
}

export function jevRelevanceJudgeConcurrency(env = process.env) {
  return parsePositiveIntEnv(env, 'JEV_RELEVANCE_JUDGE_CONCURRENCY', {
    defaultValue: DEFAULT_JUDGE_CONCURRENCY,
    label: 'JEV_RELEVANCE_JUDGE_CONCURRENCY',
  });
}

function rowCategoryKey(row) {
  return String(row?.category || '').trim().toLowerCase();
}

const RELEVANCE_JUDGE_SOURCE_ORDER = ['brave', 'prior_db', 'osm'];

function relevanceJudgeSourceRank(row) {
  const source = String(row?.source || '').trim();
  const index = RELEVANCE_JUDGE_SOURCE_ORDER.indexOf(source);
  return index === -1 ? RELEVANCE_JUDGE_SOURCE_ORDER.length : index;
}

/** Brave hits must reach Jev before OSM island noise consumes the per-category cap (check 6 / 6b). */
export function orderRowsForRelevanceJudge(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const sourceDelta = relevanceJudgeSourceRank(left) - relevanceJudgeSourceRank(right);
    if (sourceDelta !== 0) return sourceDelta;
    const leftRank = Number(left?.providerRank);
    const rightRank = Number(right?.providerRank);
    const leftOrder = Number.isFinite(leftRank) ? leftRank : 999;
    const rightOrder = Number.isFinite(rightRank) ? rightRank : 999;
    return leftOrder - rightOrder;
  });
}

export function capRowsForRelevanceJudge(rows = [], category = '') {
  const list = orderRowsForRelevanceJudge(rows);
  const judgedPerCategory = new Map();
  const toJudge = [];
  let skipped = 0;
  for (const row of list) {
    const key = rowCategoryKey(row);
    const cap = firstPassSearchLimit(key || category);
    const judged = judgedPerCategory.get(key) ?? 0;
    if (judged < cap) {
      toJudge.push(row);
      judgedPerCategory.set(key, judged + 1);
      continue;
    }
    skipped += 1;
  }
  const judgedCap = firstPassSearchLimit(String(category || '').trim().toLowerCase());
  return {
    toJudge,
    judgedCap,
    totalRows: list.length,
    skipped,
  };
}

export function throwRelevanceStageBudgetExceeded({ elapsedMs, budgetMs, judged, remaining }) {
  throw new PlaceSearchError(
    `Jev relevance stage exceeded ${budgetMs}ms budget after ${elapsedMs}ms (${judged} scored, ${remaining} remaining)`,
    'relevance_judge_failed',
    { judgeTimedOut: true, judgeStageBudgetMs: budgetMs, relevanceStageMs: elapsedMs },
  );
}

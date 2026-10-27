import { recordDossierTracePages } from './dossier-fill-trace.mjs';
import { classifyFillOutcome, namedFillStopFromOutcome } from './thing-fill-states.mjs';
import { createHash } from 'node:crypto';
import { isFlightOrCarOrDecision, placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import { dossierReviewsShouldRunWriter } from './dossier-reviews-rebuild.mjs';
import { commitDossierXaiUsageRun } from './dossier-cost.mjs';
import { braveTopUpFieldsPending, computeDossierFieldCounts } from './thing-evidence-dossier-field-counts.mjs';
import { mergeDossierPages } from './thing-evidence-dossier.mjs';
import { saveThingEvidenceDossier } from './thing-evidence-dossier-store.mjs';
import { dossierRebuildFields } from './thing-dossier-fields.mjs';
import { dossierPresent, dossierPresented, passbPresentedHardTextViolations } from './passb-dossier-presented.mjs';
import { normalizeDossierEvidence } from './dossier-evidence-hydrate.mjs';
import { searchPlaceFromStoredDossier } from './shared-trip-dossier-overlay.mjs';

const NO_OP_TOP_UP_IGNORE = new Set(['coordinates', 'ratings']);

function retryWindow(attempts, step, evidenceHash) {
  const previous = attempts.findLast((row) => row.step === step
    && (!evidenceHash || row.evidenceHash === evidenceHash));
  const count = Math.min(1000000, Math.max(0, Number(previous?.retryCount) || 0));
  return { count, nextEligibleAt: previous?.nextEligibleAt || null,
    cooling: previous?.status === 'failed' && Date.parse(previous.nextEligibleAt) > Date.now() };
}

function nextRetryAt(count) {
  return count < 3 ? null : new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(6, count - 3))).toISOString();
}

export async function prepareOperatorDossierGather(persisted, place, {
  reuseSavedPages, key, env, storeImpl, trace,
} = {}) {
  const unchanged = { persisted, retryEmptyGather: false };
  if (!reuseSavedPages || !persisted) {
    if (trace) trace.gather = { path: 'fresh', gate: persisted ? 'refresh_requested' : 'no_saved_dossier' };
    return unchanged;
  }
  const normalized = normalizeDossierEvidence({ ...persisted }, place, trace);
  recordDossierTracePages(trace, persisted, normalized);
  if (normalized.pages?.length) {
    normalized.emptySource = null;
    const needsText = dossierFillNeedsTextRebuild(normalized, place);
    const retry = retryWindow(normalized.attempts || [], 'operator_presented_text_retry', presentedEvidenceHash(normalized));
    if (trace) trace.gather = { path: 'reuse', gate: needsText ? 'presented_text_retry_due' : 'saved_pages', retry };
    if (needsText && retry.cooling) {
      normalized.captureCheckpoint = 'failed-presented';
      if (trace) trace.gather.gate = 'text_retry_backoff';
      return { ...unchanged, persisted: normalized, presentedFailure: dossierFillHardFailure(normalized, place) };
    }
    return { ...unchanged, persisted: normalized };
  }
  const retry = retryWindow(normalized.attempts || [], 'operator_empty_gather_retry');
  if (trace) trace.gather = { path: retry.cooling ? 'reuse' : 'retry', gate: retry.cooling ? 'empty_gather_backoff' : 'empty_saved_pages', retry };
  if (retry.cooling) return { ...unchanged, persisted: normalized };
  normalized.attempts = [...(normalized.attempts || []), {
    kind: 'gather', step: 'operator_empty_gather_retry', status: 'started',
    retryCount: retry.count + 1, nextEligibleAt: nextRetryAt(retry.count + 1),
    startedAt: new Date().toISOString(),
  }];
  if (key) await saveThingEvidenceDossier(key, normalized, { env, storeImpl });
  return { persisted: normalized, retryEmptyGather: true };
}

function dossierFillTextProblems(dossier = {}, place = {}) {
  if (isFlightOrCarOrDecision(place) && !(dossier.attempts || [])
    .some((row) => ['page', 'brave'].includes(row.kind) && row.status === 'ok')) return [];
  if (dossierPresented(dossier, place)) return [];
  const counts = computeDossierFieldCounts(dossier, place);
  const hydrated = searchPlaceFromStoredDossier(place, dossier);
  return [...new Set([
    ...(!dossierPresent(dossier) ? ['no_gather_attempts'] : []),
    ...['summary', 'description'].filter((key) => counts[key]?.status !== 'ok')
      .map((key) => `${key}:${counts[key]?.status || 'missing'}`),
    ...['summary', 'description'].filter((key) => !hydrated[key])
      .map((key) => `${key}:missing`),
    ...passbPresentedHardTextViolations({
      ...hydrated, sourceRecord: hydrated,
      title: hydrated.title || place.title || place.name,
      category: place.category || place.cat || hydrated.category,
    }),
  ])];
}

export function dossierFillNeedsTextRebuild(dossier = {}, place = {}) {
  return dossierFillTextProblems(dossier, place).length > 0;
}

function presentedEvidenceHash(dossier) {
  const pages = (dossier.pages || []).map(({ url, sha256 }) => [url, sha256]).sort();
  return createHash('sha256').update(JSON.stringify({ pages })).digest('hex');
}

export function recordOperatorDossierTextBuild(dossier, place, startedAt, trace) {
  dossier.attempts = [...(dossier.attempts || []), {
    kind: 'builder', step: 'operator_text_build', status: 'completed',
    startedAt, finishedAt: new Date().toISOString(),
  }];
  const failure = dossierFillHardFailure(dossier, place);
  if (!failure.presentedReasons?.length) return;
  const retry = retryWindow(dossier.attempts || [], 'operator_presented_text_retry', presentedEvidenceHash(dossier));
  dossier.attempts = [...(dossier.attempts || []), {
    kind: 'builder', step: 'operator_presented_text_retry', status: 'failed',
    retryCount: retry.count + 1, nextEligibleAt: nextRetryAt(retry.count + 1),
    blankedBy: trace?.builder.blankedBy || null,
    startedAt: new Date().toISOString(), evidenceHash: presentedEvidenceHash(dossier),
    presentedReasons: failure.presentedReasons,
  }];
  dossier.captureCheckpoint = 'failed-presented';
}

export function dossierFillRebuildFields(persisted = {}, merged = {}, place = {}, {
  maxAgeExpired = false,
  changedUrls = [],
} = {}) {
  const rebuildFields = dossierRebuildFields(persisted, merged, { maxAgeExpired, changedUrls });
  if (dossierFillNeedsTextRebuild(merged, place)) {
    rebuildFields.add('summary');
    rebuildFields.add('description');
  }
  const counts = computeDossierFieldCounts(merged, place);
  if (counts.itineraryNote?.status === 'missing') rebuildFields.add('itineraryNote');
  return rebuildFields;
}

export function dossierEmptyGatherReason(dossier = {}) {
  const attempts = Array.isArray(dossier.attempts) ? dossier.attempts : [];
  if (!attempts.length) return 'no_gather_attempts';
  const terminal = [...new Map(attempts.map((row) => [JSON.stringify([row.kind, row.provider, row.step, row.stage, row.query, row.url]), row])).values()];
  const tavilySearches = terminal.filter((row) => row.provider === 'Tavily' && row.stage === 'search');
  if (tavilySearches.length) {
    const last = tavilySearches.at(-1);
    const brave = terminal.find((row) => row.kind === 'brave' && row.status === 'failed');
    const status = Number(brave?.httpStatus);
    const reason = last.status !== 'ok' ? last.error || 'tavily_request_failed'
      : tavilySearches.some((row) => row.results > 0) ? 'tavily_hits_not_materialized' : 'tavily_zero_hits';
    return `${brave ? status ? `brave_http_${status}` : brave.error || 'brave_request_failed' : 'brave_missing_key'}+${reason}`;
  }
  const searches = terminal.filter((row) => row.kind === 'brave');
  const errors = terminal.filter((row) => row.status === 'failed' && (row.kind === 'brave' || /tavily/i.test(row.provider || row.via || '')));
  const lastError = errors.at(-1);
  if (lastError) {
    const status = Number(lastError.httpStatus) || Number(String(lastError.error || '').match(/(?:http[_ ]|HTTP\s+)(\d{3})/i)?.[1]);
    if (status) return `${lastError.kind === 'brave' ? 'brave' : 'tavily'}_http_${status}`;
    if (lastError.kind === 'brave') return lastError.error === 'brave_deadline' ? 'brave_deadline' : 'brave_request_failed';
  }
  if (searches.some((row) => Number(row.results) > 0) || dossier.braveResults?.length) return 'brave_hits_not_materialized';
  if (searches.some((row) => row.step === 'web_search' && row.status === 'ok')
    && searches.filter((row) => row.step === 'web_search').every((row) => row.status === 'ok' && Number(row.results) === 0)) return 'brave_zero_hits';
  if (searches.some((row) => row.status === 'missing_key')) return 'brave_missing_key';
  if (searches.some((row) => row.status === 'no_match')) return 'brave_no_match';
  return 'gather_no_pages';
}

export function dossierPersistedFillIsNoOp(persisted = {}, merged = {}, place = {}, {
  changedUrls = [],
} = {}) {
  if (!persisted?.pages?.length || !merged?.pages?.length) return false;
  if (persisted.emptySource || merged.emptySource) return false;
  if (dossierFillNeedsTextRebuild(persisted, place) || dossierFillNeedsTextRebuild(merged, place)) return false;
  const rebuildFields = dossierFillRebuildFields(persisted, merged, place, { maxAgeExpired: false, changedUrls });
  const needsWriter = placeSupportsDossierReviews(place)
    && dossierReviewsShouldRunWriter(persisted, merged, place);
  const pendingTopUp = braveTopUpFieldsPending(merged, place)
    .filter((field) => !NO_OP_TOP_UP_IGNORE.has(field));
  const skipBuilder = rebuildFields.size === 0
    && persisted.fields
    && Object.keys(persisted.fields).length > 0;
  return !needsWriter && skipBuilder && pendingTopUp.length === 0;
}

export function dossierFillHardFailure(dossier = {}, place = {}, {
  deployment = 'tip',
  hold,
} = {}) {
  if (!dossier.pages?.length) {
    const emptySource = dossier.emptySource || dossierEmptyGatherReason(dossier);
    const outcome = classifyFillOutcome(dossier, place, {
      deployment, hold, emptySource,
    });
    const stopReason = namedFillStopFromOutcome(outcome) || emptySource;
    return { failed: true, status: 'failed', error: stopReason, emptySource };
  }
  if (dossier.emptySource) {
    const outcome = classifyFillOutcome(dossier, place, {
      deployment, hold, emptySource: dossier.emptySource,
    });
    const stopReason = namedFillStopFromOutcome(outcome) || dossier.emptySource;
    return { failed: true, status: 'failed', error: stopReason, emptySource: dossier.emptySource };
  }
  const presentedReasons = dossierFillTextProblems(dossier, place);
  if (!presentedReasons.length) return {};
  const hardFailure = { presentedReasons };
  const outcome = classifyFillOutcome(dossier, place, { deployment, hold, hardFailure });
  const stopReason = namedFillStopFromOutcome(outcome) || 'presented_fields_not_ok';
  return {
    failed: true,
    status: 'failed',
    error: stopReason,
    presentedReasons,
  };
}

export async function saveResumablePartial(merged, persisted, {
  key, env, storeImpl, place, checkpoint, rateLimitStep,
} = {}) {
  const next = mergeDossierPages(persisted || {}, merged || {});
  next.captureCheckpoint = checkpoint || next.captureCheckpoint || 'partial-xai';
  if (rateLimitStep) next.captureRateLimitStep = rateLimitStep;
  commitDossierXaiUsageRun(next, persisted || {}, {
    kind: 'partial-xai',
    placeId: place.id ?? place.placeId,
    rateLimitStep: rateLimitStep || undefined,
  });
  if (key && next) await saveThingEvidenceDossier(key, next, { env, storeImpl });
  return {
    payload: {},
    structuredText: '',
    partial: true,
    resumable: true,
    rateLimited: Boolean(rateLimitStep),
    rateLimitStep: rateLimitStep || undefined,
    checkpoint: next.captureCheckpoint,
    parsed: { evidenceDossier: next },
  };
}

export async function saveFailedDossierAttempt(persisted, merged, {
  key, env, storeImpl, place, error, checkpoint,
} = {}) {
  const next = mergeDossierPages(persisted || {}, merged || {});
  const step = error?.step || error?.upstream?.step || 'builder';
  const attempt = {
    kind: step,
    status: 'failed',
    at: new Date().toISOString(),
    httpStatus: Number(error?.status || error?.upstream?.status) || undefined,
    error: String(error?.message || 'dossier_step_failed').slice(0, 120),
  };
  if (error?.upstream) attempt.upstream = error.upstream;
  next.attempts = [...(next.attempts || []), attempt];
  next.captureCheckpoint = checkpoint || next.captureCheckpoint || `failed-${step}`;
  commitDossierXaiUsageRun(next, persisted || {}, {
    kind: 'failed-xai',
    placeId: place.id ?? place.placeId,
    rateLimitStep: step,
  });
  if (key) await saveThingEvidenceDossier(key, next, { env, storeImpl });
  return {
    payload: {},
    structuredText: '',
    partial: true,
    failed: true,
    upstream: error?.upstream || undefined,
    checkpoint: next.captureCheckpoint,
    parsed: { evidenceDossier: next },
  };
}

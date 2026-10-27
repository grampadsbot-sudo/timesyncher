import { z } from 'zod';

import { dossierPresent, dossierPresented } from './passb-dossier-presented.mjs';

export const fillDeploymentLabelSchema = z.enum(['tip', 'live']);

const thingHoldLabelSchema = z.enum([
  'hold:parked',
  'hold:skip',
  'hold:ready',
  'hold:blocked',
  'hold:eggbot-decision',
]);

const dossierPresenceSchema = z.enum(['absent', 'present', 'presented']);

const providerHttpOutcomeSchema = z.enum([
  'provider_http_402',
  'provider_http_403',
  'provider_http_401',
  'provider_http_429',
  'provider_http_other',
]);

const fillOutcomeKindSchema = z.enum([
  'pages_saved',
  'text_empty',
  'presented_ok',
  'gather_failed',
  'provider_payment_required',
  'provider_forbidden',
  'provider_error',
  'presented_fields_not_ok',
  'silent_done_blocked',
]);

export const fillOutcomeSchema = z.object({
  kind: fillOutcomeKindSchema,
  stopReason: z.string().min(1),
  deployment: fillDeploymentLabelSchema.optional(),
  hold: thingHoldLabelSchema.optional(),
  presence: dossierPresenceSchema.optional(),
  providerHttp: providerHttpOutcomeSchema.optional(),
});

const HTTP_OUTCOME_MAP = new Map([
  [402, 'provider_http_402'],
  [403, 'provider_http_403'],
  [401, 'provider_http_401'],
  [429, 'provider_http_429'],
]);

function dossierPresenceState(dossier, place) {
  if (!dossier) return 'absent';
  if (dossierPresented(dossier, place)) return 'presented';
  if (dossierPresent(dossier)) return 'present';
  return 'absent';
}

export function providerHttpOutcomeFromGatherReason(reason = '') {
  const text = String(reason || '');
  const match = text.match(/_http_(\d{3})/i) || text.match(/http[_ ](\d{3})/i);
  const status = match ? Number(match[1]) : 0;
  if (!status) return undefined;
  if (HTTP_OUTCOME_MAP.has(status)) return HTTP_OUTCOME_MAP.get(status);
  return 'provider_http_other';
}

function fillOutcomeKindFromGatherReason(reason = '', httpOutcome) {
  if (httpOutcome === 'provider_http_402') return 'provider_payment_required';
  if (httpOutcome === 'provider_http_403') return 'provider_forbidden';
  if (httpOutcome) return 'provider_error';
  if (reason === 'gather_no_pages') return 'gather_failed';
  return 'gather_failed';
}

export function classifyFillOutcome(dossier = {}, place = {}, {
  deployment = 'tip',
  hold,
  hardFailure = null,
  emptySource = '',
} = {}) {
  const presence = dossierPresenceState(dossier, place);
  if (presence === 'presented') {
    return fillOutcomeSchema.parse({
      kind: 'presented_ok',
      stopReason: 'presented_fields_ok',
      deployment,
      hold,
      presence,
    });
  }
  const pages = Array.isArray(dossier.pages) ? dossier.pages : [];
  if (pages.length > 0 && hardFailure?.presentedReasons?.length) {
    const textEmpty = hardFailure.presentedReasons.some((row) => /:missing|:blank|text_empty/i.test(String(row)));
    return fillOutcomeSchema.parse({
      kind: textEmpty ? 'text_empty' : 'presented_fields_not_ok',
      stopReason: textEmpty ? 'presented_text_empty' : 'presented_fields_not_ok',
      deployment,
      hold,
      presence,
    });
  }
  if (pages.length > 0 && presence === 'present') {
    return fillOutcomeSchema.parse({
      kind: 'pages_saved',
      stopReason: 'pages_saved_pending_presented',
      deployment,
      hold,
      presence,
    });
  }
  const gatherReason = String(emptySource || dossier.emptySource || 'gather_no_pages');
  const providerHttp = providerHttpOutcomeFromGatherReason(gatherReason);
  const kind = fillOutcomeKindFromGatherReason(gatherReason, providerHttp);
  return fillOutcomeSchema.parse({
    kind,
    stopReason: gatherReason,
    deployment,
    hold,
    presence,
    providerHttp,
  });
}

export function namedFillStopFromOutcome(outcome) {
  const parsed = fillOutcomeSchema.parse(outcome);
  if (parsed.kind === 'presented_ok') return null;
  return parsed.stopReason;
}

export function assertNoSilentDone(checkpoint, { pagesAdded = 0, needsFill = false } = {}) {
  if (checkpoint !== 'done' || !needsFill || pagesAdded > 0) return null;
  throw Object.assign(new Error('silent_checkpoint_done_pagesAdded_0'), {
    code: 'silent_done_blocked',
    outcome: fillOutcomeSchema.parse({
      kind: 'silent_done_blocked',
      stopReason: 'silent_checkpoint_done_pagesAdded_0',
    }),
  });
}

export function parseThingHoldLabel(raw) {
  return thingHoldLabelSchema.parse(raw);
}

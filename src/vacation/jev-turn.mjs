import { jevQualityRewrite, openRouterChatModelForTier } from '../../scripts/vacation-app-reply-rules.mjs';

export function draftTierForTurn({ intent = null } = {}) {
  const modelTier = intent?.asksPrice === true || intent?.asksAccess === true || intent?.pullsAccess === true ? 4 : 3;
  return {
    jevRan: true,
    via: 'turn-understanding-tier',
    modelTier,
    responseModel: openRouterChatModelForTier(modelTier),
    routeType: null,
    extraContext: { routeType: null },
    jevLatencyMs: 0,
    jevBeforeModel: false,
  };
}

export async function jevTurn({ customerTurn, draft, tripContext = null, planLine = '', session = null, env = process.env } = {}) {
  const tierContext = { stage: 'vacation_conversation', screen: 'vacation-app', session: { seed_id: session?.token || null } };
  const { tier = null, ...quality } = await jevQualityRewrite({ customerTurn, draft, tripContext, planLine, env, purpose: 'jev_turn', tierContext });
  if (!tier) return { jevRan: false, error: quality.reason || 'jev_turn_failed', quality };
  return { jevRan: true, via: tier.via, modelTier: tier.modelTier ?? null, routeType: tier.routeType ?? null, extraContext: tier.extraContext ?? null, quality };
}

export function applyJevTurn(jev, result, judgeMs) {
  if (result?.jevRan) {
    jev.routeType = result.routeType ?? jev.routeType;
    jev.extraContext = { ...(result.extraContext || {}), judgedModelTier: result.modelTier };
    jev.via = result.via ?? jev.via;
    jev.jevLatencyMs = Math.max(0, Number(judgeMs) || 0);
  } else {
    jev.error = result?.error || 'jev_turn_failed';
    jev.jevRan = false;
  }
  return result?.quality;
}

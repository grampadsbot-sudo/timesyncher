import { jevQualityRewrite } from '../../scripts/vacation-app-reply-rules.mjs';

export function unjudgedReply({ rules, jev, model, quality, log, draft }) {
  const reason = quality?.reason || 'quality_not_judged';
  const nextQuality = quality || { judged: false, reason };
  const nextLog = { ...log, draftText: draft, flagged: false, rewriteFailReason: reason };
  return {
    reply: null,
    rules,
    jev,
    model: { ...(model || {}), quality: nextQuality, log: nextLog },
    quality: nextQuality,
    log: nextLog,
    reason,
  };
}

export function claimBlockedReply({ rules, jev, model, quality, draft, claimReason }) {
  return {
    reply: null,
    rules,
    jev,
    model,
    quality,
    reason: 'reply_action_claim_blocked',
    blockedDraft: draft,
    blockedReasons: [claimReason],
  };
}

export function heldJudgedDraft({ shippedDraft, enforceInTurnPlaces, finished, pending, rules, jev }) {
  if (!shippedDraft || enforceInTurnPlaces) return null;
  const judgedDraft = finished?.quality?.judged === true ? finished.quality : (pending?.quality?.judged === true ? pending.quality : null);
  if (judgedDraft) {
    const model = finished.model?.quality?.judged === true ? finished.model : { ...(finished.model || pending.model || {}), quality: judgedDraft };
    return { reply: shippedDraft, rules, jev, model, quality: judgedDraft, log: finished.log, reason: null };
  }
  return {
    reply: null,
    rules,
    jev,
    model: finished?.model,
    quality: finished?.quality || pending?.quality || { judged: false },
    log: finished?.log,
    reason: finished?.reason || pending?.quality?.reason || 'quality_not_judged',
  };
}

export async function requireReplyQuality(produced, { customerTurn = '', env = process.env } = {}) {
  if (!produced?.reply) return produced;
  const already = produced.model?.quality?.judged === true
    ? produced.model.quality
    : (produced.quality?.judged === true ? produced.quality : null);
  if (already) return produced;
  const started = Date.now();
  const quality = await jevQualityRewrite({ customerTurn, draft: produced.reply, env, purpose: 'jev_quality_rewrite' });
  const judgeMs = Math.max(0, Date.now() - started);
  if (quality?.judged !== true) {
    const reason = quality?.reason || 'quality_not_judged';
    return {
      ...produced,
      reply: null,
      quality: quality || { judged: false, reason },
      reason,
      blockedReasons: [reason],
    };
  }
  quality.judgeMs = judgeMs;
  const model = produced.model && typeof produced.model === 'object' ? produced.model : {};
  const latency = model.log?.latencyMs && typeof model.log.latencyMs === 'object' ? model.log.latencyMs : {};
  return {
    ...produced,
    reason: null,
    quality,
    model: {
      ...model,
      quality,
      log: {
        ...(model.log || {}),
        jevScoreDraft: quality.score,
        latencyMs: {
          ...latency,
          jevDraft: judgeMs,
          total: (Number(latency.total) || Number(latency.draft) || Number(model.genLatencyMs) || 0) + judgeMs,
        },
      },
    },
  };
}

export async function applyReplyQuality(produced, { customerTurn = '', env = process.env, previousReply = undefined } = {}) {
  if (!produced || typeof produced !== 'object') return produced;
  if (produced.reply && previousReply !== undefined && produced.reply !== previousReply) {
    produced.quality = null;
    if (produced.model?.quality) produced.model = { ...produced.model, quality: null };
  }
  if (!produced.reply) return produced;
  if (produced.model?.quality?.judged === true || produced.quality?.judged === true) return produced;
  const judged = await requireReplyQuality(produced, { customerTurn, env });
  produced.reply = judged.reply;
  produced.quality = judged.quality;
  produced.model = judged.model;
  produced.reason = judged.reply ? null : judged.reason;
  produced.blockedReasons = judged.blockedReasons || produced.blockedReasons;
  return produced;
}

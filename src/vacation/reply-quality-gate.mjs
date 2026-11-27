import { JEV_QUALITY_MODEL, jevQualityRewrite } from '../../scripts/vacation-app-reply-rules.mjs';

const JEV_CONFIG_REFUSALS = new Set(['quality_credentials_missing', 'quality_decisions_url_required']);

function stripUrls(value) {
  return String(value || '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function shortJevJudgeError(reason) {
  const text = stripUrls(reason);
  return text || 'jev_judge_failed';
}

export function jevJudgeErrored(quality) {
  if (!quality || quality.judged === true) return false;
  const reason = String(quality.reason || '').trim();
  if (JEV_CONFIG_REFUSALS.has(reason)) return false;
  return true;
}

export function failOpenJudgedQuality(quality, judgeMs = 0) {
  const judgeError = shortJevJudgeError(quality?.reason);
  return {
    judged: true,
    judgeFailed: true,
    failOpen: true,
    score: null,
    scoreRaw: null,
    disposition: null,
    comment: null,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    jevFocus: null,
    rewrite: '',
    rewritten: false,
    wantsRewrite: false,
    model: quality?.model || JEV_QUALITY_MODEL,
    judgeError,
    judgeMs: Math.max(0, Number(judgeMs) || 0),
  };
}

function failOpenShippedReply({ rules, jev, model, quality, log, draft, judgeMs = 0 }) {
  const openQuality = failOpenJudgedQuality(quality, judgeMs);
  if (jev && typeof jev === 'object') {
    jev.judgeFailed = true;
    jev.judgeError = openQuality.judgeError;
  }
  const nextLog = { ...log, draftText: draft, flagged: false, rewriteFailReason: '' };
  return {
    reply: draft,
    rules,
    jev,
    model: { ...(model || {}), quality: openQuality, log: nextLog },
    quality: openQuality,
    log: nextLog,
    reason: null,
  };
}

export function failOpenLiveReply({ rules, jev, model, quality, log, draft, judgeMs, draftModel, ship, stamp }) {
  const failOpen = failOpenShippedReply({ rules, jev, model, quality, log, draft, judgeMs });
  const shippedReplyText = ship(draft, { rules, jev });
  if (shippedReplyText?.status) return shippedReplyText;
  const stamped = stamp({ reply: shippedReplyText ?? failOpen.reply, quality: failOpen.quality, draftModel, log: failOpen.log, draft });
  stamped.model.modelTier = model?.modelTier ?? jev?.modelTier ?? null;
  stamped.model.beats = model?.beats || null;
  stamped.model.via = model?.via || stamped.model.via;
  return { reply: stamped.reply, rules, jev, model: stamped.model, quality: stamped.quality, log: stamped.log, reason: null };
}

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
  const judgedDraft = finished?.quality?.judged === true
    ? finished.quality
    : (pending?.quality?.judged === true ? pending.quality : null);
  if (!judgedDraft && jevJudgeErrored(finished?.quality || pending?.quality) && shippedDraft) {
    return failOpenShippedReply({
      rules,
      jev,
      model: finished?.model || pending?.model,
      quality: finished?.quality || pending?.quality,
      log: finished?.log || pending?.log,
      draft: shippedDraft,
      judgeMs: finished?.quality?.judgeMs || pending?.quality?.judgeMs || pending?.qualityJevMs,
    });
  }
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

export async function requireReplyQuality(produced, { customerTurn = '', tripContext = null, env = process.env, judge = null, tripStateContext = null } = {}) {
  if (!produced?.reply) return produced;
  const already = produced.model?.quality?.judged === true
    ? produced.model.quality
    : (produced.quality?.judged === true ? produced.quality : null);
  if (already) return produced;
  const started = Date.now();
  const quality = judge ? await judge() : await jevQualityRewrite({ customerTurn, draft: produced.reply, tripContext, env, purpose: 'jev_quality_rewrite', tripStateContext });
  const judgeMs = Math.max(0, Date.now() - started);
  if (quality?.judged !== true) {
    if (jevJudgeErrored(quality)) {
      const openQuality = failOpenJudgedQuality(quality, judgeMs);
      const model = produced.model && typeof produced.model === 'object' ? produced.model : {};
      const latency = model.log?.latencyMs && typeof model.log.latencyMs === 'object' ? model.log.latencyMs : {};
      return {
        ...produced,
        reason: null,
        quality: openQuality,
        model: {
          ...model,
          quality: openQuality,
          log: {
            ...(model.log || {}),
            latencyMs: {
              ...latency,
              jevDraft: judgeMs,
              total: (Number(latency.total) || Number(latency.draft) || Number(model.genLatencyMs) || 0) + judgeMs,
            },
          },
        },
      };
    }
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

export async function applyReplyQuality(produced, { customerTurn = '', tripContext = null, env = process.env, previousReply = undefined, tripStateContext = null } = {}) {
  if (!produced || typeof produced !== 'object') return produced;
  if (produced.reply && previousReply !== undefined && produced.reply !== previousReply) {
    produced.quality = null;
    if (produced.model?.quality) produced.model = { ...produced.model, quality: null };
  }
  if (!produced.reply) return produced;
  if (produced.model?.quality?.judged === true || produced.quality?.judged === true) return produced;
  const judged = await requireReplyQuality(produced, { customerTurn, tripContext, env, tripStateContext });
  produced.reply = judged.reply;
  produced.quality = judged.quality;
  produced.model = judged.model;
  produced.reason = judged.reply ? null : judged.reason;
  produced.blockedReasons = judged.blockedReasons || produced.blockedReasons;
  return produced;
}

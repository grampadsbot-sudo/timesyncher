import { callTieredModel } from '../../scripts/vacation-app-reply-rules.mjs';
import { sameTierRewriteRequest, splitRewriteChange } from './live-app-turn.mjs';
import { replyActionClaimReason } from './reply-action-claim.mjs';

export async function rewriteBlockedActionClaim({
  draft = '',
  reason = '',
  customerTurn = '',
  customerTurnId = '',
  tripId = '',
  turnActionResults = null,
  replyClaimContext = null,
  jev = null,
  rules = null,
  env = process.env,
  destination = '',
  postIntake = false,
} = {}) {
  const originalText = String(draft || '').trim();
  const blockedReason = String(
    reason || replyActionClaimReason(originalText, turnActionResults, replyClaimContext) || '',
  ).trim();
  console.error(JSON.stringify({
    reason: blockedReason,
    customerTurnId: String(customerTurnId || ''),
    tripId: String(tripId || ''),
    originalText,
  }));
  const request = sameTierRewriteRequest({
    customerTurn,
    draft: originalText,
    failure: blockedReason,
  });
  const called = await callTieredModel({
    rules,
    jev,
    customerTurn: request.customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    destination,
    memory: [],
    upsell: 'forbidden',
    postIntake: postIntake === true,
    env,
    systemExtra: request.systemExtra,
  });
  const modelText = called?.called && called.text ? String(called.text).trim() : '';
  const rewritten = modelText ? String(splitRewriteChange(modelText).reply || '').trim() : '';
  const still = rewritten
    ? replyActionClaimReason(rewritten, turnActionResults, replyClaimContext)
    : (blockedReason || called?.reason || 'rewrite_empty');
  if (rewritten && !still) return { reply: rewritten, model: called, reason: null };
  console.error(JSON.stringify({
    reason: still || called?.reason || 'rewrite_empty',
    customerTurnId: String(customerTurnId || ''),
    tripId: String(tripId || ''),
    originalText,
    rewriteFailed: true,
  }));
  return {
    reply: null,
    model: called?.called ? called : null,
    reason: still || called?.reason || 'rewrite_empty',
  };
}

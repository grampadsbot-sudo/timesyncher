import { callTieredModel, jevPrecall } from '../../scripts/vacation-app-reply-rules.mjs';
import { appTextBanned } from './live-app-turn.mjs';
import { assertCustomerReplyShippable } from './reply-id-citation.mjs';
import { failReplyPlanEntitlement, loadSessionOwnerReplyPlan } from './reply-plan-entitlement.mjs';
import { isCollaboratorAppSeat } from './collaborator-app-seat.mjs';
import { firstIntakeReplyLeak, intakeCustomerName } from './first-intake-reply.mjs';
import { applyTurnInviteReplyFacts } from './turn-invite-reply-facts.mjs';

const FIRST_INTAKE_TONE = [
  'Address the customer in the second person. Use customer_name when it is present, copied verbatim. Do not use a customer id, a session id, or a trip id. Do not speak about the customer in the third person.',
  'Echo dates, weekdays, and names exactly as they appear in the facts or in customer_said. Do not shorten a name. Do not calculate a weekday. If weekday or end_weekday is present, use that weekday.',
  'Do not use a relative month phrase unless when_relative is true. Otherwise say the year.',
  'Tone: warm and plain, with contractions. No sales voice. At most one exclamation point. No emoji.',
  'Say place, activity, or day. Do not use EULA, terms, or seat.',
].join('\n');

export const NO_TRIP_STARTER_INSTRUCTION = [
  'You are writing a reply in the TimeSyncher vacation app before a vacation record exists yet. Write it in your own words. Do not copy this instruction back.',
  'The customer has not given enough detail to start a vacation yet. Ask only for what is still missing to begin planning: where they are going and when.',
  'Use exactly one question.',
  'Do not mention a trip link, shared site, or URL. Do not include /shared/ or any website link.',
  'Do not invent a place, date, lodging, activity, or name.',
  FIRST_INTAKE_TONE,
].join('\n');

function intakeFactText(value, max = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : '';
}

function questionCount(reply) {
  return (String(reply || '').match(/\?/g) || []).length;
}

export function noTripStarterFacts({ customerTurn = '', session = null, ownerPlan = null, turnActionResults = null } = {}) {
  const facts = {
    shape: isCollaboratorAppSeat(session) ? 'no-trip-collaborator' : 'no-trip',
    customer_said: intakeFactText(customerTurn, 1200),
    customer_name: intakeCustomerName(session),
    missing_where: true,
    missing_when: true,
    gaps: ['where', 'when'],
  };
  if (isCollaboratorAppSeat(session)) {
    return applyTurnInviteReplyFacts(facts, turnActionResults);
  }
  if (!ownerPlan || typeof ownerPlan !== 'object') failReplyPlanEntitlement('owner_plan_missing', '');
  facts.plan = {
    purchased_plan: String(ownerPlan.checkout_plan || '').trim(),
    plan_id: String(ownerPlan.plan_id || '').trim(),
    plan_name: String(ownerPlan.plan_name || '').trim(),
    plan_owned: true,
    order_bump_owned: ownerPlan.order_bump_owned === true,
  };
  if (!facts.plan.plan_id || !facts.plan.plan_name) failReplyPlanEntitlement('owner_plan_incomplete', '');
  return applyTurnInviteReplyFacts(facts, turnActionResults);
}

export function noTripReplyBlock(reply, banned = appTextBanned, facts = {}) {
  const reason = banned(reply);
  if (reason && reason !== 'app reply text is empty') return reason;
  const text = String(reply || '').trim();
  if (!text) return '';
  if (/\/shared\//i.test(text)) return 'no_trip_reply_shared_link';
  if (firstIntakeReplyLeak(text)) return 'no_trip_reply_flagged';
  if (facts.shape === 'no-trip' && questionCount(text) !== 1) return 'no_trip_reply_flagged';
  return '';
}

export async function produceNoTripStarterReply({
  customerTurn = '',
  session = null,
  env = process.env,
  rules = null,
  loadOwnerPlan = loadSessionOwnerReplyPlan,
  turnActionResults = null,
} = {}) {
  if (!rules?.ok) {
    return { reply: null, rules, jev: null, model: null, reason: rules?.error || 'reply_rules_unloaded' };
  }
  const jevStarted = Date.now();
  const jev = await jevPrecall({
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    session: { seed_id: session?.token || null },
    env,
  });
  if (jev && typeof jev === 'object') jev.jevLatencyMs = Math.max(0, Date.now() - jevStarted);
  if (!jev?.jevRan) {
    return { reply: null, rules, jev, model: null, reason: jev?.error || 'jev_skipped' };
  }
  jev.jevBeforeModel = true;
  const ownerPlan = await loadOwnerPlan({ session, env });
  const facts = noTripStarterFacts({ customerTurn, session, ownerPlan, turnActionResults });
  const prompt = `${NO_TRIP_STARTER_INSTRUCTION}\n\nStarter facts: ${JSON.stringify(facts)}`;
  let model = null;
  let reply = '';
  let block = '';
  for (let attempt = 0; attempt < 2 && !reply; attempt += 1) {
    const genStarted = Date.now();
    model = await callTieredModel({
      rules,
      jev,
      customerTurn,
      stage: 'vacation_conversation',
      screen: 'vacation-app',
      destination: '',
      memory: [],
      upsell: 'forbidden',
      postIntake: false,
      intakeReplyTurn: true,
      replyFacts: facts,
      env,
      systemExtra: prompt,
    });
    if (model && typeof model === 'object') model.genLatencyMs = Math.max(0, Date.now() - genStarted);
    reply = model?.called && model.text ? String(model.text).trim() : '';
    block = noTripReplyBlock(reply, appTextBanned, facts);
    if (block) reply = '';
  }
  if (!reply) {
    const visible = model?.called && model.text ? String(model.text).trim() : '';
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: (visible && noTripReplyBlock(visible, appTextBanned, facts))
        || block
        || model?.reason
        || 'no trip starter reply model returned no reply',
    };
  }
  try {
    assertCustomerReplyShippable(reply, '', turnActionResults);
  } catch (error) {
    if (error?.name !== 'reply_action_claim_blocked') throw error;
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: 'reply_action_claim_blocked',
      blockedDraft: reply,
      blockedReasons: [String(error.reason || 'reply_action_claim_blocked')],
    };
  }
  return { reply, rules, jev, model, reason: null };
}

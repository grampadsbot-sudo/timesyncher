import { POST_INTAKE_COLLAB_COPY } from './live-app-turn.mjs';
import { finalizeCustomerReplyText, HOUSEHOLD_PLAN_YEAR_PATTERN } from './reply-customer-wording.mjs';

function customerAskedAccessCollabOrPlan(customerTurn = '') {
  const source = String(customerTurn || '').toLowerCase();
  if (!source.trim()) return false;
  const planAsk = /\b(household plan|family plan|year[- ]round|subscription|membership|unlimited plan)\b/.test(source);
  const accessAsk = /\b(view access|edit access|full access|collaborator|collaborate|collaboration|invite|sharing|share (?:the |this )?vacation|who can (?:see|edit)|access for)\b/.test(source);
  const pricedAccess = /\b(how much|cost|price|pricing|charge|fee|pay|purchase|buy)\b/.test(source)
    && /\b(access|collaborator|collaborate|edit|family|spouse|wife|husband|assistant)\b/.test(source);
  return planAsk || accessAsk || pricedAccess;
}

export function postIntakeCollabCopyMissing(text) {
  const value = String(text || '');
  return !/build(?:ing)? (?:the|your) itinerary/i.test(value)
    || /you also have unlimited/i.test(value)
    || !/\bview access\b/i.test(value)
    || !/\bedit access\b/i.test(value)
    || !/email invite/i.test(value)
    || !HOUSEHOLD_PLAN_YEAR_PATTERN.test(value);
}

export function ensurePostIntakeCollabCopy(text, customerTurn = '') {
  const value = finalizeCustomerReplyText(String(text || '').trim().replace(/\byou also have unlimited\b/gi, 'the plan includes'));
  if (!value) return value;
  if (!customerAskedAccessCollabOrPlan(customerTurn)) return value;
  if (!postIntakeCollabCopyMissing(value)) return value;
  return `${value} ${POST_INTAKE_COLLAB_COPY}`;
}

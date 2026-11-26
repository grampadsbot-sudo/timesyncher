import { POST_INTAKE_COLLAB_COPY } from './live-app-turn.mjs';
import { customerAskedAccessCollabOrPlan } from './customer-collab-plan-asked.mjs';
import { finalizeCustomerReplyText, HOUSEHOLD_PLAN_YEAR_PATTERN } from './reply-customer-wording.mjs';

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

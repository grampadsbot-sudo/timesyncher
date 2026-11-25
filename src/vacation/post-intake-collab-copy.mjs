import { POST_INTAKE_COLLAB_COPY } from './live-app-turn.mjs';
import { HOUSEHOLD_PLAN_YEAR_FRAGMENT } from './household-plan-year-copy.mjs';
import { finalizeCustomerReplyText } from './reply-customer-wording.mjs';

const PLAN_YEAR_FRAGMENT = new RegExp(HOUSEHOLD_PLAN_YEAR_FRAGMENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

export function postIntakeCollabCopyMissing(text) {
  const value = String(text || '');
  return !/build(?:ing)? (?:the|your) itinerary/i.test(value)
    || /you also have unlimited/i.test(value)
    || !/\bview access\b/i.test(value)
    || !/\bedit access\b/i.test(value)
    || !/email invite/i.test(value)
    || !PLAN_YEAR_FRAGMENT.test(value);
}

export function ensurePostIntakeCollabCopy(text) {
  let value = String(text || '').trim().replace(/\byou also have unlimited\b/gi, 'the plan includes');
  if (!value) return value;
  if (!postIntakeCollabCopyMissing(value)) return finalizeCustomerReplyText(value);
  return finalizeCustomerReplyText(`${value} ${POST_INTAKE_COLLAB_COPY}`);
}

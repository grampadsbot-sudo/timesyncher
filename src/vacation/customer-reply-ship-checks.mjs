import { customerAskedAccessCollabOrPlan } from './customer-collab-plan-asked.mjs';
import { postIntakeCollabCopyMissing } from './post-intake-collab-copy.mjs';
import { replyHasCannedHelpDeskOpener } from './reply-canned-opener.mjs';

export { customerAskedAccessCollabOrPlan } from './customer-collab-plan-asked.mjs';
export { replyHasCannedHelpDeskOpener, stripCannedHelpDeskOpener } from './reply-canned-opener.mjs';

export function replyHasUnaskedPostIntakeCollabCopy(reply = '', customerTurn = '') {
  if (customerAskedAccessCollabOrPlan(customerTurn)) return false;
  return !postIntakeCollabCopyMissing(reply);
}

export function customerReplyShipViolations(reply = '', customerTurn = '') {
  const violations = [];
  if (replyHasCannedHelpDeskOpener(reply)) violations.push('canned_help_desk_opener');
  if (replyHasUnaskedPostIntakeCollabCopy(reply, customerTurn)) violations.push('unasked_post_intake_collab_plan');
  return violations;
}
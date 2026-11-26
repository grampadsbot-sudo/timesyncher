const CANNED_HELP_DESK_OPENER = /^(?:hi\s+[\w][\w\s.'’-]{0,48},?\s*)?(?:i\s*['']?m\s+)?(?:glad|happy)\s+(?:that\s+)?you\s+(?:reached\s+out|got\s+in\s+touch|contacted\s+(?:us|me)?)\b[.!]?\s*/i;
const CANNED_THANKS_OPENER = /^thanks?\s+you\s+for\s+(?:reaching\s+out|contacting(?:\s+us)?)\b[.!]?\s*/i;

export function replyHasCannedHelpDeskOpener(reply = '') {
  const value = String(reply || '').trim();
  if (!value) return false;
  const head = value.slice(0, 200);
  return CANNED_HELP_DESK_OPENER.test(head) || CANNED_THANKS_OPENER.test(head);
}

export function stripCannedHelpDeskOpener(reply = '') {
  let value = String(reply || '').trim();
  let prev;
  do {
    prev = value;
    value = value.replace(CANNED_HELP_DESK_OPENER, '').replace(CANNED_THANKS_OPENER, '').trim();
  } while (value !== prev);
  return value;
}
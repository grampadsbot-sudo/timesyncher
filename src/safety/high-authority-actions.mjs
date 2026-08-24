const DEFAULT_BLOCK_MESSAGE = 'I can research, compare, summarize, or draft this for you, but TimeSyncher is advisory-only right now. You will need to take the actual action yourself.';

export const HIGH_AUTHORITY_ACTION_KINDS = Object.freeze([
  'booking_or_reservation',
  'purchase_or_payment',
  'outbound_message',
  'calendar_write',
  'email_send',
  'account_change',
  'terms_acceptance',
  'vendor_commitment',
  'cancellation_or_reschedule',
]);

function isTimeSyncherVacationCheckoutRequest(text = "") {
  const body = String(text || "").toLowerCase();
  if (!body.trim()) return false;
  const asksToBuy = /\b(buy|purchase|pay for|checkout|check out|sign up|subscribe|get started|start|get)\b/.test(body);
  const namesProduct =
    /\btime\s*syncher\s+vacation\b/.test(body) ||
    /\btimesyncher\s+vacation\b/.test(body) ||
    /\b(?:buy|purchase|get|start)\s+(?:a\s+)?vacation\b/.test(body) ||
    /\bsign up\s+for\s+(?:a\s+)?vacation\b/.test(body);
  const namesTravelPurchase = /\b(flight|flights|hotel|hotels|reservation|reservations|ticket|tickets|excursion|excursions|tour|tours|show|activity|activities|restaurant|restaurants|rental car|airbnb|vrbo)\b/.test(body);
  return asksToBuy && namesProduct && !namesTravelPurchase;
}

const MATCHERS = [
  {
    kind: 'booking_or_reservation',
    patterns: [/\bbook(?:\s+it|\s+this|\s+the)?\b/i, /\breserve(?:\s+it|\s+this|\s+the)?\b/i, /\bmake (?:a|the) reservation\b/i],
  },
  {
    kind: 'purchase_or_payment',
    patterns: [/\bbuy(?:\s+it|\s+this|\s+the)?\b/i, /\bpurchase(?:\s+it|\s+this|\s+the)?\b/i, /\bpay(?:\s+for|\s+the|\s+this)?\b/i, /\bcharge (?:my|the)\b/i],
  },
  {
    kind: 'outbound_message',
    patterns: [/\bmessage (?:the|them|him|her|vendor|hotel|airline|restaurant)\b/i, /\bcontact (?:the|them|him|her|vendor|hotel|airline|restaurant)\b/i],
  },
  {
    kind: 'calendar_write',
    patterns: [/\b(?:create|add|move|update|edit|delete|cancel|reschedule) (?:my |the |a )?(?:calendar|event|meeting|appointment)\b/i, /\bput (?:it|this) on (?:my|the) calendar\b/i],
  },
  {
    kind: 'email_send',
    patterns: [/\bsend (?:the |an? |this )?email\b/i, /\bemail (?:them|him|her|the|this)\b/i, /\breply to (?:the |this )?email\b/i],
  },
  {
    kind: 'account_change',
    patterns: [/\bchange (?:my|the) (?:account|password|plan|subscription|settings)\b/i, /\bupdate (?:my|the) (?:account|password|plan|subscription|settings)\b/i],
  },
  {
    kind: 'terms_acceptance',
    patterns: [/\baccept (?:the|their|these|those)? ?(?:terms|conditions|eula|agreement|waiver)\b/i, /\bagree to (?:the|their|these|those)? ?(?:terms|conditions|eula|agreement|waiver)\b/i],
  },
  {
    kind: 'vendor_commitment',
    patterns: [/\bconfirm (?:with|the) (?:vendor|hotel|airline|restaurant|host|guide)\b/i, /\bcommit (?:to|with)\b/i],
  },
  {
    kind: 'cancellation_or_reschedule',
    patterns: [/\bcancel (?:the|my|this|that)? ?(?:reservation|booking|flight|hotel|event|meeting|appointment)\b/i, /\breschedule (?:the|my|this|that)? ?(?:reservation|booking|flight|hotel|event|meeting|appointment)\b/i],
  },
];

export function highAuthorityActionsAllowed(env = process.env) {
  return String(env.TIMESYNCHER_ALLOW_HIGH_AUTHORITY_ACTIONS || '').trim().toLowerCase() === 'true';
}

export function classifyHighAuthorityRequest(text) {
  const body = String(text || '');
  if (!body.trim()) return { blocked: false, kinds: [] };
  const kinds = [];
  for (const matcher of MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(body))) kinds.push(matcher.kind);
  }
  return { blocked: kinds.length > 0, kinds };
}

export function blockHighAuthorityRequest(text, env = process.env) {
  if (highAuthorityActionsAllowed(env)) return { blocked: false, kinds: [] };
  if (isTimeSyncherVacationCheckoutRequest(text)) return { blocked: false, kinds: [], reason: "timesyncher_vacation_checkout" };
  const result = classifyHighAuthorityRequest(text);
  if (!result.blocked) return result;
  return {
    ...result,
    message: DEFAULT_BLOCK_MESSAGE,
  };
}

export function assertHighAuthorityActionAllowed(actionKind, env = process.env) {
  if (!HIGH_AUTHORITY_ACTION_KINDS.includes(actionKind)) {
    throw new Error(`unknown high-authority action kind: ${actionKind}`);
  }
  if (highAuthorityActionsAllowed(env)) return;
  const error = new Error(`high-authority action blocked: ${actionKind}`);
  error.statusCode = 403;
  error.code = 'HIGH_AUTHORITY_ACTION_BLOCKED';
  error.customerMessage = DEFAULT_BLOCK_MESSAGE;
  throw error;
}

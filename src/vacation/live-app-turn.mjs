import {
  DIALOG_TEST_FINGERPRINT,
  callTieredModel,
  INTERIM_MODEL,
  isBakeoffModelId,
  jevPrecall,
  jevQualityRewrite,
  JEV_QUALITY_MODEL,
  isTemplateNote,
  noteContradictsDraft,
  loadVacationAppReplyRules,
} from '../../scripts/vacation-app-reply-rules.mjs';

export { isTemplateNote };
import { productThingSummary } from './intake-shared-trip.mjs';
import { payerPriceLine, planSeatDollars, priceAnswered } from './seat-price.mjs';

export const LIVE_TRANSCRIPT_CAPTURE = 'live-vacation-app';
export const LIVE_REPLY_PRODUCER = 'vacation-app-reply-rules';
export const LIVE_OPENER_PRODUCER = 'vacation-app-onboarding-opener';
export const FIXED_OPENER_REASON = 'fixed_onboarding_opener';
export const LIVE_DISPATCHER = 'product-gbrain-dispatch';
export const ONBOARDING_OPENER_WITH_SITE = 'I can update this vacation from here.\n\nTell me the trip basics you want changed: where you are going, when you leave and come back, who is coming, and what matters most.\n\nFamily and friends can join this same vacation as collaborators. View access lets them see the days. Edit access lets them add notes after you approve an email invite. They join from that email, accept the terms, and then this vacation opens.\n\nType a message, tap the microphone to the right to speak, or attach photos, reservations, and notes.';
export const ONBOARDING_OPENER_CHAT_ONLY = 'Welcome. I am here to build this vacation with you. Your website is not built yet, so this chat is the whole workspace until it is actually up.\n\nTell me the trip basics: where you are going, when you leave and come back, who is coming, and what matters most.\n\nIf family or friends are coming, we can welcome them onto this vacation as collaborators. View access lets them see the days. Edit access lets them add notes after you approve an email invite. They join from that email, accept the terms, and then this vacation opens.\n\nType in the box, tap the microphone to the right of it and speak, or use the paperclip for photos, reservations, and notes.';

export function tripIsReturning(trip) {
  if (!trip || typeof trip !== 'object') return false;
  const meta = trip.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  if (trip.intakeShare === true || meta.intakeShare === true) return false;
  const slug = String(trip.shareToken || trip.publicSlug || meta.publicSlug || meta.shareToken || meta.sharedToken || '');
  const url = String(trip.publicUrl || meta.publicUrl || meta.public_url || '');
  if (/^intake-/i.test(slug) || /\/shared\/intake-/i.test(url)) return false;
  return Boolean(url.trim() || slug.trim());
}

export function onboardingOpenerText(returning) {
  return returning ? ONBOARDING_OPENER_WITH_SITE : ONBOARDING_OPENER_CHAT_ONLY;
}

const CANNED_APP_REPLY = 'Got it. I saved that';

export function customerModality(body) {
  return body?.voiceMode ? 'voice' : 'text';
}

export function targetPersonFromSession(session) {
  const first = String(session?.first_name || session?.firstName || '').trim();
  if (first) return first.split(/\s+/)[0];
  const display = String(session?.display_name || session?.displayName || session?.customerName || '').trim();
  if (display) return display.split(/\s+/)[0];
  return '';
}

export function jevStamp(jev) {
  if (jev?.jevRan === true) {
    return {
      jevRan: true,
      modelTier: jev.modelTier ?? null,
      routeType: jev.routeType || jev.extraContext?.routeType || null,
      extraContext: jev.extraContext ?? null,
      via: jev.via || null,
      responseModel: jev.responseModel || null,
      jevLatencyMs: Number.isFinite(Number(jev.jevLatencyMs)) ? Number(jev.jevLatencyMs) : null,
      jevBeforeModel: jev.jevBeforeModel === true,
    };
  }
  return {
    jevRan: false,
    reason: String(jev?.error || jev?.reason || 'jev_skipped'),
    via: jev?.via || null,
    modelTier: null,
    routeType: null,
    extraContext: null,
  };
}

function scored(value) {
  if (value == null || value === '') return null;
  const score = Number(value);
  if (!Number.isFinite(score) || score < 1 || score > 5) return null;
  return Math.round(score * 1000) / 1000;
}

function rawScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

export function liveTurnRecord({
  turnIndex,
  role,
  modality,
  text,
  at,
  latencyMs,
  sessionE2eMs,
  jev,
  replyProducer = null,
  model = null,
  rules = null,
  speakerName = null,
}) {
  const record = {
    turnIndex,
    role,
    modality,
    text: String(text || ''),
    speakerName: speakerName ? String(speakerName) : null,
    at,
    latencyMs,
    sessionE2eMs,
    jev: jevStamp(jev),
  };
  if (role === 'app') {
    record.replyProducer = replyProducer || LIVE_REPLY_PRODUCER;
    record.fixedOpener = record.replyProducer === LIVE_OPENER_PRODUCER;
    record.dispatcher = record.fixedOpener ? null : LIVE_DISPATCHER;
    record.invented = false;
    record.modelId = model?.responseModel || (record.fixedOpener ? null : jev?.responseModel) || null;
    record.genLatencyMs = Number.isFinite(Number(model?.genLatencyMs)) ? Number(model.genLatencyMs) : null;
    record.maxTokens = Number.isFinite(Number(model?.maxTokens)) ? Number(model.maxTokens) : null;
    record.jevLatencyMs = Number.isFinite(Number(jev?.jevLatencyMs)) ? Number(jev.jevLatencyMs) : null;
    record.jevBeforeModel = jev?.jevBeforeModel === true && jev?.jevRan === true;
    if (Array.isArray(model?.beats) && model.beats.length) {
      record.beats = model.beats.map((beat) => String(beat || '').trim()).filter(Boolean);
    }
    if (model?.quality?.judged === true) {
      record.quality = {
        judged: true,
        score: Number(model.quality.score),
        scoreRaw: Number.isFinite(Number(model.quality.scoreRaw)) ? Number(model.quality.scoreRaw) : null,
        disposition: model.quality.disposition || null,
        jevFocus: model.quality.jevFocus || null,
        comment: model.quality.comment || null,
        jevNoteReason: model.quality.jevNoteReason || null,
        rewritten: model.quality.rewritten === true,
        model: model.quality.model || null,
        judgeMs: Number.isFinite(Number(model.quality.judgeMs)) ? Number(model.quality.judgeMs) : null,
      };
      if (record.quality.rewritten && model.quality.draft) {
        record.quality.draft = String(model.quality.draft);
      }
      if (record.quality.rewritten && model.quality.rewriteModel) {
        record.quality.rewriteModel = String(model.quality.rewriteModel);
      }
      if (model.quality.shippedModel) record.shippedModel = String(model.quality.shippedModel);
      if (model.quality.draftModel) record.draftModel = String(model.quality.draftModel);
      if (model.quality.rewriteModel) record.rewriteModel = String(model.quality.rewriteModel);
      if (model.quality.rewriteText) record.rewriteText = String(model.quality.rewriteText);
      if (model.quality.draft) record.quality.draft = String(model.quality.draft);
    }
    const log = model?.log && typeof model.log === 'object' ? model.log : null;
    if (log) {
      record.draftModel = log.draftModel || record.draftModel || null;
      record.rewriteModel = log.rewriteModel || record.rewriteModel || null;
      if (log.rewriteText) record.rewriteText = String(log.rewriteText);
      if (log.draftText && record.quality) record.quality.draft = String(log.draftText);
      record.shippedModel = log.shippedModel || record.shippedModel || null;
      record.jevScoreDraft = scored(log.jevScoreDraft);
      record.jevScoreRewrite = scored(log.jevScoreRewrite);
      record.jevScoreRaw = rawScore(log.jevScoreRaw);
      record.jevDisposition = log.jevDisposition || null;
      record.jevFixFocus = log.jevFixFocus || null;
      record.draftJevScoreRaw = rawScore(log.draftJevScoreRaw);
      record.draftJevDisposition = log.draftJevDisposition || null;
      record.draftJevFixFocus = log.draftJevFixFocus || null;
      record.rewriteJevScoreRaw = rawScore(log.rewriteJevScoreRaw);
      record.rewriteJevDisposition = log.rewriteJevDisposition || null;
      record.rewriteJevFixFocus = log.rewriteJevFixFocus || null;
      record.draftFactCheck = log.draftFactCheck || null;
      record.rewriteFactCheck = log.rewriteFactCheck || null;
      if (log.rewriteFailReason) record.rewriteFailReason = String(log.rewriteFailReason);
      if (Array.isArray(log.rewriteAttempts)) record.rewriteAttempts = log.rewriteAttempts;
      record.jevNote = log.jevNote || null;
      record.jevNoteReason = log.jevNoteReason || null;
      record.interimReply = log.interimReply || null;
      record.modelLatency = log.latencyMs || null;
      record.flagged = log.flagged === true;
    }
    record.model = model
      ? {
        called: Boolean(model.called),
        via: model.via || null,
        responseModel: model.responseModel || null,
        modelTier: model.modelTier ?? null,
        genLatencyMs: record.genLatencyMs,
      }
      : null;
  }
  if (rules) {
    record.rules = {
      ok: Boolean(rules.ok),
      via: rules.via || null,
      slug: rules.slug || null,
      contentHash: rules.content_hash || null,
    };
  }
  return record;
}

const OTHER_DESTINATION = /\b(tulum|cartagena|cancun|cancún|maui|kauai|puerto vallarta|\bcabo\b)\b/i;

export function destinationFromTexts(texts) {
  const blob = (Array.isArray(texts) ? texts : [texts]).join('\n');
  if (/big island/i.test(blob) || /hawai/i.test(blob) || /kailua-kona/i.test(blob)) return 'Big Island, Hawaii';
  return '';
}

export function replyLeavesDestination(reply, destination) {
  if (!/big island/i.test(String(destination || ''))) return false;
  return OTHER_DESTINATION.test(String(reply || ''));
}

const UNLIMITED_PHRASE = 'unlimited vacations for the whole year';
const UNLIMITED_PATTERN = /unlimited vacations for the whole year/i;
const COLLAB_WELCOME = /welcome\b[^.\n]{0,180}\bcollaborat|\bcollaborat\w*[^.\n]{0,180}(?:add notes|help shape the days|whole household|whole family|unlimited vacations)/i;

export function isLongIntake(text) {
  const value = String(text || '').trim();
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 70) return false;
  const place = /big island|hawai|kailua-kona|voice note|ramble/i.test(value);
  const shape = /garden|swim|grocer|dinner|family|april|coming/i.test(value);
  return place && shape;
}

export function postIntakeUpsellTurn(customerTurn, priorTurns) {
  if (!isLongIntake(customerTurn)) return false;
  const priors = Array.isArray(priorTurns) ? [...priorTurns] : [];
  while (priors.length && priors.at(-1)?.role === 'customer' && String(priors.at(-1).text || '') === String(customerTurn || '')) {
    priors.pop();
  }
  return !priors.some((turn) => turn?.role === 'customer' && isLongIntake(turn.text));
}

export function customerPullsAccess(text) {
  const value = String(text || '');
  if (/\b(price|pricing|how much|what(?:'s| is) (?:the )?(?:price|cost))\b/i.test(value)) return true;
  if (/\bcollaborat/i.test(value)) return true;
  if (/\b(family|household|editing|full) access\b/i.test(value)) return true;
  if (/\bjoin (?:this|the) (?:same )?(?:trip|vacation)\b/i.test(value) && /\b(family|friend|them|everyone|household)\b/i.test(value)) return true;
  return false;
}

export function isCollabWelcome(text) {
  return COLLAB_WELCOME.test(String(text || ''));
}

export function isFullUpsell(text) {
  const value = String(text || '');
  return UNLIMITED_PATTERN.test(value) && /collaborat/i.test(value);
}

export function isFixedOpenerText(text) {
  const value = String(text || '');
  return value === ONBOARDING_OPENER_CHAT_ONLY
    || value === ONBOARDING_OPENER_WITH_SITE
    || /your website is not built yet/i.test(value)
    || /i can update this vacation from here/i.test(value);
}

function sentenceIsUpsell(sentence) {
  return UNLIMITED_PATTERN.test(sentence) || COLLAB_WELCOME.test(sentence);
}

export const ITEM34_BAN = /\b(?:split|splitting)\b/i;

export function customerAsksAccessChoice(text) {
  const value = String(text || '');
  return /\?/.test(value) && /\bview access\b/i.test(value) && /\bedit access\b/i.test(value);
}

export function customerAsksPrice(text) {
  return /\b(price|pricing|how much|what(?:'s| is) (?:the )?(?:price|cost))\b/i.test(String(text || ''));
}

export function item34BanHit(text) {
  return ITEM34_BAN.test(String(text || ''));
}

export function stripItem34Ban(text) {
  const paragraphs = String(text || '').split(/\n{2,}/);
  const kept = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).filter((sentence) => !item34BanHit(sentence));
    const joined = sentences.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
    if (joined && !item34BanHit(joined)) kept.push(joined);
  }
  return kept.join('\n\n').trim();
}

export function stripUpsell(text) {
  const paragraphs = String(text || '').split(/\n{2,}/);
  const kept = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).filter((sentence) => !sentenceIsUpsell(sentence));
    const joined = sentences.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
    if (joined) kept.push(joined);
  }
  return kept.join('\n\n').trim();
}

const STOCK_REWRITE_LEAD = /^the plan stays on the days and places you named\b/i;
const FALSE_PRICE = /no extra fees|you'?ve got unlimited|you have unlimited|you also have unlimited/i;

export function sessionHasFullUpsell(priorTurns) {
  return (Array.isArray(priorTurns) ? priorTurns : []).some((turn) => {
    if (turn?.role === 'customer') return false;
    const text = String(turn?.text || '');
    if (isFixedOpenerText(text) || turn?.fixedOpener === true || turn?.replyProducer === LIVE_OPENER_PRODUCER) return false;
    return isFullUpsell(text);
  });
}

export function upsellModeForTurn(customerTurn, priorTurns) {
  if (sessionHasFullUpsell(priorTurns)) return 'forbidden';
  if (customerPullsAccess(customerTurn) || postIntakeUpsellTurn(customerTurn, priorTurns)) return 'allow-once';
  return 'forbidden';
}

export function upsellAudit(turns) {
  const list = Array.isArray(turns) ? turns : [];
  let full = 0;
  const unsolicitedFull = [];
  const softEmbeds = [];
  const unsolicitedWelcome = [];
  let lastCustomer = '';
  const priorCustomers = [];
  for (const turn of list) {
    const text = String(turn?.text || '');
    if (turn?.role !== 'app') {
      if (turn?.role === 'customer') {
        lastCustomer = text;
        priorCustomers.push(text);
      }
      continue;
    }
    if (isFixedOpenerText(text) || turn?.fixedOpener === true || turn?.replyProducer === LIVE_OPENER_PRODUCER) continue;
    const pulled = customerPullsAccess(lastCustomer)
      || postIntakeUpsellTurn(lastCustomer, priorCustomers.slice(0, -1).map((prior) => ({ role: 'customer', text: prior })));
    const phrase = UNLIMITED_PATTERN.test(text);
    const welcome = isCollabWelcome(text);
    const fullBlock = isFullUpsell(text);
    if (fullBlock) {
      full += 1;
      if (!pulled || full > 1) unsolicitedFull.push(turn.turnIndex ?? null);
    } else if (welcome && !pulled) {
      unsolicitedWelcome.push(turn.turnIndex ?? null);
    } else if (phrase && !pulled) {
      softEmbeds.push(turn.turnIndex ?? null);
    }
  }
  return {
    full,
    unsolicitedFull,
    unsolicitedWelcome,
    softEmbeds,
    ok: unsolicitedFull.length === 0 && unsolicitedWelcome.length === 0 && softEmbeds.length === 0 && full <= 1,
  };
}

function memoryTurns(priorTurns) {
  return (Array.isArray(priorTurns) ? priorTurns : []).slice(-12).map((turn) => ({
    role: turn.role === 'app' ? 'app' : 'customer',
    text: String(turn.text || '').slice(0, 1500),
  }));
}

export function draftingFacts(priorTurns, customerTurn = '') {
  const turns = [...(Array.isArray(priorTurns) ? priorTurns : []), { role: 'customer', text: customerTurn }];
  const customerTexts = turns
    .filter((turn) => turn?.role !== 'app')
    .map((turn) => String(turn?.text || '').trim())
    .filter(Boolean);
  const corpus = customerTexts.join('\n');
  let things = ensureNamedThings(thingsFromIntake(corpus), corpus);
  for (const line of customerTexts) things = applyCustomerNotes(things, line);
  const itinerary = things.map((thing) => {
    const when = String(thing.customerWhen || thing.whenLabel || '').trim();
    return when ? `${thing.title}: ${when}` : thing.title;
  }).filter(Boolean);
  const span = intakeSpan(corpus);
  const named = ['Craig', 'Kimberly', 'Tyler', 'Lauren', 'Torren', 'Peyton', 'Keegan', 'Fallon', 'Marcus Chen', 'Aunt Jean']
    .filter((name) => new RegExp(`\\b${name}\\b`, 'i').test(corpus));
  return {
    itinerary,
    roster: named.length ? `People the customer has named: ${named.join(', ')}.` : '',
    dates: span?.spanLabel ? `Dates the customer named: ${span.spanLabel}.` : '',
  };
}

export function qualityFailureReason(quality, flags) {
  const parts = [];
  if (flags?.missingPrice) parts.push('missing per-payer dollar line');
  if (flags?.invented?.length) parts.push(`invented place: ${flags.invented.join(', ')}`);
  if (flags?.split) parts.push('banned payment word');
  if (flags?.missingAccess) parts.push('missing view access and edit access');
  const focus = String(quality?.jevFocus || '').trim();
  if (focus && focus !== 'keep') parts.push(`jev fix_focus ${focus}`);
  const accuracy = Array.isArray(quality?.accuracyErrors) ? quality.accuracyErrors : [];
  for (const error of accuracy) {
    const line = String(error || '').trim();
    if (line) parts.push(line);
  }
  const score = Number(quality?.score);
  if (Number.isFinite(score) && score <= 2) parts.push(`score ${score}`);
  return parts.join('; ');
}

function appTextBanned(text) {
  const value = String(text || '');
  if (!value.trim()) return 'app reply text is empty';
  if (value.includes(DIALOG_TEST_FINGERPRINT)) return 'app reply carries the dialog test fingerprint';
  if (value.includes(CANNED_APP_REPLY)) return 'app reply is the canned vacation-app bubble';
  if (/dialog_vacation_test_turn/i.test(value)) return 'app reply came from dialog_vacation_test_turn';
  if (/dialog-pdf-openrouter-selfcall|openrouter-selfcall/i.test(value)) return 'app reply came from an OpenRouter self-call pack';
  return '';
}

const INVENTED_GARDEN = /kahalu|pu'?a mau|arboretum|botanical garden/i;

export function inventedGardenHit(reply, corpus) {
  const text = String(reply || '');
  const known = String(corpus || '');
  if (/kahalu/i.test(text) && !/kahalu/i.test(known)) return true;
  if (/pu'?a mau/i.test(text) && !/pu'?a mau/i.test(known)) return true;
  if (/arboretum|botanical garden/i.test(text) && !/arboretum|botanical garden/i.test(known)) return true;
  if (/garden/i.test(known) && /garden[\s\S]{0,80}(?:if it rains|because of (?:the )?weather)|(?:if it rains|because of (?:the )?weather)[\s\S]{0,80}garden/i.test(text)
    && !/(?:if it rains|because of (?:the )?weather)[\s\S]{0,40}garden/i.test(known)) return true;
  return false;
}

const UNNAMED_VENUE = [
  [/snorkel/i, 'snorkel'],
  [/\bcruise\b/i, 'cruise'],
  [/keauhou/i, 'Keauhou'],
  [/volcano/i, 'Volcanoes'],
  [/lava tube/i, 'lava tube'],
  [/thurston/i, 'Thurston'],
  [/pu['ʻ‘’]?uhonua|h[oō]naunau/i, 'Puuhonua o Honaunau'],
  [/captain cook/i, 'Captain Cook'],
  [/coffee farm/i, 'coffee farm'],
  [/kahalu/i, 'Kahaluu'],
  [/pu'?a mau/i, 'Pua Mau'],
  [/arboretum/i, 'arboretum'],
  [/botanical garden/i, 'botanical garden'],
  [/community center/i, 'community center'],
  [/national park/i, 'national park'],
  [/resort pool/i, 'resort pool'],
  [/\blagoon\b/i, 'lagoon'],
  [/\bdock\b/i, 'dock'],
];

export function inventedVenueNames(reply, corpus) {
  const value = String(reply || '');
  const known = String(corpus || '');
  const names = [];
  for (const [pattern, label] of UNNAMED_VENUE) {
    if (pattern.test(value) && !pattern.test(known)) names.push(label);
  }
  if (inventedGardenHit(value, known) && !names.length) names.push('a garden they did not name');
  return names;
}

export function stripInventedVenues(reply, corpus) {
  const paragraphs = String(reply || '').split(/\n{2,}/);
  const kept = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).filter((sentence) => inventedVenueNames(sentence, corpus).length === 0 && !inventedGardenHit(sentence, corpus));
    const joined = sentences.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
    if (joined && inventedVenueNames(joined, corpus).length === 0 && !inventedGardenHit(joined, corpus)) kept.push(joined);
  }
  return kept.join('\n\n').trim();
}

export function stripInventedGarden(reply, corpus) {
  const paragraphs = String(reply || '').split(/\n{2,}/);
  const kept = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).filter((sentence) => !inventedGardenHit(sentence, corpus));
    const joined = sentences.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
    if (joined && !inventedGardenHit(joined, corpus)) kept.push(joined);
  }
  return kept.join('\n\n').trim();
}

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20, 'twenty-first': 21, 'twenty-second': 22, 'twenty-third': 23,
  'twenty-fourth': 24, 'twenty-fifth': 25, 'twenty-sixth': 26, 'twenty-seventh': 27, 'twenty-eighth': 28,
  'twenty-ninth': 29, thirtieth: 30, 'thirty-first': 31,
};
const WEEKDAY_ABBR = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' };
const WHO_SKIP = new Set(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Base', 'Big', 'SpeediShuttle', 'Kids', 'Four', 'What', 'Keep', 'This', 'The']);

function splitSentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function parseYear(text) {
  const digits = String(text || '').match(/\b(20\d{2})\b/);
  if (digits) return Number(digits[1]);
  const words = String(text || '').toLowerCase();
  const teens = { five: 2025, six: 2026, seven: 2027, eight: 2028, nine: 2029 };
  const match = words.match(/\btwenty[\s-]+twenty[\s-]*(five|six|seven|eight|nine)\b/);
  return match ? teens[match[1]] : null;
}

function parseDayToken(token) {
  const word = String(token || '').toLowerCase();
  if (DAY_WORDS[word]) return DAY_WORDS[word];
  const digits = word.match(/^(\d{1,2})/);
  const day = digits ? Number(digits[1]) : 0;
  return day >= 1 && day <= 31 ? day : 0;
}

export function datedMentions(text) {
  const year = parseYear(text);
  const re = /\b(?:(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first|twenty-second|twenty-third|twenty-fourth|twenty-fifth|twenty-sixth|twenty-seventh|twenty-eighth|twenty-ninth|thirtieth|thirty-first)\b/gi;
  const found = [];
  let match = re.exec(String(text || ''));
  while (match) {
    const month = MONTHS[match[2].toLowerCase()];
    const day = parseDayToken(match[3]);
    if (month && day) {
      found.push({
        weekday: match[1] || '',
        month,
        day,
        year: parseYear(match[0]) || year,
        raw: match[0],
      });
    }
    match = re.exec(String(text || ''));
  }
  return found;
}

function weekdayAbbr(mention) {
  if (mention?.weekday && WEEKDAY_ABBR[mention.weekday.toLowerCase()]) return WEEKDAY_ABBR[mention.weekday.toLowerCase()];
  if (!mention?.year) return '';
  const date = new Date(Date.UTC(mention.year, mention.month - 1, mention.day));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()] || '';
}

function formatMention(mention, { withWeekday = true, withYear = false } = {}) {
  if (!mention) return '';
  const weekday = withWeekday ? weekdayAbbr(mention) : '';
  const year = withYear && mention.year ? ` ${mention.year}` : '';
  return `${weekday ? `${weekday} ` : ''}${MONTH_ABBR[mention.month]} ${mention.day}${year}`.trim();
}

export function intakeSpan(text) {
  const mentions = datedMentions(text);
  if (!mentions.length) return null;
  const year = mentions.find((item) => item.year)?.year || parseYear(text);
  const start = { ...mentions[0], year: mentions[0].year || year };
  const end = { ...mentions[mentions.length - 1], year: mentions[mentions.length - 1].year || year };
  const place = /big island/i.test(text) ? 'Big Island' : '';
  const startIso = start.year ? `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}` : '';
  const endIso = end.year ? `${end.year}-${String(end.month).padStart(2, '0')}-${String(end.day).padStart(2, '0')}` : '';
  const sameMonth = start.month === end.month && start.year === end.year;
  const badgeRange = !endIso || (startIso === endIso)
    ? formatMention(start, { withWeekday: false, withYear: true })
    : (sameMonth
      ? `${MONTH_ABBR[start.month]} ${start.day}–${end.day}${start.year ? ` ${start.year}` : ''}`
      : `${formatMention(start, { withWeekday: false, withYear: false })}–${formatMention(end, { withWeekday: false, withYear: true })}`);
  const spanLabel = startIso === endIso
    ? formatMention(start, { withWeekday: true, withYear: true })
    : `${formatMention(start, { withWeekday: true })}–${formatMention(end, { withWeekday: true, withYear: true })}`;
  return {
    destination: place ? `${place}, Hawaii` : '',
    placeTitle: place,
    start: startIso,
    end: endIso || startIso,
    startLabel: formatMention(start, { withWeekday: true }),
    endLabel: formatMention(end, { withWeekday: true, withYear: true }),
    spanLabel,
    badge: place ? `${place} ${badgeRange}`.trim() : badgeRange,
    year: year || null,
  };
}

function whoIn(sentence) {
  const named = String(sentence || '').match(/\b([A-Z][a-z]{2,})\s+wants\b/);
  if (named && !WHO_SKIP.has(named[1])) return named[1];
  const forWhom = String(sentence || '').match(/\bfor\s+([A-Z][a-z]{2,})\b/);
  if (forWhom && !WHO_SKIP.has(forWhom[1])) return forWhom[1];
  return '';
}

function thingPattern(title) {
  const key = String(title || '').toLowerCase();
  if (key === 'big island') return /big island/i;
  if (key === 'gardens') return /garden/i;
  if (key === 'groceries') return /grocer/i;
  if (key === 'dinner') return /\bdinner\b/i;
  if (key === 'swim') return /\bswim/i;
  if (key === 'town walk') return /town walk/i;
  if (key === 'kailua-kona house') return /\bhouse\b/i;
  return null;
}

function swimDayKey(label) {
  const match = String(label || '').match(/^((?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) [A-Z][a-z]{2,3} \d{1,2})/);
  return match ? match[1] : '';
}

function swimLabelRank(label) {
  if (/beach or house pool/i.test(label)) return 3;
  if (/house pool|\bbeach\b/i.test(label)) return 2;
  return 1;
}

function mergeSwimLabel(labels, label) {
  const day = swimDayKey(label);
  if (!day) return;
  const idx = labels.findIndex((item) => swimDayKey(item) === day);
  if (idx < 0) {
    labels.push(label);
    return;
  }
  if (swimLabelRank(label) > swimLabelRank(labels[idx])) labels[idx] = label;
}

function swimPlanLabel(sentence) {
  if (!/\bswim\b|house pool/i.test(sentence)) return '';
  const dated = datedMentions(sentence)[0];
  if (!dated) return '';
  const day = formatMention({ ...dated, year: dated.year || null }, { withWeekday: true });
  if (!day) return '';
  let plan = '';
  if (/beach/i.test(sentence) && /house pool/i.test(sentence)) plan = 'beach or house pool';
  else if (/house pool/i.test(sentence)) plan = 'house pool';
  else if (/\bbeach\b/i.test(sentence)) plan = 'beach';
  return [day, plan].filter(Boolean).join(' ');
}

function customerNamedWeekday(customerText, weekdayName) {
  if (!weekdayName) return false;
  return new RegExp(`\\b${weekdayName}\\b`, 'i').test(String(customerText || ''));
}

const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function weekdayInsideSpan(weekdayName, span) {
  const target = WEEKDAY_INDEX[String(weekdayName || '').toLowerCase()];
  if (target == null || !span?.start || !span?.end) return '';
  const start = new Date(`${String(span.start).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(span.end).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    if (cursor.getUTCDay() !== target) continue;
    return formatMention({
      weekday: weekdayName,
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
      year: cursor.getUTCFullYear(),
    }, { withWeekday: true });
  }
  return '';
}

function spanDateLabel(date) {
  return formatMention({
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    year: date.getUTCFullYear(),
  }, { withWeekday: true });
}

function spanStartLabel(span) {
  if (!span?.start) return 'Fri Apr 3';
  const start = new Date(`${String(span.start).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return 'Fri Apr 3';
  return spanDateLabel(start);
}

function arrivalSwimLabel(label, arrival) {
  const day = swimDayKey(label);
  return day === arrival || String(label || '').startsWith(`${arrival} `) || String(label || '') === arrival;
}

export function applyAgreedAppSwim(things, customerText, appText, span = null) {
  if (!/\bswim\b/i.test(String(customerText || ''))) return things;
  const arrival = spanStartLabel(span);
  const wantsLater = /\blater\b|\bsecond\b|\banother\b|\bstill want\b/i.test(String(customerText || ''));
  const labels = [];
  if (wantsLater) {
    for (const sentence of splitSentences(appText).filter((part) => /\bswim\b/i.test(part))) {
      const dated = datedMentions(sentence)[0];
      if (dated) {
        if (!customerNamedWeekday(customerText, dated.weekday)) continue;
        const label = formatMention({ ...dated, year: dated.year || span?.year || null }, { withWeekday: true });
        if (label && !arrivalSwimLabel(label, arrival)) labels.push(label);
        continue;
      }
      const weekday = sentence.match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
      if (!weekday || !customerNamedWeekday(customerText, weekday[1])) continue;
      const resolved = weekdayInsideSpan(weekday[1], span);
      if (resolved && !arrivalSwimLabel(resolved, arrival)) labels.push(resolved);
    }
  }
  return (Array.isArray(things) ? things : []).map((thing) => {
    if (thing.title !== 'Swim') return thing;
    const merged = String(thing.customerWhen || '').split(' · ').map((part) => part.trim()).filter((part) => part && !arrivalSwimLabel(part, arrival));
    for (const label of labels) {
      if (merged.some((item) => item === label || item.startsWith(`${label} `))) continue;
      merged.push(label);
    }
    return { ...thing, customerWhen: merged.join(' · ') };
  });
}

function whenForThing(title, sentence, span) {
  if (title === 'Groceries' && /same day/i.test(sentence) && span?.startLabel) return span.startLabel;
  if (title === 'Swim' && /later in the week/i.test(sentence)) return 'later in the week';
  if ((title === 'Big Island' || title === 'Kailua-Kona house') && span?.spanLabel) return span.spanLabel;
  const dated = datedMentions(sentence)[0];
  return dated ? formatMention({ ...dated, year: dated.year || span?.year }) : '';
}

export function intakeFacts(text) {
  const value = String(text || '');
  const sentences = splitSentences(value);
  const span = intakeSpan(value);
  const rule = sentences.find((part) => /two big activities/i.test(part)) || '';
  const things = [];
  const add = (title, category, pattern) => {
    if (!pattern.test(value) || INVENTED_GARDEN.test(title)) return;
    const matched = sentences.filter((part) => pattern.test(part) && !(INVENTED_GARDEN.test(part) && !INVENTED_GARDEN.test(value)));
    const notes = matched.length ? matched : [title];
    if (title === 'Big Island' && rule && !notes.some((note) => note === rule)) notes.push(rule);
    const description = notes.join(' ');
    if (INVENTED_GARDEN.test(description) && !INVENTED_GARDEN.test(value)) return;
    things.push({
      title,
      category,
      description,
      who: whoIn(notes[0]) || '',
      whenLabel: whenForThing(title, notes.join(' '), span),
      customerWhen: '',
      notes,
      collaboratorNotes: [],
    });
  };
  if (/big island/i.test(value)) add('Big Island', 'activity', /big island/i);
  if (/garden/i.test(value)) add('Gardens', 'activity', /garden/i);
  if (/grocer/i.test(value)) add('Groceries', 'activity', /grocer/i);
  if (/\bdinner\b/i.test(value)) add('Dinner', 'restaurant', /\bdinner\b/i);
  if (/\bswim\b/i.test(value)) add('Swim', 'activity', /\bswim\b/i);
  if (/town walk/i.test(value)) add('Town walk', 'activity', /town walk/i);
  if (/house/i.test(value) && /kailua-kona/i.test(value)) add('Kailua-Kona house', 'hotel', /house/i);
  return { span, rule, things };
}

export function thingsFromIntake(text) {
  return intakeFacts(text).things;
}

function sameNote(left, right) {
  return String(left || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(right || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function ensureNamedThings(things, text) {
  const next = Array.isArray(things) ? [...things] : [];
  const have = new Set(next.map((thing) => thing.title));
  const add = (title, category, pattern) => {
    if (have.has(title) || !pattern.test(String(text || ''))) return;
    have.add(title);
    next.push({
      title,
      category,
      description: '',
      who: '',
      whenLabel: '',
      customerWhen: '',
      notes: [],
      collaboratorNotes: [],
    });
  };
  add('Gardens', 'activity', /garden/i);
  add('Dinner', 'restaurant', /\bdinner\b/i);
  add('Swim', 'activity', /\bswim\b/i);
  add('Town walk', 'activity', /town walk/i);
  return next;
}

export function applyCustomerNotes(things, text, { collaborator = false, speakerName = '' } = {}) {
  const sentences = splitSentences(text);
  return (Array.isArray(things) ? things : []).map((thing) => {
    const pattern = thingPattern(thing.title);
    if (!pattern) return thing;
    const hits = sentences.filter((part) => pattern.test(part));
    if (!hits.length) return thing;
    const notes = Array.isArray(thing.notes) ? [...thing.notes] : [];
    const collaboratorNotes = Array.isArray(thing.collaboratorNotes) ? [...thing.collaboratorNotes] : [];
    const bucket = collaborator ? collaboratorNotes : notes;
    for (const hit of hits) {
      const line = collaborator && speakerName && !hit.includes(String(speakerName).split(/\s+/)[0])
        ? `${speakerName}: ${hit}`
        : hit;
      if ([...notes, ...collaboratorNotes, ...bucket].some((note) => sameNote(note, line))) continue;
      bucket.push(line);
    }
    const spanThing = thing.title === 'Big Island' || thing.title === 'Kailua-Kona house';
    let customerWhen = thing.customerWhen || '';
    if (thing.title === 'Groceries' && /Fri Apr 3|same day/i.test(String(thing.whenLabel || ''))) {
      customerWhen = 'Fri Apr 3';
    } else if (thing.title === 'Swim') {
      const labels = String(customerWhen || '').split(' · ').map((part) => part.trim()).filter((part) => swimDayKey(part) && !/^Fri Apr 3\b/i.test(part));
      for (const hit of hits) mergeSwimLabel(labels, swimPlanLabel(hit));
      customerWhen = labels.filter((part) => !/^Fri Apr 3\b/i.test(part)).join(' · ');
    } else if (thing.title === 'Gardens' || thing.title === 'Dinner' || thing.title === 'Town walk') {
      const labels = String(customerWhen || '').split(' · ').map((part) => part.trim()).filter(Boolean);
      for (const hit of hits) {
        if (/keep us on the big island|stay on the big island/i.test(hit)) continue;
        for (const dated of datedMentions(hit)) {
          const label = formatMention(dated, { withWeekday: true, withYear: Boolean(dated.year) });
          if (label && !labels.some((item) => item === label || item.startsWith(`${label} `))) labels.push(label);
        }
      }
      customerWhen = labels.join(' · ');
    } else if (!spanThing) {
      const datedHits = hits.filter((hit) => datedMentions(hit)[0] && !/keep us on the big island|stay on the big island/i.test(hit));
      const dated = datedHits.length ? datedMentions(datedHits[datedHits.length - 1])[0] : null;
      if (dated) customerWhen = formatMention(dated, { withWeekday: true, withYear: Boolean(dated.year) });
    }
    const who = thing.who || whoIn(hits.join(' ')) || '';
    return {
      ...thing,
      who,
      notes,
      collaboratorNotes,
      customerWhen,
      description: productThingSummary({
        ...thing,
        who,
        customerWhen,
        notes,
        collaboratorNotes,
      }),
    };
  });
}

export function acceptQualityRewrite(draft, rewritten) {
  const prior = String(draft || '').trim();
  const next = String(rewritten || '').trim();
  if (!next || next.replace(/\s+/g, ' ') === prior.replace(/\s+/g, ' ')) {
    return { text: prior, rewritten: false, draft: '' };
  }
  return { text: next, rewritten: true, draft: prior };
}

export function rewriteCreditLabel(model, note = '') {
  const credit = `rewritten by ${String(model || '').trim()}`;
  return String(note || '').trim() ? `${credit} (Jev note)` : credit;
}

export function mustRewriteQuality(quality) {
  if (quality?.hardFlag === true) return true;
  if (quality?.wantsRewrite === true) return true;
  const score = Number(quality?.score);
  const disposition = String(quality?.disposition || '');
  if (disposition === 'rewrite') return true;
  return Number.isFinite(score) && score <= 2;
}

export function stripChatMarkdown(value) {
  return String(value || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, '$1$2');
}

const AGE_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const WEEKDAY_NAME = { sun: 'sunday', mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', thu: 'thursday', thur: 'thursday', thurs: 'thursday', fri: 'friday', sat: 'saturday' };

function customerCorpus(priorTurns, customerTurn = '') {
  const turns = [...(Array.isArray(priorTurns) ? priorTurns : []), { role: 'customer', text: customerTurn }];
  return turns
    .filter((turn) => turn?.role !== 'app')
    .map((turn) => String(turn?.text || '').trim())
    .filter(Boolean)
    .join('\n');
}

function dayStamp(label) {
  const match = String(label || '').toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})\b/);
  return match ? `${match[1].slice(0, 3)} ${Number(match[2])}` : '';
}

function mentionStamp(mention) {
  const month = MONTH_ABBR[mention?.month] || '';
  if (!month || !mention?.day) return '';
  return `${month.toLowerCase()} ${Number(mention.day)}`;
}

function looseDayStamps(sentence, span) {
  const dated = datedMentions(sentence).map(mentionStamp).filter(Boolean);
  if (dated.length) return dated;
  const match = String(sentence || '').match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat)\b(?:[\s,]+(?:the\s+)?)?(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (!match || !span?.start) return [];
  const month = MONTH_ABBR[Number(String(span.start).slice(5, 7))] || '';
  return month ? [`${month.toLowerCase()} ${Number(match[2])}`] : [];
}

function weekdayName(sentence) {
  const match = String(sentence || '').match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat)\b/i);
  if (!match) return '';
  const word = match[1].toLowerCase();
  return WEEKDAY_NAME[word] || word;
}

function endWeekday(span) {
  if (!span?.end) return '';
  const date = new Date(`${String(span.end).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()] || '';
}

function endDayNumber(span) {
  if (!span?.end) return 0;
  return Number(String(span.end).slice(8, 10)) || 0;
}

function commitsDay(sentence) {
  if (/\?/.test(sentence)) return false;
  if (/\bor\b/i.test(sentence)) return false;
  return true;
}

export function customerTripFacts(priorTurns, customerTurn = '') {
  const corpus = customerCorpus(priorTurns, customerTurn);
  const span = intakeSpan(corpus);
  const sentences = splitSentences(corpus);
  const swimDays = new Set();
  const gardenDays = new Set();
  const owners = {};
  for (const sentence of sentences) {
    if (/\bswim\b/i.test(sentence)) {
      if (/tyler/i.test(sentence)) owners.swim = owners.swim || 'Tyler';
      if (commitsDay(sentence)) {
        for (const stamp of looseDayStamps(sentence, span)) swimDays.add(stamp);
      }
    }
    if (/garden/i.test(sentence)) {
      if (/kimberly/i.test(sentence)) owners.gardens = 'Kimberly';
      if (commitsDay(sentence)) {
        for (const stamp of looseDayStamps(sentence, span)) gardenDays.add(stamp);
      }
    }
  }
  const activities = [];
  if (/\bswim\b/i.test(corpus)) activities.push('swim');
  if (/garden/i.test(corpus)) activities.push('garden');
  if (/picnic/i.test(corpus)) activities.push('picnic');
  if (/town walk/i.test(corpus)) activities.push('town walk');
  if (/\bdinner\b/i.test(corpus)) activities.push('dinner');
  if (/grocer/i.test(corpus)) activities.push('groceries');
  const addressedTo = /this is tyler|tyler[^\n]{0,80}paid for my own seat/i.test(String(customerTurn || '')) ? 'Tyler' : '';
  return {
    span,
    swimDays: [...swimDays],
    gardenDays: [...gardenDays],
    owners,
    planOwned: /(?:bought|purchased|own) the unlimited plan/i.test(corpus),
    activities,
    corpus,
    addressedTo,
  };
}

function dayIsSet(stamps, set) {
  return stamps.some((stamp) => set.includes(stamp));
}

function pushError(errors, line) {
  if (line && !errors.includes(line)) errors.push(line);
}

export function draftFactErrors(reply, facts = {}) {
  const body = String(reply || '');
  const errors = [];
  const swimDays = Array.isArray(facts.swimDays) ? facts.swimDays : [];
  const gardenDays = Array.isArray(facts.gardenDays) ? facts.gardenDays : [];
  const span = facts.span || null;
  if (!facts.planOwned && /you(?:'|’)re all set (?:with|for) the\b[^.]{0,80}unlimited|you are all set (?:with|for) the\b[^.]{0,80}unlimited|already (?:own|have|set up)[^.]{0,40}unlimited/i.test(body)) {
    pushError(errors, 'the unlimited plan is not owned yet');
  }
  const endDay = endDayNumber(span);
  const shortened = body.match(/\bapril\s+\d{1,2}(?:st|nd|rd|th)?\s*(?:[\u2013\-]|to|through)\s*(?:the\s+)?(?:april\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (shortened && endDay && Number(shortened[1]) < endDay) {
    pushError(errors, `the trip runs through ${facts.span?.endLabel || span.end}, not April ${shortened[1]}`);
  }
  if (/no extra charge|no extra cost|at no extra/i.test(body) && !/no extra charge|no extra cost|at no extra/i.test(facts.corpus || '')) {
    pushError(errors, 'no extra charge is not in what the customer set');
  }
  if (/picnic/i.test(body) && !(facts.activities || []).includes('picnic')) {
    pushError(errors, 'a picnic was not named');
  }
  if (/kimberly/i.test(facts.owners?.gardens || '') && /tyler(?:'|’)s\s+gardens?/i.test(body)) {
    pushError(errors, 'the gardens are Kimberly\'s, not Tyler\'s');
  }
  if (facts.addressedTo === 'Tyler' && /kimberly/i.test(facts.owners?.gardens || '') && /your (?:two )?garden/i.test(body)) {
    pushError(errors, 'the gardens are Kimberly\'s, not Tyler\'s');
  }
  const sentences = splitSentences(body);
  const tripEnd = endWeekday(span);
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const next = sentences[index + 1] || '';
    const previous = sentences[index - 1] || '';
    const swimNegated = /\b(?:do not|don't)\b[^.]*\bswim\b|\bswim\b[^.]*\b(?:do not|don't)\b/i.test(sentence);
    if (/\bswim\b/i.test(sentence) && !swimNegated) {
      const stamps = [...looseDayStamps(previous, span), ...looseDayStamps(sentence, span), ...looseDayStamps(next, span)];
      const swimStamps = looseDayStamps(sentence, span);
      const attached = swimStamps.length ? swimStamps : stamps;
      if (swimDays.length && attached.length && !dayIsSet(attached, swimDays)) {
        pushError(errors, `a swim on ${attached.find((stamp) => !swimDays.includes(stamp)) || attached[0]} was not set by the customer`);
      }
    }
    if (/garden/i.test(sentence)) {
      const stamps = looseDayStamps(sentence, span);
      const already = /already set/i.test(sentence);
      if (gardenDays.length && stamps.length && !dayIsSet(stamps, gardenDays)) {
        pushError(errors, already ? `the garden on ${stamps[0]} is not already set` : `a garden on ${stamps[0]} was not set by the customer`);
      }
    }
    if (/after checkout|one last time|heading out|last day|last morning/i.test(sentence)) {
      const stamps = [...looseDayStamps(sentence, span), ...looseDayStamps(previous, span)];
      const named = weekdayName(sentence) || weekdayName(previous);
      const endStamp = span?.end ? dayStamp(`${MONTH_ABBR[Number(String(span.end).slice(5, 7))]} ${endDay}`) : '';
      const onEnd = (stamps.length && endStamp && stamps.includes(endStamp)) || (named && tripEnd && named === tripEnd);
      if ((stamps.length || named) && !onEnd) {
        pushError(errors, `${stamps[0] || named} is not the trip end`);
      }
    }
  }
  return errors;
}

export function draftAccuracyErrors(reply, context = {}) {
  const facts = context.facts || customerTripFacts(context.priorTurns || [], context.customerTurn || '');
  return draftFactErrors(reply, facts);
}

export function applyAccuracyRewrite(quality, errors) {
  const list = (Array.isArray(errors) ? errors : []).map((error) => String(error || '').trim()).filter(Boolean);
  if (!list.length) return quality;
  return {
    ...quality,
    accuracyErrors: list,
    factCheck: list,
    hardFlag: true,
    wantsRewrite: true,
  };
}

function ageFromWords(token) {
  const digits = String(token || '').match(/\b(\d{1,2})\b/);
  if (digits) {
    const age = Number(digits[1]);
    if (age >= 0 && age <= 18) return age;
  }
  const word = String(token || '').toLowerCase().match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
  return word ? AGE_WORDS[word[1]] : null;
}

function payerFromCustomer(corpus, name) {
  if (new RegExp(`\\bI pay for ${name}\\b`, 'i').test(corpus)) return 'owner';
  if (new RegExp(`\\b${name} pays for (?:himself|herself|themself)\\b`, 'i').test(corpus)) return name.toLowerCase();
  return '';
}

export function completeRosterParty(doc) {
  const stored = doc?.party && typeof doc.party === 'object' ? doc.party : {};
  const corpus = (Array.isArray(doc?.turns) ? doc.turns : [])
    .filter((turn) => turn?.role !== 'app')
    .map((turn) => String(turn?.text || ''))
    .join('\n');
  const party = {
    primary: stored.primary?.name
      ? { name: stored.primary.name, role: stored.primary.role || 'Owner' }
      : { name: doc?.customerName || doc?.targetPerson || 'Craig', role: 'Owner' },
    collaborators: Array.isArray(stored.collaborators) ? stored.collaborators.map((person) => ({ ...person })) : [],
    preference_subjects: Array.isArray(stored.preference_subjects)
      ? stored.preference_subjects.filter((kid) => kid?.name && Number.isFinite(Number(kid.age))).map((kid) => ({ name: kid.name, age: Number(kid.age) }))
      : [],
    viewers: Array.isArray(stored.viewers) ? stored.viewers.filter((person) => person?.name).map((person) => ({ name: person.name })) : [],
    editors: Array.isArray(stored.editors) ? stored.editors.filter((person) => person?.name).map((person) => ({ name: person.name })) : [],
  };
  for (const name of ['Kimberly', 'Tyler', 'Lauren']) {
    const payer = payerFromCustomer(corpus, name);
    const existing = party.collaborators.find((person) => new RegExp(name, 'i').test(person?.name || ''));
    if (existing) {
      if (payer) existing.payer = payer;
      continue;
    }
    if (payer) party.collaborators.push({ name: `${name} Davidson`, payer });
  }
  for (const name of ['Torren', 'Peyton', 'Keegan', 'Fallon']) {
    if (party.preference_subjects.some((kid) => kid.name === name)) continue;
    const match = corpus.match(new RegExp(`\\b${name}\\b(?:\\s+who\\s+is|\\s+is)\\s+([a-z0-9-]+)`, 'i'));
    const age = match ? ageFromWords(match[1]) : null;
    if (age == null) continue;
    party.preference_subjects.push({ name, age });
  }
  if (!party.viewers.length && /Marcus Chen[^\n]{0,60}(?:can view|can look)/i.test(corpus)) {
    party.viewers.push({ name: 'Marcus Chen' });
  }
  if (!party.editors.length && /Aunt Jean[^\n]{0,60}can edit/i.test(corpus)) {
    party.editors.push({ name: 'Aunt Jean' });
  }
  return party;
}

function rewriteAttempted(turn) {
  return turn?.quality?.rewritten === true
    || turn?.flagged === true
    || Boolean(String(turn?.rewriteModel || '').trim())
    || Boolean(String(turn?.rewriteText || '').trim());
}

const INTERIM_STOCK = /^(got it|sure|okay|ok|the plan stays|i am building the itinerary)\b/i;

export function isTemplateInterim(text, customerTurn) {
  const value = String(text || '').trim();
  if (!value || INTERIM_STOCK.test(value)) return true;
  const words = String(customerTurn || '').toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  const blob = value.toLowerCase();
  return !words.some((word) => blob.includes(word));
}

export function interimProblems(turns) {
  const problems = [];
  const seen = new Map();
  const list = Array.isArray(turns) ? turns : [];
  for (const turn of list) {
    if (turn?.role && turn.role !== 'app') continue;
    const interim = turn?.interimReply;
    const text = String(interim?.text || '').trim();
    const rewritten = rewriteAttempted(turn);
    const prior = list.slice(0, list.indexOf(turn)).reverse().find((item) => item?.role === 'customer');
    const template = prior
      ? isTemplateInterim(text, prior.text)
      : /^(got it|sure|okay|ok|the plan stays|i am building the itinerary)\b/i.test(text);
    if (rewritten) {
      if (!text || template) problems.push(`turn ${turn.turnIndex} rewrite is missing an interim reply`);
      else if (interim?.model !== 'google/gemini-2.5-flash-lite') {
        problems.push(`turn ${turn.turnIndex} interim model is not google/gemini-2.5-flash-lite`);
      }
    } else if (text) {
      problems.push(`turn ${turn.turnIndex} non-rewrite turn has an interim reply`);
      if (template) problems.push(`turn ${turn.turnIndex} interim reply is a template`);
    }
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) problems.push(`interim reply repeats across turns ${seen.get(key)} and ${turn.turnIndex}`);
    else seen.set(key, turn.turnIndex);
  }
  return problems;
}

export function nearIdenticalRewrite(draft, rewritten) {
  if (!rewriteReplacesDraft(draft, rewritten)) return true;
  const a = String(draft || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const b = String(rewritten || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!a || !b || b.includes(a) || a.includes(b)) return true;
  return bigramDice(a, b) >= 0.88;
}

function bigramDice(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (value) => {
    const map = new Map();
    for (let index = 0; index < value.length - 1; index += 1) {
      const gram = value.slice(index, index + 2);
      map.set(gram, (map.get(gram) || 0) + 1);
    }
    return map;
  };
  const left = grams(a);
  const right = grams(b);
  let shared = 0;
  for (const [gram, count] of left) shared += Math.min(count, right.get(gram) || 0);
  const total = [...left.values(), ...right.values()].reduce((sum, count) => sum + count, 0);
  return total ? (2 * shared) / total : 0;
}

export function shipChoice({ draft, rewrite, draftFactErrors = [], rewriteFactErrors = [] }) {
  const rewriteOk = Boolean(String(rewrite || '').trim()) && !nearIdenticalRewrite(draft, rewrite);
  const draftCount = (Array.isArray(draftFactErrors) ? draftFactErrors : []).length;
  const rewriteCount = (Array.isArray(rewriteFactErrors) ? rewriteFactErrors : []).length;
  const worse = rewriteCount > draftCount;
  if (rewriteOk && !worse) return { text: String(rewrite).trim(), rewritten: true, flagged: false, failReason: '' };
  return {
    text: draft,
    rewritten: false,
    flagged: true,
    failReason: worse ? 'rewrite_fact_check_worse' : '',
  };
}

export function formatQualityLine(quality) {
  if (!quality || quality.judged !== true) return '';
  const score = Number(quality.score);
  if (!Number.isFinite(score) || score < 1 || score > 5) return '';
  const shown = Number.isInteger(score) ? String(score) : String(Math.round(score * 1000) / 1000);
  const comment = String(quality.comment || '').replace(/\s+/g, ' ').trim();
  return comment ? `quality: ${shown} — ${comment}` : `quality: ${shown}`;
}

const REWRITE_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'be', 'this', 'that', 'it', 'you', 'your', 'we', 'our', 'with', 'from', 'as', 'if', 'so', 'not', 'do', 'does', 'what', 'when', 'where', 'who', 'how']);

function rewriteTokens(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !REWRITE_STOP.has(word));
}

export function rewriteKeepsSubstance(draft, rewritten) {
  const need = rewriteTokens(draft);
  if (!need.length) return true;
  const have = new Set(rewriteTokens(rewritten));
  const hit = need.filter((word) => have.has(word)).length;
  if (hit / need.length < 0.55) return false;
  const days = String(draft || '').match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi) || [];
  return days.every((day) => new RegExp(`\\b${day}\\b`, 'i').test(String(rewritten || '')));
}

export function rewriteAnswersQuestion(customerTurn, rewritten) {
  const body = String(rewritten || '');
  if (customerAsksPrice(customerTurn)) return priceAnswered(body, customerTurn);
  if (customerAsksAccessChoice(customerTurn)) return /\bview access\b/i.test(body) && /\bedit access\b/i.test(body);
  const question = splitSentences(customerTurn).find((sentence) => /\?/.test(sentence));
  if (!question) return true;
  const words = rewriteTokens(question);
  if (!words.length) return true;
  const have = new Set(rewriteTokens(body));
  return words.some((word) => have.has(word));
}

export function rewriteReplacesDraft(draft, rewritten) {
  const prior = String(draft || '').replace(/\s+/g, ' ').trim();
  const next = String(rewritten || '').replace(/\s+/g, ' ').trim();
  if (!next || next === prior) return false;
  if (next.startsWith(prior) || prior.startsWith(next)) return false;
  if (next.includes(prior)) return false;
  if (STOCK_REWRITE_LEAD.test(next)) return false;
  return true;
}

export function hardQualityFlags(reply, customerTurn, corpus) {
  const body = String(reply || '');
  return {
    split: item34BanHit(body),
    invented: inventedVenueNames(body, corpus),
    missingPrice: customerAsksPrice(customerTurn) && !priceAnswered(body, customerTurn),
    missingAccess: customerAsksAccessChoice(customerTurn) && !(/\bview access\b/i.test(body) && /\bedit access\b/i.test(body)),
  };
}

export function correctFalsePriceMiss(quality, reply, customerTurn) {
  if (!customerAsksPrice(customerTurn) || priceAnswered(reply, customerTurn)) return quality;
  return {
    ...quality,
    score: Math.min(Number(quality?.score) || 1, 3),
    wantsRewrite: true,
  };
}

export function dockQuality(quality, flags) {
  const rule = Boolean(flags?.invented?.length || flags?.split || flags?.missingPrice || flags?.missingAccess);
  const score = rule ? Math.min(Number(quality?.score) || 1, 3) : Number(quality?.score);
  return {
    ...quality,
    score,
    hardFlag: rule,
    wantsRewrite: quality?.wantsRewrite === true || score <= 2 || rule,
  };
}

function keepPriceStripWelcome(text) {
  const paragraphs = String(text || '').split(/\n{2,}/);
  const kept = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).filter((sentence) => !isCollabWelcome(sentence));
    const joined = sentences.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
    if (joined) kept.push(joined);
  }
  return kept.join('\n\n').trim();
}

function applyUpsellPolicy(reply, upsell, postIntake, customerTurn = '') {
  const value = stripChatMarkdown(String(reply || '').trim());
  if (customerAsksPrice(customerTurn)) return keepPriceStripWelcome(value);
  if (upsell === 'forbidden') return stripUpsell(value);
  return value;
}

function rewriteBreaksUpsell(text, upsell, customerTurn) {
  if (upsell !== 'forbidden') return false;
  if (isCollabWelcome(text)) return true;
  if (customerAsksPrice(customerTurn)) return false;
  return isFullUpsell(text) || UNLIMITED_PATTERN.test(text);
}

function item34Reason(text) {
  return item34BanHit(text) ? 'item34_ban' : '';
}

function cleanCandidate(text, upsell, postIntake, customerTurn, corpus) {
  let value = applyUpsellPolicy(text, upsell, postIntake, customerTurn);
  if (item34BanHit(value)) value = applyUpsellPolicy(stripItem34Ban(value), upsell, postIntake, customerTurn);
  if (inventedVenueNames(value, corpus).length) value = applyUpsellPolicy(stripInventedVenues(value, corpus), upsell, postIntake, customerTurn);
  return value;
}

export async function produceLiveAppReply({ customerTurn, session, priorTurns, tripTitle, env = process.env } = {}) {
  const rules = await loadVacationAppReplyRules(env);
  const history = Array.isArray(priorTurns) ? priorTurns : [];
  const memory = memoryTurns(history);
  const destination = destinationFromTexts([
    tripTitle,
    ...history.map((turn) => turn.text),
    customerTurn,
  ]);
  const postIntake = postIntakeUpsellTurn(customerTurn, history);
  const upsell = upsellModeForTurn(customerTurn, history);
  const corpus = [customerTurn, ...history.filter((turn) => turn?.role === 'customer').map((turn) => turn.text)].join('\n');
  const tripContext = draftingFacts(history, customerTurn);
  const tripFacts = customerTripFacts(history, customerTurn);
  const planLine = customerAsksPrice(customerTurn) ? payerPriceLine(customerTurn, env) : '';
  const seatDollars = planSeatDollars(env);
  const planTable = planLine
    ? {
      plan_name: 'unlimited vacations for the whole year',
      dollars_per_collaborator_seat: seatDollars,
      payer_line: planLine,
    }
    : null;
  const jevStarted = Date.now();
  const jev = await jevPrecall({
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    session: { seed_id: session?.token || null },
    env,
  });
  if (jev && typeof jev === 'object') jev.jevLatencyMs = Math.max(0, Date.now() - jevStarted);
  if (!rules?.ok) {
    return {
      reply: null,
      rules,
      jev,
      model: null,
      reason: rules?.error || 'reply_rules_unloaded',
    };
  }
  if (!jev?.jevRan) {
    return {
      reply: null,
      rules,
      jev,
      model: null,
      jevLatencyMs: jev?.jevLatencyMs ?? null,
      genLatencyMs: null,
      jevBeforeModel: false,
      reason: jev?.error || 'jev_skipped',
    };
  }
  jev.jevBeforeModel = true;
  const genStarted = Date.now();
  const modelArgs = (turnText, mode) => ({
    rules,
    jev,
    customerTurn: turnText,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    destination,
    memory,
    upsell: mode,
    postIntake,
    env,
    tripContext,
    planTable,
    planLine,
    seatDollars,
  });
  let model = await callTieredModel(modelArgs(customerTurn, upsell));
  let reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake, customerTurn);
  for (let attempt = 0; attempt < 2 && !String(reply || '').trim(); attempt += 1) {
    model = await callTieredModel(modelArgs(`${customerTurn}\n\nWrite the reply in sentences. Do not return an empty message.`, upsell));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake, customerTurn);
  }
  if (reply && replyLeavesDestination(reply, destination)) {
    model = await callTieredModel(modelArgs(`${customerTurn}\n\nStay on ${destination}. Do not name another city or island.`, upsell));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake, customerTurn);
    if (replyLeavesDestination(reply, destination)) {
      reply = splitSentences(reply).filter((sentence) => !OTHER_DESTINATION.test(sentence)).join(' ').trim();
    }
  }
  if (rewriteBreaksUpsell(reply, upsell, customerTurn)) {
    const nudge = customerAsksPrice(customerTurn)
      ? `${customerTurn}\n\nAnswer with who pays: ${payerPriceLine(customerTurn) || 'the dollar amount for each person and who pays'}. Do not add a second collaborator welcome.`
      : `${customerTurn}\n\nDo not welcome collaborators. Do not mention price, access, or ${UNLIMITED_PHRASE}. Answer the day only.`;
    model = await callTieredModel(modelArgs(nudge, 'forbidden'));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake, customerTurn);
  }
  if (model && typeof model === 'object') model.genLatencyMs = Math.max(0, Date.now() - genStarted);
  const banned = appTextBanned(reply);
  if (!reply || banned) {
    const interim = await interimFromTierOne({ rules, customerTurn, destination, env });
    if (interim.text && !appTextBanned(interim.text)) {
      reply = applyUpsellPolicy(interim.text, upsell, postIntake, customerTurn);
      model = {
        called: true,
        via: 'openrouter-chat',
        responseModel: INTERIM_MODEL,
        modelTier: 1,
        text: reply,
        genLatencyMs: interim.ms,
        maxTokens: 900,
      };
    }
  }
  if (!reply || appTextBanned(reply)) {
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: banned || model?.reason || 'live dispatcher returned no reply',
    };
  }
  const originalDraft = reply;
  const draftModel = String(model?.responseModel || '').trim();
  const draftLatencyMs = Number(model?.genLatencyMs) || Math.max(0, Date.now() - genStarted);
  const draftFlags = hardQualityFlags(originalDraft, customerTurn, corpus);
  const qualityStarted = Date.now();
  let quality = await jevQualityRewrite({ customerTurn, draft: originalDraft, tripContext, planLine, env });
  if (!quality?.judged) quality = await jevQualityRewrite({ customerTurn, draft: originalDraft, tripContext, planLine, env });
  const draftQualityMs = Math.max(0, Date.now() - qualityStarted);
  const factErrors = draftFactErrors(originalDraft, tripFacts);
  if (quality?.judged) {
    quality = correctFalsePriceMiss(dockQuality(quality, draftFlags), originalDraft, customerTurn);
    quality = applyAccuracyRewrite(quality, factErrors);
    quality = await settleJevNote(quality, customerTurn, originalDraft, env);
    quality.judgeMs = draftQualityMs;
  }
  const jevNote = quality?.jevNote || null;
  const draftFactLine = factErrors.length ? factErrors.join('; ') : 'ok';
  const baseLog = {
    draftModel,
    rewriteModel: null,
    shippedModel: draftModel,
    jevScoreDraft: quality.score,
    jevScoreRaw: rawScore(quality.scoreRaw),
    jevDisposition: quality.disposition || null,
    jevFixFocus: quality.jevFocus || null,
    draftJevScoreRaw: rawScore(quality.scoreRaw),
    draftJevDisposition: quality.disposition || null,
    draftJevFixFocus: quality.jevFocus || null,
    rewriteJevScoreRaw: null,
    rewriteJevDisposition: null,
    rewriteJevFixFocus: null,
    draftFactCheck: draftFactLine,
    rewriteFactCheck: null,
    jevScoreRewrite: null,
    jevNote,
    jevNoteReason: quality?.jevNoteReason || (jevNote ? null : 'jev_no_free_text'),
    interimReply: { text: null, model: null, ms: null },
    latencyMs: { draft: draftLatencyMs, rewrite: null, jevDraft: draftQualityMs, jevRewrite: null, total: draftLatencyMs + draftQualityMs },
    flagged: false,
  };
  if (!quality?.judged) {
    return {
      reply: originalDraft,
      rules,
      jev,
      model: {
        ...(model || {}),
        quality: quality || { judged: false },
        log: { ...baseLog, draftText: originalDraft, flagged: false, rewriteFailReason: quality?.reason || 'quality_not_judged' },
      },
      quality: quality || { judged: false },
      log: { ...baseLog, draftText: originalDraft, flagged: false, rewriteFailReason: quality?.reason || 'quality_not_judged' },
      reason: quality?.reason || 'quality_not_judged',
    };
  }
  const needsRewrite = mustRewriteQuality(quality);
  if (!needsRewrite) {
    const shipped = stampShippedReply({
      reply: originalDraft,
      quality,
      draftModel,
      log: { ...baseLog, draftText: originalDraft, flagged: false },
      draft: originalDraft,
    });
    shipped.model.modelTier = model?.modelTier ?? jev?.modelTier ?? null;
    shipped.model.beats = model?.beats || null;
    shipped.model.via = model?.via || shipped.model.via;
    return { reply: shipped.reply, rules, jev, model: shipped.model, quality: shipped.quality, log: shipped.log, reason: null };
  }
  const interimStarted = Date.now();
  const interimReply = await interimFromTierOne({ rules, customerTurn, destination, env });
  interimReply.ms = Math.max(interimReply.ms || 0, Date.now() - interimStarted);
  const pending = {
    customerTurn,
    draft: originalDraft,
    draftModel,
    draftScore: quality.score,
    jevNote,
    quality,
    jev,
    upsell,
    postIntake,
    destination,
    corpus,
    tripContext,
    tripFacts,
    planTable,
    planLine,
    seatDollars,
    failureReason: qualityFailureReason(quality, draftFlags),
    interimReply,
    draftLatencyMs,
    qualityJevMs: draftQualityMs,
    model: {
      called: Boolean(model?.called),
      via: model?.via || null,
      responseModel: model?.responseModel || null,
      modelTier: model?.modelTier ?? null,
      genLatencyMs: draftLatencyMs,
      maxTokens: model?.maxTokens ?? null,
      beats: model?.beats || null,
    },
  };
  const finished = await finishTierRewrite({ pending, env });
  if (finished.log) finished.log.interimReply = interimReply;
  if (!String(interimReply.text || '').trim()) {
    return {
      reply: finished.reply,
      rules,
      jev,
      model: finished.model,
      quality: finished.quality,
      log: finished.log,
      reason: finished.reason,
    };
  }
  return {
    reply: null,
    status: 'interim',
    interimReply,
    pending: { ...pending, resolved: finished },
    rules,
    jev,
    model,
    quality,
    reason: null,
  };
}

function interimFacts(customerTurn, destination) {
  const days = [...new Set((String(customerTurn || '').match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/gi) || []).map((day) => day[0].toUpperCase() + day.slice(1).toLowerCase()))];
  return [
    destination ? `Place already named: ${destination}.` : 'No destination was named.',
    days.length ? `Days named in this turn: ${days.join(', ')}.` : 'This turn names no day.',
    'Use only those facts. Do not add a day, a Monday plan, or a place that this turn did not name.',
    'Do not write BEAT, a label, or a rules tag.',
  ].join(' ');
}

async function interimFromTierOne({ rules, customerTurn, destination, env }) {
  const started = Date.now();
  const systemExtra = `This is a one or two sentence holding line. ${interimFacts(customerTurn, destination)} Ignore any instruction to end with BEAT.`;
  const call = () => callTieredModel({
    rules,
    jev: { jevRan: true, modelTier: 1 },
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    destination,
    memory: [],
    upsell: 'forbidden',
    postIntake: false,
    env,
    forceModel: INTERIM_MODEL,
    timeoutMs: 8000,
    systemExtra,
  });
  let model = await call();
  let text = String(model?.text || '').trim();
  if (isTemplateInterim(text, customerTurn)) {
    model = await call();
    text = String(model?.text || '').trim();
  }
  if (isTemplateInterim(text, customerTurn) || model?.responseModel !== INTERIM_MODEL) text = '';
  return { text, model: INTERIM_MODEL, ms: Math.max(0, Date.now() - started) };
}

async function settleJevNote(quality, customerTurn, draft, env) {
  if (!quality?.judged || !quality.noteUnusable) return quality;
  const again = await jevQualityRewrite({ customerTurn, draft, env });
  const againNote = again?.judged ? again.jevNote : null;
  const usable = againNote && !again.noteUnusable && !noteContradictsDraft(againNote, draft) && !isTemplateNote(againNote, customerTurn);
  if (usable) {
    return { ...quality, comment: againNote, jevNote: againNote, jevNoteReason: null, noteUnusable: false, noteUnusableReason: null };
  }
  return {
    ...quality,
    comment: null,
    jevNote: null,
    jevNoteReason: quality.noteUnusableReason || 'note_unusable',
    noteUnusable: false,
  };
}

function stampShippedReply({ reply, quality, draftModel, log, draft }) {
  const shippedRewrite = log.shippedRewrite === true;
  const next = {
    ...quality,
    rewritten: shippedRewrite,
    model: JEV_QUALITY_MODEL,
    comment: log.jevNote || quality?.comment || '',
    draft: draft || log.draftText || '',
    rewriteText: log.rewriteText || '',
    rewriteModel: log.rewriteModel || '',
    draftModel,
    shippedModel: log.shippedModel,
  };
  return {
    reply,
    quality: next,
    log,
    model: {
      called: true,
      via: 'openrouter-chat',
      responseModel: draftModel,
      modelTier: null,
      genLatencyMs: log.latencyMs?.draft ?? null,
      maxTokens: 900,
      beats: null,
      quality: next,
      log,
    },
  };
}

export async function finishTierRewrite({ pending, env = process.env } = {}) {
  const rules = await loadVacationAppReplyRules(env);
  const facts = pending?.tripFacts || customerTripFacts([], pending?.customerTurn || '');
  const draftErrors = draftFactErrors(pending?.draft, facts);
  async function askRewrite(failure) {
    const started = Date.now();
    const called = await callTieredModel({
      rules,
      jev: pending?.jev,
      customerTurn: `${pending?.customerTurn || ''}\n\nRewrite the draft. The scoring failure is: ${failure || 'the draft missed this turn'}. Keep only days and places the customer already named. Do not paste the draft.\nDraft:\n${pending?.draft || ''}`,
      stage: 'vacation_conversation',
      screen: 'vacation-app',
      destination: pending?.destination || '',
      memory: [],
      upsell: pending?.upsell || 'forbidden',
      postIntake: pending?.postIntake === true,
      env,
      forceModel: pending?.draftModel || '',
      timeoutMs: 20000,
      tripContext: pending?.tripContext || null,
      planTable: pending?.planTable || null,
      planLine: pending?.planLine || '',
      seatDollars: pending?.seatDollars || 0,
      systemExtra: [
        'Rewrite the draft. Do not copy it and do not put a lead line in front of it. Do not insert a sentence the draft did not earn.',
        failure ? `The scoring failure is: ${failure}. Fix that failure.` : '',
        'Do not assign a swim, a garden, checkout, or one last time to a day the customer did not set. Do not say the unlimited plan is already owned.',
        pending?.planTable?.payer_line
          ? `Plan table: ${pending.planTable.plan_name}. $${pending.planTable.dollars_per_collaborator_seat} per collaborator seat. State this payer line exactly: ${pending.planTable.payer_line}. Make no coverage claims. Do not say whole group. Do not say Fallon.`
          : '',
      ].filter(Boolean).join(' '),
    });
    return { called, ms: Math.max(0, Date.now() - started) };
  }
  function acceptText(called) {
    const modelText = called?.called && called.text ? String(called.text).trim() : '';
    let rewritten = modelText
      ? cleanCandidate(modelText, pending?.upsell, pending?.postIntake === true, pending?.customerTurn, pending?.corpus)
      : '';
    if (item34Reason(rewritten)) rewritten = cleanCandidate(stripItem34Ban(rewritten), pending?.upsell, pending?.postIntake === true, pending?.customerTurn, pending?.corpus);
    return { modelText, rewritten, called };
  }
  let attempt = await askRewrite(pending?.failureReason);
  let rewriteMs = attempt.ms;
  let parsed = acceptText(attempt.called);
  if (!parsed.modelText) {
    const again = await askRewrite(pending?.failureReason);
    rewriteMs += again.ms;
    const second = acceptText(again.called);
    if (second.modelText) {
      attempt = again;
      parsed = second;
    }
  }
  let rewriteErrors = parsed.rewritten ? draftFactErrors(parsed.rewritten, facts) : [];
  if (parsed.rewritten && rewriteErrors.length) {
    const again = await askRewrite(`${pending?.failureReason || 'fact check'}; ${rewriteErrors.join('; ')}`);
    rewriteMs += again.ms;
    const second = acceptText(again.called);
    const secondErrors = second.rewritten ? draftFactErrors(second.rewritten, facts) : [];
    if (second.modelText && secondErrors.length < rewriteErrors.length) {
      attempt = again;
      parsed = second;
      rewriteErrors = secondErrors;
    }
  }
  const model = attempt.called;
  const { modelText, rewritten } = parsed;
  let failReason = '';
  if (!modelText) failReason = model?.reason || 'rewrite_empty';
  else if (!rewritten) failReason = 'rewrite_rejected';
  else if (nearIdenticalRewrite(pending?.draft, rewritten)) failReason = 'rewrite_near_draft';
  else if (appTextBanned(rewritten)) failReason = 'rewrite_banned';
  else if (replyLeavesDestination(rewritten, pending?.destination)) failReason = 'rewrite_left_destination';
  const judgedText = rewritten || modelText;
  let rewriteQuality = null;
  const rewriteQualityStarted = Date.now();
  if (judgedText) {
    rewriteQuality = await jevQualityRewrite({ customerTurn: pending.customerTurn, draft: judgedText, tripContext: pending.tripContext, planLine: pending.planLine, env });
    if (!rewriteQuality?.judged) rewriteQuality = await jevQualityRewrite({ customerTurn: pending.customerTurn, draft: judgedText, tripContext: pending.tripContext, planLine: pending.planLine, env });
    if (rewriteQuality?.judged) {
      const rewriteFlags = hardQualityFlags(judgedText, pending.customerTurn, pending.corpus);
      rewriteQuality = correctFalsePriceMiss(
        dockQuality(rewriteQuality, rewriteFlags),
        judgedText,
        pending.customerTurn,
      );
      rewriteQuality = applyAccuracyRewrite(rewriteQuality, rewriteErrors);
      rewriteQuality = await settleJevNote(rewriteQuality, pending.customerTurn, judgedText, env);
      rewriteQuality.judgeMs = null;
    } else {
      failReason = failReason || 'rewrite_not_judged';
    }
  }
  const choice = shipChoice({
    draft: pending.draft,
    rewrite: failReason ? '' : rewritten,
    draftFactErrors: draftErrors,
    rewriteFactErrors: rewriteErrors,
  });
  if (!choice.rewritten && !failReason) {
    failReason = choice.failReason === 'rewrite_fact_check_worse'
      ? `rewrite_fact_check_worse: ${rewriteErrors.join('; ')}`
      : 'rewrite_not_shipped';
  }
  const rewriteQualityMs = Math.max(0, Date.now() - rewriteQualityStarted);
  const draftQualityMs = Number(pending.qualityJevMs) || 0;
  const rewriteModel = String(model?.responseModel || pending.draftModel || '').trim();
  const shippedModel = choice.rewritten ? rewriteModel : pending.draftModel;
  const shippedScore = choice.rewritten && rewriteQuality?.judged ? rewriteQuality.score : pending.draftScore;
  const shippedQuality = choice.rewritten && rewriteQuality?.judged ? rewriteQuality : pending.quality;
  const shippedNote = shippedQuality?.jevNote || null;
  const judgeMs = choice.rewritten ? rewriteQualityMs : (Number(pending.quality?.judgeMs) || draftQualityMs);
  const draftFactLine = draftErrors.length ? draftErrors.join('; ') : 'ok';
  const rewriteFactLine = modelText ? (rewriteErrors.length ? rewriteErrors.join('; ') : 'ok') : 'none';
  const rewriteAttempt = {
    text: modelText || null,
    model: rewriteModel || null,
    score: rewriteQuality?.judged ? rewriteQuality.score : null,
    ms: rewriteMs,
    error: choice.rewritten ? null : (failReason || model?.reason || 'rewrite_empty'),
  };
  const log = {
    draftModel: pending.draftModel,
    draftText: pending.draft,
    rewriteModel,
    rewriteText: modelText || rewritten || '',
    rewriteFailReason: choice.rewritten ? '' : (failReason || model?.reason || 'rewrite_empty'),
    rewriteAttempts: [rewriteAttempt],
    shippedRewrite: choice.rewritten,
    shippedModel,
    jevScoreDraft: pending.draftScore,
    jevScoreRaw: rawScore(shippedQuality?.scoreRaw) ?? rawScore(pending.quality?.scoreRaw),
    jevDisposition: shippedQuality?.disposition || pending.quality?.disposition || null,
    jevFixFocus: shippedQuality?.jevFocus || pending.quality?.jevFocus || null,
    draftJevScoreRaw: rawScore(pending.quality?.scoreRaw),
    draftJevDisposition: pending.quality?.disposition || null,
    draftJevFixFocus: pending.quality?.jevFocus || null,
    rewriteJevScoreRaw: rawScore(rewriteQuality?.scoreRaw),
    rewriteJevDisposition: rewriteQuality?.disposition || null,
    rewriteJevFixFocus: rewriteQuality?.jevFocus || null,
    draftFactCheck: draftFactLine,
    rewriteFactCheck: rewriteFactLine,
    jevScoreRewrite: rewriteQuality?.judged ? rewriteQuality.score : null,
    jevNote: shippedNote,
    jevNoteReason: shippedNote ? null : (shippedQuality?.jevNoteReason || 'jev_no_free_text'),
    interimReply: pending.interimReply || { text: null, model: null, ms: null },
    latencyMs: {
      draft: pending.draftLatencyMs,
      rewrite: rewriteMs,
      jevDraft: draftQualityMs,
      jevRewrite: rewriteQualityMs,
      total: Number(pending.draftLatencyMs || 0) + rewriteMs + Number(pending.interimReply?.ms || 0) + draftQualityMs + rewriteQualityMs,
    },
    flagged: choice.flagged,
  };
  const quality = {
    ...(choice.rewritten && rewriteQuality?.judged ? rewriteQuality : pending.quality),
    score: shippedScore,
    comment: shippedNote,
    judgeMs,
  };
  const stamped = stampShippedReply({
    reply: choice.text,
    quality,
    draftModel: pending.draftModel,
    log,
    draft: pending.draft,
  });
  stamped.model.responseModel = pending.model?.responseModel || pending.draftModel;
  stamped.model.modelTier = pending.model?.modelTier ?? pending.jev?.modelTier ?? null;
  stamped.model.genLatencyMs = pending.draftLatencyMs;
  stamped.model.beats = pending.model?.beats || null;
  stamped.model.maxTokens = pending.model?.maxTokens ?? 900;
  return { reply: stamped.reply, rules, jev: pending.jev, model: stamped.model, quality: stamped.quality, log, reason: null };
}

function payloadObject(payload) {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return typeof payload === 'object' ? payload : {};
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

export function liveTranscriptFromRows({ session, rows }) {
  const targetPerson = targetPersonFromSession(session);
  const turns = (rows || []).map((row) => {
    const payload = payloadObject(row.payload);
    const live = payload.liveTranscript && typeof payload.liveTranscript === 'object' ? payload.liveTranscript : {};
    const text = String(row.body || '');
    return {
      turnIndex: Number(live.turnIndex),
      role: live.role,
      modality: live.modality,
      text,
      speakerName: live.speakerName || null,
      storedText: live.text == null ? text : String(live.text),
      at: iso(live.at || row.received_at || row.sent_at || row.created_at),
      latencyMs: Number(live.latencyMs ?? row.response_latency_ms),
      sessionE2eMs: Number(live.sessionE2eMs),
      jev: live.jev && typeof live.jev === 'object' ? live.jev : null,
      replyProducer: live.replyProducer || null,
      dispatcher: live.dispatcher || null,
      fixedOpener: live.fixedOpener === true,
      invented: live.invented === true,
      modelId: live.modelId || live.model?.responseModel || live.jev?.responseModel || null,
      genLatencyMs: Number.isFinite(Number(live.genLatencyMs ?? live.model?.genLatencyMs)) ? Number(live.genLatencyMs ?? live.model?.genLatencyMs) : null,
      jevLatencyMs: Number.isFinite(Number(live.jevLatencyMs ?? live.jev?.jevLatencyMs)) ? Number(live.jevLatencyMs ?? live.jev?.jevLatencyMs) : null,
      maxTokens: Number.isFinite(Number(live.maxTokens ?? live.model?.maxTokens)) ? Number(live.maxTokens ?? live.model?.maxTokens) : null,
      jevBeforeModel: live.jevBeforeModel === true || live.jev?.jevBeforeModel === true,
      beats: Array.isArray(live.beats) ? live.beats : null,
      quality: live.quality && typeof live.quality === 'object' ? live.quality : null,
      shippedModel: live.shippedModel || live.quality?.shippedModel || null,
      draftModel: live.draftModel || live.quality?.draftModel || null,
      rewriteModel: live.rewriteModel || live.quality?.rewriteModel || null,
      jevScoreDraft: scored(live.jevScoreDraft),
      jevScoreRewrite: scored(live.jevScoreRewrite),
      jevScoreRaw: rawScore(live.jevScoreRaw),
      jevDisposition: live.jevDisposition || live.quality?.disposition || null,
      jevFixFocus: live.jevFixFocus || live.quality?.jevFocus || null,
      draftJevScoreRaw: rawScore(live.draftJevScoreRaw),
      draftJevDisposition: live.draftJevDisposition || null,
      draftJevFixFocus: live.draftJevFixFocus || null,
      rewriteJevScoreRaw: rawScore(live.rewriteJevScoreRaw),
      rewriteJevDisposition: live.rewriteJevDisposition || null,
      rewriteJevFixFocus: live.rewriteJevFixFocus || null,
      draftFactCheck: live.draftFactCheck || null,
      rewriteFactCheck: live.rewriteFactCheck || null,
      rewriteText: live.rewriteText || live.quality?.rewriteText || '',
      rewriteFailReason: live.rewriteFailReason || '',
      rewriteAttempts: Array.isArray(live.rewriteAttempts) ? live.rewriteAttempts : null,
      jevNote: live.jevNote || null,
      jevNoteReason: live.jevNoteReason || live.quality?.jevNoteReason || null,
      interimReply: live.interimReply || null,
      modelLatency: live.modelLatency || null,
      flagged: live.flagged === true,
      model: live.model || null,
      rules: live.rules || null,
    };
  });
  const last = turns[turns.length - 1] || null;
  return {
    live: true,
    capture: LIVE_TRANSCRIPT_CAPTURE,
    sessionToken: session?.token || null,
    targetPerson,
    customerName: session?.display_name || session?.displayName || targetPerson || null,
    tripId: session?.trip_id || session?.tripId || null,
    startedAt: turns[0]?.at || null,
    endedAt: last?.at || null,
    sessionE2eMs: (() => {
      const values = turns.map((turn) => Number(turn.sessionE2eMs)).filter((value) => value > 0);
      if (values.length) return Math.max(...values);
      return last && Number.isFinite(last.sessionE2eMs) ? last.sessionE2eMs : null;
    })(),
    turns,
  };
}

export async function loadLiveTranscriptByToken(db, token) {
  const sessions = await db`
    select
      onboarding_sessions.token,
      onboarding_sessions.customer_id,
      onboarding_sessions.trip_id,
      customers.display_name,
      customers.first_name,
      customers.last_name
    from onboarding_sessions
    left join customers on customers.id = onboarding_sessions.customer_id
    where onboarding_sessions.token = ${token}
    limit 1
  `;
  const session = sessions[0];
  if (!session?.customer_id || !session.trip_id) {
    const error = new Error('live transcript session not found');
    error.code = 'LIVE_TRANSCRIPT_MISSING';
    throw error;
  }
  const rows = await db`
    select speaker, body, payload, direction, received_at, sent_at, created_at, response_latency_ms
    from transcript_turns
    where customer_id = ${session.customer_id}
      and trip_id = ${session.trip_id}
      and channel = 'vacation-app'
      and payload->'liveTranscript' is not null
    order by coalesce(received_at, sent_at, created_at) asc
  `;
  const doc = liveTranscriptFromRows({ session, rows });
  const tripRows = await db`
    select metadata
    from trips
    where id = ${session.trip_id}
    limit 1
  `;
  const tripMeta = tripRows[0]?.metadata && typeof tripRows[0].metadata === 'object' ? tripRows[0].metadata : {};
  const collabRows = await db`
    select display_name, metadata
    from vacation_collaborators
    where owner_customer_id = ${session.customer_id}
      and trip_id = ${session.trip_id}
      and status = 'active'
    order by accepted_at asc nulls last, created_at asc
  `;
  const stored = tripMeta.dialogParty && typeof tripMeta.dialogParty === 'object' ? tripMeta.dialogParty : {};
  const collaborators = collabRows.map((row) => {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    return { name: row.display_name, payer: meta.payer || 'owner' };
  });
  doc.party = {
    primary: stored.primary || { name: doc.customerName || doc.targetPerson, role: 'Owner' },
    collaborators: collaborators.length ? collaborators : (stored.collaborators || []),
    preference_subjects: stored.preference_subjects || stored.kids || [],
    viewers: stored.viewers || [],
    editors: stored.editors || [],
  };
  return doc;
}

export function transcriptToJsonl(doc) {
  const header = {
    type: 'session',
    live: doc.live === true,
    capture: doc.capture || null,
    sessionToken: doc.sessionToken || null,
    targetPerson: doc.targetPerson || null,
    customerName: doc.customerName || null,
    tripId: doc.tripId || null,
    startedAt: doc.startedAt || null,
    endedAt: doc.endedAt || null,
    sessionE2eMs: doc.sessionE2eMs ?? null,
    buildSha: doc.buildSha || null,
    party: completeRosterParty(doc),
  };
  const lines = [header, ...(doc.turns || []).map((turn) => ({ type: 'turn', ...turn }))];
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}

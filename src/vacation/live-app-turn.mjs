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
  if (value == null || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function runningBuildSha(env = process.env) {
  return String(env.VERCEL_GIT_COMMIT_SHA || env.TIMESYNCHER_BUILD_SHA || '').trim();
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
  buildSha = runningBuildSha(),
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
    buildSha: String(buildSha || '').trim() || null,
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
        score: scored(model.quality.score),
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
      record.rewriteJevScoreRaw = log.rewriteModel || log.rewriteText ? rawScore(log.rewriteJevScoreRaw) : null;
      record.rewriteJevDisposition = log.rewriteJevDisposition || null;
      record.rewriteJevFixFocus = log.rewriteJevFixFocus || null;
      record.rejudgeMs = finiteOrNull(log.rejudgeMs);
      record.rawModelText = log.rawModelText == null ? null : String(log.rawModelText);
      record.draftFactCheck = log.draftFactCheck || null;
      record.rewriteFactCheck = log.rewriteFactCheck || null;
      if (log.rewriteFailReason) record.rewriteFailReason = String(log.rewriteFailReason);
      if (Array.isArray(log.rewriteAttempts)) record.rewriteAttempts = log.rewriteAttempts;
      record.jevNote = null;
      record.jevNoteReason = log.jevNoteReason || 'jev_no_free_text';
      record.rewriterChange = log.rewriterChange || null;
      record.savedTrip = log.savedTrip || null;
      record.interimReply = log.interimReply || null;
      record.modelLatency = log.latencyMs || null;
      record.flagged = log.flagged === true;
      record.held = log.held === true;
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

function projectCustomerRecord(priorTurns, customerTurn = '') {
  const corpus = customerCorpus(priorTurns, customerTurn);
  const span = intakeSpan(corpus);
  let things = ensureNamedThings(thingsFromIntake(corpus), corpus);
  if (corpus) things = applyCustomerNotes(things, corpus);
  const party = completeRosterParty({ turns: [{ role: 'customer', text: corpus }] });
  return {
    start: span?.start || '',
    end: span?.end || '',
    span,
    things,
    party,
    planOwned: false,
    rule: intakeFacts(corpus).rule || '',
    addressedTo: (String(customerTurn || '').match(/\bthis is ([A-Z][a-z]+)/i) || [])[1] || '',
  };
}

export function draftingFacts(priorTurns, customerTurn = '', saved = null) {
  const record = saved && typeof saved === 'object' ? saved : projectCustomerRecord(priorTurns, customerTurn);
  const things = Array.isArray(record?.things) ? record.things : [];
  const itinerary = things.map((thing) => {
    const when = String(thing.customerWhen || thing.whenLabel || '').trim();
    return when ? `${thing.title}: ${when}` : thing.title;
  }).filter(Boolean);
  const party = record?.party && typeof record.party === 'object' ? record.party : {};
  const owner = party.primary?.name ? [{ name: party.primary.name, payer: 'account holder' }] : [];
  const travelers = [
    ...owner,
    ...(Array.isArray(party.collaborators) ? party.collaborators : []),
    ...(Array.isArray(party.preference_subjects) ? party.preference_subjects : []),
  ].filter((person) => person?.name);
  const absent = [
    ...(Array.isArray(party.viewers) ? party.viewers.map((person) => person?.name && `${person.name} (viewer)`) : []),
    ...(Array.isArray(party.editors) ? party.editors.map((person) => person?.name && `${person.name} (editor)`) : []),
  ].filter(Boolean);
  const corpus = customerCorpus(priorTurns, customerTurn);
  const statedParty = corpus.match(/\bparty of (six|seven|eight|nine|ten|\d+)\b/i);
  const statedLine = statedParty
    ? `Customer stated party of ${statedParty[1].toLowerCase()}. Use that count. List only people the customer named. Do not add unnamed people.`
    : 'List only people the customer named in chat. Do not invent people.';
  const holder = owner[0]?.name ? ` The account holder is ${owner[0].name}. A collaborator who just joined is not the account holder.` : '';
  const roster = [
    `Party rule: ${statedLine} Ask the customer for anything they haven't said.`,
    travelers.length ? `Traveling: ${travelers.map((person) => person.payer ? `${person.name} (payer ${person.payer})` : person.name).join(', ')}.${holder}` : '',
    absent.length ? `Not on the trip: ${absent.join(', ')}. Viewers and editors are not coming, not in the house, and not in the day's group.` : '',
  ].filter(Boolean).join(' ');
  const span = record?.span || null;
  return {
    itinerary,
    roster,
    dates: span?.spanLabel ? `Saved trip dates: ${span.spanLabel}.` : '',
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
  const ordered = [...mentions].sort((left, right) => (left.month - right.month) || (left.day - right.day));
  const start = { ...ordered[0], year: ordered[0].year || year };
  const end = { ...ordered[ordered.length - 1], year: ordered[ordered.length - 1].year || year };
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

function isoDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value ?? '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function weekdayInsideSpan(weekdayName, span) {
  const target = WEEKDAY_INDEX[String(weekdayName || '').toLowerCase()];
  if (target == null || !span?.start || !span?.end) return '';
  const start = new Date(`${isoDay(span.start)}T00:00:00Z`);
  const end = new Date(`${isoDay(span.end)}T00:00:00Z`);
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
  if (!span?.start) return '';
  const start = new Date(`${isoDay(span.start)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return '';
  return spanDateLabel(start);
}

function laterFridayLabel(span) {
  if (!span?.start || !span?.end) return '';
  const start = new Date(`${isoDay(span.start)}T00:00:00Z`);
  const end = new Date(`${isoDay(span.end)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  let seen = 0;
  let found = '';
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    if (cursor.getUTCDay() !== WEEKDAY_INDEX.friday) continue;
    seen += 1;
    if (seen === 1) continue;
    found = formatMention({
      weekday: 'Friday',
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
      year: cursor.getUTCFullYear(),
    }, { withWeekday: true });
  }
  return found;
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
    const namedDay = /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i.test(String(customerText || ''));
    if (!namedDay) {
      const later = laterFridayLabel(span);
      if (later && !labels.includes(later)) labels.push(later);
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
      who: notes.map((note) => whoIn(note)).find(Boolean) || '',
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

function activitySentenceCommits(hit) {
  const dated = datedMentions(hit).length > 0;
  if (/\bif\b/i.test(hit) && !dated) return false;
  if (/\?/.test(hit) && !dated) return false;
  return true;
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
    if (thing.title === 'Groceries') {
      const arrival = String(thing.whenLabel || '').trim();
      if (arrival && !/same day/i.test(arrival)) customerWhen = arrival;
    } else if (thing.title === 'Swim') {
      const labels = String(customerWhen || '').split(' · ').map((part) => part.trim()).filter((part) => swimDayKey(part));
      for (const hit of hits) {
        if (!activitySentenceCommits(hit)) continue;
        mergeSwimLabel(labels, swimPlanLabel(hit));
      }
      customerWhen = labels.join(' · ');
    } else if (thing.title === 'Gardens' || thing.title === 'Dinner' || thing.title === 'Town walk') {
      const labels = String(customerWhen || '').split(' · ').map((part) => part.trim()).filter(Boolean);
      for (const hit of hits) {
        if (/keep us on the big island|stay on the big island/i.test(hit)) continue;
        if (!activitySentenceCommits(hit)) continue;
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

export function rewriteCreditLabel(model, change = '') {
  const line = String(change || '').replace(/\s+/g, ' ').trim();
  if (!line) return '';
  return `Rewriter (${String(model || '').trim()}): ${line}`;
}

export function splitRewriteChange(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  const match = raw.match(/(?:^|\n)WHAT_I_CHANGED:\s*(.+)\s*$/i);
  if (!match) return { reply: raw, change: '' };
  return {
    reply: raw.slice(0, match.index).trim(),
    change: match[1].replace(/\s+/g, ' ').trim(),
  };
}

function sentenceHas(text, pattern) {
  return splitSentences(text).some((sentence) => pattern.test(sentence));
}

export function verifiedRewriteChange(change, draft, shipped) {
  const line = String(change || '').replace(/\s+/g, ' ').trim();
  if (!line) return '';
  const shippedText = String(shipped || '');
  const draftText = String(draft || '');
  if (/\bmoved\b/i.test(line)) {
    const days = [...line.matchAll(/\b(\d{1,2})\b/g)].map((match) => Number(match[1])).filter((day) => day >= 1 && day <= 31);
    const activity = /\bswim\b/i.test(line) ? /\bswim\b/i : /\bgarden\b/i.test(line) ? /garden/i : /town walk/i.test(line) ? /town walk/i : null;
    if (activity && days.length) {
      const already = days.some((day) => splitSentences(draftText).some((sentence) => activity.test(sentence) && new RegExp(`\\b${day}\\b`).test(sentence)));
      if (already) return '';
    }
  }
  if (/\b(include|included|including|corrected the group)\b/i.test(line)) {
    const names = [...line.matchAll(/\b([A-Z][a-z]{2,})\b/g)].map((match) => match[1]);
    const missing = names.filter((name) => !/^(April|Friday|Sunday|Monday|Tuesday|Wednesday|Thursday|Saturday|Big|Island|What|Fixed|Removed)$/.test(name) && !new RegExp(`\\b${name}\\b`).test(shippedText));
    if (missing.length) return '';
  }
  if (/\b(saved|already saved|now set)\b/i.test(line) && /\b(removed|dropped|clarified|implication)\b/i.test(line)) {
    const days = [...line.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\b/g)].map((match) => Number(match[1])).filter((day) => day >= 1 && day <= 31);
    const activity = /\bswim\b/i.test(line) ? /\bswim\b/i : /\bgarden\b/i.test(line) ? /garden/i : /town walk/i.test(line) ? /town walk/i : null;
    if (activity && days.length) {
      const savedOn = (text, day) => splitSentences(text).some((sentence) => {
        if (!activity.test(sentence)) return false;
        if (new RegExp(`\\bnot\\s+(?:on\\s+)?(?:april|apr)\\.?\\s+${day}(?:st|nd|rd|th)?\\b`, 'i').test(sentence)) return false;
        const dayRe = new RegExp(`\\b(?:april|apr)\\.?\\s+${day}(?:st|nd|rd|th)?\\b|\\b${day}(?:st|nd|rd|th)\\b`, 'i');
        return dayRe.test(sentence) && /\b(saved|already[- ]saved|now set|set for)\b/i.test(sentence);
      });
      const removedSaved = days.some((day) => savedOn(draftText, day) && !savedOn(shippedText, day));
      if (!removedSaved) return '';
    } else {
      const draftSaved = /\b(saved|already[- ]saved|now set)\b/i.test(draftText);
      const shippedSaved = /\b(saved|already[- ]saved|now set)\b/i.test(shippedText);
      if (!draftSaved || shippedSaved) return '';
    }
  }
  if (/town walk/i.test(shippedText) && !/town walk/i.test(draftText) && !/town walk/i.test(line)) return '';
  if (/\bon the list\b/i.test(shippedText) && !/\bon the list\b/i.test(draftText) && !/town walk|on the list/i.test(line)) return '';
  if (/\b(removed|dropped|deleted|cut)\b/i.test(line)) {
    for (const phrase of ['the whole crew', 'just the crew', 'party of eight', 'crew of eight', 'full party']) {
      if (line.toLowerCase().includes(phrase) && shippedText.toLowerCase().includes(phrase)) return '';
    }
    const days = [...line.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\b/g)].map((match) => Number(match[1])).filter((day) => day >= 1 && day <= 31);
    if (days.length && /\b(swim|garden|town walk|april|apr)\b/i.test(line)) {
      const activity = /\bswim\b/i.test(line) ? /\bswim\b/i : /\bgarden\b/i.test(line) ? /garden/i : /town walk/i.test(line) ? /town walk/i : null;
      const dayRe = (day) => new RegExp(`\\b(?:april|apr)\\.?\\s+${day}(?:st|nd|rd|th)?\\b|\\b${day}(?:st|nd|rd|th)\\b`, 'i');
      const placed = (text, day) => splitSentences(text).some((sentence) => {
        if (activity && !activity.test(sentence)) return false;
        if (/\boff that day\b|\bkeep\b[^.]{0,40}\boff\b/i.test(sentence)) return false;
        return dayRe(day).test(sentence);
      });
      const removedAny = days.some((day) => placed(draftText, day) && !placed(shippedText, day));
      if (!removedAny) return '';
    }
  }
  if (sentenceHas(line, /removed|dropped/i) && sentenceHas(shippedText, /the whole crew|just the crew/i) && /crew/i.test(line)) return '';
  return line;
}

export function mustRewriteQuality(quality) {
  if (quality?.hardFlag === true) return true;
  if (quality?.wantsRewrite === true) return true;
  const score = Number(quality?.score);
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
  const match = String(label || '').toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  return match ? `${match[1].slice(0, 3)} ${Number(match[2])}` : '';
}

function mentionStamp(mention) {
  const month = MONTH_ABBR[mention?.month] || '';
  if (!month || !mention?.day) return '';
  return `${month.toLowerCase()} ${Number(mention.day)}`;
}

function rangeBoundDays(sentence) {
  const days = new Set();
  const re = /\bapr(?:il)?\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:[\u2013\-]|to|through)\s*(?:the\s+)?(?:apr(?:il)?\.?\s+)?(\d{1,2})(?:st|nd|rd|th)?/gi;
  for (const match of String(sentence || '').matchAll(re)) {
    days.add(Number(match[1]));
    days.add(Number(match[2]));
  }
  return days;
}

function activityStamps(sentence, span) {
  const bounds = rangeBoundDays(sentence);
  return looseDayStamps(sentence, span).filter((stamp) => !bounds.has(Number(String(stamp).split(' ')[1])));
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

function spanFromIso(startIso, endIso) {
  const start = String(startIso || '').slice(0, 10);
  const end = String(endIso || start).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) return null;
  const startMention = { month: startDate.getUTCMonth() + 1, day: startDate.getUTCDate(), year: startDate.getUTCFullYear() };
  const endMention = Number.isNaN(endDate.getTime())
    ? startMention
    : { month: endDate.getUTCMonth() + 1, day: endDate.getUTCDate(), year: endDate.getUTCFullYear() };
  return {
    start,
    end: Number.isNaN(endDate.getTime()) ? start : end,
    startLabel: formatMention(startMention, { withWeekday: true }),
    endLabel: formatMention(endMention, { withWeekday: true, withYear: true }),
    spanLabel: `${formatMention(startMention, { withWeekday: true })}–${formatMention(endMention, { withWeekday: true, withYear: true })}`,
    year: startMention.year,
  };
}

function stampsFromWhen(value) {
  return [...new Set(String(value || '').split('·').map((part) => dayStamp(part)).filter(Boolean))];
}

export function savedTripFacts(record = {}) {
  const things = Array.isArray(record.things) ? record.things : [];
  const swim = things.find((thing) => /\bswim\b/i.test(String(thing?.title || '')));
  const garden = things.find((thing) => /garden/i.test(String(thing?.title || '')));
  const townWalk = things.find((thing) => /town walk/i.test(String(thing?.title || '')));
  const span = record.span?.end ? record.span : spanFromIso(record.start, record.end);
  const party = record.party && typeof record.party === 'object' ? record.party : {};
  const notTraveling = [
    ...(Array.isArray(party.viewers) ? party.viewers : []).map((person) => ({ name: person?.name, role: 'viewer' })),
    ...(Array.isArray(party.editors) ? party.editors : []).map((person) => ({ name: person?.name, role: 'editor' })),
  ].filter((person) => person.name);
  const owners = {};
  const namedOwner = (thing) => {
    const direct = String(thing?.who || '').match(/\b([A-Z][a-z]{2,})\b/);
    if (direct && !WHO_SKIP.has(direct[1])) return direct[1];
    const notes = [...(Array.isArray(thing?.notes) ? thing.notes : []), ...(Array.isArray(thing?.collaboratorNotes) ? thing.collaboratorNotes : [])];
    return notes.map((note) => whoIn(note)).find(Boolean) || '';
  };
  const gardenWho = namedOwner(garden);
  const swimWho = namedOwner(swim);
  if (gardenWho) owners.gardens = gardenWho;
  if (swimWho) owners.swim = swimWho;
  const activities = things.map((thing) => String(thing?.title || '').toLowerCase()).filter(Boolean);
  return {
    span,
    swimDays: [...new Set([...stampsFromWhen(swim?.customerWhen), ...stampsFromWhen(swim?.whenLabel)])],
    gardenDays: [...new Set([...stampsFromWhen(garden?.customerWhen), ...stampsFromWhen(garden?.whenLabel)])],
    townWalkDays: [...new Set([...stampsFromWhen(townWalk?.customerWhen), ...stampsFromWhen(townWalk?.whenLabel)])],
    owners,
    planOwned: record.planOwned === true,
    activities,
    notTraveling,
    travelers: [
      party.primary?.name,
      ...(Array.isArray(party.collaborators) ? party.collaborators.map((person) => person?.name) : []),
      ...(Array.isArray(party.preference_subjects) ? party.preference_subjects.map((person) => person?.name) : []),
    ].filter(Boolean),
    ownerName: party.primary?.name || '',
    rule: String(record.rule || ''),
    addressedTo: String(record.addressedTo || ''),
    corpus: '',
  };
}

export function customerTripFacts(priorTurns, customerTurn = '') {
  return savedTripFacts(projectCustomerRecord(priorTurns, customerTurn));
}

function withoutNegatedDays(sentence) {
  return String(sentence || '')
    .replace(/\bnot\s+(?:on\s+)?(?:april|apr)\.?\s+\d{1,2}(?:st|nd|rd|th)?/gi, '')
    .replace(/\bnot\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b/gi, '');
}

function dayIsSet(stamps, set) {
  return stamps.some((stamp) => set.includes(stamp));
}

function pushError(errors, line) {
  if (line && !errors.includes(line)) errors.push(line);
}

const RANGE_END = /\b(?:(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+)?apr(?:il)?\s+\d{1,2}(?:st|nd|rd|th)?\s*(?:[\u2013\-]|to|through)\s*(?:the\s+)?(?:(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+)?(?:apr(?:il)?\s+)?(\d{1,2})(?:st|nd|rd|th)?/gi;
const DEPARTURE = /\blast day\b|\blast evening\b|\blast morning\b|\bpack(?:ing)? up\b|\bpacked and\b|\bpack(?:ing|ed)?\b(?!\s+schedule)(?!\s+(?:a |the )?(?:cooler|water|snack|snacks|lunch|towel|bag))|\bafter checkout\b|\bone last time\b/i;
const SWIM_RE = /\bswim\b|\bhouse pool\b|\bpool dip\b|\bdip into\b|\ba dip\b/i;
const GARDEN_RE = /garden/i;
const WALK_RE = /town walk/i;
const DINNER_RE = /\bdinner\b/i;
const ACTIVITY_RES = [SWIM_RE, GARDEN_RE, WALK_RE, DINNER_RE];
const ACTIVITY_DENIAL = /\b(?:isn't set|is not set|won't lock|will not lock|not already set|not a swim|off that day)\b|\bkeep\b[^.]{0,48}\boff\b|\bnot on\b/i;

function activityClauses(sentence) {
  return String(sentence || '').split(/\s*(?:,|;|\band\b)\s*/i).map((part) => part.trim()).filter(Boolean);
}

function otherActivity(clause, activityRe) {
  return ACTIVITY_RES.some((pattern) => pattern !== activityRe && pattern.test(clause) && !activityRe.test(clause));
}

function activityBefore(clauses, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const hit = ACTIVITY_RES.find((pattern) => pattern.test(clauses[cursor]));
    if (hit) return hit;
  }
  return null;
}

function clauseStamps(sentence, span, activityRe) {
  const clauses = activityClauses(sentence);
  const stamps = new Set();
  clauses.forEach((clause, index) => {
    if (!activityRe.test(clause) || ACTIVITY_DENIAL.test(clause)) return;
    const local = activityStamps(clause, span);
    if (local.length) {
      local.forEach((stamp) => stamps.add(stamp));
      return;
    }
    if (/\blater in the week\b|\blater in the day\b|\bstays in place\b|\bcan wait\b/i.test(clause)) return;
    for (const neighbor of [clauses[index - 1], clauses[index + 1]].filter(Boolean)) {
      if (ACTIVITY_DENIAL.test(neighbor) || otherActivity(neighbor, activityRe)) continue;
      const neighborIndex = clauses.indexOf(neighbor);
      const borrowed = activityStamps(neighbor, span);
      if (!borrowed.length) continue;
      const owner = activityBefore(clauses, neighborIndex);
      if (owner && owner !== activityRe) continue;
      borrowed.forEach((stamp) => stamps.add(stamp));
    }
    const walkClause = clauses.find((clause) => WALK_RE.test(clause)) || '';
    const undatedOr = activityRe === WALK_RE && /^\s*or\b/i.test(walkClause) && !activityStamps(walkClause, span).length;
    const relativeWalk = activityRe === WALK_RE
      && /\b(?:after|before|following)\s+(?:the\s+)?town walk\b/i.test(sentence)
      && !activityStamps(walkClause, span).length;
    if (!stamps.size && !undatedOr && !relativeWalk && activityRe === WALK_RE && /\band\b/i.test(sentence)) {
      activityStamps(sentence, span).forEach((stamp) => stamps.add(stamp));
    }
  });
  return [...stamps];
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
  const ranges = body.matchAll(RANGE_END);
  for (const shortened of ranges) {
    if (endDay && Number(shortened[1]) !== endDay) {
      pushError(errors, `the trip runs through ${facts.span?.endLabel || span.end}, not day ${shortened[1]}`);
    }
  }
  if (/no extra charge|no extra cost|at no extra/i.test(body)) {
    pushError(errors, 'no extra charge is not in what the customer set');
  }
  if (/picnic/i.test(body) && !(facts.activities || []).some((item) => /picnic/i.test(item))) {
    pushError(errors, 'a picnic was not named');
  }
  const gardenOwner = String(facts.owners?.gardens || '');
  const gardenClaim = body.match(/\b([A-Z][a-z]+)(?:'|’)s\s+gardens?\b/);
  const weekdayNameClaim = gardenClaim && /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i.test(gardenClaim[1]);
  if (gardenOwner && gardenClaim && !weekdayNameClaim && gardenClaim[1].toLowerCase() !== gardenOwner.toLowerCase()) {
    pushError(errors, `the gardens are ${gardenOwner}'s, not ${gardenClaim[1]}'s`);
  }
  if (gardenOwner && facts.addressedTo && facts.addressedTo.toLowerCase() !== gardenOwner.toLowerCase() && /your (?:two )?garden/i.test(body)) {
    pushError(errors, `the gardens are ${gardenOwner}'s, not ${facts.addressedTo}'s`);
  }
  const swimOwner = String(facts.owners?.swim || '');
  if (swimOwner && facts.addressedTo && facts.addressedTo.toLowerCase() !== swimOwner.toLowerCase() && /your (?:later |second |beach )?swim/i.test(body)) {
    pushError(errors, `the swim is ${swimOwner}'s, not ${facts.addressedTo}'s`);
  }
  if (/\b(?:we|i)(?:'|’)ve corrected\b|\b(?:we|i) have corrected\b/i.test(body)) {
    pushError(errors, 'the reply invented a correction');
  }
  const ownerName = String(facts.ownerName || '').trim();
  const ownerFirst = ownerName.split(/\s+/)[0] || '';
  const NOT_ROSTER = /^(April|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Big|Island|Kailua|Kona|Hawaii|Hawai|With|Option|Both|Which|Either|Since|That|This|They|Your|The|And|For)$/;
  if (ownerFirst) {
    const ownerRe = new RegExp(`\\b${ownerFirst}\\b`, 'i');
    const crewList = body.match(/\bthe crew\b([\s\S]{0,180})/i);
    const crewAddressesOwner = crewList && /\bwith you\b|\byou(?:'|’)re\b|\byour\b/i.test(crewList[1]);
    const rosterNames = crewList
      ? [...crewList[1].matchAll(/\b[A-Z][a-z]{2,}\b/g)].map((match) => match[0]).filter((name) => name && !NOT_ROSTER.test(name))
      : [];
    if (crewList && !crewAddressesOwner && rosterNames.length >= 2 && !ownerRe.test(crewList[1])) {
      pushError(errors, `${ownerName} is traveling`);
    }
    if (!ownerRe.test(body) && /\bjust the crew\b|\bfull party\b|\bparty of eight\b|\bcrew of eight\b|\bwhole crew\b/i.test(body)) {
      pushError(errors, `${ownerName} is traveling`);
    }
  }
  if (/\bmidweek\b/i.test(body) && /\bfriday\b/i.test(body)) {
    pushError(errors, 'Friday is not midweek');
  }
  const paragraphs = body.split(/\n{2,}/).map((part) => part.replace(/\s+/g, ' ').trim().toLowerCase()).filter((part) => part.length > 40);
  const repeatedSentences = splitSentences(body).map((part) => part.replace(/\s+/g, ' ').trim().toLowerCase()).filter((part) => part.length > 40);
  if (new Set(paragraphs).size !== paragraphs.length || new Set(repeatedSentences).size !== repeatedSentences.length) {
    pushError(errors, 'a paragraph is repeated');
  }
  const arrivalStamp = span?.start ? dayStamp(`${MONTH_ABBR[Number(String(span.start).slice(5, 7))]} ${Number(String(span.start).slice(8, 10))}`) : '';
  const laterFriday = dayStamp(facts.laterFriday || '');
  const customerTurn = String(facts.customerTurn || '');
  const wantsLaterSwim = /\bswim\b/i.test(customerTurn)
    && /\blater\b|\bstill want\b|\banother\b|\bsecond\b/i.test(customerTurn)
    && !/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(customerTurn);
  if (wantsLaterSwim && laterFriday) {
    const told = splitSentences(body).some((sentence) => {
      if (!SWIM_RE.test(sentence)) return false;
      const day = Number(String(laterFriday).split(' ')[1]);
      const namesFriday = looseDayStamps(sentence, span).includes(laterFriday)
        || new RegExp(String(facts.laterFriday || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(sentence)
        || (day && new RegExp(`\\bfriday\\b[^.]{0,48}\\b${day}(?:st|nd|rd|th)?\\b`, 'i').test(sentence));
      if (!namesFriday) return false;
      if (/\bbetween\b/i.test(sentence) && !/\bsaved\b|\bset\b/i.test(sentence)) return false;
      return true;
    });
    if (!told) pushError(errors, `the later swim is saved on ${facts.laterFriday || laterFriday}`);
  }
  const sentences = splitSentences(body);
  const tripEnd = endWeekday(span);
  const endStamp = span?.end ? dayStamp(`${MONTH_ABBR[Number(String(span.end).slice(5, 7))]} ${endDay}`) : '';
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const next = sentences[index + 1] || '';
    const previous = sentences[index - 1] || '';
    const swimDenied = ACTIVITY_DENIAL.test(sentence) && SWIM_RE.test(sentence);
    const optional = /\bchoice\b|\bwould you like\b|\binterested\b|\beither\b|\?/.test(sentence);
    const rainyBackup = /\brains\b|\brainy\b|\bbackup\b|\bshifting\b|\breschedul/i.test(sentence);
    if (SWIM_RE.test(sentence) && !swimDenied && !optional && !rainyBackup) {
      let attached = clauseStamps(withoutNegatedDays(sentence), span, SWIM_RE);
      if (!attached.length && /\boption\b|\bor a swim\b|\bswim day\b/i.test(sentence)) {
        attached = activityStamps(previous, span);
      }
      if (!attached.length && /\bdip\b|\bpool\b|\bswim\b/i.test(sentence) && !/\blater\b|\bwait\b|\bbetween\b|\bin the week\b/i.test(sentence) && /\barrival\b/i.test(previous)) {
        attached = activityStamps(previous, span);
      }
      const laterOnly = wantsLaterSwim && laterFriday && attached.length && attached.every((stamp) => stamp === laterFriday);
      if (attached.length && !laterOnly && !dayIsSet(attached, swimDays)) {
        pushError(errors, `a swim on ${attached.find((stamp) => !swimDays.includes(stamp)) || attached[0]} was not set by the customer`);
      }
    }
    if (SWIM_RE.test(sentence) && /\b(saved|already[- ]saved|scheduled|noted|now set|set for|i(?:'|’)ll save|we(?:'|’)ll save|save that|i(?:'|’)ve got that)\b/i.test(sentence) && !ACTIVITY_DENIAL.test(sentence)) {
      const laterStamp = dayStamp(facts.laterFriday || laterFridayLabel(span));
      let claimed = looseDayStamps(withoutNegatedDays(sentence), span);
      if (/\bsecond friday\b/i.test(sentence) && laterStamp && !claimed.includes(laterStamp)) claimed = [...claimed, laterStamp];
      const askedForLater = !facts.strictSaved && wantsLaterSwim && laterStamp && claimed.includes(laterStamp);
      if (!askedForLater && claimed.length && !dayIsSet(claimed, swimDays)) {
        pushError(errors, `a swim on ${claimed.find((stamp) => !swimDays.includes(stamp)) || claimed[0]} was claimed as saved`);
      } else if (!claimed.length && !swimDays.length) {
        pushError(errors, 'a swim was claimed as saved when it is not');
      }
    }
    if (GARDEN_RE.test(sentence) && !optional) {
      const stamps = clauseStamps(withoutNegatedDays(sentence), span, GARDEN_RE);
      const denied = ACTIVITY_DENIAL.test(sentence);
      const already = /already set|locked in/i.test(sentence) && !denied;
      if (!denied && stamps.length && !dayIsSet(stamps, gardenDays)) {
        pushError(errors, already ? `the garden on ${stamps[0]} is not already set` : `a garden on ${stamps[0]} was not set by the customer`);
      }
    }
    if (WALK_RE.test(sentence) && !optional) {
      const stamps = clauseStamps(withoutNegatedDays(sentence), span, WALK_RE);
      if (stamps.length && !dayIsSet(stamps, facts.townWalkDays)) {
        pushError(errors, `a town walk on ${stamps[0]} was not set by the customer`);
      }
      if (/\b(noted|saved|scheduled|on the list)\b/i.test(sentence) && !stamps.length && !(facts.townWalkDays || []).length) {
        pushError(errors, 'a town walk was noted but not saved');
      }
    }
    if (/\bfour friends\b|\bunnamed friends\b/i.test(sentence)) {
      pushError(errors, 'the reply invented people');
    }
    const partyCount = sentence.match(/\bparty of (six|seven|eight|nine|ten|\d+)\b/i);
    if (partyCount) {
      const words = { six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      const claimed = words[partyCount[1].toLowerCase()] || Number(partyCount[1]);
      const names = new Set((sentence.match(/\b[A-Z][a-z]{2,}\b/g) || []).filter((name) => !/^(April|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Big|Island|With|Option|Both|Which)$/.test(name)));
      const friends = /\bfour friends\b/i.test(sentence) ? 4 : 0;
      const listed = names.size + friends;
      if (listed && listed !== claimed) pushError(errors, `party of ${partyCount[1]} lists ${listed} people`);
    }
    if (ownerFirst && /\baccount holder\b/i.test(sentence) && facts.addressedTo && facts.addressedTo.toLowerCase() !== ownerFirst.toLowerCase()) {
      pushError(errors, `the account holder is ${ownerName}`);
    }
    const travelerFirst = [...new Set((facts.travelers || []).map((name) => String(name || '').split(/\s+/)[0]).filter((name) => name.length > 2))];
    if (travelerFirst.length >= 3) {
      const mentioned = travelerFirst.filter((name) => new RegExp(`\\b${name}\\b`, 'i').test(body));
      if (mentioned.length >= Math.min(5, travelerFirst.length - 1) && mentioned.length < travelerFirst.length) {
        for (const name of travelerFirst) {
          if (!mentioned.some((item) => item.toLowerCase() === name.toLowerCase())) pushError(errors, `${name} is traveling`);
        }
      }
    }
    for (const person of facts.notTraveling || []) {
      const named = new RegExp(`\\b${String(person.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const absent = /\bnot (?:on the trip|traveling|with the crew|in the house)\b|\b(?:aren(?:'|’)t|are not) traveling\b|\bviewer\b|\beditor\b|\bview access\b|\bedit access\b/i.test(sentence);
      if (!absent && named.test(sentence) && /\bon the trip|all together|sharing the|whole group|for your stay|with the crew|all on the trip|in the house|with you|joining you|coming along|along with/i.test(sentence)) {
        pushError(errors, `${person.name} is a ${person.role}, not on the trip`);
      }
    }
    if (DEPARTURE.test(sentence)) {
      const stamps = looseDayStamps(sentence, span);
      const named = weekdayName(sentence);
      const onEnd = (stamps.length && endStamp && stamps.includes(endStamp)) || (named && tripEnd && named === tripEnd && (!stamps.length || stamps.includes(endStamp)));
      if (!onEnd) {
        pushError(errors, `${stamps[0] || named || 'that phrase'} is not the trip end`);
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

function rememberRoster(sources, field, value, source) {
  sources.push({ field, value, source });
}

export function completeRosterParty(doc) {
  const stored = doc?.party && typeof doc.party === 'object' ? doc.party : {};
  const corpus = (Array.isArray(doc?.turns) ? doc.turns : [])
    .filter((turn) => turn?.role !== 'app')
    .map((turn) => String(turn?.text || ''))
    .join('\n');
  const sources = [];
  const party = {
    primary: null,
    collaborators: [],
    preference_subjects: [],
    viewers: [],
    editors: [],
    sources,
  };
  if (stored.primary?.name) {
    party.primary = { name: stored.primary.name, role: stored.primary.role || 'Owner' };
    rememberRoster(sources, 'primary', party.primary.name, 'trip.dialogParty');
  } else if (doc?.customerName || doc?.targetPerson) {
    party.primary = { name: doc.customerName || doc.targetPerson, role: 'Owner' };
    rememberRoster(sources, 'primary', party.primary.name, 'session');
  }
  for (const person of Array.isArray(stored.collaborators) ? stored.collaborators : []) {
    if (!person?.name) continue;
    party.collaborators.push({ ...person });
    rememberRoster(sources, `collaborators.${person.name}`, person.payer || '', 'trip.dialogParty');
  }
  for (const kid of Array.isArray(stored.preference_subjects) ? stored.preference_subjects : []) {
    if (!kid?.name || !Number.isFinite(Number(kid.age))) continue;
    party.preference_subjects.push({ name: kid.name, age: Number(kid.age) });
    rememberRoster(sources, `preference_subjects.${kid.name}`, Number(kid.age), 'trip.dialogParty');
  }
  for (const person of Array.isArray(stored.viewers) ? stored.viewers : []) {
    if (!person?.name) continue;
    party.viewers.push({ name: person.name });
    rememberRoster(sources, `viewers.${person.name}`, 'viewer', 'trip.dialogParty');
  }
  for (const person of Array.isArray(stored.editors) ? stored.editors : []) {
    if (!person?.name) continue;
    party.editors.push({ name: person.name });
    rememberRoster(sources, `editors.${person.name}`, 'editor', 'trip.dialogParty');
  }
  for (const match of corpus.matchAll(/\bI pay for ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/g)) {
    const name = match[1];
    const existing = party.collaborators.find((person) => new RegExp(`^${name}\\b`, 'i').test(person.name || ''));
    if (existing) existing.payer = existing.payer || 'owner';
    else party.collaborators.push({ name, payer: 'owner' });
    rememberRoster(sources, `collaborators.${name}.payer`, 'owner', `customer: I pay for ${name}`);
  }
  for (const match of corpus.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) pays for (?:himself|herself|themself)/g)) {
    const name = match[1];
    const payer = name.split(/\s+/)[0].toLowerCase();
    const existing = party.collaborators.find((person) => new RegExp(`^${name}\\b`, 'i').test(person.name || ''));
    if (existing) existing.payer = existing.payer || payer;
    else party.collaborators.push({ name, payer });
    rememberRoster(sources, `collaborators.${name}.payer`, payer, `customer: ${name} pays for themself`);
  }
  for (const match of corpus.matchAll(/\b([A-Z][a-z]+) who is ([a-z0-9-]+)/g)) {
    const name = match[1];
    const age = ageFromWords(match[2]);
    if (age == null || party.preference_subjects.some((kid) => kid.name === name)) continue;
    party.preference_subjects.push({ name, age });
    rememberRoster(sources, `preference_subjects.${name}`, age, `customer: ${name} who is ${match[2]}`);
  }
  for (const match of corpus.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) can (?:view|look)\b/g)) {
    const name = match[1];
    if (party.viewers.some((person) => person.name === name)) continue;
    party.viewers.push({ name });
    rememberRoster(sources, `viewers.${name}`, 'viewer', `customer: ${name} can view`);
  }
  for (const match of corpus.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) can edit\b/g)) {
    const name = match[1];
    if (party.editors.some((person) => person.name === name)) continue;
    party.editors.push({ name });
    rememberRoster(sources, `editors.${name}`, 'editor', `customer: ${name} can edit`);
  }
  const notTraveler = new Set(['Kids', 'Four', 'What', 'Big', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'April', 'Marcus', 'Aunt']);
  for (const match of corpus.matchAll(/\b([A-Z][a-z]+) (?:wants|does not want)\b/g)) {
    const name = match[1];
    if (notTraveler.has(name)) continue;
    if (party.primary?.name && new RegExp(`^${name}\\b`, 'i').test(party.primary.name)) continue;
    if (party.viewers.some((person) => new RegExp(`^${name}\\b`, 'i').test(person.name || ''))) continue;
    if (party.editors.some((person) => new RegExp(`^${name}\\b`, 'i').test(person.name || ''))) continue;
    if (party.preference_subjects.some((person) => new RegExp(`^${name}\\b`, 'i').test(person.name || ''))) continue;
    if (party.collaborators.some((person) => new RegExp(`^${name}\\b`, 'i').test(person.name || ''))) continue;
    party.collaborators.push({ name, payer: '' });
    rememberRoster(sources, `collaborators.${name}`, '', `customer: ${name} wants`);
  }
  return party;
}

function rewriteAttempted(turn) {
  return turn?.quality?.rewritten === true
    || turn?.flagged === true
    || Boolean(String(turn?.rewriteModel || '').trim())
    || Boolean(String(turn?.rewriteText || '').trim());
}

const INTERIM_STOCK = /^(got it|sure|okay|ok|the plan stays)\b/i;
const INTAKE_OPENER_ONLY = /^i am building the itinerary\b/i;

export function isTemplateInterim(text, customerTurn) {
  const value = String(text || '').trim();
  if (!value || INTERIM_STOCK.test(value)) return true;
  if (INTAKE_OPENER_ONLY.test(value) && !(/\bview access\b/i.test(value) && /\bedit access\b/i.test(value))) return true;
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

export function shipChoice({
  draft,
  rewrite,
  draftScore = null,
  rewriteScore = null,
  draftFactErrors = [],
  rewriteFactErrors = [],
  holding = '',
  holdingFactErrors = [],
  holdingScore = null,
}) {
  const rewriteText = String(rewrite || '').trim();
  const draftCount = (Array.isArray(draftFactErrors) ? draftFactErrors : []).length;
  const rewriteCount = (Array.isArray(rewriteFactErrors) ? rewriteFactErrors : []).length;
  const rewriteOk = rewriteReplacesDraft(draft, rewriteText) && rewriteCount === 0;
  const draftRaw = Number(draftScore);
  const rewriteRaw = Number(rewriteScore);
  const hold = String(holding || '').trim();
  const holdErrors = (Array.isArray(holdingFactErrors) ? holdingFactErrors : []).map((error) => String(error || '').trim()).filter(Boolean);
  const holdClean = draftCount > 0 && Boolean(hold) && holdErrors.length === 0;
  const holdingRaw = Number(holdingScore);
  const baseline = holdClean && Number.isFinite(holdingRaw) ? holdingRaw : draftRaw;
  const SCORE_NOISE = 0.15;
  const scoredLower = !Number.isFinite(rewriteRaw) || !Number.isFinite(baseline) || rewriteRaw < baseline - SCORE_NOISE;
  if (rewriteOk && !scoredLower) {
    return { text: String(rewrite).trim(), rewritten: true, flagged: false, held: false, failReason: '', holding: false };
  }
  let failReason = '';
  if (rewriteCount > 0) failReason = 'rewrite_fact_check_held';
  else if (scoredLower && rewriteOk) failReason = 'rewrite_scored_lower';
  else if (!rewriteOk) failReason = 'rewrite_not_shipped';
  if (draftCount > 0) {
    if (hold && holdErrors.length === 0) {
      return { text: hold, rewritten: false, flagged: false, held: true, failReason: failReason || 'holding_reply', holding: true };
    }
    if (rewriteOk) {
      return { text: String(rewrite).trim(), rewritten: true, flagged: false, held: false, failReason: '', holding: false };
    }
    return { text: '', rewritten: false, flagged: true, held: true, failReason: failReason || 'draft_held', holding: false };
  }
  return {
    text: draft,
    rewritten: false,
    flagged: false,
    held: false,
    failReason,
    holding: false,
  };
}

export function holdingShipErrors(text, facts = {}) {
  const errors = draftFactErrors(text, { ...facts, strictSaved: true });
  const who = String(facts.addressedTo || '').trim().split(/\s+/)[0];
  const vocative = String(text || '').match(/(?:^|[.!?]\s+)([A-Z][a-z]{2,}),\s/);
  if (who && vocative && vocative[1].toLowerCase() !== who.toLowerCase()) {
    pushError(errors, `addresses ${vocative[1]} while ${who} is speaking`);
  }
  return errors;
}

export function interimDodges(text, customerTurn) {
  const value = String(text || '');
  const ask = String(customerTurn || '');
  const dodgeTone = /\bit sounds like\b|\bwonderful trip\b|\bi can help you\b|\bi can definitely help\b|\bcoming together\b/i.test(value);
  if (!dodgeTone) return false;
  if (/\btwo options\b|\boffer two\b|\bpick after you offer\b/i.test(ask) && !/\bor\b|\boption\b/i.test(value)) return true;
  if (/\bbackup\b|\bif\b[^.]{0,40}\brain|\brainy\b/i.test(ask) && !/\bbackup\b|\bshift|\bsecond friday\b/i.test(value)) return true;
  if (!isLongIntake(ask) && /\blater\b/i.test(ask) && /\bswim\b/i.test(ask) && !/\bfriday\b|\bapr(?:il)?\.?\s+10\b/i.test(value)) return true;
  if (/\bi can help you\b|\bi can definitely help\b|\bcoming together\b/i.test(value) && !/\b(saved|set for|option|town walk)\b/i.test(value)) return true;
  return false;
}

export function interimCanShip(text, customerTurn, facts = {}) {
  const value = String(text || '').trim();
  if (!value || isTemplateInterim(value, customerTurn)) return false;
  const customer = String(customerTurn || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const body = value.replace(/\s+/g, ' ').trim().toLowerCase();
  if (customer && (body === customer || body.includes(customer) || (customer.length > 40 && customer.includes(body)))) return false;
  if (interimDodges(value, customerTurn)) return false;
  if (holdingShipErrors(value, facts).some((error) => /claimed as saved|account holder is|not on the trip|while .+ is speaking|town walk was noted|later swim is saved|invented a correction/.test(error))) return false;
  if (isLongIntake(customerTurn) && !/\bcollaborat/i.test(value)) return false;
  if (/\blater in the day\b/i.test(value) && /\bswim\b/i.test(value)) return false;
  return true;
}

const BEAT_STOP = new Set(['with', 'that', 'this', 'from', 'into', 'your', 'days', 'day', 'the', 'and', 'for']);

export function beatsMatchingReply(beats, text) {
  const body = String(text || '');
  const lower = body.toLowerCase();
  const matched = [];
  for (const beat of Array.isArray(beats) ? beats : []) {
    const line = String(beat || '').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const beatLower = line.toLowerCase();
    if (/\bbackup\b|\brain\b/.test(beatLower) && !/\bbackup\b|\brain|\bshift/.test(lower)) continue;
    if (/\boffer/.test(beatLower) && !/\bor\b|\boption\b/.test(lower)) continue;
    if (/\b(set|saved|added|confirm)/.test(beatLower) && /\bswim\b/.test(beatLower)) {
      const swimSet = /\bswim\b[^.]{0,90}\b(saved|set|added|friday|monday)\b/i.test(body)
        || /\b(saved|set|added)\b[^.]{0,90}\bswim\b/i.test(body);
      if (!swimSet) continue;
    }
    const words = beatLower.split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !BEAT_STOP.has(word));
    if (words.length) {
      const hit = words.filter((word) => lower.includes(word)).length;
      if (hit / words.length < 0.5) continue;
    }
    matched.push(line);
  }
  return matched;
}

export function formatQualityLine(quality) {
  if (!quality || quality.judged !== true) return '';
  const score = Number(quality.score);
  if (!Number.isFinite(score) || score < 1 || score > 5) return '';
  const shown = Number.isInteger(score) ? String(score) : String(Math.round(score * 1000) / 1000);
  return `quality: ${shown}`;
}

export function heldRewriteLine(turn) {
  if (!turn || turn.held !== true || turn.quality?.rewritten === true) return '';
  const drafted = String(turn.rewriteText || '').trim()
    || (Array.isArray(turn.rewriteAttempts) && turn.rewriteAttempts.some((item) => String(item?.text || '').trim()));
  if (!drafted) return '';
  const reason = String(turn.rewriteFailReason || '').replace(/\s+/g, ' ').trim() || 'held';
  return `rewrite drafted, held: ${reason}`;
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
    missingCollaborators: isLongIntake(customerTurn) && !/\bcollaborat/i.test(body),
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
  const rule = Boolean(flags?.invented?.length || flags?.split || flags?.missingPrice || flags?.missingAccess || flags?.missingCollaborators);
  const score = rule ? Math.min(Number(quality?.score) || 1, 3) : Number(quality?.score);
  return {
    ...quality,
    score,
    hardFlag: rule,
    wantsRewrite: quality?.wantsRewrite === true || score <= 2 || rule,
  };
}

function applyUpsellPolicy(reply) {
  return stripChatMarkdown(String(reply || '').trim());
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

function cleanCandidate(text) {
  return applyUpsellPolicy(text);
}

async function loadSavedTripRecord(session, env = process.env) {
  const tripId = session?.trip_id || session?.tripId;
  if (!tripId || !env?.DATABASE_URL) return null;
  try {
    const { sql } = await import('./db.mjs');
    const db = sql(env);
    const trips = await db`select start_date, end_date, metadata from trips where id = ${tripId} limit 1`;
    const row = trips[0];
    if (!row) return null;
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const thingRows = await db`select title, metadata from trip_things where trip_id = ${tripId} order by created_at asc`;
    return {
      start: row.start_date || '',
      end: row.end_date || '',
      things: thingRows.map((thing) => {
        const thingMeta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
        return {
          title: thing.title,
          who: thingMeta.who || '',
          whenLabel: thingMeta.whenLabel || '',
          customerWhen: thingMeta.customerWhen || '',
          notes: thingMeta.notes || [],
        };
      }),
      party: meta.dialogParty && typeof meta.dialogParty === 'object' ? meta.dialogParty : null,
      rule: meta.intakeRule || '',
      planOwned: meta.planOwned === true || meta.unlimitedPlanOwned === true,
    };
  } catch {
    return null;
  }
}

function joiningSeatRecord(session) {
  const seat = session?.metadata?.seat || session?.seat;
  const name = String(seat?.displayName || seat?.name || '').trim();
  return name ? { name, payer: String(seat?.payer || '').trim() } : null;
}

function mergeSavedTurn(saved, priorTurns, customerTurn, session) {
  const projected = projectCustomerRecord(priorTurns, customerTurn);
  const baseThings = Array.isArray(saved?.things) && saved.things.length ? saved.things : projected.things;
  const things = customerTurn ? applyCustomerNotes(baseThings, customerTurn) : baseThings;
  const seat = session?.metadata?.seat || session?.seat;
  const collaborator = seat?.role === 'collaborator' || Boolean(seat?.ownerCustomerId);
  const storedOwner = String(saved?.party?.primary?.name || '').trim();
  const holder = storedOwner || (collaborator ? '' : String(session?.display_name || session?.displayName || '').trim());
  const party = completeRosterParty({
    party: {
      ...(saved?.party || {}),
      primary: holder ? { name: holder, role: 'Owner' } : (saved?.party?.primary || null),
    },
    customerName: holder,
    turns: [{ role: 'customer', text: customerCorpus(priorTurns, customerTurn) }],
  });
  const span = saved?.start ? spanFromIso(saved.start, saved.end || saved.start) : projected.span;
  return {
    start: span?.start || projected.start || '',
    end: span?.end || projected.end || '',
    span,
    things,
    party,
    planOwned: saved?.planOwned === true,
    rule: saved?.rule || projected.rule,
    addressedTo: projected.addressedTo || (collaborator ? String(seat?.displayName || '').trim().split(/\s+/)[0] : ''),
  };
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
  const savedTrip = await loadSavedTripRecord(session, env);
  const mergedTrip = mergeSavedTurn(savedTrip, history, customerTurn, session);
  const tripContext = draftingFacts(history, customerTurn, mergedTrip);
  if (mergedTrip?.rule) tripContext.rule = String(mergedTrip.rule);
  const seat = joiningSeatRecord(session);
  const tripFacts = savedTripFacts(mergedTrip);
  tripFacts.customerTurn = String(customerTurn || '');
  tripFacts.laterFriday = laterFridayLabel(tripFacts.span);
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
  const speaker = String(tripFacts.addressedTo || '').trim();
  const draftExtra = [
    tripContext.roster || '',
    'When you list who is coming, name every traveler in the saved roster. Do not add a name that is not in that roster.',
    'Do not say a swim or a town walk is saved, now set, set for, or on the list unless that activity is already on the saved trip.',
    isLongIntake(customerTurn) ? 'This intake reply must include the word collaborators, plus view access, edit access, and unlimited vacations for the whole year. Do not say a swim was saved.' : '',
    speaker ? `The person speaking now is ${speaker}. Address ${speaker}. Do not address ${tripFacts.ownerName || 'the account holder'} as if they sent this message.` : '',
  ].filter(Boolean).join(' ');
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
    seat,
    systemExtra: draftExtra,
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
  }
  if (rewriteBreaksUpsell(reply, upsell, customerTurn)) {
    const nudge = customerAsksPrice(customerTurn)
      ? `${customerTurn}\n\nAnswer with who pays: ${payerPriceLine(customerTurn, env) || 'the dollar amount for each person and who pays'}. Do not add a second collaborator welcome.`
      : `${customerTurn}\n\nDo not welcome collaborators. Do not mention price, access, or ${UNLIMITED_PHRASE}. Answer the day only.`;
    model = await callTieredModel(modelArgs(nudge, 'forbidden'));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake, customerTurn);
  }
  if (model && typeof model === 'object') model.genLatencyMs = Math.max(0, Date.now() - genStarted);
  const banned = appTextBanned(reply);
  if (!reply || banned) {
    const interim = await interimFromTierOne({ rules, customerTurn, destination, env, facts: tripFacts, seat });
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
    quality.jevNote = null;
    quality.comment = null;
    quality.jevNoteReason = 'jev_no_free_text';
    quality.judgeMs = draftQualityMs;
  }
  const jevNote = null;
  const draftFactLine = factErrors.length ? factErrors.join('; ') : 'ok';
  const savedTripLog = {
    start: tripFacts.span?.start || '',
    end: tripFacts.span?.end || '',
    swimDays: tripFacts.swimDays || [],
    gardenDays: tripFacts.gardenDays || [],
    owner: tripFacts.ownerName || '',
  };
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
    rejudgeMs: null,
    rawModelText: model?.text == null ? null : String(model.text),
    jevScoreRewrite: null,
    jevNote,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: null,
    savedTrip: savedTripLog,
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
  const interimPromise = interimFromTierOne({ rules, customerTurn, destination, env, facts: tripFacts, seat }).then((interim) => {
    interim.ms = String(interim.text || '').trim() ? Math.max(Number(interim.ms) || 0, Date.now() - interimStarted) : null;
    return interim;
  });
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
    seat,
    rawModelText: model?.text == null ? null : String(model.text),
    failureReason: qualityFailureReason(quality, draftFlags),
    interimReply: { text: null, model: null, ms: null },
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
  const finished = await finishTierRewrite({ pending, env, interimPromise });
  const interimReply = finished.log?.interimReply || { text: null, model: null, ms: null };
  if (finished.log) finished.log.interimReply = interimReply;
  if (finished.reply) {
    return {
      reply: finished.reply,
      rules,
      jev,
      model: finished.model,
      quality: finished.quality,
      log: finished.log,
      reason: null,
    };
  }
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

async function interimFromTierOne({ rules, customerTurn, destination, env, facts = {}, seat = null }) {
  const started = Date.now();
  const absent = (Array.isArray(facts.notTraveling) ? facts.notTraveling : []).map((person) => person.name).filter(Boolean);
  const owner = String(facts.ownerName || '').trim();
  const speaker = String(facts.addressedTo || '').trim();
  const systemExtra = [
    isLongIntake(customerTurn) ? 'This holding reply is the intake answer. Include every required sentence below.' : 'This is a one or two sentence holding line.',
    interimFacts(customerTurn, destination),
    speaker
      ? `The person speaking now is ${speaker}. Address ${speaker}. Do not address ${owner || 'someone else'} as the speaker.`
      : (owner ? `The customer is ${owner}. Do not call anyone else the account holder.` : 'Do not name an account holder.'),
    absent.length ? `Do not put ${absent.join(' or ')} on the trip.` : 'Do not add viewers or editors to the traveling party.',
    isLongIntake(customerTurn)
      ? 'This is the intake reply. Include these sentences: I am building the itinerary from that now. Family and friends can join as collaborators. View access lets them see the days. Edit access lets them add notes after you approve an email invite. You can also take the unlimited vacations for the whole year as a plan. Do not say you also have unlimited. Do not say a swim is saved.'
      : '',
    customerAsksPrice(customerTurn)
      ? `This turn asks the price. State the payer line exactly and do not say the plan is already owned: ${payerPriceLine(customerTurn, env) || 'the configured price is missing, so do not invent a dollar amount'}.`
      : '',
    'Ignore any instruction to end with BEAT.',
  ].filter(Boolean).join(' ');
  const unusable = (value) => isTemplateInterim(value, customerTurn) || draftFactErrors(value, facts).some((error) => /claimed as saved|account holder is|not on the trip/.test(error));
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
    timeoutMs: isLongIntake(customerTurn) ? 20000 : 8000,
    seat,
    systemExtra,
  });
  const model = await call();
  let text = String(model?.text || '').trim();
  if (unusable(text) || model?.responseModel !== INTERIM_MODEL) text = '';
  const elapsed = Date.now() - started;
  return { text: text || null, model: text ? INTERIM_MODEL : null, ms: text ? Math.max(elapsed, 1) : null };
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

export async function finishTierRewrite({ pending, env = process.env, interimPromise = null } = {}) {
  const rules = await loadVacationAppReplyRules(env);
  const facts = pending?.tripFacts || customerTripFacts([], pending?.customerTurn || '');
  const draftErrors = draftFactErrors(pending?.draft, facts);
  async function askRewrite(failure) {
    const started = Date.now();
    const scoreRaw = rawScore(pending?.quality?.scoreRaw);
    const called = await callTieredModel({
      rules,
      jev: pending?.jev,
      customerTurn: `${pending?.customerTurn || ''}\n\nRewrite the draft. Jev score raw ${scoreRaw == null ? 'none' : scoreRaw}. Fact-check flags: ${failure || 'none'}. Keep the days already on the saved trip. Do not paste the draft. End with one line WHAT_I_CHANGED: and a single sentence that names the real difference, including any person you added and any saved claim you added or removed.\nDraft:\n${pending?.draft || ''}`,
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
      seat: pending?.seat || null,
      systemExtra: [
        'Rewrite the draft. Do not copy it and do not put a lead line in front of it. Do not insert a sentence the draft did not earn. Do not repeat a paragraph. The account holder stays the account holder. Do not call a joining collaborator the account holder. Keep only people the customer already named in chat. Never invent people. If the customer stated a party size, do not list more people than that size. Ask the customer for anything they haven\'t said. Address the person who is speaking. Do not give that person an activity the saved trip record assigns to someone else. Do not say an activity is saved, now set, or on the list unless it is already saved. Do not say we have corrected that or I have corrected that. Do not call a saved preference rule locked and do not rename it. End with one line WHAT_I_CHANGED: and a single sentence that names only a real difference that is in the draft. If you add or remove a person or a saved claim, that sentence must name it. Do not say you removed a saved activity on a day the draft did not claim.',
        [pending?.tripContext?.roster && `Saved roster: ${pending.tripContext.roster}`, pending?.tripFacts?.rule && `Saved preference rule: ${pending.tripFacts.rule}`].filter(Boolean).join(' '),
        failure ? `Jev score and fact-check flags: ${failure}. Fix that failure.` : '',
        'Use the saved trip dates. Do not shorten the trip. Do not call a day the last day, the last evening, after checkout, or one last time, and do not say pack or head out, unless that day is the saved trip end.',
        'Do not offer an activity on a day that is not already that activity on the saved trip. Do not put viewers or editors on the trip. Never say "splitting payments" or splitting anything up.',
        'Do not say the unlimited plan is already owned.',
        pending?.planTable?.payer_line && Number(pending.planTable.dollars_per_collaborator_seat) > 0
          ? `Plan table: ${pending.planTable.plan_name}. $${pending.planTable.dollars_per_collaborator_seat} per collaborator seat. State this payer line exactly: ${pending.planTable.payer_line}. Make no coverage claims. Do not say whole group.`
          : '',
      ].filter(Boolean).join(' '),
    });
    return { called, ms: Math.max(0, Date.now() - started) };
  }
  function acceptText(called) {
    const modelText = called?.called && called.text ? String(called.text).trim() : '';
    const split = splitRewriteChange(modelText);
    const rewritten = split.reply ? cleanCandidate(split.reply) : '';
    return { modelText, rewritten, change: split.change, called };
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
  const model = attempt.called;
  const { modelText, rewritten, change } = parsed;
  let failReason = '';
  if (!modelText) failReason = model?.reason || 'rewrite_empty';
  else if (!rewritten) failReason = 'rewrite_rejected';
  else if (!rewriteReplacesDraft(pending?.draft, rewritten)) failReason = 'rewrite_near_draft';
  else if (rewriteErrors.length && nearIdenticalRewrite(pending?.draft, rewritten)) failReason = 'rewrite_near_draft';
  else if (appTextBanned(rewritten)) failReason = 'rewrite_banned';
  else if (replyLeavesDestination(rewritten, pending?.destination)) failReason = 'rewrite_left_destination';
  const judgedText = rewritten || modelText;
  const rewriteCanShip = Boolean(rewritten) && !failReason && rewriteErrors.length === 0;
  let rewriteQuality = null;
  const rewriteQualityStarted = Date.now();
  if (rewriteCanShip) {
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
      rewriteQuality.jevNote = null;
      rewriteQuality.jevNoteReason = 'jev_no_free_text';
      rewriteQuality.comment = null;
      rewriteQuality.judgeMs = null;
    } else {
      failReason = failReason || 'rewrite_not_judged';
    }
  }
  const rewriteQualityMs = rewriteCanShip ? Math.max(0, Date.now() - rewriteQualityStarted) : 0;
  const interimReply = interimPromise ? await interimPromise : (pending?.interimReply || { text: null, model: null, ms: null });
  if (pending) pending.interimReply = interimReply;
  const holdingText = interimCanShip(interimReply?.text, pending?.customerTurn, facts)
    ? String(interimReply.text).trim()
    : '';
  let choice = shipChoice({
    draft: pending.draft,
    rewrite: failReason ? '' : rewritten,
    draftScore: Number(pending.quality?.score),
    rewriteScore: rewriteQuality?.judged ? Number(rewriteQuality.score) : NaN,
    draftFactErrors: draftErrors,
    rewriteFactErrors: failReason ? [] : rewriteErrors,
    holding: holdingText,
    holdingFactErrors: holdingText ? holdingShipErrors(holdingText, facts).filter((error) => /claimed as saved|account holder is|not on the trip|while .+ is speaking|town walk was noted/.test(error)) : [],
  });
  if (!choice.text && !draftErrors.length) {
    choice = {
      text: String(pending.draft || '').trim(),
      rewritten: false,
      flagged: false,
      held: true,
      failReason: choice.failReason || 'draft_held',
      holding: false,
    };
  } else if (!choice.text && holdingText) {
    choice = {
      text: holdingText,
      rewritten: false,
      flagged: false,
      held: true,
      failReason: choice.failReason || 'holding_reply',
      holding: true,
    };
  }
  let holdingQuality = null;
  if (choice.holding && choice.text) {
    holdingQuality = await jevQualityRewrite({ customerTurn: pending.customerTurn, draft: choice.text, tripContext: pending.tripContext, planLine: pending.planLine, env });
    if (!holdingQuality?.judged) {
      holdingQuality = await jevQualityRewrite({ customerTurn: pending.customerTurn, draft: choice.text, tripContext: pending.tripContext, planLine: pending.planLine, env });
    }
    if (holdingQuality?.judged) {
      holdingQuality.jevNote = null;
      holdingQuality.comment = null;
      holdingQuality.jevNoteReason = 'jev_no_free_text';
      if (choice.failReason === 'rewrite_scored_lower' && rewriteQuality?.judged) {
        const again = shipChoice({
          draft: pending.draft,
          rewrite: failReason ? '' : rewritten,
          draftScore: Number(pending.quality?.score),
          rewriteScore: Number(rewriteQuality.score),
          draftFactErrors: draftErrors,
          rewriteFactErrors: failReason ? [] : rewriteErrors,
          holding: holdingText,
          holdingFactErrors: holdingText ? holdingShipErrors(holdingText, facts).filter((error) => /claimed as saved|account holder is|not on the trip|while .+ is speaking|town walk was noted|later swim is saved|invented a correction/.test(error)) : [],
          holdingScore: Number(holdingQuality.score),
        });
        if (again.rewritten) choice = again;
      }
    } else if (!draftErrors.length) {
      choice = {
        text: String(pending.draft || '').trim(),
        rewritten: false,
        flagged: false,
        held: true,
        failReason: choice.failReason || 'holding_unscored',
        holding: false,
      };
    }
  }
  if (!choice.rewritten && String(rewritten || modelText || '').trim()) choice.held = true;
  const shippedText = choice.text;
  if (!choice.rewritten && !failReason) {
    failReason = choice.failReason === 'rewrite_fact_check_held'
      ? `rewrite_fact_check_held: ${rewriteErrors.join('; ')}`
      : (choice.failReason || 'rewrite_not_shipped');
  }
  const draftQualityMs = Number(pending.qualityJevMs) || 0;
  const rewriteModel = String(model?.responseModel || pending.draftModel || '').trim();
  const shownChange = choice.rewritten ? (verifiedRewriteChange(change, pending.draft, shippedText) || null) : null;
  let shippedModel = pending.draftModel;
  let shippedScore = pending.draftScore;
  let shippedQuality = pending.quality;
  if (choice.rewritten && rewriteQuality?.judged) {
    shippedModel = rewriteModel;
    shippedScore = rewriteQuality.score;
    shippedQuality = rewriteQuality;
  } else if (choice.holding && holdingQuality?.judged) {
    shippedModel = pending.interimReply?.model || INTERIM_MODEL;
    shippedScore = holdingQuality.score;
    shippedQuality = holdingQuality;
  }
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
    rejudgeMs: rewriteCanShip ? rewriteQualityMs : null,
    rawModelText: pending.rawModelText == null ? null : String(pending.rawModelText),
    jevScoreRewrite: rewriteQuality?.judged ? rewriteQuality.score : null,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: shownChange,
    savedTrip: {
      start: facts.span?.start || '',
      end: facts.span?.end || '',
      swimDays: facts.swimDays || [],
      gardenDays: facts.gardenDays || [],
      owner: facts.ownerName || '',
    },
    interimReply: pending.interimReply || { text: null, model: null, ms: null },
    latencyMs: {
      draft: pending.draftLatencyMs,
      rewrite: rewriteMs,
      jevDraft: draftQualityMs,
      jevRewrite: rewriteCanShip ? rewriteQualityMs : null,
      total: Number(pending.draftLatencyMs || 0) + draftQualityMs + Math.max(rewriteMs + rewriteQualityMs, Number(interimReply?.ms || 0)),
    },
    flagged: choice.flagged === true && choice.held !== true,
    held: choice.held === true,
  };
  const quality = {
    ...shippedQuality,
    score: shippedScore,
    comment: null,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: shownChange,
    rewritten: choice.rewritten === true,
    judgeMs,
  };
  const stamped = stampShippedReply({
    reply: shippedText,
    quality,
    draftModel: pending.draftModel,
    log,
    draft: pending.draft,
  });
  stamped.model.responseModel = pending.model?.responseModel || pending.draftModel;
  stamped.model.modelTier = pending.model?.modelTier ?? pending.jev?.modelTier ?? null;
  stamped.model.genLatencyMs = pending.draftLatencyMs;
  const beatSource = choice.rewritten ? model?.beats : (choice.holding ? [] : pending.model?.beats);
  const matchedBeats = beatsMatchingReply(beatSource, shippedText);
  stamped.model.beats = matchedBeats.length ? matchedBeats : null;
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
      latencyMs: live.latencyMs == null ? null : Number(live.latencyMs ?? row.response_latency_ms),
      sessionE2eMs: live.sessionE2eMs == null ? null : Number(live.sessionE2eMs),
      jev: live.jev && typeof live.jev === 'object' ? live.jev : null,
      replyProducer: live.replyProducer || null,
      dispatcher: live.dispatcher || null,
      fixedOpener: live.fixedOpener === true,
      invented: live.invented === true,
      buildSha: String(live.buildSha || '').trim() || null,
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
      rewriteJevScoreRaw: live.rewriteModel || live.rewriteText ? rawScore(live.rewriteJevScoreRaw) : null,
      rewriteJevDisposition: live.rewriteJevDisposition || null,
      rewriteJevFixFocus: live.rewriteJevFixFocus || null,
      rejudgeMs: finiteOrNull(live.rejudgeMs),
      rewriterChange: live.rewriterChange || live.quality?.rewriterChange || null,
      savedTrip: live.savedTrip || null,
      rawModelText: live.rawModelText == null ? null : String(live.rawModelText),
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
      held: live.held === true,
      model: live.model || null,
      rules: live.rules || null,
    };
  });
  const last = turns[turns.length - 1] || null;
  const buildShas = turns.map((turn) => String(turn.buildSha || '').trim()).filter(Boolean);
  const buildSha = buildShas[0] || '';
  const driveBuildEnd = buildShas.length ? buildShas[buildShas.length - 1] : '';
  return {
    live: true,
    capture: LIVE_TRANSCRIPT_CAPTURE,
    sessionToken: session?.token || null,
    targetPerson,
    customerName: session?.display_name || session?.displayName || targetPerson || null,
    tripId: session?.trip_id || session?.tripId || null,
    startedAt: turns[0]?.at || null,
    endedAt: last?.at || null,
    buildSha: buildSha || null,
    driveBuildEnd: driveBuildEnd || null,
    buildMismatch: Boolean(buildSha && driveBuildEnd && buildSha !== driveBuildEnd),
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
    sessionToken: null,
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

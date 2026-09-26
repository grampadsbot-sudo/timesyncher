import {
  DIALOG_TEST_FINGERPRINT,
  callTieredModel,
  jevPrecall,
  jevQualityRewrite,
  loadVacationAppReplyRules,
} from '../../scripts/vacation-app-reply-rules.mjs';

export const LIVE_TRANSCRIPT_CAPTURE = 'live-vacation-app';
export const LIVE_REPLY_PRODUCER = 'vacation-app-reply-rules';
export const LIVE_OPENER_PRODUCER = 'vacation-app-onboarding-opener';
export const FIXED_OPENER_REASON = 'fixed_onboarding_opener';
export const LIVE_DISPATCHER = 'product-gbrain-dispatch';
export const ONBOARDING_OPENER_WITH_SITE = 'I can update this vacation from here.\n\nTell me the trip basics you want changed: where you are going, when you leave and come back, who is coming, and what matters most.\n\nFamily and friends can join this same vacation as collaborators. They add notes and help shape the days with you. When price comes up, the household plan to name is unlimited vacations for the whole year.\n\nType a message, tap the microphone to the right to speak, or attach photos, reservations, and notes.';
export const ONBOARDING_OPENER_CHAT_ONLY = 'Welcome. I am here to build this vacation with you. Your website is not built yet, so this chat is the whole workspace until it is actually up.\n\nTell me the trip basics: where you are going, when you leave and come back, who is coming, and what matters most.\n\nIf family or friends are coming, we can welcome them onto this vacation as collaborators. They join the same trip, add notes, and help shape the days. When you ask about price, the plan to name is unlimited vacations for the whole year.\n\nType in the box, tap the microphone to the right of it and speak, or use the paperclip for photos, reservations, and notes.';

export function onboardingOpenerText(hasSite) {
  return hasSite ? ONBOARDING_OPENER_WITH_SITE : ONBOARDING_OPENER_CHAT_ONLY;
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
        comment: String(model.quality.comment || ''),
        rewritten: model.quality.rewritten === true,
        model: model.quality.model || null,
      };
      if (record.quality.rewritten && model.quality.draft) {
        record.quality.draft = String(model.quality.draft);
      }
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

export const ITEM34_BAN = /splitting payments|splitting payment|split payment|split-payer|split payer|splitting it up|how you['’]re splitting|how you are splitting|payment split|splitting the (?:cost|bill|pay)/i;

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

const ITINERARY_ACK = 'I am building the itinerary from that dump.';
const COLLAB_OPTIONS = 'Family and friends can join this same vacation as collaborators. They add notes and help shape the days.';

export function ensurePostIntakeBeats(text) {
  let value = ensureExactUpsellPhrase(text);
  if (!/building the itinerary/i.test(value)) value = `${ITINERARY_ACK}\n\n${value}`.trim();
  if (!/collaborat/i.test(value)) value = `${value}\n\n${COLLAB_OPTIONS}`.trim();
  if (!UNLIMITED_PATTERN.test(value)) value = ensureExactUpsellPhrase(value);
  return value;
}

export function ensureExactUpsellPhrase(text) {
  const value = String(text || '').trim();
  if (UNLIMITED_PATTERN.test(value) && /collaborat/i.test(value)) {
    return value.replace(UNLIMITED_PATTERN, UNLIMITED_PHRASE);
  }
  const welcome = `Welcome them onto this vacation as collaborators. The household plan is ${UNLIMITED_PHRASE}.`;
  return value ? `${value}\n\n${welcome}` : welcome;
}

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
    if (!customerWhen && !spanThing) {
      const datedHit = hits.find((hit) => datedMentions(hit)[0] && !/keep us on the big island|stay on the big island/i.test(hit));
      const dated = datedHit ? datedMentions(datedHit)[0] : null;
      if (dated) customerWhen = formatMention(dated, { withWeekday: true, withYear: Boolean(dated.year) });
    }
    const who = thing.who || whoIn(hits.join(' ')) || '';
    return {
      ...thing,
      who,
      notes,
      collaboratorNotes,
      customerWhen,
      description: [...notes, ...collaboratorNotes].join(' '),
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

export function formatQualityLine(quality) {
  if (!quality || quality.judged !== true) return '';
  const score = Number(quality.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) return '';
  const comment = String(quality.comment || '').replace(/\s+/g, ' ').trim();
  const rewritten = quality.rewritten === true ? ' (rewritten)' : '';
  return `quality: ${score} — ${comment || 'Jev rated this reply'}${rewritten}`;
}

function applyUpsellPolicy(reply, upsell, postIntake) {
  if (upsell === 'allow-once' && postIntake) return ensurePostIntakeBeats(reply);
  if (upsell === 'allow-once') return ensureExactUpsellPhrase(reply);
  return stripUpsell(reply);
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
  });
  let model = await callTieredModel(modelArgs(customerTurn, upsell));
  let reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake);
  for (let attempt = 0; attempt < 2 && !String(reply || '').trim(); attempt += 1) {
    model = await callTieredModel(modelArgs(`${customerTurn}\n\nWrite the reply in sentences. Do not return an empty message.`, upsell));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake);
  }
  if (reply && replyLeavesDestination(reply, destination)) {
    model = await callTieredModel(modelArgs(`${customerTurn}\n\nStay on ${destination}. Do not name another city or island.`, upsell));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake);
    if (replyLeavesDestination(reply, destination)) {
      return {
        reply: null,
        rules,
        jev,
        model,
        reason: 'destination_lock',
      };
    }
  }
  if (upsell === 'forbidden' && (isFullUpsell(reply) || isCollabWelcome(reply) || UNLIMITED_PATTERN.test(reply))) {
    model = await callTieredModel(modelArgs(`${customerTurn}\n\nDo not welcome collaborators. Do not mention price, access, or ${UNLIMITED_PHRASE}. Answer the day only.`, 'forbidden'));
    reply = stripUpsell(model?.called && model.text ? String(model.text) : '');
  }
  if (item34BanHit(reply)) {
    model = await callTieredModel(modelArgs(`${customerTurn}\n\nRewrite the reply. Do not describe seats as a split. Kimberly's seat is already covered. Tyler and Lauren each have their own seat. Do not use the word split. Keep the vacation answer.`, upsell));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake);
  }
  if (item34BanHit(reply)) {
    reply = stripItem34Ban(reply);
    reply = applyUpsellPolicy(reply, upsell, postIntake);
  }
  if (inventedGardenHit(reply, corpus)) {
    model = await callTieredModel(modelArgs(`${customerTurn}\n\nRewrite. Use the customer's word gardens. Do not name Kahaluu, Pua Mau, an arboretum, or a botanical garden. Do not move the garden because of weather.`, upsell));
    reply = applyUpsellPolicy(model?.called && model.text ? String(model.text) : '', upsell, postIntake);
  }
  if (inventedGardenHit(reply, corpus)) reply = applyUpsellPolicy(stripInventedGarden(reply, corpus), upsell, postIntake);
  if (model && typeof model === 'object') model.genLatencyMs = Math.max(0, Date.now() - genStarted);
  const banned = appTextBanned(reply);
  if (!reply || banned || item34BanHit(reply) || inventedGardenHit(reply, corpus) || (upsell === 'forbidden' && (isFullUpsell(reply) || UNLIMITED_PATTERN.test(reply) || isCollabWelcome(reply)))) {
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: item34BanHit(reply) ? 'item34_ban' : (inventedGardenHit(reply, corpus) ? 'invented_garden' : (banned || (upsell === 'forbidden' && reply ? 'unsolicited_upsell' : model?.reason || 'live dispatcher returned no reply'))),
    };
  }
  let quality = await jevQualityRewrite({ customerTurn, draft: reply, env });
  if (!quality?.judged) quality = await jevQualityRewrite({ customerTurn, draft: reply, env });
  if (!quality?.judged) {
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: quality?.reason || 'quality_unjudged',
    };
  }
  if (quality.wantsRewrite) {
    const draftBeforeRewrite = reply;
    const directed = await callTieredModel(modelArgs(`${customerTurn}\n\nJev asked for a rewrite before the customer sees this. Jev comment: ${quality.comment}\nDraft to replace:\n${reply}`, upsell));
    let rewritten = applyUpsellPolicy(directed?.called && directed.text ? String(directed.text) : '', upsell, postIntake);
    if (item34BanHit(rewritten)) rewritten = applyUpsellPolicy(stripItem34Ban(rewritten), upsell, postIntake);
    if (inventedGardenHit(rewritten, corpus)) rewritten = applyUpsellPolicy(stripInventedGarden(rewritten, corpus), upsell, postIntake);
    const rewriteBanned = appTextBanned(rewritten);
    const rewriteUpsell = upsell === 'forbidden' && (isFullUpsell(rewritten) || UNLIMITED_PATTERN.test(rewritten) || isCollabWelcome(rewritten));
    if (rewritten && !rewriteBanned && !item34BanHit(rewritten) && !inventedGardenHit(rewritten, corpus) && !replyLeavesDestination(rewritten, destination) && !rewriteUpsell) {
      const accepted = acceptQualityRewrite(draftBeforeRewrite, rewritten);
      reply = accepted.text;
      quality.rewritten = accepted.rewritten;
      if (accepted.rewritten) quality.draft = accepted.draft;
      if (model && typeof model === 'object' && directed?.genLatencyMs == null) {
        model.genLatencyMs = Math.max(0, Date.now() - genStarted);
      }
    }
  }
  if (model && typeof model === 'object') model.quality = quality;
  return { reply, rules, jev, model, quality, reason: null };
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
    sessionE2eMs: last && Number.isFinite(last.sessionE2eMs) ? last.sessionE2eMs : null,
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
  };
  const lines = [header, ...(doc.turns || []).map((turn) => ({ type: 'turn', ...turn }))];
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}

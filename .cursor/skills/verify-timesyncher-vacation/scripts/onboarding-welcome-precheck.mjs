/**
 * Deterministic gates for the onboarding welcome verify.
 * A passing shape is not a pass. PASS requires an external judge grade.
 */
import { renderOnboardingWelcome } from '../../../../src/vacation/onboarding-welcome.mjs';

export const LONG_VOICE_TEMPLATE = [
  "Okay so, um, we're going to {destination} from {startDate} to {endDate}, so about {nNights} nights.",
  "It's me, my wife {collab1}, and our two kids, {kid1} who's {age1} and {kid2} who's {age2}.",
  'My {relation} {collab2} might join us for the second half.',
  'We booked a rental near {lodgingArea}, nothing fancy, but it has a kitchen.',
  'The kids really want to do {activityA}, and {collab1} has been talking about {activityB} for like a year.',
  "I'd love one really nice dinner, maybe our anniversary night, which is {anniversaryDate}.",
  "We don't want to overpack the days because {kid2} still naps.",
  "Oh, and we're flying in late on the first day, so that one's basically a write-off.",
  'Not sure about a car yet.',
].join(' ');

export const SHORT_TRIP_TEXT = 'beach trip sometime next summer';
export const QUESTION_FIRST_TEXT = "wait can my husband see this too? he's doing most of the planning";

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RELATIONS = ['cousin', 'sibling', 'neighbor', 'friend'];
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const BANNED = [
  { code: 'thing', re: /\bthings?\b/i },
  { code: 'eula', re: /\beula\b/i },
  { code: 'terms', re: /\bterms\b/i },
  { code: 'seat', re: /\bseats?\b/i },
  { code: 'payment', re: /\bpayments?\b/i },
  { code: 'reservation', re: /\breservations?\b/i },
];

const VOICE_INVITE = /\b(microphone|mic|voice[\s-]?notes?)\b/i;

export function onboardingBars() {
  return [
    { id: 'app_greeting', audience: 'app_welcome', text: 'Greets the customer by first name.' },
    { id: 'app_site_url', audience: 'app_welcome', text: 'Includes the trip website URL.' },
    { id: 'app_viewer_access', audience: 'app_welcome', text: 'Includes a viewer access line saying people can see the site without signing in.' },
    { id: 'app_how_it_works', audience: 'app_welcome', text: 'Explains day-by-day itinerary, notes per day and place, photos, videos and stories, then a keepsake at the end.' },
    { id: 'app_voice_invite', audience: 'app_welcome', text: 'Invites the customer to hold the mic and talk for a minute or two about where, when, who, where they are staying, and what they are excited about or still deciding.' },
    { id: 'app_banned_words', audience: 'app_welcome', text: 'Never contains Thing, EULA, terms, or seat, and nothing about payments or reservations.' },
    { id: 'app_one_access_line', audience: 'app_welcome', text: 'Has at most one access line.' },
    { id: 'app_before_first_turn', audience: 'app_welcome', text: 'Arrives after EULA accept and before the customer\'s first turn.' },
    { id: 'collab_before_first', audience: 'collaborator_welcome', text: 'Arrives before the collaborator\'s first message.' },
    { id: 'collab_names', audience: 'collaborator_welcome', text: 'Names the collaborator and the owner, and includes the trip title and the site URL.' },
    { id: 'collab_contribute', audience: 'collaborator_welcome', text: 'Includes a line about adding ideas, photos and notes, and a voice-note invitation.' },
    { id: 'f1_ack', audience: 'f1_reply', text: 'The same reply acknowledges the itinerary build and echoes the spoken details.' },
    { id: 'f1_collaborators', audience: 'f1_reply', text: 'The same reply offers to add collaborators.' },
    { id: 'f1_plan', audience: 'f1_reply', text: 'The same reply mentions the unlimited vacations plan.' },
    { id: 'f1_one_question', audience: 'f1_reply', text: 'The reply ends with one open question.' },
    { id: 'f2_draft', audience: 'f2_reply', text: 'Sets up a draft, asks where, when, how long and who, and suggests a voice note.' },
    { id: 'f2_no_upsell', audience: 'f2_reply', text: 'Makes no collaborator offer and no upsell.' },
    { id: 'f3_yes', audience: 'f3_reply', text: 'Says yes, and that he can view without signing in.' },
    { id: 'f3_add', audience: 'f3_reply', text: 'Offers to add him as a collaborator and asks for his name and email or phone.' },
    { id: 'f3_trip', audience: 'f3_reply', text: 'Asks about the trip and suggests a voice note.' },
  ];
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function token(random, length) {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function utcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function formatDate(date) {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

export function generateOnboardingFixtures(random = Math.random) {
  const ownerFirst = `nia${token(random, 6)}`;
  const ownerLast = `oro${token(random, 6)}`;
  const stamp = token(random, 8);
  const start = utcDate(2032, Math.floor(random() * 12), 4 + Math.floor(random() * 18));
  const nights = 4 + Math.floor(random() * 7);
  const end = addDays(start, nights);
  const anniversary = addDays(start, 1 + Math.floor(random() * Math.max(1, nights - 1)));
  const values = {
    destination: `zon-${token(random, 8)}`,
    startDate: formatDate(start),
    endDate: formatDate(end),
    nNights: String(nights),
    collab1: `ada${token(random, 6)}`,
    age1: String(4 + Math.floor(random() * 8)),
    kid1: `bri${token(random, 6)}`,
    age2: String(1 + Math.floor(random() * 4)),
    kid2: `cal${token(random, 6)}`,
    relation: pick(random, RELATIONS),
    collab2: `deo${token(random, 6)}`,
    lodgingArea: `area-${token(random, 8)}`,
    activityA: `pastime-${token(random, 8)}`,
    activityB: `pastime-${token(random, 8)}`,
    anniversaryDate: formatDate(anniversary),
  };
  const longText = fill(LONG_VOICE_TEMPLATE, values);
  const titles = {
    f1: `trip-${token(random, 8)}`,
    f2: `trip-${token(random, 8)}`,
    f3: `trip-${token(random, 8)}`,
  };
  const trips = [
    { id: 'f1', kind: 'long_voice', voice: true, title: titles.f1, values, text: longText },
    { id: 'f2', kind: 'short', voice: false, title: titles.f2, values: {}, text: SHORT_TRIP_TEXT },
    { id: 'f3', kind: 'question', voice: false, title: titles.f3, values: {}, text: QUESTION_FIRST_TEXT },
  ];
  const literals = [
    ownerFirst,
    ownerLast,
    values.destination,
    values.collab1,
    values.kid1,
    values.kid2,
    values.collab2,
    values.lodgingArea,
    values.activityA,
    values.activityB,
    titles.f1,
    titles.f2,
    titles.f3,
    stamp,
  ];
  return {
    owner: {
      firstName: ownerFirst,
      lastName: ownerLast,
      displayName: ownerFirst,
      email: `verify-${stamp}@timesyncher.test`,
    },
    emptyAccount: {
      firstName: `lea${stamp.slice(0, 6)}`,
      displayName: `lea${stamp.slice(0, 6)}`,
      email: `empty-${stamp}@timesyncher.test`,
      title: `shell-${stamp}`,
    },
    collaborator: {
      firstName: values.collab1,
      displayName: values.collab1,
      email: `collab-${stamp}@timesyncher.test`,
    },
    trips,
    literals,
  };
}

export function turnText(turn) {
  return String(turn?.text ?? turn?.body ?? '').replace(/\s+/g, ' ').trim();
}

function isCustomer(turn) {
  return turn?.speaker === 'customer' || turn?.speaker === 'user' || turn?.direction === 'inbound';
}

function isApp(turn) {
  return turn?.speaker === 'app' || turn?.speaker === 'assistant';
}

export function welcomeBeforeFirstTurn(turns) {
  const list = Array.isArray(turns) ? turns : [];
  const customerIndex = list.findIndex((turn) => isCustomer(turn));
  const prior = customerIndex < 0 ? list : list.slice(0, customerIndex);
  const welcome = prior.find((turn) => isApp(turn) && turnText(turn));
  if (!welcome) return { ok: false, reason: 'missing', welcome: null, customer: null };
  if (customerIndex < 0) return { ok: false, reason: 'no_customer_turn', welcome, customer: null };
  const customer = list[customerIndex];
  const welcomeAt = Date.parse(welcome.at || '');
  const customerAt = Date.parse(customer.at || '');
  if (!Number.isFinite(welcomeAt) || !Number.isFinite(customerAt) || welcomeAt >= customerAt) {
    return { ok: false, reason: 'timestamp', welcome, customer };
  }
  return { ok: true, reason: null, welcome, customer };
}

export function bannedWordHits(text) {
  const value = String(text || '');
  return BANNED.filter((item) => item.re.test(value)).map((item) => item.code);
}

export function hasVoiceInvitation(text) {
  return VOICE_INVITE.test(String(text || ''));
}

const INTERNAL_WORDS = [
  { code: 'tier', re: /\btiers?\b/i },
  { code: 'route', re: /\broutes?\b/i },
  { code: 'model', re: /\bmodels?\b/i },
  { code: 'jev', re: /\bjev\b/i },
];

const ACCESS_GRANTED = /\baccess granted\b|\baccess has been granted\b|\balready (?:has|have) access\b|\bi(?:'ve| have) (?:added|granted)\b|\byou now have access\b/i;
const ACCESS_OFFERED = /\bwithout signing in\b|\banyone with the link\b|\bcan see (?:the |plans|photos)\b|\b(?:can|could) add\b|\bwant me to add\b/i;

export function internalWordHits(text) {
  const value = String(text || '');
  return INTERNAL_WORDS.filter((item) => item.re.test(value)).map((item) => item.code);
}

export function questionCount(text) {
  return (String(text || '').match(/\?/g) || []).length;
}

export function endsWithExactlyOneQuestion(text) {
  const value = String(text || '').trim();
  return value.endsWith('?') && questionCount(value) === 1;
}

export function accessPosture(text) {
  const value = String(text || '');
  return {
    offered: ACCESS_OFFERED.test(value),
    granted: ACCESS_GRANTED.test(value),
  };
}

export function countRealVacations(vacations) {
  return (Array.isArray(vacations) ? vacations : []).filter((trip) => {
    if (String(trip?.destination || '').trim()) return true;
    if (trip?.startDate || trip?.endDate) return true;
    return false;
  }).length;
}

export function gradeNoVacationDropdown(observation = {}) {
  const options = (Array.isArray(observation.options) ? observation.options : [])
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const selected = String(observation.selected || observation.preselected || '').replace(/\s+/g, ' ').trim();
  const placeNames = [...new Set([...(selected ? [selected] : []), ...options])];
  const failures = [];
  if (Number(observation.vacationCount) !== 0) {
    failures.push({ code: 'vacation_count', detail: observation.vacationCount ?? null });
  }
  if (observation.opened !== true) failures.push({ code: 'dropdown_not_opened' });
  if (selected) failures.push({ code: 'dropdown_preselected', detail: selected });
  if (options.length) failures.push({ code: 'dropdown_options', detail: options });
  if (placeNames.length) failures.push({ code: 'dropdown_place', detail: placeNames });
  return {
    ok: failures.length === 0,
    failures,
    vacationCount: observation.vacationCount ?? null,
    opened: observation.opened === true,
    control: observation.control || '',
    selected,
    options,
    placeNames,
    screenshot: observation.screenshot || '',
  };
}

export function normalizeWelcomeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function renderedWelcome(audience, fields = {}) {
  try {
    return { ok: true, text: renderOnboardingWelcome({ audience, ...fields }) };
  } catch (error) {
    const message = String(error?.message || '');
    const key = message.match(/missing ([A-Za-z0-9]+)/)?.[1] || '';
    return { ok: false, reason: 'placeholder', key };
  }
}

export function welcomeTemplateMatch(actual, expected) {
  const got = normalizeWelcomeText(actual);
  const want = normalizeWelcomeText(expected);
  if (!want || !got) return { ok: false, reason: 'missing' };
  if (got !== want) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

function matchRenderedWelcome(actual, audience, fields) {
  const rendered = renderedWelcome(audience, fields);
  if (!rendered.ok) return rendered;
  return welcomeTemplateMatch(actual, rendered.text);
}

function ownerCustomerNeedles(ownerTurns) {
  return (Array.isArray(ownerTurns) ? ownerTurns : [])
    .filter((turn) => isCustomer(turn))
    .map((turn) => turnText(turn))
    .filter((value) => value.length >= 24)
    .map((value) => value.slice(0, 48));
}

export function collaboratorWelcomeTurn(collaborator) {
  const appTurns = (Array.isArray(collaborator?.turns) ? collaborator.turns : []).filter((turn) => isApp(turn) && turnText(turn));
  const eulaAt = Date.parse(collaborator?.eulaAcceptedAt || '');
  if (Number.isFinite(eulaAt)) {
    const after = appTurns.filter((turn) => {
      const at = Date.parse(turn.at || '');
      return Number.isFinite(at) && at >= eulaAt - 2000;
    });
    if (after.length) return after[0];
  }
  return appTurns.at(-1) || null;
}

export function collaboratorOwnFirstMessage(collaborator, ownerTurns = []) {
  const needles = ownerCustomerNeedles(ownerTurns);
  const turns = Array.isArray(collaborator?.turns) ? collaborator.turns : [];
  return turns.find((turn) => {
    if (!isCustomer(turn) || !turnText(turn)) return false;
    const text = turnText(turn);
    return !needles.some((needle) => text.includes(needle));
  }) || null;
}

export function collaboratorWelcomeTiming(collaborator, ownerTurns = []) {
  const welcome = collaboratorWelcomeTurn(collaborator);
  if (!welcome) return { ok: false, reason: 'missing', welcome: null, customer: null };
  const customer = collaboratorOwnFirstMessage(collaborator, ownerTurns);
  if (!customer) return { ok: true, reason: null, welcome, customer: null };
  const welcomeAt = Date.parse(welcome.at || '');
  const customerAt = Date.parse(customer.at || '');
  if (!Number.isFinite(welcomeAt) || !Number.isFinite(customerAt) || welcomeAt >= customerAt) {
    return { ok: false, reason: 'timestamp', welcome, customer };
  }
  return { ok: true, reason: null, welcome, customer };
}

export function gradeAuthorLabels(bubbles, { ownerName = '', collabName = '', ownerTurns = [] } = {}) {
  const list = Array.isArray(bubbles) ? bubbles : [];
  if (!list.length) return [{ code: 'author_label', detail: 'missing' }];
  const needles = ownerCustomerNeedles(ownerTurns);
  const owner = String(ownerName || '').trim().toLowerCase();
  const collab = String(collabName || '').trim().toLowerCase();
  const failures = [];
  for (const bubble of list) {
    const label = String(bubble?.label || '').replace(/\s+/g, ' ').trim();
    const text = turnText(bubble);
    if (!label) {
      failures.push({ code: 'author_label', detail: 'empty', text: text.slice(0, 48) });
      continue;
    }
    const labelKey = label.toLowerCase();
    const labeledYou = labelKey === 'you';
    const labeledOwner = Boolean(owner) && labelKey.includes(owner);
    const labeledCollab = labeledYou || (Boolean(collab) && labelKey.includes(collab));
    const ownerText = needles.some((needle) => text.includes(needle));
    if (bubble?.user !== true) {
      if (labeledYou || labeledOwner) failures.push({ code: 'author_label', detail: 'app_label', label });
      continue;
    }
    if (ownerText) {
      if (!labeledOwner || labeledYou) failures.push({ code: 'author_label', detail: 'owner_labeled_you', label });
      continue;
    }
    if (!labeledCollab && !labeledOwner) failures.push({ code: 'author_label', detail: 'collaborator_label', label });
  }
  return failures;
}

export function normalizeBuildSha(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(text) ? text : '';
}

export function stampBuildSha(probe = {}) {
  const checked = Array.isArray(probe.checked) ? probe.checked : [];
  const sha = checked.map((row) => normalizeBuildSha(row?.sha)).find(Boolean) || '';
  return {
    sha: sha || 'UNKNOWN',
    known: Boolean(sha),
    checkedAt: probe.checkedAt || null,
    checked,
  };
}

export function accessLineCount(text) {
  const sentences = String(text || '').split(/\n+/).flatMap((line) => line.split(/(?<=[.!?])\s+/));
  return sentences.filter((sentence) => /without signing in|viewer access|can see the site|no sign-?in/i.test(sentence)).length;
}

export function literalLeaks(literals, sources) {
  const needles = [...new Set((literals || []).map((value) => String(value || '').trim()).filter((value) => value.length >= 8))];
  const failures = [];
  for (const source of sources || []) {
    const text = String(source?.text || '');
    for (const needle of needles) {
      if (text.includes(needle)) failures.push({ code: 'fixture_literal', file: source.file || '', literal: needle });
    }
  }
  return failures;
}

function appTexts(trips, collaborator) {
  const rows = [];
  for (const trip of trips || []) {
    const timing = welcomeBeforeFirstTurn(trip?.turns);
    const welcome = turnText(timing.welcome);
    const reply = replyAfterCustomer(trip?.turns);
    if (welcome) rows.push({ id: trip?.id || '', where: 'welcome', text: welcome });
    if (reply) rows.push({ id: trip?.id || '', where: 'reply', text: reply });
  }
  const collabWelcome = collaboratorWelcomeTurn(collaborator);
  if (collabWelcome) rows.push({ id: 'collaborator', where: 'welcome', text: turnText(collabWelcome) });
  return rows;
}

export function precheckOnboardingRun({
  trips,
  literals,
  sources,
  collaborator = null,
  noVacation = null,
  eulaAccepts = null,
  checkDialog = false,
} = {}) {
  const failures = [];
  const welcomes = [];
  for (const trip of trips || []) {
    const timing = welcomeBeforeFirstTurn(trip?.turns);
    welcomes.push({
      id: trip?.id || '',
      ok: timing.ok,
      reason: timing.reason,
      text: turnText(timing.welcome),
      welcomeAt: timing.welcome?.at || null,
      firstCustomerAt: timing.customer?.at || null,
      accessLineCount: accessLineCount(turnText(timing.welcome)),
    });
    if (!timing.ok) {
      failures.push({ code: 'welcome_before_first_turn', trip: trip?.id || '', detail: timing.reason });
      continue;
    }
    const text = turnText(timing.welcome);
    const reply = replyAfterCustomer(trip?.turns);
    for (const code of internalWordHits(reply)) {
      failures.push({ code: 'internal_word', trip: trip?.id || '', where: 'reply', word: code });
    }
    if (checkDialog) {
      const match = matchRenderedWelcome(text, 'owner', trip?.welcomePlaceholders || {});
      if (!match.ok) failures.push({ code: 'welcome_template', trip: trip?.id || '', detail: match.reason, key: match.key || '' });
    } else {
      for (const code of bannedWordHits(text)) {
        failures.push({ code: 'banned_word', trip: trip?.id || '', word: code });
      }
      for (const code of internalWordHits(text)) {
        failures.push({ code: 'internal_word', trip: trip?.id || '', where: 'welcome', word: code });
      }
      if (!hasVoiceInvitation(text)) failures.push({ code: 'voice_invitation', trip: trip?.id || '' });
    }
  }
  for (const leak of literalLeaks(literals, sources)) failures.push(leak);
  if (checkDialog) {
    const f1 = (trips || []).find((trip) => trip?.id === 'f1');
    const f1Reply = replyAfterCustomer(f1?.turns);
    if (!endsWithExactlyOneQuestion(f1Reply)) {
      failures.push({ code: 'f1_one_question', detail: questionCount(f1Reply) });
    }
    const ownerTurns = (trips || []).flatMap((trip) => trip?.turns || []);
    failures.push(...gradeAuthorLabels(collaborator?.bubbles, {
      ownerName: collaborator?.welcomePlaceholders?.ownerFirstName || '',
      collabName: collaborator?.welcomePlaceholders?.collabFirstName || '',
      ownerTurns,
    }));
    const collabTiming = collaboratorWelcomeTiming(collaborator, ownerTurns);
    if (!collabTiming.ok) {
      failures.push({ code: 'collaborator_welcome_before_first', detail: collabTiming.reason });
    }
    const collabMatch = matchRenderedWelcome(turnText(collabTiming.welcome), 'collaborator', collaborator?.welcomePlaceholders || {});
    if (!collabMatch.ok) {
      failures.push({ code: 'welcome_template', trip: 'collaborator', detail: collabMatch.reason, key: collabMatch.key || '' });
    }
    for (const row of appTexts(trips, collaborator)) {
      const posture = accessPosture(row.text);
      if (posture.granted) failures.push({ code: 'access_granted', trip: row.id, where: row.where });
      const mustOffer = (row.id !== 'collaborator' && row.where === 'welcome') || (row.id === 'f3' && row.where === 'reply');
      if (mustOffer && !posture.offered) failures.push({ code: 'access_not_offered', trip: row.id, where: row.where });
    }
    const f3Reply = replyAfterCustomer((trips || []).find((trip) => trip?.id === 'f3')?.turns);
    if (!f3Reply) failures.push({ code: 'access_not_offered', trip: 'f3', where: 'reply' });
  }
  let noVacationGrade = null;
  if (noVacation) {
    noVacationGrade = gradeNoVacationDropdown(noVacation);
    failures.push(...noVacationGrade.failures.map((failure) => ({ ...failure, trip: 'no-vacation' })));
  }
  if (Array.isArray(eulaAccepts)) {
    for (const row of eulaAccepts) {
      if (!row?.at) failures.push({ code: 'eula_accept_time', trip: row?.id || '' });
    }
  }
  return { ok: failures.length === 0, failures, welcomes, noVacation: noVacationGrade };
}

function affirmative(value) {
  if (value === true) return true;
  if (value === false) return false;
  const text = String(value ?? '').trim().toLowerCase();
  if (['yes', 'true', 'pass', 'ready'].includes(text)) return true;
  if (['no', 'false', 'fail'].includes(text)) return false;
  return null;
}

export function normalizeJudge(input) {
  if (!input || typeof input !== 'object') {
    return { graded: false, pass: false, source: 'external' };
  }
  const explicit = input.graded === true && (input.pass === true || input.pass === false)
    && input.response_ready == null
    && input.answers == null
    && input.judge == null
    && input.result == null;
  if (explicit) {
    return {
      graded: true,
      pass: input.pass === true,
      source: input.source || 'external',
      coverage: input.coverage || null,
    };
  }
  const answers = input.answers || input.judge || input.result || input;
  const ready = affirmative(answers?.response_ready);
  const repair = affirmative(answers?.needs_repair);
  const coverageValue = answers?.priority_coverage_status;
  const coverage = typeof coverageValue === 'object' && coverageValue
    ? (coverageValue.choice || null)
    : (coverageValue || null);
  const graded = ready !== null || repair !== null || Boolean(coverage);
  const pass = ready === true && repair === false && coverage === 'all_covered';
  return {
    graded,
    pass,
    source: input.source || 'dialog_vacation_dialog_judge',
    coverage,
    ready,
    repair,
  };
}

export function onboardingVerdict({ precheck, judge } = {}) {
  const graded = judge?.graded === true;
  if (!precheck?.ok) return { result: 'FAIL', pass: false, reason: 'precheck' };
  if (!graded) return { result: 'FAIL', pass: false, reason: 'ungraded' };
  if (judge.pass !== true) return { result: 'FAIL', pass: false, reason: 'judge' };
  return { result: 'PASS', pass: true, reason: 'judge' };
}

export function applyJudgeGrade(packet, grade) {
  const judge = normalizeJudge(grade);
  const verdict = onboardingVerdict({ precheck: packet?.precheck, judge });
  return {
    ...packet,
    judge,
    result: verdict.result,
    pass: verdict.pass,
    reason: verdict.reason,
  };
}

function replyAfterCustomer(turns) {
  const list = Array.isArray(turns) ? turns : [];
  const customerIndex = list.findIndex((turn) => isCustomer(turn));
  if (customerIndex < 0) return '';
  const reply = list.slice(customerIndex + 1).find((turn) => isApp(turn) && turnText(turn));
  return turnText(reply);
}

export function renderJudgePacketMarkdown(packet) {
  const lines = [
    '# Onboarding welcome judge packet',
    '',
    `Result: ${packet?.result || 'FAIL'}`,
    `Reason: ${packet?.reason || 'ungraded'}`,
    '',
    'PASS is recorded only after the external judge grades a pass and the deterministic gates are clear.',
    '',
    '## Staging build',
    '',
    `Start: ${packet?.build?.start?.sha || 'UNKNOWN'} at ${packet?.build?.start?.checkedAt || 'missing'}`,
    `End: ${packet?.build?.end?.sha || 'UNKNOWN'} at ${packet?.build?.end?.checkedAt || 'missing'}`,
    '',
    '## EULA accepts',
    '',
  ];
  for (const row of packet?.eulaAccepts || []) {
    lines.push(`- ${row.id}: ${row.at || 'missing'}`);
  }
  lines.push(
    '',
    '## No-vacation dropdown',
    '',
    '```json',
    JSON.stringify(packet?.noVacation || packet?.precheck?.noVacation || {}, null, 2),
    '```',
    '',
    '## Fixture values',
    '',
    '```json',
    JSON.stringify(packet?.fixtures || {}, null, 2),
    '```',
    '',
    '## Timestamps',
    '',
  );
  for (const row of packet?.timestamps || []) {
    lines.push(`- ${row.id}: welcome ${row.welcomeAt || 'missing'} ; first customer turn ${row.firstCustomerAt || 'missing'} ; before=${row.welcomeBeforeCustomer === true}`);
  }
  lines.push('', '## Requirements', '');
  for (const bar of packet?.requirements || []) {
    lines.push(`- ${bar.id} (${bar.audience}): ${bar.text}`);
  }
  lines.push('', '## Pre-check', '', '```json', JSON.stringify(packet?.precheck || {}, null, 2), '```', '', '## Judge', '', '```json', JSON.stringify(packet?.judge || { graded: false }, null, 2), '```', '', '## Transcript', '');
  for (const trip of packet?.trips || []) {
    lines.push('', `### ${trip.id}`, '');
    for (const turn of trip.turns || []) {
      lines.push(`- ${turn.at || 'no-time'} ${turn.speaker}: ${turnText(turn)}`);
    }
    const reply = replyAfterCustomer(trip.turns);
    if (reply) lines.push('', `Reply: ${reply}`);
  }
  if (packet?.collaborator) {
    lines.push('', '### collaborator', '');
    lines.push(packet.collaborator.error ? `Capture: ${packet.collaborator.error}` : 'Capture recorded.');
    for (const turn of packet.collaborator.turns || []) {
      lines.push(`- ${turn.at || 'no-time'} ${turn.speaker}: ${turnText(turn)}`);
    }
    if (Array.isArray(packet.collaborator.bubbles)) {
      lines.push('', 'Labels:');
      for (const bubble of packet.collaborator.bubbles) {
        lines.push(`- ${bubble.label || 'unlabeled'} (${bubble.user ? 'user' : 'app'}): ${turnText(bubble)}`);
      }
    }
  }
  lines.push('', '## Screenshots', '');
  for (const shot of packet?.screenshots || []) lines.push(`- ${shot}`);
  lines.push('');
  return lines.join('\n');
}

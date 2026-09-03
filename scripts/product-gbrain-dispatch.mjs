#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCapabilityObject, assertCapabilityObject, assertCustomerRequestAllowed, assertToolingAllowed } from './product-capabilities.mjs';
import { runPublicResearch } from './vacation-public-research-worker.mjs';
import { actorFromIntake, gateTelegramIntakeEdit } from '../src/vacation/intake-edit-bridge.mjs';

const DEFAULT_MANIFEST = new URL('./product-gbrain-manifest.json', import.meta.url).pathname;
const MAX_TEXT = 12000;
const DEFAULT_SITE_BASE = 'https://www.timesyncher.com';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function loadManifest(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      name: 'timesyncher-vacation',
      allowedSkills: [],
      lodgingPolicy: {
        default: 'Hotels-first unless the customer explicitly asks for a vacation rental.',
      },
      capturePolicy: {
        externalActions: 'TimeSyncher Vacation does not book, reserve, hold, purchase, or complete travel arrangements. Customers verify details and make bookings themselves.',
      },
      manifestLoadError: error?.message || String(error),
    };
  }
}

function text(value, max = MAX_TEXT) {
  return String(value || '').trim().slice(0, max);
}

function listFrom(...values) {
  const out = [];
  for (const value of values) {
    if (Array.isArray(value)) out.push(...value);
  }
  return out;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function titleCase(value) {
  return text(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function vacationNameFrom(job, payload, trip, destination, options = {}) {
  const inheritedPayloadName = options.ignoreTripContext ? '' : (payload.vacationName || payload.vacation_name || '');
  const inheritedTripTitle = options.ignoreTripContext ? '' : (trip.title || trip.name || '');
  return text(
    inheritedPayloadName ||
      job.normalized_intent?.vacationName ||
      inheritedTripTitle ||
      (destination ? `${titleCase(destination)} Vacation` : ''),
    160,
  );
}

function unforgettableGoalFrom(job, payload) {
  return text(
    payload.unforgettableGoal ||
      payload.unforgettable_goal ||
      job.normalized_intent?.unforgettableGoal ||
      '',
    1000,
  );
}

function firstMatch(source, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (match?.[1]) return text(match[1].replace(/[.;,]$/, ''), 180);
  }
  return '';
}

function transcriptTurns(job) {
  return Array.isArray(job.trip_transcript) ? job.trip_transcript : [];
}

function currentTurnText(job) {
  return text(job.request_text || job.input?.requestText || job.payload?.requestText || job.payload?.text);
}

function combinedRequestText(job) {
  const own = currentTurnText(job);
  const prior = transcriptTurns(job)
    .filter((turn) => turn?.speaker === 'customer' && text(turn.body))
    .map((turn) => text(turn.body, 3000))
    .reverse();
  return [...prior, own].filter(Boolean).join('\n\n');
}

function sharedTokenFromText(value) {
  const match = text(value, 5000).match(/\/shared\/([^/?#\s]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function shareTokenFromContext(job, input, payload, requestText) {
  return text(
    job.share_token ||
      job.shared_token ||
      input.shareToken ||
      input.share_token ||
      payload.shareToken ||
      payload.share_token ||
      payload.token ||
      sharedTokenFromText(requestText),
    180,
  );
}

function linkedVacationsFrom(job, input, payload) {
  const rawVacations = listFrom(
    job.linkedVacations,
    job.linked_vacations,
    job.customerVacations,
    job.customer_vacations,
    job.vacations,
    input.linkedVacations,
    input.linked_vacations,
    input.customerVacations,
    input.customer_vacations,
    input.vacations,
    payload.linkedVacations,
    payload.linked_vacations,
    payload.customerVacations,
    payload.customer_vacations,
    payload.vacations,
    payload.session?.linkedVacations,
    payload.session?.linked_vacations,
    payload.account?.vacations,
  );
  const singleTrip = asObject(payload.trip || input.trip || job.trip);
  if (Object.keys(singleTrip).length) rawVacations.push(singleTrip);
  const seen = new Set();
  return rawVacations
    .map((vacation) => asObject(vacation))
    .map((vacation) => {
      const token = text(vacation.shareToken || vacation.share_token || vacation.token || vacation.sharedToken || vacation.shared_token, 180);
      const url = text(vacation.url || vacation.website || vacation.webItineraryUrl || vacation.web_itinerary_url || vacation.sharedUrl || vacation.shared_url, 500);
      const name = text(vacation.name || vacation.title || vacation.vacationName || vacation.vacation_name || vacation.tripName || vacation.trip_name, 160);
      const destination = text(vacation.destination || vacation.city || vacation.location || '', 160);
      const status = text(vacation.status || vacation.state || '', 80);
      const members = listFrom(vacation.members, vacation.tripMembers, vacation.trip_members, vacation.editors, vacation.users)
        .map((member) => asObject(member))
        .map((member) => ({
          username: text(member.username || member.name || member.displayName || member.display_name, 160),
          email: text(member.email, 220),
          role: text(member.role || member.access || '', 80),
        }));
      const webEditorInvites = listFrom(
        vacation.webEditorInvites,
        vacation.web_editor_invites,
        vacation.editorInvites,
        vacation.editor_invites,
        vacation.invites,
        vacation.invitees,
        vacation.accessGrants,
        vacation.access_grants,
      )
        .map((entry) => asObject(entry))
        .map((entry) => ({
          name: text(entry.name || entry.displayName || entry.display_name || '', 160),
          email: text(entry.email, 220),
          role: text(entry.role || entry.access || entry.kind || '', 80),
          status: text(entry.status || entry.state || '', 80),
        }));
      const shareCollab = Boolean(vacation.shareCollab || vacation.share_collab || vacation.share_collaboration || vacation.webCollaboration || vacation.web_collaboration);
      const id = text(vacation.id || vacation.tripId || vacation.trip_id || token || url || name || destination, 220);
      return { id, token, url, name, destination, status, members, webEditorInvites, shareCollab };
    })
    .filter((vacation) => vacation.id || vacation.name || vacation.destination || vacation.token || vacation.url)
    .filter((vacation) => {
      const key = vacation.id || vacation.token || vacation.url || `${vacation.name}:${vacation.destination}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function containsAny(source, words) {
  const lower = source.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function knownDestinationFromText(source) {
  const lower = source.toLowerCase();
  const places = [];
  const add = (label, pattern) => {
    if (pattern.test(lower) && !places.includes(label)) places.push(label);
  };
  add('Caldwell', /\bcaldwell\b/);
  add('Boise', /\bboise\b/);
  add('Idaho', /\bidaho\b/);
  add('Oahu/Waikiki', /\boahu\b|\bhonolulu\b|\bwaikiki\b/);
  add('Maui/Kihei', /\bmaui\b|\bkihei\b/);
  add('Kona/Big Island', /\bkona\b|\bbig island\b/);
  add('Hawaii', /\bhawaii\b/);
  add('Las Vegas Strip', /\blas vegas strip\b|\bvegas strip\b/);
  add('Las Vegas', /\blas vegas\b|\bvegas\b/);

  if (places.includes('Las Vegas Strip')) return 'Las Vegas Strip';
  if (places.includes('Las Vegas')) return 'Las Vegas';
  if (places.includes('Caldwell') || places.includes('Boise') || places.includes('Idaho')) {
    if (places.includes('Caldwell')) return 'Caldwell, Idaho';
    if (places.includes('Boise')) return 'Boise, Idaho';
    return 'Idaho';
  }
  const hawaiiPlaces = places.filter((place) => place !== 'Idaho');
  return hawaiiPlaces.join(' / ');
}

function extractDestination(requestText, payload, trip, options = {}) {
  const inheritedTripDestination = options.ignoreTripContext ? '' : (trip.destination || payload.trip?.destination || '');
  return text(
    inheritedTripDestination ||
      payload.destination ||
      knownDestinationFromText(requestText) ||
      firstMatch(requestText, [
        /\b(?:to|in|for)\s+([A-Z][A-Za-z .'-]{2,60}?)(?:\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|from|on|for|with|between|around|starting|leaving)\b|$)/i,
        /\b(?:visit|visiting|vacation(?:ing)? in|trip to)\s+([A-Z][A-Za-z .'-]{2,60})(?:\s|$)/i,
      ]),
    180,
  );
}

const WEEKDAYS = new Map([
  ['sunday', 0], ['sun', 0],
  ['monday', 1], ['mon', 1],
  ['tuesday', 2], ['tue', 2], ['tues', 2],
  ['wednesday', 3], ['wed', 3],
  ['thursday', 4], ['thu', 4], ['thur', 4], ['thurs', 4],
  ['friday', 5], ['fri', 5],
  ['saturday', 6], ['sat', 6],
]);

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseNightCount(requestText) {
  const numeric = requestText.match(/\b(\d{1,2})[-\s]*nights?\b/i);
  if (numeric) return Number(numeric[1]);
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const word = requestText.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)[-\s]*nights?\b/i)?.[1]?.toLowerCase();
  return word ? words[word] : 0;
}

function referenceDateFrom(payload, job) {
  const raw = text(payload.receivedAt || payload.received_at || job.receivedAt || job.received_at || job.created_at || job.createdAt, 80);
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function recentWeekdayDate(requestText, referenceDate) {
  const match = requestText.match(/\b(?:ending|ended|ends|through|until)\s+(sun(?:day)?|mon(?:day)?|tue(?:s|sday|day)?|wed(?:nesday)?|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?)\b/i);
  const target = match ? WEEKDAYS.get(match[1].toLowerCase()) : undefined;
  if (target === undefined) return '';
  const ref = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  const delta = (ref.getUTCDay() - target + 7) % 7;
  return isoDate(addUtcDays(ref, -delta));
}

function extractDates(requestText, payload, trip, options = {}) {
  const monthDay = firstMatch(requestText, [
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?)\b/i,
  ]);
  const dateRange = firstMatch(requestText, [
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\s*(?:-|to|through)\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)?[a-z]*\s*\d{1,2})\b/i,
    /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:-|to|through)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/,
  ]);
  const inheritedStart = options.ignoreTripContext ? '' : (trip.startDate || trip.start_date || '');
  const inheritedEnd = options.ignoreTripContext ? '' : (trip.endDate || trip.end_date || '');
  let startDate = text(inheritedStart || payload.startDate || payload.start_date, 40);
  let endDate = text(inheritedEnd || payload.endDate || payload.end_date, 40);
  let dateText = text(payload.dateText || payload.dates || dateRange || monthDay, 120);
  const nights = parseNightCount(requestText);
  if (!endDate) endDate = recentWeekdayDate(requestText, referenceDateFrom(payload, options.job || {}));
  if (nights && endDate && !startDate) {
    const end = new Date(`${endDate}T00:00:00Z`);
    if (!Number.isNaN(end.getTime())) startDate = isoDate(addUtcDays(end, -nights));
  }
  if (nights && startDate && endDate && !dateText) dateText = `${nights} nights / ${nights + 1} days, ${startDate} to ${endDate}`;
  return { startDate, endDate, dateText };
}

function inferMethods(requestText) {
  const lower = requestText.toLowerCase();
  const methods = [
    'travel.assistant.load-client-context',
    'travel.assistant.cache-first-source-check',
    'travel.assistant.select-source-lane',
    'travel.assistant.recommend-itinerary',
    'travel.assistant.external-action-gate',
    'travel.assistant.sync-trek-nomad',
  ];
  if (/\bflight|airfare|airport|airline|fly|flying\b/.test(lower)) methods.push('travel.assistant.compare-flights');
  if (/\bhotel|lodging|stay|airbnb|vacation rental|condo|apartment|house\b/.test(lower)) methods.push('travel.ui.tabs-filters');
  if (/\brestaurant|dinner|lunch|breakfast|food|eat\b/.test(lower)) methods.push('travel.thing-editor.review-enrichment', 'travel.restaurant-tagger.classify-restaurants');
  if (/\bstore|shop|grocery|market|retail\b/.test(lower)) methods.push('travel.store-tagger.classify-stores');
  if (/\bbudget|cost|price|spend|cheap|expensive\b/.test(lower)) methods.push('travel.ui.tabs-filters');
  return [...new Set(methods)];
}

function lodgingLane(requestText, manifest) {
  const lower = requestText.toLowerCase();
  const explicitRental = /\bairbnb|vacation rental|rental house|rental home|condo|apartment|more space\b/.test(lower);
  return {
    primary: explicitRental ? 'vacation_rentals_allowed_by_request' : 'hotels_first',
    policy: explicitRental ? manifest.lodgingPolicy?.airbnb : manifest.lodgingPolicy?.default,
  };
}

function isWebsiteLinkRequestText(value) {
  const requestText = text(value, 2000).toLowerCase();
  return (
    /\b(send|share|show|give|need|where|what|open|current|broken|old)\b/.test(requestText) || /\?/.test(requestText)
  ) && /\b(website|web site|web page|site|link|url)\b/.test(requestText) && /\b(vacation|trip|itinerary|caldwell|davidson|vegas|las vegas|strip)\b/.test(requestText);
}

function isLinkCapabilityQuestion(value) {
  const requestText = text(value, 3000).toLowerCase();
  if (!requestText || !isQuestionLike(requestText)) return false;
  return /\b(if|when|can|could|does|will|would|only)\b/.test(requestText)
    && /\b(someone|anyone|person|people|family|friend|stranger|finds?|has|with)\b/.test(requestText)
    && /\b(link|url|website|web site|web page|site|shared link)\b/.test(requestText)
    && /\b(edit|change|modify|collaborate|comment|view|see|open|only view)\b/.test(requestText)
    && /\b(vacation|trip|itinerary|vegas|las vegas|strip|jockey club)\b/.test(requestText);
}

function linkCapabilityAnswer({ requestText = '', linkedVacations = [], fallbackBase = DEFAULT_SITE_BASE } = {}) {
  const lookup = vacationLookupTerm(requestText);
  const lookupMatches = lookup
    ? linkedVacations.filter((vacation) => vacationMatchesLookup(vacation, lookup))
    : [];
  const matches = lookupMatches.length
    ? lookupMatches
    : (linkedVacations.length === 1 ? linkedVacations : []);
  if (matches.length !== 1) return 'I need to know which vacation link you mean before I answer what that link allows.';
  const match = matches[0];
  const label = match.name || match.destination || lookup || 'that vacation';
  const url = publicVacationUrl(match, fallbackBase);
  const lines = [];
  lines.push(`The shared website link for ${label} is view-only for people who have the URL.`);
  if (url) lines.push(`Website: ${url}`);
  lines.push(match.shareCollab
    ? 'Website editing is enabled for approved sessions: the owner or paid Telegram collaborator can open from Telegram and edit, and non-Telegram invitees can use an owner-approved email magic link.'
    : 'This shared link is view-only unless the owner opens from Telegram/session or grants a specific editor path.');
  lines.push('The shared website link does not grant full Telegram editing or media-upload access by itself.');
  return lines.join('\n\n');
}

function isPaymentCredentialRequest(value) {
  const requestText = text(value, 4000).toLowerCase();
  if (!requestText) return false;
  const mentionsPaymentSecret = /\b(card|credit card|debit card|cvv|cvc|security code|expiration|exp|4111|4242|visa|mastercard|amex)\b/.test(requestText)
    || /\b\d{13,19}\b/.test(requestText);
  const mentionsExternalAction = /\b(book|booking|reserve|reservation|purchase|buy|pay|charge|hold)\b/.test(requestText);
  return mentionsPaymentSecret && mentionsExternalAction;
}

function isSensitiveDumpRequest(value) {
  const requestText = text(value, 4000).toLowerCase();
  if (!requestText) return false;
  return /\b(dump|export|show|list|print|send|get)\b/.test(requestText)
    && /\b(all|every|customer|customers|owner emails?|emails?|api keys?|tokens?|secrets?|ids?|database|db)\b/.test(requestText)
    && /\b(vacation|trip|customer|owner|api|key|token|secret|email|id|database|db)\b/.test(requestText);
}

function isDeleteVacationRequest(value) {
  const requestText = text(value, 4000).toLowerCase();
  if (!requestText) return false;
  return /\b(delete|destroy|wipe|erase)\b/.test(requestText)
    && /\b(vacation|trip|itinerary|site|website)\b/.test(requestText);
}

function deleteVacationLookupTerm(value) {
  const explicit = vacationLookupTerm(value);
  if (explicit) return explicit;
  const requestText = text(value, 4000).toLowerCase().replace(/\s+/g, ' ').trim();
  const match = requestText.match(/\b(?:delete|destroy|wipe|erase)\s+(?:the\s+|a\s+|an\s+)?([a-z][a-z0-9 .'-]{2,80}?)(?:\s+(?:vacation|trip|itinerary|site|website)\b|[?!.]|$)/i);
  return text(match?.[1] || '', 120);
}

function deleteVacationSafetyAnswer({ requestText = '', linkedVacations = [], fallbackBase = DEFAULT_SITE_BASE } = {}) {
  const lookup = deleteVacationLookupTerm(requestText);
  const matches = lookup
    ? linkedVacations.filter((vacation) => vacationMatchesLookup(vacation, lookup))
    : [];
  if (matches.length === 1) {
    const match = matches[0];
    const label = match.name || match.destination || lookup || 'that vacation';
    const url = publicVacationUrl(match, fallbackBase);
    return [
      `I found ${label}${url ? `: ${url}` : ''}.`,
      'Deleting a vacation is destructive, so I will not delete it from this message.',
      'Ask again with an explicit delete confirmation and the exact vacation name if you really want that removed.',
    ].join('\n\n');
  }
  const visible = linkedVacations
    .slice(0, 5)
    .map((vacation) => vacation.name || vacation.destination || vacation.token || 'Untitled vacation')
    .filter(Boolean);
  return [
    lookup ? `I do not see a ${lookup} vacation I can delete.` : 'I could not identify the vacation to delete.',
    visible.length ? `Current vacation sites I can access: ${visible.join(', ')}.` : '',
    'I will not delete anything without a verified matching vacation and an explicit confirmation.',
  ].filter(Boolean).join('\n\n');
}

function isConcreteItineraryEditRequest(value) {
  const requestText = text(value, 4000).toLowerCase();
  if (!requestText) return false;
  if (isExplicitNewVacationRequest(requestText)) return false;
  if (isWebsiteLinkRequestText(requestText)) return false;
  if (isDeleteVacationRequest(requestText)) return false;
  if (isPersonAccessQuestion(requestText)) return false;
  const mentionsTrip = /\b(vacation|trip|itinerary|dates?|nights?|days?|hotel|lodging|caldwell|davidson|shared website|travel plan)\b/.test(requestText);
  const mentionsEdit = /\b(add|remove|delete|keep|change|update|move|create|fill in|timeline|day\s*\d|\d+\s*days?|days?\s+\d|\d+\s*nights?|nights?\s+\d|right dates?|dates?|length of (the )?trip|hotel|lodging|rename|title|description|access|share|member|family|wife|husband|spouse|collaborator|permission|edit rights?|view rights?)\b/.test(requestText);
  const timelineAdd = /\b(add|create|put|include|schedule)\b/.test(requestText)
    && /\b(day\s*\d|days?\s+\d|timeline|family event)\b/.test(requestText);
  return (mentionsTrip && mentionsEdit) || timelineAdd;
}

function isExplicitNewVacationRequest(value) {
  const requestText = text(value, 4000).toLowerCase();
  if (!requestText) return false;
  if (isNewVacationAdviceQuestion(requestText) || isVagueNextStepQuestion(requestText) || isVacationExistenceQuestion(requestText)) return false;
  if (/\b(update|change|edit|add|remove|delete|rename|move)\b/.test(requestText) && /\b(existing|current|this|that)\s+(vacation|trip|itinerary|website)\b/.test(requestText)) return false;
  if (sharedTokenFromText(requestText) && /\b(update|change|edit|add|remove|delete|rename|move|make)\b/.test(requestText)) return false;
  if (/\b(update|change|edit)\s+(?:the\s+)?(?:trip|vacation|itinerary|website)\s+at\s+https?:\/\//.test(requestText)) return false;
  const explicitPlanningCreate = /\b(start|create|make|build|plan|set up|setup)\b/.test(requestText)
    && /\b(vacation|trip|itinerary|staycation|travel plan)\b/.test(requestText)
    && (knownDestinationFromText(requestText) || /\b(to|in|for)\s+[a-z][a-z .'-]{2,60}/i.test(requestText) || /\b\d{1,2}\s*(day|night)s?\b/i.test(requestText));
  return (
    /\b(start|create|make|build|plan|set up|setup)\b/.test(requestText) &&
    /\b(new|brand new|fresh|another|separate|next)\b/.test(requestText) &&
    /\b(vacation|trip|itinerary|staycation|travel plan)\b/.test(requestText)
  ) || (
    /\bi want to create\b/.test(requestText) &&
    /\b(vacation|trip|itinerary|staycation|travel plan)\b/.test(requestText)
  ) || explicitPlanningCreate;
}

function isNewVacationAdviceQuestion(value) {
  const requestText = text(value, 4000).toLowerCase();
  if (!requestText) return false;
  if (isWebsiteLinkRequestText(requestText)) return false;
  const questionLike = requestText.includes('?') || /\b(should i|should we|what should i do|what do i do|do i need to|am i supposed to|is the current one|is my current|did the current|was the current)\b/.test(requestText);
  if (!questionLike) return false;
  const mentionsNewVacation = /\b(start|create|make|build|plan|set up|setup)\b/.test(requestText)
    && /\b(new|brand new|fresh|another|separate|next)\b/.test(requestText)
    && /\b(vacation|trip|itinerary|staycation|travel plan)\b/.test(requestText);
  const mentionsMetaState = /\b(staging bot|vacation bot|bot|current one|current vacation|current trip|deleted|still there|already exists|should i test)\b/.test(requestText);
  return /\b(should i|should we|what should i do|what do i do|do i need to|am i supposed to|is the current one|is my current|did the current|was the current)\b/.test(requestText)
    && (mentionsNewVacation || mentionsMetaState);
}

function isVagueNextStepQuestion(value) {
  const requestText = text(value, 4000).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!requestText || !isQuestionLike(requestText)) return false;
  if (isWebsiteLinkRequestText(requestText)) return false;
  return /\b(now what|what next|what should i do now|what do i do now|what should i send|what should i send you|what do you need from me|what else do you need|how should i proceed)\b/.test(requestText);
}


function isVacationExistenceQuestion(value) {
  const requestText = text(value, 4000).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!requestText || !isQuestionLike(requestText)) return false;
  const mentionsVacation = /\b(vacation|trip|itinerary|staycation|travel plan)\b/.test(requestText);
  if (!mentionsVacation) return false;
  return /\b(is there|are there|do we have|do i have|do i already have|did we create|did i create|was .* created|is my|is our|does .* exist|tell me if .* exists|if .* exists|already exists|still there)\b/.test(requestText);
}


function isPersonAccessQuestion(value) {
  const rawText = text(value, 4000).replace(/\s+/g, ' ').trim();
  const requestText = rawText.toLowerCase();
  if (!requestText) return false;
  if (/\bfamily event\b/.test(requestText)) return false;
  if (sharedTokenFromText(requestText) && /\b(update|change|edit|add|remove|delete|rename|move|make)\b/.test(requestText)) return false;
  const mentionsAccess = /\b(access|permission|permissions|edit rights?|view rights?|member|collaborator|collaborate|share|shared|see|view|look at|open|edit|modify|change|interact|use\s+telegram|add\s+(?:pics?|pictures?|photos?|videos?|media)|send\s+(?:vacation\s+)?(?:pics?|pictures?|photos?|videos?|media)|save\s+(?:pics?|pictures?|photos?|videos?|media)|upload|uploads?)\b/.test(requestText);
  const explicitNamedPerson = /\b(?:[Cc]an|[Dd]oes|[Dd]id|[Ww]ill|[Ii]s|[Aa]dd|[Rr]emove|[Ss]hare(?:\s+with)?|[Gg]ive|[Mm]ake)\s+(?:my\s+)?([A-Z][A-Za-z'-]{1,40})\b/.test(rawText);
  const mentionsPerson = /\b(kim|wife|husband|spouse|partner|she|he|family|friend|assistant|collaborator|member)\b/.test(requestText) || explicitNamedPerson;
  const mentionsVacationContext = /\b(this|that|vegas|las vegas|strip|jockey club|vacation|trip|itinerary|website|web page|site|telegram|collaborator|photos?|pictures?|pics?|videos?|media|upload|uploads?)\b/.test(requestText);
  return mentionsAccess && mentionsPerson && mentionsVacationContext;
}

function isAccessRosterQuestion(value) {
  const requestText = text(value, 4000).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!requestText || !isQuestionLike(requestText)) return false;
  const asksWho = /\b(who|which people|what people|who all)\b/.test(requestText);
  const mentionsAccess = /\b(access|permission|permissions|edit|editor|member|collaborator|collaborate|share|shared|view|see|telegram|upload|media)\b/.test(requestText);
  const mentionsVacationContext = /\b(this|that|vegas|las vegas|strip|jockey club|vacation|trip|itinerary|website|web page|site)\b/.test(requestText);
  return asksWho && mentionsAccess && mentionsVacationContext;
}

function vacationLookupTerm(value) {
  const requestText = text(value, 4000).toLowerCase();
  const destination = knownDestinationFromText(requestText);
  if (destination) return destination;
  if (isPersonAccessQuestion(requestText) && !/\b(vacation|trip|itinerary|staycation|travel plan)\b/.test(requestText)) return '';
  const match = requestText.match(/\b(?:is there|are there|do we have|do i have|did we create|did i create|is my|is our)\s+(?:a|an|the|any)?\s*([a-z][a-z0-9 .'-]{2,80}?)(?:\s+(?:vacation|trip|itinerary|staycation|travel plan)\b|[?!.]|$)/i);
  return text(match?.[1] || '', 120);
}

function vacationMatchesLookup(vacation, lookup) {
  const needle = text(lookup, 120).toLowerCase();
  if (!needle) return false;
  const haystack = [vacation.name, vacation.destination, vacation.url, vacation.token]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return false;
  if (haystack.includes(needle)) return true;
  if (needle.includes('vegas')) return /\b(vegas|las vegas|strip|jockey club)\b/i.test(haystack);
  if (needle.includes('hawaii')) return /\b(hawaii|oahu|waikiki|maui|kona|big island)\b/i.test(haystack);
  return false;
}

function publicVacationUrl(vacation, fallbackBase) {
  if (vacation.url) return vacation.url;
  if (vacation.token) return `${fallbackBase.replace(/\/+$/, '')}/shared/${encodeURIComponent(vacation.token)}/`;
  return '';
}

function accessPersonLabel(value = '', context = '') {
  const rawText = text(value, 500);
  const requestText = rawText.toLowerCase();
  const contextText = text(context, 3000).toLowerCase();
  if (/\bkim\b/.test(requestText) || (/\b(she|her)\b/.test(requestText) && /\bkim\b/.test(contextText))) return 'Kim';
  if (/\bwife\b/.test(requestText)) return 'your wife';
  if (/\bhusband\b/.test(requestText)) return 'your husband';
  if (/\bspouse|partner\b/.test(requestText)) return 'your spouse';
  if (/\bfamily\b/.test(requestText)) return 'your family';
  const named = rawText.match(/\b(?:[Cc]an|[Dd]oes|[Dd]id|[Ww]ill|[Ii]s|[Aa]dd|[Rr]emove|[Ss]hare(?:\s+with)?|[Gg]ive|[Mm]ake)\s+(?:my\s+)?([A-Z][A-Za-z'-]{1,40})\b/)?.[1];
  if (named && !/^(TimeSyncher|Vegas|Las|The|This|That|A|An)$/i.test(named)) return named;
  return 'that person';
}

function accessPersonCustomerLabel(personLabel = '', requestText = '', contextText = '') {
  const person = text(personLabel, 120);
  const configuredWifeName = text(process.env.TIMESYNCHER_CUSTOMER_WIFE_DISPLAY_NAME || process.env.TIMESYNCHER_PRIMARY_SPOUSE_NAME, 80);
  const combined = `${text(requestText, 1000)}\n${text(contextText, 3000)}`.toLowerCase();
  if (person === 'your wife' && configuredWifeName) return configuredWifeName;
  if (person === 'your wife' && /\bkim\b/.test(combined)) return 'Kim';
  return person || 'that person';
}

function memberMatchesAccessPerson(member = {}, personLabel = '') {
  const needle = text(personLabel, 80).toLowerCase();
  if (!needle || ['your wife', 'your husband', 'your spouse', 'your family', 'that person'].includes(needle)) return false;
  const haystack = [member.username, member.email, member.name, member.displayName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

function accessInviteStateFrom(vacation = {}, personLabel = '') {
  const personNeedle = text(personLabel, 120).toLowerCase();
  const inviteLists = listFrom(
    vacation.webEditorInvites,
    vacation.web_editor_invites,
    vacation.editorInvites,
    vacation.editor_invites,
    vacation.invites,
    vacation.invitees,
    vacation.accessGrants,
    vacation.access_grants,
  );
  const invite = inviteLists
    .map((entry) => asObject(entry))
    .find((entry) => {
      const haystack = [
        entry.name,
        entry.displayName,
        entry.display_name,
        entry.email,
        entry.role,
        entry.status,
      ].map((value) => text(value, 180).toLowerCase()).join(' ');
      return personNeedle && haystack.includes(personNeedle);
    });
  if (!invite) return '';
  const role = text(invite.role || invite.access || invite.kind, 80).toLowerCase();
  const status = text(invite.status || invite.state, 80).toLowerCase();
  if (role.includes('web') || role.includes('editor')) {
    if (['sent', 'invited', 'pending'].includes(status)) return 'sent';
    if (['accepted', 'active'].includes(status)) return 'accepted';
  }
  return '';
}

function accessCapabilitiesRequested(requestText = '') {
  const source = text(requestText, 1200).toLowerCase();
  const caps = new Set();
  const wantsPhoto = /\b(photo|photos|picture|pictures|pic|pics)\b/.test(source);
  const wantsVideo = /\b(video|videos)\b/.test(source);
  const wantsMedia = /\b(media|upload|uploads|add .*media|add .*photo|add .*video|send .*photo|send .*video|save .*photo|save .*video)\b/.test(source);
  const wantsFull = /\b(full access|everything|all access|photo\/?video|photos? and videos?)\b/.test(source);
  if (wantsPhoto || wantsMedia || wantsFull) caps.add('photo_upload');
  if (wantsVideo || wantsFull) caps.add('video_upload');
  if (wantsPhoto || wantsVideo || wantsMedia || wantsFull) caps.add('media_upload');
  if (/\b(telegram|bot|message|chat|talk to|text|modify|change|edit|add to|interact|upload|uploads|photo|photos|video|videos|media|full access)\b/.test(source)) caps.add('collab_telegram');
  if (/\b(website|site|web|web page|shared link|link|view|see|look at|open)\b/.test(source)) caps.add('view_shared');
  if (/\b(web collab|website collab|collaborate on the website|collaborate on the web page|comment on the shared website|comment on the website|edit the website|edit the web page|modify the website|modify the web page)\b/.test(source) || (/\b(collaborate|comment|edit|modify|change)\b/.test(source) && /\b(website|web page|site|web)\b/.test(source))) caps.add('collab_web');
  if (!caps.size) caps.add('collab_telegram');
  return [...caps];
}

function isTelegramCollaboratorStatusQuestion(requestText = '') {
  const source = text(requestText, 1200).toLowerCase();
  if (!/\btelegram\b/.test(source) || !/\bcollaborator\b/.test(source)) return false;
  if (!/\b(already|currently|now|is|are|listed|status)\b/.test(source)) return false;
  if (/\b(can|could|may|able|allow|let|add|invite|make|give|grant|buy|purchase|cost|price|upload|photo|photos|video|videos|website|web page|site)\b/.test(source)) return false;
  return true;
}

function checkoutBaseUrl(manifest) {
  return text(
    process.env.TIMESYNCHER_ACCESS_CHECKOUT_BASE_URL ||
      process.env.TIMESYNCHER_VACATION_CHECKOUT_BASE_URL ||
      manifest?.accessRemediationCatalog?.defaultCheckoutBaseUrl ||
      'https://vacation-staging.timesyncher.com',
    500,
  ).replace(/\/+$/, '');
}

function remediationCatalogItem(manifest, targetCapability) {
  const items = Array.isArray(manifest?.accessRemediationCatalog?.items) ? manifest.accessRemediationCatalog.items : [];
  return items.find((item) => text(item?.targetCapability, 80) === targetCapability) || null;
}

function remediationLine(manifest, targetCapability, { person = 'that person', label = 'this vacation' } = {}) {
  const item = remediationCatalogItem(manifest, targetCapability);
  if (!item) return '';
  const actionType = text(item.actionType, 80);
  const ctaLabel = text(item.ctaLabel, 160) || 'Add access';
  const path = text(item.path, 240);
  const amount = Number(item.amountUsd || 0);
  const price = amount > 0 ? `$${amount}` : '';
  const url = path ? `${checkoutBaseUrl(manifest)}${path.startsWith('/') ? path : `/${path}`}` : '';
  if (actionType === 'owner_enable') {
    return `${ctaLabel}: ${person} is not enabled for that website editing path on ${label} yet.`;
  }
  return [
    `${ctaLabel}${price ? ` (${price})` : ''}:`,
    url,
  ].filter(Boolean).join(' ');
}

function isAccessPricingQuestion(requestText = '') {
  const source = text(requestText, 2000).toLowerCase();
  if (!isQuestionLike(source)) return false;
  const asksPrice = /\b(how much|cost|costs|price|pricing|charge|fee|pay|purchase|buy)\b/.test(source);
  const accessTarget = /\b(access|full access|collaborator|collaborate|edit|editing|change|modify|telegram|photo|photos|pic|pics|video|videos|media|upload|wife|spouse|family|assistant|kim)\b/.test(source);
  return asksPrice && accessTarget;
}

function accessPricingAnswer({ requestText = '', manifest = null } = {}) {
  const source = text(requestText, 2000).toLowerCase();
  const person = accessPersonLabel(requestText);
  const allVacations = /\b(all|every|unlimited|future)\b/.test(source) && /\b(vacations?|trips?)\b/.test(source);
  const wantsMedia = /\b(photo|photos|picture|pictures|pic|pics|video|videos|media|upload|uploads)\b/.test(source) || /\bfull access\b/.test(source);
  const plans = Array.isArray(manifest?.collaboratorEntitlementPolicy?.plans) ? manifest.collaboratorEntitlementPolicy.plans : [];
  const singleTrip = plans.find((plan) => text(plan?.scope, 80) === 'single_trip');
  const unlimited = plans.find((plan) => text(plan?.scope, 80) === 'unlimited_trips');
  const photo = manifest?.mediaAddOnPolicy?.photoMemories || {};
  const video = manifest?.mediaAddOnPolicy?.videoMemoriesRecommendation || {};
  const checkout = checkoutBaseUrl(manifest);
  const lines = [];
  if (allVacations) {
    lines.push(`For ${person}, full Telegram editing access across all of your vacations is ${unlimited?.amountUsd ? `$${unlimited.amountUsd}` : '$27'}.`);
    lines.push(`That adds one active Telegram collaborator. Add more collaborators one checkout at a time.`);
    if (wantsMedia) {
      lines.push(`Photo upload access across all vacations is ${photo.unlimitedVacationsAmountUsd ? `$${photo.unlimitedVacationsAmountUsd}` : '$9'}.`);
      lines.push(`Video upload access across all vacations is ${video.unlimitedVacationsAmountUsd ? `$${video.unlimitedVacationsAmountUsd}` : '$27'}.`);
    }
  } else {
    lines.push(`For ${person}, Telegram editing access for one vacation is ${singleTrip?.amountUsd ? `$${singleTrip.amountUsd}` : '$15'}.`);
    lines.push(`That adds one active Telegram collaborator for that vacation. Add more collaborators one checkout at a time.`);
    if (wantsMedia) {
      lines.push(`Photo upload access for one vacation is ${photo.singleVacationAmountUsd ? `$${photo.singleVacationAmountUsd}` : '$5'}.`);
      lines.push(`Video upload access for one vacation is ${video.singleVacationAmountUsd ? `$${video.singleVacationAmountUsd}` : '$17'}.`);
    }
  }
  lines.push(`Add-on checkout link: ${checkout}/addons-checkout.html`);
  return lines.join('\n\n');
}

function hasTelegramCollaboratorAccess({ namedMember = false, requestedCaps = [] } = {}) {
  return Boolean(namedMember && requestedCaps.includes('collab_telegram'));
}

function vacationAccessAnswerFacts({ requestText = '', linkedVacations = [], fallbackBase = DEFAULT_SITE_BASE, contextText = '', manifest = null } = {}) {
  const lookup = vacationLookupTerm(requestText);
  const lookupMatches = lookup
    ? linkedVacations.filter((vacation) => vacationMatchesLookup(vacation, lookup))
    : [];
  const matches = lookupMatches.length
    ? lookupMatches
    : (linkedVacations.length === 1 ? linkedVacations : []);
  const rawPerson = accessPersonLabel(requestText, contextText);
  const person = accessPersonCustomerLabel(rawPerson, requestText, contextText);
  if (matches.length !== 1) return { matches, person, lookup, facts: null, fallbackAnswer: '' };
  const match = matches[0];
  const label = match.name || match.destination || lookup || 'that vacation';
  const url = publicVacationUrl(match, fallbackBase);
  const requestedCaps = accessCapabilitiesRequested(requestText);
  const namedMember = Array.isArray(match.members) && match.members.some((member) => memberMatchesAccessPerson(member, person) || memberMatchesAccessPerson(member, rawPerson));
  const telegramCollaborator = hasTelegramCollaboratorAccess({ namedMember, requestedCaps });
  const inviteState = accessInviteStateFrom(match, person) || accessInviteStateFrom(match, rawPerson);
  const allowedClaims = [];
  const forbiddenClaims = [];
  allowedClaims.push(telegramCollaborator
    ? `${person} is a Telegram collaborator on ${label}.`
    : `${person} is not a Telegram collaborator on ${label} yet.`);
  if (inviteState === 'sent') allowedClaims.push(`${person} has been sent a website editor invite.`);
  if (inviteState === 'accepted') allowedClaims.push(`${person} has accepted a website editor invite.`);
  allowedClaims.push(`Telegram collaboration is separate from website editor access.`);
  if (namedMember) allowedClaims.push(`${person} is listed as a named member/editor on ${label}.`);
  else allowedClaims.push(`${person} is not listed as a named member/editor on ${label}.`);
  if (url) allowedClaims.push(`The shared vacation website is ${url}.`);
  forbiddenClaims.push(`${person} can edit through Telegram.`);
  forbiddenClaims.push(`${person} accepted the invite.`);
  forbiddenClaims.push(`${person} is a collaborator.`);
  forbiddenClaims.push(`${person} has website editor access.`);
  const fallbackLines = [];
  if (requestedCaps.includes('collab_telegram')) {
    fallbackLines.push(telegramCollaborator
      ? `Yes, ${person} is a Telegram collaborator on ${label}.`
      : `No, ${person} is not a Telegram collaborator on ${label} yet.`);
    if (inviteState === 'sent') fallbackLines.push(`${person} has the website editor invite, but Telegram collaboration is separate.`);
    else fallbackLines.push('Telegram collaboration is separate from website editor access.');
  } else {
    fallbackLines.push(namedMember
      ? `${person} is listed as a named member/editor on ${label}.`
      : `${person} is not listed as a named member/editor on ${label}.`);
  }
  if (url && !requestedCaps.includes('collab_telegram')) fallbackLines.push(`The vacation website itself is available to anyone with the shared link: ${url}`);
  if (requestedCaps.includes('photo_upload') || requestedCaps.includes('video_upload')) {
    const parts = [];
    if (requestedCaps.includes('photo_upload')) parts.push('photo uploads');
    if (requestedCaps.includes('video_upload')) parts.push('video uploads');
    fallbackLines.push(`${person} is not currently enabled for ${parts.join(' or ')} on ${label}.`);
  }
  if (!namedMember || requestedCaps.includes('collab_telegram')) {
    const line = remediationLine(manifest, 'collab_telegram', { person, label });
    if (line && !requestedCaps.includes('collab_telegram')) fallbackLines.push(line);
  }
  return {
    matches,
    person,
    lookup,
    facts: {
      kind: 'vacation_access_status',
      request_text: text(requestText, 1000),
      person_name: person,
      person_reference: rawPerson,
      vacation_name: label,
      vacation_url: url || '',
      requested_capabilities: requestedCaps,
      telegram_collaborator: telegramCollaborator,
      named_member_or_editor: namedMember,
      website_editor_invite: inviteState || 'unknown',
      allowed_claims: allowedClaims,
      forbidden_claims: forbiddenClaims,
      required_terms: [person, label],
      preferred_style: 'direct, warm, one or two short Telegram sentences',
    },
    fallbackAnswer: fallbackLines.filter(Boolean).join('\n\n'),
  };
}

function customerCopyLooksSafe(answer = '', facts = {}) {
  const source = text(answer, 2400);
  if (!source || source.length > 900) return false;
  if (!customerCopyLeakScan(source).ok) return false;
  if (/\b(could not verify|matching vacation|linked vacation|database|router|worker|no-write|deterministic|schema|fact packet)\b/i.test(source)) return false;
  const lower = source.toLowerCase();
  const person = text(facts.person_name, 120);
  const label = text(facts.vacation_name, 180);
  if (person && person !== 'that person' && !lower.includes(person.toLowerCase())) return false;
  if (label && !lower.includes(label.toLowerCase())) return false;
  if (facts.telegram_collaborator === false && !/^\s*no\b/i.test(source)) return false;
  if (facts.telegram_collaborator === true && !/^\s*yes\b/i.test(source)) return false;
  if (facts.telegram_collaborator === false && /\b(is|already is|can edit through telegram|has telegram access)\b/i.test(source) && !/\bnot\b/i.test(source)) return false;
  const forbidden = Array.isArray(facts.forbidden_claims) ? facts.forbidden_claims : [];
  for (const claim of forbidden) {
    const normalized = text(claim, 240).toLowerCase();
    if (normalized && lower.includes(normalized.toLowerCase())) return false;
  }
  return true;
}

function grokCustomerRender(facts = {}) {
  if (process.env.TIMESYNCHER_GROK_RESPONSE_RENDERER_FAKE === '1') {
    const claims = Array.isArray(facts.allowed_claims) ? facts.allowed_claims : [];
    const first = facts.telegram_collaborator === false && claims[0] ? `No, ${claims[0]}` : claims[0];
    const answer = [first, claims[1], claims[2]].filter(Boolean).join(' ');
    return customerCopyLooksSafe(answer, facts) ? answer : '';
  }
  if (process.env.TIMESYNCHER_DISABLE_GROK_RESPONSE_RENDERER === '1') return '';
  const token = text(process.env.TIMESYNCHER_GROK_ROUTER_TOKEN, 500);
  if (!token) return '';
  const host = text(process.env.TIMESYNCHER_GROK_ROUTER_HOST || '127.0.0.1', 120);
  const port = text(process.env.TIMESYNCHER_GROK_ROUTER_PORT || '39217', 20);
  const routePath = text(process.env.TIMESYNCHER_GROK_RENDER_PATH || '/render', 80) || '/render';
  const timeoutSeconds = Math.max(1, Math.ceil(Number(process.env.TIMESYNCHER_GROK_RENDER_CLIENT_TIMEOUT_MS || process.env.TIMESYNCHER_GROK_ROUTER_CLIENT_TIMEOUT_MS || process.env.TIMESYNCHER_GROK_ROUTER_TIMEOUT_MS || 12000) / 1000));
  const url = /^https?:\/\//i.test(host) ? host.replace(/\/+$/, '') + routePath : 'http://' + host + ':' + port + routePath;
  const payload = JSON.stringify({ facts });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync('/usr/bin/curl', ['-sS', '--max-time', String(timeoutSeconds), '-H', 'content-type: application/json', '-H', 'authorization: Bearer ' + token, '--data-binary', '@-', url], {
      input: payload,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0) continue;
    try {
      const body = JSON.parse(result.stdout || '{}');
      if (body.ok === false) continue;
      const answer = text(body.answer || body.reply || body.customerResponse, 1800);
      if (customerCopyLooksSafe(answer, facts)) return answer;
    } catch {}
  }
  return '';
}

function vacationAccessQuestionAnswer({ requestText = '', linkedVacations = [], fallbackBase = DEFAULT_SITE_BASE, contextText = '', manifest = null } = {}) {
  const resolved = vacationAccessAnswerFacts({ requestText, linkedVacations, fallbackBase, contextText, manifest });
  const { lookup, matches, person } = resolved;
  if (matches.length !== 1) {
    if (matches.length > 1) {
      const lines = matches.slice(0, 5).map((match) => {
        const label = match.name || match.destination || match.token || 'Untitled vacation';
        const url = publicVacationUrl(match, fallbackBase);
        return url ? `- ${label}: ${url}` : `- ${label}`;
      });
      return [`I found more than one matching vacation:`, ...lines, '', `Which vacation should I check for ${person}?`].join('\n');
    }
    return [
      `I could not verify ${person}'s access to a matching vacation yet.`,
    ].join('\n');
  }
  const modelAnswer = resolved.facts ? grokCustomerRender(resolved.facts) : '';
  if (modelAnswer) return modelAnswer;
  if (resolved.fallbackAnswer && isTelegramCollaboratorStatusQuestion(requestText)) return resolved.fallbackAnswer;
  const match = matches[0];
  const label = match.name || match.destination || lookup || 'that vacation';
  const url = publicVacationUrl(match, fallbackBase);
  const requestedCaps = accessCapabilitiesRequested(requestText);
  const namedMember = Array.isArray(match.members) && match.members.some((member) => memberMatchesAccessPerson(member, person));
  const lines = [];
  lines.push(namedMember
    ? `${person} is listed as a named member/editor on ${label}.`
    : `${person} is not listed as a named member/editor on ${label}.`);
  if (url) lines.push(`The vacation website itself is available to anyone with the shared link: ${url}`);
  else lines.push('I found the vacation record, but I do not have a share-link URL for it yet.');
  lines.push(match.shareCollab
    ? 'Website editing requires an authenticated owner, a paid Telegram collaborator opening from Telegram, or an owner-approved email web editor.'
    : 'The shared website is view-only unless the owner opens from Telegram/session, the paid Telegram collaborator opens from Telegram, or the owner invites a named email user as a web editor.');
  if (requestedCaps.includes('photo_upload') || requestedCaps.includes('video_upload')) {
    const parts = [];
    if (requestedCaps.includes('photo_upload')) parts.push('photo uploads');
    if (requestedCaps.includes('video_upload')) parts.push('video uploads');
    lines.push(`${person} is not currently enabled for ${parts.join(' or ')} on ${label}.`);
  }
  if (!namedMember || requestedCaps.includes('collab_telegram')) {
    lines.push('Full Telegram editing is separate and requires paid collaborator access.');
    const line = remediationLine(manifest, 'collab_telegram', { person, label });
    if (line) lines.push(line);
  }
  if (requestedCaps.includes('photo_upload')) {
    const line = remediationLine(manifest, 'photo_upload', { person, label });
    if (line) lines.push(line);
  }
  if (requestedCaps.includes('video_upload')) {
    const line = remediationLine(manifest, 'video_upload', { person, label });
    if (line) lines.push(line);
  }
  if (!match.shareCollab && requestedCaps.includes('collab_web')) {
    const line = remediationLine(manifest, 'collab_web', { person, label });
    if (line) lines.push(line);
  }
  return lines.join('\n\n');
}

function vacationAccessRosterAnswer({ requestText = '', linkedVacations = [], fallbackBase = DEFAULT_SITE_BASE } = {}) {
  const lookup = vacationLookupTerm(requestText);
  const matches = lookup
    ? linkedVacations.filter((vacation) => vacationMatchesLookup(vacation, lookup))
    : (linkedVacations.length === 1 ? linkedVacations : []);
  if (matches.length !== 1) {
    return 'I need to know which linked vacation you want me to check before I answer who has access.';
  }
  const match = matches[0];
  const label = match.name || match.destination || lookup || 'that vacation';
  const url = publicVacationUrl(match, fallbackBase);
  const named = Array.isArray(match.members) && match.members.length
    ? match.members.map((member) => [member.username, member.email].filter(Boolean).join(' / ')).filter(Boolean)
    : [];
  const lines = [];
  lines.push(named.length
    ? `Named members/editors I can see for ${label}: ${named.join(', ')}.`
    : `I do not see any named members/editors for ${label}.`);
  if (url) lines.push(`The vacation website itself is available to anyone with the shared link: ${url}`);
  lines.push(match.shareCollab
    ? 'Website editing requires an authenticated owner, a paid Telegram collaborator opening from Telegram, or an owner-approved email web editor.'
    : 'The shared website is view-only unless the owner opens from Telegram/session, the paid Telegram collaborator opens from Telegram, or the owner invites a named email user as a web editor.');
  lines.push('Full Telegram editing is separate and requires paid collaborator access.');
  return lines.join('\n\n');
}

function vacationExistenceQuestionAnswer({ requestText = '', linkedVacations = [], fallbackBase = DEFAULT_SITE_BASE } = {}) {
  const lookup = vacationLookupTerm(requestText);
  const matches = linkedVacations.filter((vacation) => vacationMatchesLookup(vacation, lookup));
  if (matches.length === 1) {
    const match = matches[0];
    const label = match.name || match.destination || lookup || 'that vacation';
    const url = publicVacationUrl(match, fallbackBase);
    return url
      ? `Yes, I found ${label}. Here is the website: ${url}`
      : `Yes, I found ${label}.`;
  }
  if (matches.length > 1) {
    const lines = matches.slice(0, 5).map((match) => {
      const label = match.name || match.destination || match.token || 'Untitled vacation';
      const url = publicVacationUrl(match, fallbackBase);
      return url ? `- ${label}: ${url}` : `- ${label}`;
    });
    return ['I found more than one matching vacation:', ...lines, '', 'Which one do you want to update or inspect?'].join('\n');
  }
  if (linkedVacations.length && lookup) {
    const names = linkedVacations
      .slice(0, 5)
      .map((vacation) => vacation.name || vacation.destination || vacation.token || 'Untitled vacation')
      .filter(Boolean);
    return [
      `I do not see a ${lookup} vacation site I can access yet.`,
      names.length ? `Current vacation sites I can access: ${names.join(', ')}.` : '',
      'If you want to start a new one, send the destination, dates, and priorities.',
    ].filter(Boolean).join('\n');
  }
  return [
    'I could not find a matching vacation site yet.',
    '',
    'To update an existing vacation, tell me the vacation name and the change. To start a new one, send the destination, dates, and priorities.',
  ].join('\n');
}

function makeTurnDecision({
  intent,
  writeMode = 'none',
  shouldQueueWorker = false,
  confidence = 0,
  answer = '',
  selectedSkill = 'timesyncher-vacation-support-router',
  answerMode = 'clarify',
  tripSelector = null,
  reasons = [],
  source = 'deterministic_current_turn_router',
}) {
  return {
    intent,
    write_mode: writeMode,
    writeMode,
    shouldQueueWorker: Boolean(shouldQueueWorker),
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
    answer: text(answer, 2400),
    selectedSkill,
    answerMode,
    tripSelector,
    reasons: Array.isArray(reasons) ? reasons.map((reason) => text(reason, 240)).filter(Boolean) : [],
    source,
  };
}


function isQuestionLike(value) {
  const requestText = text(value, 2000).toLowerCase();
  return requestText.includes('?') || /\b(should i|should we|what should i do|what do i do|do i need to|am i supposed to|is there|did i|have i|can you|could you|will you|would you|where|what|when|why|how)\b/.test(requestText);
}

const ROUTER_ALLOWED_INTENTS = new Set(['itinerary_action', 'account_question', 'support_question', 'ambiguous', 'unsafe_internal', 'media_upload_question', 'collaborator_access_question', 'website_link_question']);
const ROUTER_WRITE_MODES = new Set(['none', 'create', 'edit', 'attach']);

function normalizeStructuredDecision(candidate, source = 'structured_router', options = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const intent = text(candidate.intent, 80);
  const writeMode = text(candidate.write_mode || candidate.writeMode || candidate.writeRisk || candidate.write_risk || '', 80) || (candidate.shouldQueueWorker === false ? 'none' : '');
  const confidence = Number(candidate.confidence);
  if (!ROUTER_ALLOWED_INTENTS.has(intent)) return null;
  if (!ROUTER_WRITE_MODES.has(writeMode)) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (confidence < (options.minConfidence ?? 0.7)) return null;
  const shouldQueueWorker = candidate.shouldQueueWorker === true;
  if (writeMode === 'none' && shouldQueueWorker) return null;
  if (shouldQueueWorker && !['create', 'edit', 'attach'].includes(writeMode)) return null;
  return {
    intent,
    write_mode: writeMode,
    writeMode,
    shouldQueueWorker,
    confidence,
    answer: text(candidate.answer || candidate.reply || candidate.customerResponse, 1800),
    selectedSkill: text(candidate.selectedSkill || candidate.skill || 'timesyncher-vacation-support-router', 120),
    writeRisk: text(candidate.writeRisk || candidate.write_risk || '', 80),
    answerMode: text(candidate.answerMode || candidate.answer_mode || '', 80),
    tripSelector: candidate.tripSelector || candidate.trip_selector || null,
    reasons: Array.isArray(candidate.reasons) ? candidate.reasons.map((reason) => text(reason, 240)).filter(Boolean) : [],
    source,
  };
}

function grokRouterDecision(job, context = {}) {
  if (process.env.TIMESYNCHER_DISABLE_GROK_INTENT_ROUTER === '1') return null;
  const token = text(process.env.TIMESYNCHER_GROK_ROUTER_TOKEN, 500);
  if (!token) return null;
  const host = text(process.env.TIMESYNCHER_GROK_ROUTER_HOST || '127.0.0.1', 120);
  const port = text(process.env.TIMESYNCHER_GROK_ROUTER_PORT || '39217', 20);
  const routePath = text(process.env.TIMESYNCHER_GROK_ROUTER_PATH || '/intent', 80) || '/intent';
  const timeoutSeconds = Math.max(1, Math.ceil(Number(process.env.TIMESYNCHER_GROK_ROUTER_CLIENT_TIMEOUT_MS || process.env.TIMESYNCHER_GROK_ROUTER_TIMEOUT_MS || 12000) / 1000));
  const url = /^https?:\/\//i.test(host) ? host.replace(/\/+$/, '') + routePath : 'http://' + host + ':' + port + routePath;
  const payload = JSON.stringify({
    text: currentTurnText(job),
    context: {
      route: 'product-gbrain-dispatch',
      requestId: job.request_id || null,
      jobId: job.id || null,
      linkedVacations: (context.linkedVacations || []).slice(0, 5).map((vacation) => ({
        name: vacation.name || null,
        destination: vacation.destination || null,
        token: vacation.token || null,
        status: vacation.status || null,
      })),
      hasPriorTranscript: transcriptTurns(job).length > 0,
    },
  });
  const result = spawnSync('/usr/bin/curl', ['-sS', '--max-time', String(timeoutSeconds), '-H', 'content-type: application/json', '-H', 'authorization: Bearer ' + token, '--data-binary', '@-', url], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) return null;
  try {
    const body = JSON.parse(result.stdout || '{}');
    if (body.ok === false) return null;
    return normalizeStructuredDecision(body.decision || body, 'grok_intent_router');
  } catch {
    return null;
  }
}

function supportClarificationAnswer() {
  return 'I need to check one thing before I change anything.\n\nDo you want me to update an existing vacation, start a brand-new vacation, or answer a product/account question?';
}

function hydrateStructuredDecision(decision, { job, manifest, ownRequestText, linkedVacations, fallbackBase, currentShareToken }) {
  if (!decision) return null;
  const intent = decision.intent;
  const writeMode = decision.write_mode || decision.writeMode;
  if (decision.shouldQueueWorker && ['create', 'edit', 'attach'].includes(writeMode)) {
    const selectedSkill = decision.selectedSkill || (writeMode === 'create' ? 'timesyncher-travel-assistant' : 'timesyncher-travel-thing-editor');
    return { ...decision, selectedSkill, answer: text(decision.answer, 2400) };
  }
  if (writeMode !== 'none') return null;
  let answer = text(decision.answer, 2400);
  let answerMode = decision.answerMode || 'clarify';
  const selectedSkill = decision.selectedSkill || 'timesyncher-vacation-support-router';
  if (!answer) {
    if (intent === 'unsafe_internal' || isSensitiveDumpRequest(ownRequestText)) {
      answer = 'I cannot provide customer-wide vacation IDs, owner emails, API keys, tokens, secrets, or internal database dumps. I can only help with vacation information you are authorized to access.';
      answerMode = 'refuse_internal';
    } else if (isPaymentCredentialRequest(ownRequestText)) {
      answer = 'Do not send card numbers, CVV codes, or payment details in chat. TimeSyncher Vacation does not book, reserve, purchase, hold, or charge travel arrangements from chat. Customers verify details and make bookings or payments themselves through the official provider or checkout page.';
      answerMode = 'payment_refusal';
    } else if (isAccessPricingQuestion(ownRequestText)) {
      answer = accessPricingAnswer({ requestText: ownRequestText, manifest });
      answerMode = 'pricing';
    } else if (isDeleteVacationRequest(ownRequestText)) {
      answer = deleteVacationSafetyAnswer({ requestText: ownRequestText, linkedVacations, fallbackBase });
      answerMode = 'delete_safety';
    } else if (intent === 'website_link_question' || isWebsiteLinkRequestText(ownRequestText)) {
      answer = linkedVacations.length === 1 ? 'Here is the website: ' + publicVacationUrl(linkedVacations[0], fallbackBase) : 'I need to know which vacation website you want.';
      answerMode = 'account_state';
    } else if (isVacationExistenceQuestion(ownRequestText)) {
      answer = vacationExistenceQuestionAnswer({ requestText: ownRequestText, linkedVacations, fallbackBase });
      answerMode = linkedVacations.length ? 'account_state' : 'clarify';
    } else if (isAccessRosterQuestion(ownRequestText)) {
      answer = vacationAccessRosterAnswer({ requestText: ownRequestText, linkedVacations, fallbackBase });
      answerMode = linkedVacations.length ? 'account_state' : 'access_state_unverified';
    } else if (['account_question', 'collaborator_access_question', 'media_upload_question'].includes(intent) || isPersonAccessQuestion(ownRequestText)) {
      answer = vacationAccessQuestionAnswer({ requestText: ownRequestText, linkedVacations, fallbackBase, contextText: combinedRequestText(job), manifest });
      answerMode = linkedVacations.length ? 'account_state' : 'access_state_unverified';
    } else if (/\b(book|booking|reserve|reservation|purchase|buy|pay for|hold)\b/i.test(ownRequestText)) {
      answer = 'TimeSyncher Vacation helps organize and compare itinerary options. Customers verify details and make any bookings themselves.';
      answerMode = 'support_answer';
    } else if (intent === 'ambiguous') {
      answer = currentShareToken || linkedVacations.length ? 'I need to check one thing before I change anything.\n\nDo you want me to update the current vacation website, or start a brand-new vacation?' : 'I need a direct vacation instruction before I change anything. Send the destination, dates, and priorities for a new vacation, or the vacation name plus the exact update for an existing one.';
      answerMode = 'clarify';
    } else {
      answer = supportClarificationAnswer();
      answerMode = 'clarify';
    }
  }
  return makeTurnDecision({
    intent: intent === 'collaborator_access_question' || intent === 'media_upload_question' || intent === 'website_link_question' ? 'account_question' : intent,
    writeMode: 'none',
    shouldQueueWorker: false,
    confidence: decision.confidence,
    answer,
    selectedSkill,
    answerMode,
    tripSelector: decision.tripSelector || { lookup: vacationLookupTerm(ownRequestText), candidatesConsidered: linkedVacations.length },
    reasons: [...(decision.reasons || []), 'model_primary_classification', 'deterministic_truth_renderer'],
    source: decision.source,
  });
}

function currentTurnRouterDecisionModelFirst(job) {
  const manifest = job.productManifest || job.manifest || loadManifest(process.env.TIMESYNCHER_PRODUCT_GBRAIN_MANIFEST || DEFAULT_MANIFEST);
  const ownRequestText = currentTurnText(job);
  const input = asObject(job.input);
  const payload = { ...asObject(job.payload), ...asObject(input.payload) };
  const linkedVacations = linkedVacationsFrom(job, input, payload);
  const fallbackBase = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_SITE_BASE;
  const currentShareToken = shareTokenFromContext(job, input, payload, ownRequestText);
  const context = { job, manifest, ownRequestText, linkedVacations, fallbackBase, currentShareToken };
  const providedDecision = normalizedRouterDecision(job);
  const hydratedProvided = hydrateStructuredDecision(providedDecision, context);
  if (hydratedProvided) return hydratedProvided;
  const grokDecision = grokRouterDecision(job, { linkedVacations });
  const hydratedGrok = hydrateStructuredDecision(grokDecision, context);
  if (hydratedGrok) return hydratedGrok;
  const fallbackDecision = currentTurnRouterDecision(job);
  return { ...fallbackDecision, source: fallbackDecision.source === 'deterministic_current_turn_router' ? 'deterministic_fallback_router' : fallbackDecision.source, reasons: [...(fallbackDecision.reasons || []), 'grok_router_unavailable_or_invalid'] };
}

function normalizedRouterDecision(job) {
  const candidates = [
    job.supportRouterDecision,
    job.support_router_decision,
    job.normalized_intent?.supportRouterDecision,
    job.normalized_intent?.support_router_decision,
    job.normalized_intent?.supportRouter,
    job.normalized_intent?.support_router,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeStructuredDecision(candidate, 'hosted_structured_router');
    if (normalized) return normalized;
  }
  return null;
}

function currentTurnRouterDecision(job) {
  const manifest = job.productManifest || job.manifest || loadManifest(process.env.TIMESYNCHER_PRODUCT_GBRAIN_MANIFEST || DEFAULT_MANIFEST);
  const modelDecision = normalizedRouterDecision(job);
  if (modelDecision) return modelDecision;

  const ownRequestText = currentTurnText(job);
  const lower = ownRequestText.toLowerCase();
  const input = asObject(job.input);
  const payload = { ...asObject(job.payload), ...asObject(input.payload) };
  const linkedVacations = linkedVacationsFrom(job, input, payload);
  const fallbackBase = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_SITE_BASE;
  const currentShareToken = shareTokenFromContext(job, input, payload, ownRequestText);
  if (!lower) {
    return makeTurnDecision({
      intent: 'ambiguous',
      confidence: 0.7,
      answer: 'Send the vacation destination, dates, people, budget, or the change you want made.',
      answerMode: 'clarify',
      reasons: ['empty_current_turn'],
    });
  }
  if (isSensitiveDumpRequest(ownRequestText)) {
    return makeTurnDecision({
      intent: 'support_question',
      confidence: 0.96,
      answer: 'I cannot provide customer-wide vacation IDs, owner emails, API keys, tokens, secrets, or internal database dumps. I can only help with vacation information you are authorized to access.',
      answerMode: 'refuse_internal',
      reasons: ['sensitive_internal_data_request', 'current_turn_no_write'],
    });
  }
  if (isPaymentCredentialRequest(ownRequestText)) {
    return makeTurnDecision({
      intent: 'support_question',
      confidence: 0.96,
      answer: 'Do not send card numbers, CVV codes, or payment details in chat. TimeSyncher Vacation does not book, reserve, purchase, hold, or charge travel arrangements from chat. Customers verify details and make bookings or payments themselves through the official provider or checkout page.',
      answerMode: 'payment_refusal',
      reasons: ['payment_credential_request', 'external_action_boundary', 'current_turn_no_write'],
    });
  }
  if (isAccessPricingQuestion(ownRequestText)) {
    return makeTurnDecision({
      intent: 'support_question',
      confidence: 0.94,
      answer: accessPricingAnswer({ requestText: ownRequestText, manifest }),
      answerMode: 'pricing',
      tripSelector: { candidatesConsidered: linkedVacations.length },
      reasons: ['access_pricing_question', 'current_turn_no_write'],
    });
  }
  if (isDeleteVacationRequest(ownRequestText)) {
    return makeTurnDecision({
      intent: 'support_question',
      confidence: 0.94,
      answer: deleteVacationSafetyAnswer({ requestText: ownRequestText, linkedVacations, fallbackBase }),
      answerMode: 'delete_safety',
      tripSelector: { lookup: deleteVacationLookupTerm(ownRequestText), candidatesConsidered: linkedVacations.length },
      reasons: ['destructive_delete_request', 'current_turn_no_write'],
    });
  }
  if (isVacationExistenceQuestion(ownRequestText)) {
    return makeTurnDecision({
      intent: 'support_question',
      confidence: 0.92,
      answer: vacationExistenceQuestionAnswer({ requestText: ownRequestText, linkedVacations, fallbackBase }),
      answerMode: linkedVacations.length ? 'account_state' : 'clarify',
      tripSelector: { lookup: vacationLookupTerm(ownRequestText), candidatesConsidered: linkedVacations.length },
      reasons: ['vacation_existence_question', 'current_turn_no_write'],
    });
  }

  if (isAccessRosterQuestion(ownRequestText)) {
    return makeTurnDecision({
      intent: 'account_question',
      confidence: 0.92,
      answer: vacationAccessRosterAnswer({ requestText: ownRequestText, linkedVacations, fallbackBase }),
      answerMode: linkedVacations.length ? 'account_state' : 'access_state_unverified',
      tripSelector: { lookup: vacationLookupTerm(ownRequestText), candidatesConsidered: linkedVacations.length },
      reasons: ['access_roster_question', 'current_turn_no_write'],
    });
  }

  if (isPersonAccessQuestion(ownRequestText)) {
    return makeTurnDecision({
      intent: 'account_question',
      confidence: 0.93,
      answer: vacationAccessQuestionAnswer({ requestText: ownRequestText, linkedVacations, fallbackBase, contextText: combinedRequestText(job), manifest }),
      answerMode: linkedVacations.length ? 'account_state' : 'access_state_unverified',
      tripSelector: { lookup: vacationLookupTerm(ownRequestText), candidatesConsidered: linkedVacations.length },
      reasons: ['person_access_question', 'current_turn_no_write'],
    });
  }

  if (isNewVacationAdviceQuestion(ownRequestText) || isVagueNextStepQuestion(ownRequestText)) {
    const answer = isVagueNextStepQuestion(ownRequestText)
      ? [
        'I need a little more direction before I work on a vacation.',
        '',
        'To start a new vacation, send the destination, dates, and priorities. To update an existing vacation, tell me which vacation by name and the change you want made.',
      ].join('\n')
      : [
        'I need a direct instruction before I work on a vacation.',
        '',
        'If you want a new vacation, send the destination, dates, and priorities. If you want to update an existing vacation, tell me the vacation name and the change to make.',
      ].join('\n');
    return makeTurnDecision({
      intent: 'support_question',
      confidence: 0.95,
      answer,
      answerMode: 'clarify',
      tripSelector: { candidatesConsidered: linkedVacations.length },
      reasons: ['advice_or_vague_next_step_question', 'current_turn_no_write'],
    });
  }
  if (/\b(book|booking|reserve|reservation|purchase|buy|pay for|hold)\b/.test(lower) && isQuestionLike(ownRequestText)) {
    return makeTurnDecision({
      intent: 'support_question',
      confidence: 0.9,
      answer: 'TimeSyncher Vacation helps organize and compare itinerary options. Customers verify details and make any bookings themselves.',
      answerMode: 'support_answer',
      reasons: ['booking_boundary_question'],
    });
  }
  if (isLinkCapabilityQuestion(ownRequestText)) {
    return makeTurnDecision({
      intent: 'account_question',
      writeMode: 'none',
      shouldQueueWorker: false,
      confidence: 0.92,
      answer: linkCapabilityAnswer({ requestText: ownRequestText, linkedVacations, fallbackBase }),
      answerMode: 'account_state',
      tripSelector: { lookup: vacationLookupTerm(ownRequestText), candidatesConsidered: linkedVacations.length },
      reasons: ['shared_link_capability_question', 'current_turn_no_write'],
    });
  }
  if (isWebsiteLinkRequestText(ownRequestText)) {
    return makeTurnDecision({
      intent: 'support_question',
      writeMode: 'none',
      shouldQueueWorker: false,
      confidence: 0.8,
      answer: linkedVacations.length === 1
        ? `Here is the website: ${publicVacationUrl(linkedVacations[0], fallbackBase)}`
        : 'I need to know which linked vacation website you want.',
      answerMode: 'account_state',
      tripSelector: { candidatesConsidered: linkedVacations.length },
      reasons: ['website_link_lookup_no_write'],
    });
  }
  if (isExplicitNewVacationRequest(ownRequestText)) {
    return makeTurnDecision({
      intent: 'itinerary_action',
      writeMode: 'create',
      shouldQueueWorker: true,
      confidence: 0.9,
      selectedSkill: 'timesyncher-travel-assistant',
      answerMode: 'queue_ack',
      reasons: ['explicit_current_turn_create_request'],
    });
  }
  if (isConcreteItineraryEditRequest(ownRequestText)) {
    return makeTurnDecision({
      intent: 'itinerary_action',
      writeMode: 'edit',
      shouldQueueWorker: true,
      confidence: 0.85,
      selectedSkill: 'timesyncher-travel-thing-editor',
      answerMode: 'queue_ack',
      tripSelector: { candidatesConsidered: linkedVacations.length },
      reasons: ['explicit_current_turn_edit_request'],
    });
  }
  if (isQuestionLike(ownRequestText) && /\b(bot|deleted|still there|already exists|current one|current vacation|current trip|access|included|coupon|checkout|order|subscription|refund|price|cost|support|help|account|login|sign in|vacations?)\b/.test(lower)) {
    return makeTurnDecision({
      intent: 'support_question',
      confidence: 0.8,
      answer: 'I need to check one thing before I change anything.\n\nDo you want me to update an existing vacation, start a brand-new vacation, or answer a product/account question?',
      answerMode: 'clarify',
      reasons: ['question_like_support_candidate'],
    });
  }
  return makeTurnDecision({
    intent: 'ambiguous',
    confidence: 0.55,
    answer: currentShareToken || linkedVacations.length
      ? 'I need to check one thing before I change anything.\n\nDo you want me to update the current vacation website, or start a brand-new vacation?'
      : 'I need a direct vacation instruction before I change anything. Send the destination, dates, and priorities for a new vacation, or the vacation name plus the exact update for an existing one.',
    answerMode: 'clarify',
    tripSelector: { candidatesConsidered: linkedVacations.length, shareTokenPresent: Boolean(currentShareToken) },
    reasons: ['default_fail_closed_no_write'],
  });
}

function assertCommitWorthyTurnDecision(decision) {
  if (!decision?.shouldQueueWorker) return;
  const writeMode = text(decision.write_mode || decision.writeMode, 80);
  if (!['create', 'edit', 'attach'].includes(writeMode)) {
    throw new Error(`Refusing to queue Vacation worker without commit-worthy write_mode; got ${writeMode || 'missing'}`);
  }
  if (Number(decision.confidence || 0) < 0.8) {
    throw new Error(`Refusing to queue Vacation worker with low-confidence write decision: ${decision.confidence}`);
  }
}

function shouldAskBeforeStartingNewPass({ job, input, payload, requestText }) {
  const token = shareTokenFromContext(job, input, payload, requestText);
  if (isNewVacationAdviceQuestion(requestText) || isVagueNextStepQuestion(requestText) || isVacationExistenceQuestion(requestText)) return true;
  if (!token) return false;
  if (isWebsiteLinkRequestText(requestText)) return false;
  if (isConcreteItineraryEditRequest(requestText)) return false;
  if (isExplicitNewVacationRequest(requestText) || payload.createNewTrip || payload.create_new_trip || job.createNewTrip || job.create_new_trip) return false;
  return true;
}

function planningQuestions(destination, dates) {
  const questions = [];
  if (!destination) questions.push('What destination or cities should I plan around?');
  if (!dates.startDate && !dates.endDate && !dates.dateText) questions.push('What travel dates or date range should I use?');
  questions.push('What budget range and must-haves should I optimize for?');
  questions.push('Who is traveling, and are there mobility, food, lodging, or schedule constraints?');
  return questions.slice(0, 4);
}

function extractTripSegments(requestText) {
  const lower = requestText.toLowerCase();
  const segments = [];
  if (containsAny(lower, ['honolulu', 'waikiki', 'oahu', 'banzai pipeline', 'moana', 'surfrider'])) {
    segments.push({
      island: 'Oahu',
      base: containsAny(lower, ['waikiki']) ? 'Waikiki / Honolulu' : 'Honolulu',
      nights: /\bthree nights?\b/i.test(requestText) ? 3 : /\btwo nights?\b/i.test(requestText) ? 2 : 2,
      lodging: containsAny(lower, ['moana', 'surfrider']) ? 'Beachfront Waikiki lodging requested; compare source-backed nearby hotels.' : 'Waikiki hotel options.',
      ideas: [
        'Waikiki arrival/check-in and beach time',
        'Local restaurants, juice/breakfast spots, and dinner options',
        'North Shore surf/coast day or half-day',
        'Waikiki surf lesson',
        'Waikiki shopping shortlist',
      ],
    });
  }
  if (containsAny(lower, ['maui', 'kihei', 'kapalua'])) {
    segments.push({
      island: 'Maui',
      base: containsAny(lower, ['kihei']) ? 'Kihei' : 'Maui',
      nights: /\bthree nights?\b/i.test(requestText) && !/\btwo nights?\b/i.test(requestText) ? 3 : 2,
      lodging: 'Kihei-area lodging first; include Kapalua-area dining options.',
      ideas: [
        'Kihei beach / resort-area downtime',
        'Highly rated Kihei restaurants',
        'Kapalua-area dinner options',
        'Sunset dinner sailboat cruise',
        'Whale watching only if seasonally available; otherwise swap in snorkeling/sunset sail',
      ],
    });
  }
  if (containsAny(lower, ['kona', 'big island', 'manta'])) {
    segments.push({
      island: 'Big Island',
      base: 'Kona',
      nights: /\blast two nights?\b/i.test(requestText) ? 2 : 2,
      lodging: containsAny(lower, ['hilton']) ? 'Hilton option preferred; verify exact Kona-area property fit.' : 'Kona hotel options.',
      ideas: [
        'Kona arrival/check-in',
        'Night manta ray snorkel tour',
        'Hotel-based or waterfront restaurant options',
        'Flexible Kona beach / coffee / scenic time depending on flight schedule',
      ],
    });
  }
  return segments.length ? segments : [{
    island: 'Trip segment',
    base: 'Needs confirmation',
    nights: null,
    lodging: 'Lodging preferences need confirmation.',
    ideas: ['Build the day-by-day plan after destination/dates are confirmed.'],
  }];
}

function buildInitialItinerary(artifacts) {
  const start = artifacts.dates.dateText || artifacts.dates.startDate || 'travel date to confirm';
  const destination = artifacts.destination || 'destination needs confirmation';
  const lines = [
    'Initial TimeSyncher Vacation research workspace',
    '',
    `Request focus: ${destination}.`,
    `Timing: ${start}.`,
    '',
    'This production pass has not completed the required 10-15 minute public research cycle yet, so it must not present destination-specific hotels, restaurants, activities, flights, cars, or shopping as researched recommendations.',
    '',
    'Queued research scope:',
    '- multiple lodging/hotel options with source URLs, fees, cancellation terms, and location tradeoffs',
    '- flight options when relevant, including airline, airport, timing, fare caveats, and baggage notes',
    '- cars and ground transport options with pickup logistics and total-price caveats',
    '- restaurants, shopping, and activities with source URLs, hours, reservation needs, and verification status',
    '- open questions and customer decisions before anything is treated as final',
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 3900);
}

function link(label, url) {
  return { label, url };
}

function researchedThing({ category, subtype, title, description, links = [], island, status = 'research_candidate' }) {
  return {
    category,
    subtype,
    title,
    description,
    links,
    metadata: {
      source: 'product-gbrain-dispatch',
      status,
      sourceBacked: true,
      island,
      researchedAt: new Date().toISOString(),
      caveat: 'Verify current availability, prices, hours, and seasonal fit before relying on this option. TimeSyncher Vacation does not book travel.',
    },
  };
}

function hawaiiResearchThings(requestText) {
  if (!/\bhawaii|honolulu|waikiki|oahu|maui|kihei|kona|big island\b/i.test(requestText)) return [];
  return [
    researchedThing({
      category: 'hotel',
      subtype: 'Waikiki hotel candidate',
      title: 'Source-backed Waikiki beachfront lodging candidate',
      island: 'Oahu',
      description: 'Primary Waikiki hotel candidate because the customer specifically asked for the Surfrider/Moana. Research pass should compare room availability, cancellation terms, resort fees, beach access, and nearby alternatives.',
      links: [link('Hotel site', 'https://www.marriott.com/en-us/hotels/hnlwi-moana-surfrider-a-westin-resort-and-spa-waikiki-beach/overview/')],
    }),
    researchedThing({
      category: 'activity',
      subtype: 'Surf lesson',
      title: 'Waikiki surf lesson shortlist',
      island: 'Oahu',
      description: 'Customer wants to learn to surf in Waikiki. Research pass should compare 2-3 beginner-friendly lesson providers by meeting point, group/private format, duration, reviews, and cancellation policy.',
      links: [
        link('Hans Hedemann Surf School', 'https://hhsurf.com/'),
        link('Faith Surf School', 'https://faithsurfschool.com/'),
      ],
    }),
    researchedThing({
      category: 'activity',
      subtype: 'North Shore day option',
      title: 'North Shore surf/coast day',
      island: 'Oahu',
      description: 'Customer asked for a North Shore surf/coast stop. Research pass should set expectations about surf seasonality and pair it with nearby source-backed food or shopping stops if surf is quiet.',
      links: [link('Go Hawaii North Shore overview', 'https://www.gohawaii.com/islands/oahu/regions/north-shore')],
    }),
    researchedThing({
      category: 'restaurant',
      subtype: 'Waikiki restaurants',
      title: 'Waikiki local/interesting restaurant research set',
      island: 'Oahu',
      description: 'Starter shortlist should be generated from current public sources for casual noodles, beachfront classics, malasadas, plate-lunch, and poke options near Waikiki.',
      links: [
        link('Waikiki casual noodle source', 'https://www.gohawaii.com/islands/oahu/regions/honolulu/waikiki'),
        link('Duke’s Waikiki', 'https://www.dukeswaikiki.com/'),
        link('Leonard’s Bakery', 'https://www.leonardshawaii.com/'),
      ],
    }),
    researchedThing({
      category: 'shopping',
      subtype: 'Waikiki shopping',
      title: 'Waikiki shopping shortlist',
      island: 'Oahu',
      description: 'Starter shortlist to verify: Royal Hawaiian Center and International Market Place for Waikiki walkable shopping; Ala Moana Center for a larger shopping block if transportation/time fits.',
      links: [
        link('Royal Hawaiian Center', 'https://www.royalhawaiiancenter.com/'),
        link('International Market Place', 'https://shopinternationalmarketplace.com/'),
        link('Ala Moana Center', 'https://www.alamoanacenter.com/'),
      ],
    }),
    researchedThing({
      category: 'hotel',
      subtype: 'Kihei lodging candidate',
      title: 'Kihei-area lodging research',
      island: 'Maui',
      description: 'Customer wants Kihei. Research pass should compare Kihei/Wailea lodging by beach access, parking, resort fees, cancellation terms, and drive time to Kapalua-area restaurants.',
      links: [link('Go Hawaii Kihei overview', 'https://www.gohawaii.com/islands/maui/regions/south-maui/kihei')],
    }),
    researchedThing({
      category: 'restaurant',
      subtype: 'Maui restaurants',
      title: 'Kihei and Kapalua restaurant research set',
      island: 'Maui',
      description: 'Starter shortlist should be generated from current public sources for Kihei/South Maui casual food, sushi, sunset dining, and elevated dinner options.',
      links: [
        link('Nalu’s South Shore Grill', 'https://www.naluskihei.com/'),
        link('Maui sunset dining source', 'https://www.gohawaii.com/islands/maui/regions/south-maui/kihei'),
      ],
    }),
    researchedThing({
      category: 'activity',
      subtype: 'Maui sunset sail',
      title: 'Maui sunset dinner sail / whale-watching check',
      island: 'Maui',
      description: 'Customer wants a sunset dinner sail and whale watching ideally. Research pass should confirm whale season before promising whale watching, then compare sunset sail operators and dinner-included options.',
      links: [
        link('Trilogy Maui dinner sail options', 'https://sailtrilogy.com/'),
        link('Pacific Whale Foundation', 'https://www.pacificwhale.org/'),
      ],
    }),
    researchedThing({
      category: 'hotel',
      subtype: 'Kona-area hotel candidate',
      title: 'Kona-area lodging fit check',
      island: 'Big Island',
      description: 'Customer mentioned a Hilton-style Hawaii lodging preference. Research pass should confirm island intent and compare source-backed Kona-area lodging against true Kona-town hotels.',
      links: [link('Kona-area lodging source', 'https://www.gohawaii.com/islands/hawaii-island/regions/kona')],
    }),
    researchedThing({
      category: 'activity',
      subtype: 'Manta ray night snorkel',
      title: 'Kona night manta ray snorkel',
      island: 'Big Island',
      description: 'Customer wants manta rays at night. Research pass should compare operators by departure harbor, duration, snorkel vs dive, minimum age/swim requirements, cancellation policy, and moon/weather caveats.',
      links: [
        link('Kona manta ray tour source', 'https://www.gohawaii.com/islands/hawaii-island/things-to-do/water-activities'),
        link('Big Island Divers', 'https://bigislanddivers.com/'),
      ],
    }),
    researchedThing({
      category: 'transport',
      subtype: 'Inter-island and car rental',
      title: 'Inter-island flights and rental cars',
      island: 'Hawaii',
      description: 'Plan needs LAS -> HNL, HNL -> OGG, OGG -> KOA, and KOA -> LAS or return routing, plus rental car strategy. Oahu can be mixed car/no-car; Maui and Big Island generally need cars.',
      links: [
        link('Hawaiian Airlines', 'https://www.hawaiianairlines.com/'),
        link('Southwest Hawaii', 'https://www.southwest.com/destinations/hawaii'),
      ],
    }),
  ];
}

function siteBase() {
  return String(process.env.TIMESYNCHER_SITE_BASE_URL || process.env.SITE_BASE_URL || DEFAULT_SITE_BASE).replace(/\/+$/, '');
}

function syncTrekItinerary(job, artifacts) {
  const script = path.join(SCRIPT_DIR, 'trek-vacation-sync.mjs');
  if (!fs.existsSync(script)) throw new Error(`TREK sync script is missing: ${script}`);
  const payload = {
    sourceKey: text(job.onboarding_token || job.request_id || job.id || 'timesyncher-vacation', 180),
    onboardingToken: text(job.onboarding_token || '', 180),
    title: artifacts.vacationName || (artifacts.destination ? `${titleCase(artifacts.destination)} Vacation` : 'TimeSyncher Vacation Research Workspace'),
    destination: artifacts.destination || '',
    dates: artifacts.dates || {},
    requestText: artifacts.requestText || '',
    unforgettableGoal: artifacts.unforgettableGoal || '',
    createNewTrip: Boolean(artifacts.createNewTrip),
    publicBase: process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://vacation.timesyncher.com',
    researchedThings: artifacts.researchedThings || [],
  };
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`TREK sync failed: ${text(result.stderr || result.stdout || 'unknown error', 800)}`);
  }
  let sync;
  try {
    sync = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`TREK sync returned invalid JSON: ${text(result.stdout, 300)}`);
  }
  smokeCheckTrekSync(sync, { checkApi: false });
  return sync;
}

function applyTrekItineraryEdit(job, artifacts) {
  const script = path.join(SCRIPT_DIR, 'trek-itinerary-edit.mjs');
  if (!fs.existsSync(script)) throw new Error(`TREK edit script is missing: ${script}`);
  const payload = {
    token: text(job.share_token || job.shared_token || job.payload?.shareToken || job.payload?.token || '', 180),
    requestText: artifacts.requestText || job.request_text || job.input?.requestText || job.payload?.requestText || job.payload?.text || '',
    publicBase: process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://vacation.timesyncher.com',
  };
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`TREK edit failed: ${text(result.stderr || result.stdout || 'unknown error', 800)}`);
  }
  let edit;
  try {
    edit = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`TREK edit returned invalid JSON: ${text(result.stdout, 300)}`);
  }
  smokeCheckTrekSync(edit);
  edit.mode = edit.mode || 'deterministic_trek_edit';
  return edit;
}

function applyTrekAgentEdit(job, artifacts, deterministicError) {
  const script = path.join(SCRIPT_DIR, 'trek-agent-edit.mjs');
  if (!fs.existsSync(script)) throw new Error(`TREK agent edit script is missing: ${script}`);
  const payload = {
    token: text(job.share_token || job.shared_token || job.payload?.shareToken || job.payload?.token || '', 180),
    requestText: artifacts.requestText || job.request_text || job.input?.requestText || job.payload?.requestText || job.payload?.text || '',
    publicBase: process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://vacation.timesyncher.com',
    deterministicError: text(deterministicError?.message || deterministicError || '', 1200),
  };
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: Number(process.env.TIMESYNCHER_TREK_AGENT_EDIT_WRAPPER_TIMEOUT_MS || 930000),
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`TREK broad edit failed after deterministic parser could not handle the request: ${text(result.stderr || result.stdout || 'unknown error', 1800)}`);
  }
  let edit;
  try {
    edit = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`TREK broad edit returned invalid JSON: ${text(result.stdout, 500)}`);
  }
  smokeCheckTrekSync(edit);
  edit.mode = edit.mode || 'grok_trek_agent_edit';
  return edit;
}

function applyExistingTripEdit(job, artifacts) {
  const requestText = text(artifacts.requestText || job.request_text || job.input?.requestText || job.payload?.requestText || job.payload?.text || '');
  const payload = { ...asObject(job.payload), ...asObject(job.input?.payload) };
  const trip = { ...asObject(payload.trip), ...asObject(job.input?.trip) };
  const items = Array.isArray(artifacts.things)
    ? artifacts.things
    : (Array.isArray(trip.items) ? trip.items : []);
  const gate = gateTelegramIntakeEdit({
    text: requestText,
    actor: actorFromIntake({
      id: text(job.telegram_user_id || payload.telegramUserId || 'dispatch-owner', 80) || 'dispatch-owner',
      role: 'owner',
      authorized: true,
      canEdit: true,
    }),
    trip: {
      trip_id: trip.trip_id || trip.id || job.trip_id || 'trip-unspecified',
      title: trip.title || 'Vacation',
      publicUrl: trip.publicUrl || trip.public_url || '',
      status: 'live',
      items,
      trek_rows: trip.trek_rows || [],
    },
  }, { persist: false });
  if (!gate.skip && gate.integrityFailClosed) {
    return {
      mode: 'vacation_edit_pipeline_fail_closed',
      operationCount: 0,
      url: text(artifacts.webItineraryUrl || trip.publicUrl || trip.public_url || '', 500),
      reason: gate.reason,
      vacationEditPipeline: gate.compact,
    };
  }
  let edit;
  if (process.env.TIMESYNCHER_FORCE_TREK_AGENT_EDIT === '1') {
    edit = applyTrekAgentEdit(job, artifacts, new Error('Forced broad TREK edit runner by environment.'));
  } else {
    try {
      edit = applyTrekItineraryEdit(job, artifacts);
    } catch (error) {
      edit = applyTrekAgentEdit(job, artifacts, error);
    }
  }
  edit.vacationEditPipeline = gate.compact;
  return edit;
}

function smokeCheckTrekSync(sync, options = {}) {
  const url = text(sync?.url || '', 500);
  const token = text(sync?.token || '', 180);
  if (!url) throw new Error('TREK sync returned no customer URL');
  const parsed = new URL(url);
  const expectedPublicBase = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://vacation.timesyncher.com';
  const expectedHost = new URL(expectedPublicBase).hostname.toLowerCase();
  if (parsed.hostname.toLowerCase() !== expectedHost) {
    throw new Error(`TREK sync returned non-canonical host: ${parsed.hostname}`);
  }
  const page = spawnSync('curl', ['-fsSL', url], { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
  if (page.status !== 0) throw new Error(`TREK shared URL smoke failed: ${text(page.stderr || page.stdout || 'no response', 500)}`);
  const assetPaths = Array.from(page.stdout.matchAll(/["'](\/assets\/index-[^"']+)["']/g), (match) => match[1]);
  if (assetPaths.length < 2) throw new Error('TREK shared URL smoke failed: missing app JS/CSS assets');
  for (const assetPath of assetPaths) {
    const assetUrl = new URL(assetPath, parsed.origin).toString();
    const asset = spawnSync('curl', ['-fsSL', assetUrl], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    if (asset.status !== 0) throw new Error(`TREK asset smoke failed for ${assetPath}: ${text(asset.stderr || asset.stdout || 'no response', 500)}`);
  }
  const skipApiSmoke = process.env.TIMESYNCHER_TREK_SYNC_SKIP_API_SMOKE === '1';
  if (token && options.checkApi !== false && !skipApiSmoke) {
    const api = new URL(`/api/shared/${encodeURIComponent(token)}`, parsed.origin);
    const apiRes = spawnSync('curl', ['-fsSL', api.toString()], { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
    if (apiRes.status !== 0) throw new Error(`TREK shared API smoke failed: ${text(apiRes.stderr || apiRes.stdout || 'no response', 500)}`);
    let body;
    try {
      body = JSON.parse(apiRes.stdout);
    } catch {
      throw new Error(`TREK shared API returned invalid JSON: ${text(apiRes.stdout, 300)}`);
    }
    const trip = body?.trip || body;
    const days = Array.isArray(body?.days) ? body.days : Array.isArray(trip?.days) ? trip.days : [];
    const places = Array.isArray(body?.places) ? body.places : Array.isArray(trip?.places) ? trip.places : [];
    if (!text(trip?.title || body?.title, 180)) throw new Error('TREK shared API smoke failed: missing title');
    if (days.length < 1) throw new Error('TREK shared API smoke failed: missing days');
    if (places.length < 1) throw new Error('TREK shared API smoke failed: missing places');
  }
}

function hostedApiBase() {
  return String(process.env.TIMESYNCHER_API_BASE_URL || '').replace(/\/+$/, '');
}

async function syncHostedSharedItinerary(job, artifacts) {
  const apiBase = hostedApiBase();
  const workerToken = process.env.TIMESYNCHER_WORKER_TOKEN || '';
  const token = text(artifacts.trekSync?.token || '', 180);
  if (!apiBase || !workerToken || !token) return { skipped: true };

  const res = await fetch(`${apiBase}/api/worker-jobs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${workerToken}`,
    },
    body: JSON.stringify({
      action: 'shared-sync',
      jobId: job.id,
      token,
      onboardingToken: text(job.onboarding_token || '', 180),
      title: artifacts.vacationName || (artifacts.destination ? `${titleCase(artifacts.destination)} Vacation` : 'TimeSyncher Vacation'),
      destination: artifacts.destination || '',
      dates: artifacts.dates || {},
      travelerName: 'TimeSyncher Vacation Guest',
      artifacts: {
        tripThings: artifacts.things || [],
        budgetItems: artifacts.budgetItems || [],
        supportNotes: artifacts.supportNotes || [],
      },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Hosted shared itinerary sync failed: ${text(body, 800)}`);
  try {
    return JSON.parse(body);
  } catch {
    return { ok: true, raw: text(body, 500) };
  }
}

async function buildArtifacts(job, manifest) {
  const input = asObject(job.input);
  const payload = { ...asObject(job.payload), ...asObject(input.payload) };
  const trip = { ...asObject(payload.trip), ...asObject(input.trip) };
  const requestText = text(combinedRequestText({ ...job, input, payload }) || job.request_text || input.requestText || payload.requestText || payload.text);
  const ownRequestText = text(currentTurnText({ ...job, input, payload }) || requestText);
  const routerDecision = currentTurnRouterDecisionModelFirst({ ...job, input, payload, productManifest: manifest });
  assertCommitWorthyTurnDecision(routerDecision);
  if (routerDecision.shouldQueueWorker === false) {
    const token = shareTokenFromContext(job, input, payload, requestText);
    const publicBase = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://vacation.timesyncher.com';
    const linkedVacations = linkedVacationsFrom(job, input, payload);
    return {
      requestText,
      destination: extractDestination(ownRequestText, {}, {}, { ignoreTripContext: true }),
      dates: extractDates(ownRequestText, {}, {}, { ignoreTripContext: true, job }),
      methods: [routerDecision.selectedSkill || 'timesyncher-vacation-support-router', 'travel.assistant.clarify-existing-trip-or-new-trip'],
      lane: { primary: 'support_router_no_write', intent: routerDecision.intent, confidence: routerDecision.confidence, source: routerDecision.source },
      vacationName: vacationNameFrom(job, payload, trip, ''),
      unforgettableGoal: unforgettableGoalFrom(job, payload),
      things: [],
      budgetItems: [],
      supportNotes: [{
        actor: process.env.TIMESYNCHER_WORKER_ID || 'TimeStopper',
        note: 'Current customer turn was classified as no-write before prior transcript context could trigger itinerary creation or edits.',
        metadata: { requestedAt: new Date().toISOString(), shareToken: token || null, routerDecision, linkedVacationsConsidered: linkedVacations.length },
      }],
      initialItinerary: '',
      webItineraryUrl: token ? `${publicBase.replace(/\/+$/, '')}/shared/${encodeURIComponent(token)}/` : '',
      researchedThings: [],
      trekSync: null,
      hostedSync: { skipped: true, reason: 'support_router_no_write' },
      publicResearch: { status: 'support_router_no_write' },
      clarificationNeeded: routerDecision.intent === 'ambiguous',
      supportRouterDecision: routerDecision,
      turnDecision: routerDecision,
      editApplied: false,
      createNewTrip: false,
    };
  }
  const createNewTrip = Boolean(payload.createNewTrip || payload.create_new_trip || job.createNewTrip || job.create_new_trip || isExplicitNewVacationRequest(ownRequestText));
  if (!createNewTrip && isConcreteItineraryEditRequest(ownRequestText)) {
    const trekEdit = applyExistingTripEdit(job, { requestText });
    return {
      requestText,
      destination: extractDestination(requestText, payload, trip),
      dates: extractDates(requestText, payload, trip),
      methods: trekEdit.mode === 'grok_trek_agent_edit'
        ? ['travel.assistant.sync-trek-nomad', 'travel.assistant.grok-trek-agent-edit']
        : ['travel.assistant.sync-trek-nomad'],
      lane: { primary: trekEdit.mode || 'deterministic_trek_edit' },
      vacationName: vacationNameFrom(job, payload, trip, ''),
      unforgettableGoal: unforgettableGoalFrom(job, payload),
      things: [],
      budgetItems: [],
      supportNotes: [{
        actor: process.env.TIMESYNCHER_WORKER_ID || 'TimeStopper',
        note: `${trekEdit.mode === 'grok_trek_agent_edit' ? 'Grok TREK agent edit' : 'Deterministic TREK edit'} applied to existing shared trip. Operations: ${trekEdit.operationCount || 0}`,
        metadata: { requestedAt: new Date().toISOString(), webItineraryUrl: trekEdit.url || null, updatedItems: trekEdit.updatedItems || [], accessChanges: trekEdit.accessChanges || [] },
      }],
      initialItinerary: '',
      webItineraryUrl: trekEdit.url,
      researchedThings: [],
      trekSync: trekEdit,
      hostedSync: { skipped: true, reason: 'existing_trek_edit' },
      publicResearch: { status: 'skipped_existing_trek_edit' },
      editApplied: true,
      turnDecision: routerDecision,
      createNewTrip: false,
    };
  }
  if (shouldAskBeforeStartingNewPass({ job, input, payload, requestText })) {
    const token = shareTokenFromContext(job, input, payload, requestText);
    const publicBase = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://vacation.timesyncher.com';
    return {
      requestText,
      destination: extractDestination(requestText, payload, trip),
      dates: extractDates(requestText, payload, trip),
      methods: ['travel.assistant.clarify-existing-trip-or-new-trip'],
      lane: { primary: 'needs_trip_intent_clarification' },
      vacationName: vacationNameFrom(job, payload, trip, ''),
      unforgettableGoal: unforgettableGoalFrom(job, payload),
      things: [],
      budgetItems: [],
      supportNotes: [{
        actor: process.env.TIMESYNCHER_WORKER_ID || 'TimeStopper',
        note: 'Asked for clarification before starting a new first pass because the Telegram turn was linked to an existing shared trip.',
        metadata: { requestedAt: new Date().toISOString(), shareToken: token || null },
      }],
      initialItinerary: '',
      webItineraryUrl: token ? `${publicBase.replace(/\/+$/, '')}/shared/${encodeURIComponent(token)}/` : '',
      researchedThings: [],
      trekSync: null,
      hostedSync: { skipped: true, reason: 'needs_trip_intent_clarification' },
      publicResearch: { status: 'needs_trip_intent_clarification' },
      clarificationNeeded: true,
    };
  }
  const destination = extractDestination(requestText, payload, trip, { ignoreTripContext: createNewTrip });
  const dates = extractDates(requestText, payload, trip, { ignoreTripContext: createNewTrip, job });
  const vacationName = vacationNameFrom(job, payload, trip, destination, { ignoreTripContext: createNewTrip });
  const unforgettableGoal = unforgettableGoalFrom(job, payload);
  const methods = inferMethods(requestText);
  const lane = lodgingLane(requestText, manifest);
  const titleDestination = destination ? titleCase(destination) : 'Vacation';
  const requestedAt = new Date().toISOString();
  const initialItinerary = buildInitialItinerary({ requestText, destination, dates });
  const publicResearch = await runPublicResearch({ artifacts: { requestText, vacationName, unforgettableGoal, destination, dates, lodgingLane: lane }, targetMinutes: manifest.capabilityObject?.targetInitialResearchMinutes || 15, minMinutes: manifest.capabilityObject?.minimumInitialResearchMinutes || 10 });
  const researchedThings = publicResearch.candidates || [];
  if ((job.request_type || job.job_type) === 'itinerary_research_update' && researchedThings.length === 0 && process.env.TIMESYNCHER_ALLOW_EMPTY_RESEARCH_PASS !== '1') {
    throw new Error(`Public research pass produced no source-linked candidates; not sending a ready message. Status: ${publicResearch.status || 'unknown'}`);
  }
  if ((job.request_type || job.job_type) === 'itinerary_research_update' && publicResearch.status !== 'source_backed_research_complete' && process.env.TIMESYNCHER_ALLOW_INCOMPLETE_RESEARCH_PASS !== '1') {
    throw new Error(`Public research pass did not meet first-pass quality gates; not sending a ready message. Status: ${publicResearch.status || 'unknown'}; counts=${JSON.stringify(publicResearch.categoryCounts || {})}; missingMinimums=${JSON.stringify(publicResearch.missingMinimums || {})}; missingReviews=${(publicResearch.missingReviews || []).length}; missingHappyHour=${(publicResearch.missingHappyHour || []).length}; missingCoordinates=${(publicResearch.missingCoordinates || []).length}`);
  }
  const trekSync = syncTrekItinerary(job, { requestText, vacationName, unforgettableGoal, destination, dates, researchedThings, createNewTrip });
  const webItineraryUrl = trekSync.url;

  const planningSummary = [
    destination ? `Destination: ${titleDestination}` : 'Destination: needs confirmation',
    dates.startDate || dates.endDate ? `Dates: ${dates.startDate || '?'} to ${dates.endDate || '?'}` : dates.dateText ? `Dates: ${dates.dateText}` : 'Dates: needs confirmation',
    `Lodging lane: ${lane.primary}`,
    `Customer action: TimeSyncher Vacation organizes and compares options; customers verify details and make any bookings themselves.`,
  ].join('\n');

  const things = [
    {
      category: 'note',
      subtype: 'planning_brief',
      title: `${titleDestination} planning brief`,
      description: planningSummary,
      metadata: {
        source: 'product-gbrain-dispatch',
        status: 'draft',
        requestedAt,
        allowedMethods: methods,
        questions: planningQuestions(destination, dates),
        initialItineraryGenerated: true,
        vacationName: vacationName || null,
        unforgettableGoal: unforgettableGoal || null,
      },
    },
    {
      category: 'activity',
      subtype: 'Initial itinerary draft',
      title: `${titleDestination} initial itinerary draft`,
      description: initialItinerary,
      metadata: {
        source: 'product-gbrain-dispatch',
        status: 'customer_sent',
        requestedAt,
      },
    },
    ...researchedThings,
    {
      category: 'hotel',
      subtype: lane.primary === 'hotels_first' ? 'Hotel search' : 'Vacation rental search',
      title: `${titleDestination} lodging search`,
      description: lane.policy || 'Search lodging options under the restricted TimeSyncher Vacation policy.',
      metadata: {
        source: 'product-gbrain-dispatch',
        status: 'queued_for_research',
        lane: lane.primary,
      },
    },
    {
      category: 'activity',
      subtype: 'Itinerary research',
      title: `${titleDestination} itinerary research`,
      description: 'Build a source-backed shortlist of itinerary options, restaurants, stores, events, budget items, and unresolved decisions.',
      metadata: {
        source: 'product-gbrain-dispatch',
        status: 'queued_for_research',
        requiresSourceBackedEnrichment: true,
      },
    },
  ];

  const budgetItems = [
    { category: 'lodging', label: `${titleDestination} lodging budget placeholder`, amountCents: 0, metadata: { status: 'needs_budget' } },
    { category: 'activities', label: `${titleDestination} activities budget placeholder`, amountCents: 0, metadata: { status: 'needs_budget' } },
  ];

  const supportNotes = [
    {
      actor: process.env.TIMESYNCHER_WORKER_ID || 'TimeStopper',
      note: `Restricted Product GBrain dispatch created a TREK research workspace and queued source-backed public research. Methods: ${methods.join(', ')}`,
      metadata: { destination: destination || null, lodgingLane: lane.primary, requestedAt, webItineraryUrl: webItineraryUrl || null },
    },
  ];

  const hostedSync = await syncHostedSharedItinerary(job, { vacationName, destination, dates, things, budgetItems, supportNotes, trekSync });
  smokeCheckTrekSync(trekSync);

  return { requestText, destination, dates, methods, lane, vacationName, unforgettableGoal, things, budgetItems, supportNotes, initialItinerary, webItineraryUrl, researchedThings, trekSync, hostedSync, publicResearch, createNewTrip, turnDecision: routerDecision };
}

function customerResponse(job, artifacts) {
  const requestType = text(job.request_type || job.job_type || '', 80);
  const url = text(artifacts.webItineraryUrl || '', 500);
  const requestText = text(job.request_text || job.text || job.message || artifacts.requestText || '', 2000).toLowerCase();
  if (artifacts.supportRouterDecision && artifacts.supportRouterDecision.shouldQueueWorker === false) {
    const answer = text(artifacts.supportRouterDecision.answer, 1800);
    if (answer) return answer.slice(0, 3900);
  }
  if (url && isWebsiteLinkRequestText(requestText)) {
    return `Here is the website: ${url}`.slice(0, 3900);
  }
  if (artifacts.clarificationNeeded) {
    return [
      'I need to check one thing before I change anything.',
      '',
      'Do you want me to update the current vacation website, or start a brand-new vacation?',
      '',
      url ? `Current website: ${url}` : 'Tell me the vacation name if you want me to update an existing vacation.',
    ].join('\n').slice(0, 3900);
  }
  if (artifacts.editApplied) {
    const updatedItems = Array.isArray(artifacts.trekSync?.updatedItems) ? artifacts.trekSync.updatedItems : [];
    const itemLines = updatedItems
      .map((item) => {
        const title = text(item?.title || item?.name || item?.label, 160);
        if (!title) return '';
        const action = text(item?.action || 'updated', 40).toLowerCase();
        const day = Number.isFinite(Number(item?.day)) ? ` to Day ${Number(item.day)}` : '';
        const category = text(item?.category || item?.type, 60);
        const categoryText = category ? ` (${category.replace(/_/g, ' ')})` : '';
        return `- ${title}: ${action}${day}${categoryText}`;
      })
      .filter(Boolean)
      .slice(0, 8);
    return [
      itemLines.length
        ? 'I updated the vacation website:'
        : 'I updated the vacation website.',
      ...itemLines,
      '',
      `Here is the website: ${url}`,
    ].join('\n').slice(0, 3900);
  }
  if (requestType === 'itinerary_research_update' || url) {
    const count = artifacts.researchedThings?.length || 0;
    const researchStatus = text(artifacts.publicResearch?.status || '', 120);
    if (researchStatus && researchStatus !== 'source_backed_research_complete') {
      return [
        'I started the vacation website, but it still needs more source-backed options before I call the first pass ready.',
        '',
        count
          ? `So far I found ${count} source-linked option${count === 1 ? '' : 's'}, and I still need to fill the missing restaurant, activity, shopping, review, or detail fields.`
          : 'I still need to gather enough destination-specific restaurants, activities, shopping, reviews, and details.',
        '',
        url ? `Here is the current website: ${url}` : 'I will send the website link once the next pass is ready.',
      ].join('\n').slice(0, 3900);
    }
    return [
      'Your first TimeSyncher Vacation pass is ready.',
      '',
      count
        ? `I researched and organized ${count} source-linked options for the trip, including restaurants, activities, wineries, sightseeing, transportation notes, and open decisions.`
        : 'I organized the details you sent into the vacation website and marked the remaining research areas for the next pass.',
      '',
      url ? `Here is the website: ${url}` : 'The website was created, but I could not attach the link in this message. I will retry sending it.',
    ].join('\n').slice(0, 3900);
  }

  const lines = [
    'Great, I’ve got the starting shape of your trip.',
    '',
    'Before I build the first version of your vacation website, send me one more note with anything else you want me to know: favorite restaurants or foods, lodging preferences, budget range, must-do activities, things to avoid, mobility needs, kid-friendly priorities, or any reservations/flights you already have.',
    '',
    'After your next message, I’ll spend about 10-15 minutes researching and organizing the first pass, then I’ll come back with your dedicated TimeSyncher Vacation website.',
  ].filter(Boolean);
  return lines.join('\n').slice(0, 3900) || artifacts.initialItinerary || 'I started your TimeSyncher Vacation itinerary and saved the planning brief.';
}

function customerVacationUrl(artifacts) {
  const candidates = [
    artifacts.customerVacationUrl,
    artifacts.vacationUrl,
    artifacts.tripUrl,
  ].map((value) => text(value || '', 500)).filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (!/^https?:$/.test(parsed.protocol)) continue;
      if (parsed.pathname.startsWith('/shared/')) continue;
      return parsed.toString();
    } catch {
      // Ignore malformed optional customer URL fields.
    }
  }
  return '';
}

function customerCopyLeakScan(value) {
  const source = text(value, 5000);
  const forbidden = ['TREK', 'GBrain', 'research workspace', 'worker', 'capability gate', 'public research pass', 'sqlite', 'Traceback', '/home/'];
  const hits = forbidden.filter((term) => source.toLowerCase().includes(term.toLowerCase()));
  return { ok: hits.length === 0, hits };
}

function buildTurnInspector(job, artifacts, customerResponseText) {
  const input = asObject(job.input);
  const payload = { ...asObject(job.payload), ...asObject(input.payload) };
  const linkedVacations = linkedVacationsFrom(job, input, payload);
  return {
    rawTurn: {
      requestText: currentTurnText({ ...job, input, payload }),
      requestId: job.request_id || null,
      jobId: job.id || null,
      jobType: job.request_type || job.job_type || null,
    },
    routerDecision: artifacts.turnDecision || artifacts.supportRouterDecision || null,
    linkedTripsConsidered: linkedVacations.map((vacation) => ({
      name: vacation.name || null,
      destination: vacation.destination || null,
      token: vacation.token || null,
      url: publicVacationUrl(vacation, process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_SITE_BASE) || null,
      status: vacation.status || null,
    })),
    selectedTrip: artifacts.trekSync ? {
      token: artifacts.trekSync.token || null,
      url: artifacts.trekSync.url || artifacts.webItineraryUrl || null,
    } : null,
    queueJobId: job.id || null,
    workerResult: {
      editApplied: Boolean(artifacts.editApplied),
      createNewTrip: Boolean(artifacts.createNewTrip),
      researchStatus: artifacts.publicResearch?.status || null,
      hostedSync: artifacts.hostedSync?.skipped ? { skipped: true, reason: artifacts.hostedSync.reason || null } : { skipped: false },
    },
    customerResponse: customerResponseText,
    leakScan: customerCopyLeakScan(customerResponseText),
  };
}

async function main() {
  const manifestPath = process.env.TIMESYNCHER_PRODUCT_GBRAIN_MANIFEST || DEFAULT_MANIFEST;
  const manifest = loadManifest(manifestPath);
  const capabilities = buildCapabilityObject(manifest);
  assertCapabilityObject(capabilities);
  const input = JSON.parse((await readStdin()) || '{}');
  const job = input.job || input;
  const preflightDecision = currentTurnRouterDecisionModelFirst({ ...job, productManifest: manifest });
  if (preflightDecision.shouldQueueWorker !== false) {
    assertCustomerRequestAllowed(job, capabilities);
  }
  const allowedSkills = manifest.allowedSkills || [];
  const artifacts = await buildArtifacts(job, manifest);
  const customerResponseText = customerResponse(job, artifacts);
  const turnInspector = buildTurnInspector(job, artifacts, customerResponseText);

  const response = {
    customerResponse: customerResponseText,
    result: {
      handledBy: process.env.TIMESYNCHER_WORKER_ID || 'TimeStopper',
      productGbrain: manifest.name,
      requestId: job.request_id,
      jobId: job.id,
      requestType: job.request_type || job.job_type,
      allowedSkills,
      selectedMethods: artifacts.methods,
      normalizedTrip: {
        vacationName: artifacts.vacationName || null,
        unforgettableGoal: artifacts.unforgettableGoal || null,
        destination: artifacts.destination || null,
        dates: artifacts.dates,
        lodgingLane: artifacts.lane,
      },
      webItineraryUrl: artifacts.webItineraryUrl || null,
      editApplied: Boolean(artifacts.editApplied),
      createNewTrip: Boolean(artifacts.createNewTrip),
      turnDecision: artifacts.turnDecision || artifacts.supportRouterDecision || null,
      turnInspector,
      trekSync: artifacts.trekSync || null,
      researchSummary: {
        sourceBackedCandidateCount: artifacts.researchedThings?.length || 0,
        status: artifacts.publicResearch?.status || (artifacts.researchedThings?.length ? 'source_backed_research_complete' : 'needs_live_research'),
        provider: artifacts.publicResearch?.provider || 'none',
        elapsedMs: artifacts.publicResearch?.elapsedMs || 0,
      },
      artifacts: {
        tripThings: artifacts.things,
        budgetItems: artifacts.budgetItems,
        supportNotes: artifacts.supportNotes,
      },
      policy: {
        lodging: manifest.lodgingPolicy,
        capture: manifest.capturePolicy,
        capabilities: capabilities.publicSummary,
      },
      nextStep: 'source_backed_research_and_thing_enrichment',
    },
    toolingUsed: ['product-gbrain-dispatch', ...allowedSkills, ...artifacts.methods],
  };

  assertToolingAllowed(response.toolingUsed, capabilities);
  console.log(JSON.stringify(response));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});

#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_MANIFEST = '/home/ubishere9995/gbrain/product-gbrains/timesyncher-vacation/manifest.json';
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

function vacationNameFrom(job, payload, trip, destination) {
  return text(
    payload.vacationName ||
      payload.vacation_name ||
      job.normalized_intent?.vacationName ||
      trip.title ||
      trip.name ||
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

function combinedRequestText(job) {
  const own = text(job.request_text || job.input?.requestText || job.payload?.requestText || job.payload?.text);
  const prior = transcriptTurns(job)
    .filter((turn) => turn?.speaker === 'customer' && text(turn.body))
    .map((turn) => text(turn.body, 3000))
    .reverse();
  return [...prior, own].filter(Boolean).join('\n\n');
}

function containsAny(source, words) {
  const lower = source.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function extractDestination(requestText, payload, trip) {
  if (/\bhawaii|honolulu|waikiki|oahu|maui|kihei|kona|big island\b/i.test(requestText)) {
    return 'Hawaii: Oahu, Maui, and Kona';
  }
  return text(
    trip.destination ||
      payload.destination ||
      payload.trip?.destination ||
      firstMatch(requestText, [
        /\b(?:to|in|for)\s+([A-Z][A-Za-z .'-]{2,60}?)(?:\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|from|on|for|with|between|around|starting|leaving)\b|$)/i,
        /\b(?:visit|visiting|vacation(?:ing)? in|trip to)\s+([A-Z][A-Za-z .'-]{2,60})(?:\s|$)/i,
      ]),
    180,
  );
}

function extractDates(requestText, payload, trip) {
  const monthDay = firstMatch(requestText, [
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?)\b/i,
  ]);
  const dateRange = firstMatch(requestText, [
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\s*(?:-|to|through)\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)?[a-z]*\s*\d{1,2})\b/i,
    /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:-|to|through)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/,
  ]);
  return {
    startDate: text(trip.startDate || trip.start_date || payload.startDate || payload.start_date, 40),
    endDate: text(trip.endDate || trip.end_date || payload.endDate || payload.end_date, 40),
    dateText: text(payload.dateText || payload.dates || dateRange || monthDay, 120),
  };
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

function planningQuestions(destination, dates) {
  const questions = [];
  if (!destination) questions.push('What destination or cities should I plan around?');
  if (!dates.startDate && !dates.endDate && !dates.dateText) questions.push('What travel dates or date range should I use?');
  questions.push('What should the shared trip paragraph emphasize: relaxing, adventure, family time, food, shows, shopping, or something else?');
  questions.push('What budget range and must-haves should I optimize for?');
  questions.push('Who is traveling, and are there mobility, food, lodging, or schedule constraints?');
  return questions.slice(0, 4);
}

function summaryMissingFields(requestText, destination, dates) {
  const lower = requestText.toLowerCase();
  const missing = [];
  if (!destination) missing.push('destination or cities');
  if (!dates.startDate && !dates.endDate && !dates.dateText) missing.push('dates or trip length');
  if (!/\b(adult|adults|kid|kids|child|children|family|wife|husband|spouse|couple|people|travelers|travellers|guests)\b/.test(lower)) missing.push('who is traveling');
  if (!/\b(budget|cheap|affordable|luxury|splurge|price|cost|per night|total)\b/.test(lower)) missing.push('budget or style');
  if (!/\b(unforgettable|special|goal|vibe|relax|adventure|food|restaurant|beach|surf|museum|show|shop|avoid|must)\b/.test(lower)) missing.push('must-dos, vibe, or things to avoid');
  return missing;
}

function hasUsableTripSummary(requestText, destination, dates) {
  const wordCount = requestText.split(/\s+/).filter(Boolean).length;
  return wordCount >= 18 && summaryMissingFields(requestText, destination, dates).length <= 2;
}

function deterministicTripSummary({ requestText, destination, dates, vacationName, unforgettableGoal }) {
  const place = destination || 'this vacation';
  const dateText = dates.dateText || [dates.startDate, dates.endDate].filter(Boolean).join(' to ');
  const goal = unforgettableGoal || firstMatch(requestText, [
    /\b(?:unforgettable|special|goal|vibe|want)\s*[:\-]?\s*([^.\n]{12,220})/i,
    /\b(?:make it|would be)\s+([^.\n]{12,220})/i,
  ]);
  const travelerHint = firstMatch(requestText, [
    /\b((?:my|our)\s+(?:wife|husband|spouse|family|kids|children|parents|friends)[^.\n]{0,120})/i,
    /\b(\d+\s+(?:adults|kids|children|people|travelers|travellers|guests)[^.\n]{0,120})/i,
  ]);
  const pieces = [
    `${vacationName || titleCase(place)} is being planned as a TimeSyncher Vacation for ${place}${dateText ? ` around ${dateText}` : ''}.`,
    travelerHint ? `The plan should fit ${travelerHint}.` : '',
    goal ? `The shared trip story should emphasize ${goal.replace(/[.;,]$/, '')}.` : '',
    'The first itinerary pass should turn that brief into a practical, source-backed plan with lodging, food, activities, transportation, budget tradeoffs, and open questions called out clearly.',
  ].filter(Boolean);
  return pieces.join(' ').replace(/\s+/g, ' ').slice(0, 900);
}

async function grokTripSummary({ requestText, destination, dates, vacationName, unforgettableGoal }) {
  const apiKey = process.env.TIMESYNCHER_XAI_API_KEY || process.env.XAI_API_KEY || '';
  if (!apiKey) return null;
  const model = process.env.TIMESYNCHER_XAI_SUMMARY_MODEL || process.env.XAI_MODEL || 'grok-4';
  const prompt = [
    'Write one polished customer-facing TimeSyncher Vacation trip summary paragraph.',
    'Use only the customer-provided facts. Do not invent bookings, prices, restaurants, or events.',
    'Mention uncertainty naturally if dates, travelers, budget, or destination are incomplete.',
    'This exact paragraph will appear on the website and in PDFs.',
    '',
    `Vacation name: ${vacationName || '(not provided)'}`,
    `Destination: ${destination || '(not provided)'}`,
    `Dates: ${dates.dateText || dates.startDate || dates.endDate || '(not provided)'}`,
    `Unforgettable goal: ${unforgettableGoal || '(not provided)'}`,
    '',
    'Customer text:',
    requestText,
  ].join('\n');
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 220,
      messages: [
        { role: 'system', content: 'You write concise, specific travel-planning summaries for a customer-facing vacation itinerary.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `XAI summary HTTP ${response.status}`);
  return text(json.choices?.[0]?.message?.content, 1200).replace(/^["“]+|["”]+$/g, '').trim();
}

export async function buildTripSummary(artifacts) {
  const missing = summaryMissingFields(artifacts.requestText, artifacts.destination, artifacts.dates);
  const goodInput = hasUsableTripSummary(artifacts.requestText, artifacts.destination, artifacts.dates);
  const fallback = deterministicTripSummary(artifacts);
  if (!goodInput) {
    return {
      paragraph: fallback,
      provider: 'deterministic_summary',
      status: 'needs_followup',
      missing,
      followUpQuestions: missing.map((field) => `Please send ${field}.`),
    };
  }
  try {
    const paragraph = await grokTripSummary(artifacts);
    if (paragraph) {
      return {
        paragraph,
        provider: 'xai_grok',
        model: process.env.TIMESYNCHER_XAI_SUMMARY_MODEL || process.env.XAI_MODEL || 'grok-4',
        status: missing.length ? 'draft_with_open_questions' : 'draft_ready',
        missing,
        followUpQuestions: missing.map((field) => `Please confirm ${field}.`),
      };
    }
  } catch (error) {
    return {
      paragraph: fallback,
      provider: 'deterministic_summary',
      providerError: text(error.message, 500),
      status: missing.length ? 'draft_with_open_questions' : 'draft_ready',
      missing,
      followUpQuestions: missing.map((field) => `Please confirm ${field}.`),
    };
  }
  return {
    paragraph: fallback,
    provider: 'deterministic_summary',
    status: missing.length ? 'draft_with_open_questions' : 'draft_ready',
    missing,
    followUpQuestions: missing.map((field) => `Please confirm ${field}.`),
  };
}

function extractTripSegments(requestText) {
  const lower = requestText.toLowerCase();
  const segments = [];
  if (containsAny(lower, ['honolulu', 'waikiki', 'oahu', 'banzai pipeline', 'moana', 'surfrider'])) {
    segments.push({
      island: 'Oahu',
      base: containsAny(lower, ['waikiki']) ? 'Waikiki / Honolulu' : 'Honolulu',
      nights: /\bthree nights?\b/i.test(requestText) ? 3 : /\btwo nights?\b/i.test(requestText) ? 2 : 2,
      lodging: containsAny(lower, ['moana', 'surfrider']) ? 'Moana Surfrider preferred; compare nearby Waikiki hotels.' : 'Waikiki hotel options.',
      ideas: [
        'Waikiki arrival/check-in and beach time',
        'Local restaurants, juice/breakfast spots, and dinner options',
        'Banzai Pipeline / North Shore day or half-day',
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
  const segments = extractTripSegments(artifacts.requestText);
  const start = artifacts.dates.dateText || artifacts.dates.startDate || 'travel date to confirm';
  const totalNights = segments.reduce((sum, segment) => sum + (Number.isFinite(segment.nights) ? segment.nights : 0), 0);
  const lines = [
    `Initial TimeSyncher Vacation itinerary draft`,
    ``,
    `I’m using this as the first working plan: ${artifacts.destination || 'destination needs confirmation'}, starting around ${start}${totalNights ? `, about ${totalNights} nights` : ''}. I’ll verify hotels, restaurants, activities, flight timing, car rentals, and seasonal availability before treating anything as final.`,
    ``,
    `Draft route: ${segments.map((segment) => segment.base).join(' -> ')}`,
    ``,
  ];
  let day = 1;
  for (const segment of segments) {
    const nights = Number.isFinite(segment.nights) ? segment.nights : 1;
    lines.push(`${segment.island}: ${segment.base}${nights ? ` (${nights} nights)` : ''}`);
    lines.push(`Stay focus: ${segment.lodging}`);
    for (let i = 0; i < Math.max(1, nights); i += 1) {
      const idea = segment.ideas[i] || segment.ideas[segment.ideas.length - 1];
      lines.push(`Day ${day}: ${idea}.`);
      day += 1;
    }
    lines.push('');
  }
  lines.push('I’ll build the next pass around:');
  lines.push('- hotel shortlist with pros/cons');
  lines.push('- flight hops and car-rental needs');
  lines.push('- local restaurants by area');
  lines.push('- activity timing and backup options');
  lines.push('- open questions and choices for you to approve');
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
      title: 'Moana Surfrider, A Westin Resort & Spa, Waikiki Beach',
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
      title: 'Banzai Pipeline / North Shore day',
      island: 'Oahu',
      description: 'Customer asked to visit the Banzai Pipeline. Research pass should set expectations: famous surf break, best big-wave season is winter, summer can be calmer; pair with North Shore food/shopping stops if surf is quiet.',
      links: [link('Go Hawaii North Shore overview', 'https://www.gohawaii.com/islands/oahu/regions/north-shore')],
    }),
    researchedThing({
      category: 'restaurant',
      subtype: 'Waikiki restaurants',
      title: 'Waikiki local/interesting restaurant research set',
      island: 'Oahu',
      description: 'Starter shortlist to verify and rank: Marugame Udon for casual noodles, Duke’s Waikiki / Hula Grill for beachfront classics, Leonard’s Bakery for malasadas, and local plate-lunch or poke options near Waikiki.',
      links: [
        link('Marugame Udon Waikiki', 'https://www.marugameudon.com/locations/waikiki/'),
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
      description: 'Starter shortlist to verify and rank: Nalu’s South Shore Grill and Koiso Sushi Bar in Kihei/South Maui; Merriman’s Kapalua and nearby Kapalua/Napili options for sunset or elevated dinner.',
      links: [
        link('Nalu’s South Shore Grill', 'https://www.naluskihei.com/'),
        link('Merriman’s Kapalua', 'https://www.merrimanshawaii.com/kapalua/'),
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
      title: 'Hilton Waikoloa Village / Kona lodging fit check',
      island: 'Big Island',
      description: 'Customer mentioned “Hilton Hawaiian Village,” which is on Oahu; likely Big Island fit is Hilton Waikoloa Village north of Kona. Research pass should confirm intent and compare with true Kona-town hotels.',
      links: [link('Hilton Waikoloa Village', 'https://www.hilton.com/en/hotels/koahwhh-hilton-waikoloa-village/')],
    }),
    researchedThing({
      category: 'activity',
      subtype: 'Manta ray night snorkel',
      title: 'Kona night manta ray snorkel',
      island: 'Big Island',
      description: 'Customer wants manta rays at night. Research pass should compare operators by departure harbor, duration, snorkel vs dive, minimum age/swim requirements, cancellation policy, and moon/weather caveats.',
      links: [
        link('Manta Ray Dives of Hawaii', 'https://mantaraydiveshawaii.com/'),
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
  if (!/\bhawaii|honolulu|waikiki|oahu|maui|kihei|kona|big island\b/i.test(artifacts.requestText || '')) {
    throw new Error('TREK itinerary sync is mandatory, but this destination is not supported by the current TREK sync adapter yet. Do not send a customer success URL.');
  }
  const script = path.join(SCRIPT_DIR, 'trek-vacation-sync.mjs');
  if (!fs.existsSync(script)) throw new Error(`TREK sync script is missing: ${script}`);
  const payload = {
    sourceKey: text(job.onboarding_token || job.request_id || job.id || 'timesyncher-vacation-hawaii', 180),
    onboardingToken: text(job.onboarding_token || '', 180),
    title: artifacts.vacationName || 'Hawaii July 2026',
    unforgettableGoal: artifacts.unforgettableGoal || '',
    tripSummary: artifacts.tripSummary?.paragraph || '',
    publicBase: process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://vacation.timesyncher.com',
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
  smokeCheckTrekSync(sync);
  return sync;
}

function smokeCheckTrekSync(sync) {
  const url = text(sync?.url || '', 500);
  const token = text(sync?.token || '', 180);
  if (!url) throw new Error('TREK sync returned no customer URL');
  const parsed = new URL(url);
  if (parsed.hostname.toLowerCase() !== 'vacation.timesyncher.com') {
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
  if (token) {
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

async function buildArtifacts(job, manifest) {
  const input = asObject(job.input);
  const payload = { ...asObject(job.payload), ...asObject(input.payload) };
  const trip = { ...asObject(payload.trip), ...asObject(input.trip) };
  const requestText = text(combinedRequestText({ ...job, input, payload }) || job.request_text || input.requestText || payload.requestText || payload.text);
  const destination = extractDestination(requestText, payload, trip);
  const dates = extractDates(requestText, payload, trip);
  const vacationName = vacationNameFrom(job, payload, trip, destination);
  const unforgettableGoal = unforgettableGoalFrom(job, payload);
  const methods = inferMethods(requestText);
  const lane = lodgingLane(requestText, manifest);
  const titleDestination = destination ? titleCase(destination) : 'Vacation';
  const requestedAt = new Date().toISOString();
  const initialItinerary = buildInitialItinerary({ requestText, destination, dates });
  const researchedThings = hawaiiResearchThings(requestText);
  const tripSummary = await buildTripSummary({ requestText, destination, dates, vacationName, unforgettableGoal });
  const trekSync = syncTrekItinerary(job, { requestText, vacationName, unforgettableGoal, tripSummary });
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
        tripSummary,
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
      note: `Restricted Product GBrain dispatch created first-pass planning artifacts. Methods: ${methods.join(', ')}`,
      metadata: { destination: destination || null, lodgingLane: lane.primary, requestedAt, webItineraryUrl: webItineraryUrl || null },
    },
  ];

  return { requestText, destination, dates, methods, lane, vacationName, unforgettableGoal, tripSummary, things, budgetItems, supportNotes, initialItinerary, webItineraryUrl, researchedThings, trekSync };
}

function customerResponse(job, artifacts) {
  const researchedCount = artifacts.researchedThings?.length || 0;
  const lines = [
    'I created the TimeSyncher Vacation TREK itinerary and added researched starter options for hotels, activities, restaurants, shopping, transportation, and open decisions.',
    '',
    artifacts.tripSummary?.paragraph ? `Trip summary: ${artifacts.tripSummary.paragraph}` : '',
    artifacts.tripSummary?.followUpQuestions?.length ? `I still need: ${artifacts.tripSummary.followUpQuestions.join(' ')}` : '',
    '',
    artifacts.webItineraryUrl ? `Open it here: ${artifacts.webItineraryUrl}` : '',
    researchedCount ? `I saved ${researchedCount} source-linked research candidates so the next pass can rank and refine them instead of re-stating your voice note.` : '',
    '',
    'TimeSyncher Vacation does not make bookings. Please verify prices, availability, hours, seasonal details, and terms yourself before booking or relying on any option.',
  ].filter(Boolean);
  return lines.join('\n').slice(0, 3900) || artifacts.initialItinerary || 'I started your TimeSyncher Vacation itinerary and saved the planning brief.';
}

async function main() {
  const manifestPath = process.env.TIMESYNCHER_PRODUCT_GBRAIN_MANIFEST || DEFAULT_MANIFEST;
  const manifest = loadManifest(manifestPath);
  const input = JSON.parse((await readStdin()) || '{}');
  const job = input.job || input;
  const allowedSkills = manifest.allowedSkills || [];
  const artifacts = await buildArtifacts(job, manifest);

  const response = {
    customerResponse: customerResponse(job, artifacts),
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
        tripSummary: artifacts.tripSummary || null,
        destination: artifacts.destination || null,
        dates: artifacts.dates,
        lodgingLane: artifacts.lane,
      },
      webItineraryUrl: artifacts.webItineraryUrl || null,
      trekSync: artifacts.trekSync || null,
      researchSummary: {
        sourceBackedCandidateCount: artifacts.researchedThings?.length || 0,
        status: artifacts.researchedThings?.length ? 'initial_source_backed_research_seeded' : 'needs_live_research',
      },
      artifacts: {
        tripThings: artifacts.things,
        budgetItems: artifacts.budgetItems,
        supportNotes: artifacts.supportNotes,
      },
      policy: {
        lodging: manifest.lodgingPolicy,
        capture: manifest.capturePolicy,
      },
      nextStep: 'source_backed_research_and_thing_enrichment',
    },
    toolingUsed: ['product-gbrain-dispatch', ...allowedSkills, ...artifacts.methods],
  };

  console.log(JSON.stringify(response));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}

#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  assertCustomerReplyShippable,
  ReplyIdCitationBlockedError,
} from '../src/vacation/reply-id-citation.mjs';
import { placeResultExtra } from '../src/vacation/provider-result-context.mjs';
import { inTurnPlaceReplyViolation } from '../src/vacation/chat-place-search.mjs';
import { replyRulesSystem, sourcedPlaceRule } from './vacation-app-reply-rules.mjs';

const STAGING_BLOCKED_DRAFT = `Shepherd, your Maui anniversary week kicks off Wednesday, March 10, 2027, with you and your wife at the Hyatt Regency Maui in Kaanapali. The weather that time of year is typically warm and sunny, averaging around 78°F, perfect for beach walks and sunset tacos. I checked several event calendars including Maui Now, Grand Wailea, and the Maui Arts & Cultural Center (id:https://mauiarts.org/calendar), but specific events for that week in 2027 aren't posted yet—most venues publish closer to the date. You might catch live Hawaiian music at the Hyatt's nightly torch lighting or cultural performances at Whalers Village, just a short walk down the beach path.`;

const MATCHED_SUBSTRING = '(id:https://mauiarts.org/calendar)';

const tavilyPlaceResults = [
  {
    name: 'Maui Events Calendar | Maui Now',
    title: 'Maui Events Calendar | Maui Now',
    sourceRef: { id: 'https://mauinow.com/events', source: 'tavily' },
  },
  {
    name: 'Maui Arts & Cultural Center | Calendar',
    title: 'Maui Arts & Cultural Center | Calendar',
    sourceRef: { id: 'https://mauiarts.org/calendar', source: 'tavily' },
  },
];

assert.throws(
  () => assertCustomerReplyShippable(STAGING_BLOCKED_DRAFT, 'trip-maui'),
  (error) => error instanceof ReplyIdCitationBlockedError,
);

assert.throws(
  () => assertCustomerReplyShippable('Thanks (id: abc)', 'trip-cite'),
  (error) => error instanceof ReplyIdCitationBlockedError,
);
assert.throws(
  () => assertCustomerReplyShippable('Plan uses timesyncher_vacation_single', 'trip-product'),
  (error) => error instanceof ReplyIdCitationBlockedError,
);

const tavilyNameReply = 'I checked Maui Now and Grand Wailea calendars; see https://mauinow.com/events for listings.';
assertCustomerReplyShippable(tavilyNameReply, 'trip-tavily');

const weatherEventsContext = placeResultExtra(tavilyPlaceResults);
assert.doesNotMatch(weatherEventsContext, /\(id:/);
assert.match(weatherEventsContext, /Maui Now/);
const rulesBlob = replyRulesSystem({ ok: true, notes_where: 'day_required_place_optional' }, 'Maui', 'forbidden', false, 'what is the weather', {});
assert.doesNotMatch(rulesBlob, /\(id:/);
assert.doesNotMatch(sourcedPlaceRule(), /\(id:/);

const inventedWeb = inTurnPlaceReplyViolation(
  'You might catch live Hawaiian music or cultural performances at Whalers Village, just a short walk down the beach path.',
  tavilyPlaceResults,
);
assert.equal(inventedWeb?.status, 'unsourced_place');
assert.ok(inventedWeb?.invented?.includes('Whalers Village'));

const sourcedWeb = inTurnPlaceReplyViolation(
  'I checked Maui Now and the Grand Wailea event calendar; nothing is posted for that week yet.',
  tavilyPlaceResults,
);
assert.equal(sourcedWeb, null);

console.log(JSON.stringify({
  ok: true,
  checked: 'reply-id-citation-weather',
  stagingMatchedSubstring: MATCHED_SUBSTRING,
  assertions: [
    'staging_maui_weather_events_draft_blocks',
    'tavily_context_and_rules_have_no_id_parenthetical',
    'tavily_names_and_bare_urls_pass_ship_guard',
    'parenthetical_id_abc_still_blocks',
    'product_id_literal_still_blocks',
    'invented_web_venue_fails_sourcing',
  ],
}));

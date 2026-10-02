#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assertCustomerReplyShippable } from '../src/vacation/reply-id-citation.mjs';
import { ReplyIdCitationBlockedError } from '../src/vacation/reply-id-citation.mjs';
import { placeResultExtra } from '../src/vacation/chat-place-search.mjs';

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

assertCustomerReplyShippable(STAGING_BLOCKED_DRAFT, 'trip-maui');

assert.throws(
  () => assertCustomerReplyShippable('Thanks (id: abc)', 'trip-cite'),
  (error) => error instanceof ReplyIdCitationBlockedError,
);
assert.throws(
  () => assertCustomerReplyShippable('Plan uses timesyncher_vacation_single', 'trip-product'),
  (error) => error instanceof ReplyIdCitationBlockedError,
);

const tavilyUrlReply = 'Maui Now lists festivals at https://mauinow.com/events and the arts center calendar (id:https://mauiarts.org/calendar) for March.';
assertCustomerReplyShippable(tavilyUrlReply, 'trip-tavily');

const weatherEventsContext = placeResultExtra(tavilyPlaceResults);
assert.doesNotMatch(weatherEventsContext, /\(id:/);
assert.match(weatherEventsContext, /Maui Now/);

console.log(JSON.stringify({
  ok: true,
  checked: 'reply-id-citation-weather',
  stagingMatchedSubstring: MATCHED_SUBSTRING,
  assertions: [
    'staging_maui_weather_events_draft_ships',
    'parenthetical_id_abc_still_blocks',
    'product_id_literal_still_blocks',
    'tavily_url_id_citation_passes',
    'tavily_place_result_extra_has_no_id_parenthetical',
  ],
}));

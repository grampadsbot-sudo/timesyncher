#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  assertCustomerReplyShippable,
  ReplyIdCitationBlockedError,
} from '../src/vacation/reply-id-citation.mjs';
import { placeResultExtra } from '../src/vacation/provider-result-context.mjs';
import { inTurnPlaceReplyViolation } from '../src/vacation/chat-place-search.mjs';
import { replyRulesSystem, sourcedPlaceRule } from './vacation-app-reply-rules.mjs';
import { sameTierRewriteRequest } from '../src/vacation/live-app-turn.mjs';

const CUSTOMER_TURN = 'best tacos near our hotel';
const LOC_MAUI = 'loc4G2MUY4CF4M2EA4IRFELTJD3DYB5ISXH6SWZSIZY=';
const LOC_ONO = 'locONOTACOSHAWAIIEXAMPLEID1234567890ABCD=';

const mauiPlaceResults = [
  {
    name: 'Maui Tacos',
    title: 'Maui Tacos',
    sourceRef: { source: 'trip_thing', id: LOC_MAUI },
  },
  {
    name: 'Ono Tacos Hawaii',
    title: 'Ono Tacos Hawaii',
    sourceRef: { source: 'brave', id: 'brave:ono-tacos-maui' },
  },
];

const modelContext = placeResultExtra(mauiPlaceResults);
assert.match(modelContext, /Maui Tacos/);
assert.match(modelContext, /Ono Tacos Hawaii/);
assert.doesNotMatch(modelContext, /\(id:/);
assert.doesNotMatch(modelContext, /loc4G2MUY4/);
assert.doesNotMatch(modelContext, /locONO/);

const rulesBlob = replyRulesSystem(
  { ok: true, notes_where: 'day_required_place_optional' },
  'Maui',
  'forbidden',
  false,
  CUSTOMER_TURN,
  {},
);
assert.doesNotMatch(rulesBlob, /\(id:/);
assert.doesNotMatch(rulesBlob, new RegExp(LOC_MAUI.slice(0, 12)));
assert.doesNotMatch(sourcedPlaceRule(), /\(id:/);

const rewriteRequest = sameTierRewriteRequest({
  customerTurn: CUSTOMER_TURN,
  draft: 'Maui Tacos and Ono Tacos Hawaii are strong picks near your hotel.',
  scoreRaw: 3,
  failure: 'none',
});
const rewritePrompt = [
  rewriteRequest.systemExtra,
  'Keep the days already on the saved trip.',
  'Never invent a place or id.',
  placeResultExtra(mauiPlaceResults),
].join(' ');
assert.doesNotMatch(rewritePrompt, /\(id:/);
assert.doesNotMatch(rewritePrompt, /loc4G2MUY4/);

const sourcedReply = 'Maui Tacos and Ono Tacos Hawaii are both close to your hotel and worth a try for tacos.';
assertCustomerReplyShippable(sourcedReply, 'trip-maui-tacos');
assert.equal(inTurnPlaceReplyViolation(sourcedReply, mauiPlaceResults), null);

assert.throws(
  () => assertCustomerReplyShippable(`Try Maui Tacos (id:${LOC_MAUI}) for lunch.`, 'trip-maui-tacos'),
  (error) => error instanceof ReplyIdCitationBlockedError,
);

const invented = inTurnPlaceReplyViolation(
  'You could also try lunch at Island Taco Shack near the hotel.',
  mauiPlaceResults,
);
assert.equal(invented?.status, 'unsourced_place');
assert.ok(invented?.invented?.some((name) => /Island Taco Shack/i.test(name)));

console.log(JSON.stringify({
  ok: true,
  checked: 'place-search-reply-no-internal-ids',
  assertions: [
    'model_context_has_no_id_parenthetical_or_loc_ids',
    'rules_and_rewrite_prompt_have_no_id_parenthetical_or_loc_ids',
    'sourced_place_names_ship_and_pass_in_turn_check',
    'parenthetical_loc_id_still_blocks_ship',
    'invented_taco_place_fails_sourcing',
  ],
}));

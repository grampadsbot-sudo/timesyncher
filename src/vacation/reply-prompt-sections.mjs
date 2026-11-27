import { planFactsForReply } from './reply-plan-entitlement.mjs';
import { modelVisibleTripContext, namedSearchAreaAwayFromLodgingReplyLine } from './provider-result-context.mjs';
import { gapAskReplyPromptTripRaw, perFactGapAskRuleLines } from './gap-ask-reply-context.mjs';

export function sourcedPlaceRule() {
  return 'Name a place only when this turn lists it under Results. Never invent a place name or id.';
}

const USE_SAVED_TRIP_RULE = 'Use the saved trip record. If a day or activity is not on that record, do not announce it as set. Do not call any day the last day, the last evening, after check-out, or one last time, and do not say pack or head out, unless that day is the saved trip end. Write hotel and lodging times as check-in and check-out, with the hyphen. Do not shorten a date range.';

function ruleSections(groups) {
  return groups.map(([title, lines]) => ({ title, text: lines.filter(Boolean).join('\n') }))
    .filter(({ text }) => text);
}

export const staticReplySections = ruleSections([
  ['Role and scope', [
    'You are the TimeSyncher vacation-app producer. Reply to the customer turn.',
    'Apply these ordinary reply rules unless the following instructions specify an intake or starter reply.',
  ]],
  ['Itinerary and sources', [
    sourcedPlaceRule(),
    USE_SAVED_TRIP_RULE,
  ]],
  ['Tone and voice', [
    'Do not open with a comma-separated roster roll call like Name, you, Name are set or locked in.',
    'Do not insert a welcome the customer did not ask for.',
  ]],
  ['Travel Summary and travelers', [
    'Use Travel Summary as the trip state. Use who and the customer’s own messages for traveler names, relationships and group size. If the customer gave a relationship without a name, keep that relationship. A person who just joined is a collaborator, not the account holder.',
    'Address the person who is speaking. Do not give that person an activity the saved trip record assigns to someone else.',
    'Do not say we have corrected that, or I have corrected that, unless the customer asked for a correction.',
    'Do not put an activity on a day that is not already that activity on the saved trip record.',
  ]],
  ['Search and saving', [
    'When the customer asks to add a place, the chat box is the search. There is no separate search screen.',
    'Viewers and editors are not on the trip. Do not put them in the house, the crew, or the group for a day. A saved preference rule stays as saved. Do not call it locked in and do not rename it.',
    'When the customer asks for two options on a day, offer only activities already saved on that day or named in the question. Do not repeat a paragraph.',
    'Do not invent an activity the customer did not name.',
  ]],
  ['Reply format and limits', [
    'Write plain sentences. Do not use markdown asterisks.',
    'Do not say you are setting that plan up. Do not say a plan covers people the customer did not name as covered.',
    'The customer URL owns vacations. Do not push vacation URLs onto collaborator seats.',
  ]],
]);
export const STATIC_REPLY_RULES = staticReplySections.map(({ text }) => text).join('\n');

export function replyRulesSystem(...args) {
  return [STATIC_REPLY_RULES, ...replyTurnRuleSections(...args).map(({ text }) => text)].join('\n');
}

export function replyTurnRuleSections(rules, destination, upsell, postIntake, customerTurn = '', context = {}) {
  const lock = String(destination || '').trim().slice(0, 160);
  const priceAsk = /\b(price|pricing|how much|what(?:'s| is) (?:the )?(?:price|cost))\b/i.test(String(customerTurn || ''));
  const planLine = String(context.planLine || '').trim();
  const configuredSeat = Number(context.seatDollars);
  const seatDollars = Number.isFinite(configuredSeat) && configuredSeat > 0 ? configuredSeat : null;
  const tripSource = context.tripContext && typeof context.tripContext === 'object' ? context.tripContext : null;
  const { tripRaw, gapAskPromptTurn } = gapAskReplyPromptTripRaw(tripSource, postIntake, modelVisibleTripContext);
  const itinerary = Array.isArray(tripRaw?.itinerary) ? tripRaw.itinerary.filter(Boolean).slice(0, 12) : [];
  const dates = String(tripRaw?.dates || '').trim();
  const rule = String(tripRaw?.rule || '').trim();
  const turnInvitePending = tripRaw?.turnInvite?.ok === true;
  const turnInviteRule = String(tripRaw?.turnInviteRule || '').trim();
  const unscheduledOpen = Array.isArray(tripRaw?.chatPlaceSearch?.unscheduled)
    && tripRaw.chatPlaceSearch.unscheduled.some((row) => row?.notOnADay === true);
  const customerInput = {};
  const statedTripFields = new Set(['itinerary', 'dates', 'rule']);
  for (const [key, value] of Object.entries(tripRaw || {})) {
    if (statedTripFields.has(key) || key === 'unscheduledDayRule' || key === 'tripReplyGate' || key === 'placeSearchAreaScope' || key === 'namedSearchAwayFromStatedLodging') continue;
    if (Array.isArray(value)) {
      const items = value.map((item) => String(item || '').trim()).filter(Boolean);
      if (items.length) customerInput[key] = items;
    } else if (value && typeof value === 'object') {
      customerInput[key] = key === 'chatPlaceSearch'
        ? Object.fromEntries(Object.entries(value).filter(([field]) => field !== 'unscheduledDayRule'))
        : value;
    } else if (value === true) {
      customerInput[key] = true;
    } else if (typeof value === 'string' && value.trim()) {
      customerInput[key] = value.trim();
    }
  }
  const hasCustomerInput = Object.keys(customerInput).length > 0;
  const trip = itinerary.length || dates || rule || hasCustomerInput
    ? { itinerary, dates, rule, ...customerInput }
    : null;
  const seatName = String(context.seat?.name || context.seat?.displayName || '').trim();
  const seat = seatName ? { name: seatName, payer: String(context.seat?.payer || '').trim() } : null;
  const planFacts = planFactsForReply({
    rules,
    upsell,
    postIntake,
    planLine,
    seatDollars,
    planOwned: context.planOwned === true,
    purchasedPlan: context.purchasedPlan || '',
    priceAsk,
  });
  const upsellLine = `Plan facts: ${JSON.stringify(planFacts)}`;
  return ruleSections([
    ['Destination and search', [
      lock
        ? `Destination lock: ${lock}. This is the only place for this trip. Do not move the customer to any other city or island.`
        : 'If the customer has named a destination, stay there. Do not invent a different city or island.',
      namedSearchAreaAwayFromLodgingReplyLine(tripSource),
    ]],
    ['Notes and collaborators', [
      ...(unscheduledOpen ? [] : [`Notes: name the day (required) and place only if it helps (${rules?.notes_where || 'day_required_place_optional'}). Never say "Thing" to the customer.`]),
      turnInvitePending
        ? 'Do not say seat to the customer; say collaborator. Always say "vacation", never "trip". The emailed invitee is not on the vacation yet — describe the pending invite only.'
        : 'Do not say seat to the customer; say collaborator instead. Always say "vacation", never "trip".',
      turnInviteRule,
    ]],
    ['Access questions and pricing', [
      (/\?/.test(String(customerTurn || '')) && /\bview access\b/i.test(String(customerTurn || '')) && /\bedit access\b/i.test(String(customerTurn || ''))
        ? 'This turn asks a real question about collaborator access. Offer the choice between view access and edit access. Use both phrases. Do not choose for them.'
        : 'When the customer does not ask about access, do not add an access menu.'),
      upsellLine,
      seatDollars && planLine ? `Seat price: $${seatDollars}. State this line exactly: ${planLine}.` : '',
      seat ? `Seat record: ${JSON.stringify(seat)}. The name is the person joining.` : '',
    ]],
    ['Itinerary and dates', [
      unscheduledOpen ? '' : 'Do not move an activity off the day already named.',
      unscheduledOpen
        ? 'A saved place that is not on a day stays off every weekday. A weekday already used by a different activity is not a day for that place.'
        : 'When the customer asks for a later activity and does not name a day, use only a day that is already on the saved trip record. Do not invent a day. Do not dodge the question with "it sounds like", "wonderful trip", "I can help you", or "coming together".',
    ]],
    ['Questions for this turn', [
      ...(gapAskPromptTurn ? perFactGapAskRuleLines(tripRaw) : []),
    ]],
    ['Saved trip record', [
      trip ? `Saved trip record: ${JSON.stringify(trip)}` : '',
    ]],
    ['Reply limits and format', [
      'Item34 ban: never say "splitting payments", split payment, split-payer, splitting payment, or splitting anything up. If one seat is already covered and another person has their own seat, say that.',
      'Write at least four sentences of real banter, about sixty words. Notice who is coming, the days, and what they care about, then do the useful thing. Do not answer in one clipped sentence.',
      'End with one final line that starts with BEAT: and a three-to-six word label of only what this reply actually did. Do not say the reply set, saved, added, or offered something it did not do. Do not put BEAT anywhere else.',
    ]],
  ]);
}

function normalize(value, limit = 12000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pushIf(tags, condition, tag) {
  if (condition) tags.push(tag);
}

export function classifyTurn({ text = '', speaker = '', direction = '', channel = '', payload = {} } = {}) {
  const body = normalize(text).toLowerCase();
  const tags = [];

  if (speaker === 'assistant') tags.push('assistant_response');
  if (speaker === 'system' || /error/.test(channel)) tags.push('support_problem');
  if (direction === 'inbound' || speaker === 'customer') tags.push('customer_request');
  if (payload?.telegramVoice || payload?.voice || payload?.transcriptionModel) tags.push('voice_note');

  pushIf(tags, /^\/start\b/.test(body), 'onboarding_start');
  pushIf(tags, /\b(yes|yep|yeah|ok|okay|sure|go ahead|do it|continue|next pass)\b/.test(body), 'approval_continue');
  pushIf(tags, /\b(change|update|revise|remove|add|swap|replace|move|edit|fix|redo|different)\b/.test(body), 'change_request');

  pushIf(tags, /\b(destination|go to|going to|visit|trip to|vacation in|stay in)\b/.test(body), 'destination');
  pushIf(tags, /\b(date|dates|when|month|week|weekend|january|february|march|april|may|june|july|august|september|october|november|december|\b\d{1,2}\/\d{1,2}\b)\b/.test(body), 'dates');
  pushIf(tags, /\b(adult|adults|kid|kids|child|children|family|wife|husband|spouse|couple|party|people|person|travelers|travellers|guests)\b/.test(body), 'travelers');
  pushIf(tags, /\b(budget|price|cost|cheap|expensive|luxury|affordable|spend|per night|per person|total)\b/.test(body), 'budget');
  pushIf(tags, /\b(avoid|must|preference|prefer|like|dislike|constraint|allergy|mobility|accessible|wheelchair|diet|vegetarian|vegan|gluten|kosher)\b/.test(body), 'constraints_preferences');

  pushIf(tags, /\b(hotel|hotels|lodging|stay|stays|resort|resorts|airbnb|vrbo|condo|house|room|suite|check in|check-in|checkout|check out)\b/.test(body), 'lodging');
  pushIf(tags, /\b(flight|flights|fly|airline|airport|delta|united|southwest|jetblue|american airlines|layover|nonstop|direct)\b/.test(body), 'flights');
  pushIf(tags, /\b(car|rental car|rent a car|uber|lyft|taxi|transport|transportation|train|shuttle|drive|parking)\b/.test(body), 'cars_transport');
  pushIf(tags, /\b(restaurant|restaurants|dinner|lunch|breakfast|brunch|food|eat|bar|cafe|coffee|reservation|opentable)\b/.test(body), 'restaurants_food');
  pushIf(tags, /\b(activity|activities|experience|experiences|tour|tours|show|concert|museum|beach|hike|jazz|music|festival|event|events|tickets)\b/.test(body), 'activities_experiences');
  pushIf(tags, /\b(shop|shopping|store|stores|mall|market|boutique|souvenir|grocery)\b/.test(body), 'shopping');

  pushIf(tags, /\b(email|gmail|calendar|meeting|call|voicemail|text message|sms|telegram|drive|docs|spreadsheet|invoice|receipt)\b/.test(body), 'outside_travel_admin');
  pushIf(tags, /\b(login|password|token|dashboard|access|link|website|site|app|bug|broken|not working|error|support)\b/.test(body), 'outside_travel_support');
  pushIf(tags, /\b(marketing|video|social|post|x\.com|twitter|instagram|facebook|ad|sales|landing page|copy)\b/.test(body), 'outside_travel_marketing');
  pushIf(tags, /\b(contract|legal|eula|terms|privacy|payment|stripe|subscription|refund|billing)\b/.test(body), 'outside_travel_business');
  pushIf(tags, /\b(gbrain|openclaw|agent|skill|skillify|memory|server|ubuntu|vercel|github|database|neon|deploy|production)\b/.test(body), 'outside_travel_technical');

  const finalTags = unique(tags);
  let category = 'general';
  if (finalTags.includes('support_problem')) category = 'support_problem';
  else if (finalTags.some((tag) => tag.startsWith('outside_travel_'))) category = 'outside_travel';
  else if (finalTags.includes('onboarding_start')) category = 'onboarding';
  else if (finalTags.includes('change_request')) category = 'itinerary_change';
  else if (finalTags.includes('approval_continue')) category = 'approval_continue';
  else if (finalTags.some((tag) => ['lodging', 'flights', 'cars_transport', 'restaurants_food', 'activities_experiences', 'shopping'].includes(tag))) category = 'travel_research';
  else if (finalTags.some((tag) => ['destination', 'dates', 'travelers', 'budget', 'constraints_preferences'].includes(tag))) category = 'trip_intake';
  else if (finalTags.includes('assistant_response')) category = 'assistant_response';

  const travelTags = finalTags.filter((tag) => !tag.startsWith('outside_travel_') && !['assistant_response', 'customer_request'].includes(tag));
  const outsideTags = finalTags.filter((tag) => tag.startsWith('outside_travel_'));
  const confidence = finalTags.length > 1 ? 0.85 : 0.55;

  return {
    category,
    tags: finalTags,
    source: 'deterministic_rules_v1',
    confidence,
    travelTags,
    outsideTags,
  };
}

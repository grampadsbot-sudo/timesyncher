import { contentTags } from './customer-intent.mjs';

function normalize(value, limit = 12000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const CONTENT_TAGS = Object.freeze([
  'onboarding_start',
  'approval_continue',
  'change_request',
  'destination',
  'dates',
  'travelers',
  'budget',
  'constraints_preferences',
  'lodging',
  'flights',
  'cars_transport',
  'restaurants_food',
  'activities_experiences',
  'shopping',
  'outside_travel_admin',
  'outside_travel_support',
  'outside_travel_marketing',
  'outside_travel_business',
  'outside_travel_technical',
]);

function categoryFor(tags) {
  if (tags.includes('support_problem')) return 'support_problem';
  if (tags.some((tag) => tag.startsWith('outside_travel_'))) return 'outside_travel';
  if (tags.includes('onboarding_start')) return 'onboarding';
  if (tags.includes('change_request')) return 'itinerary_change';
  if (tags.includes('approval_continue')) return 'approval_continue';
  if (tags.some((tag) => ['lodging', 'flights', 'cars_transport', 'restaurants_food', 'activities_experiences', 'shopping'].includes(tag))) return 'travel_research';
  if (tags.some((tag) => ['destination', 'dates', 'travelers', 'budget', 'constraints_preferences'].includes(tag))) return 'trip_intake';
  if (tags.includes('assistant_response') && !tags.includes('customer_request')) return 'assistant_response';
  return 'customer_turn';
}

const CONTENT_TAG_SET = new Set(CONTENT_TAGS);

/** Speaker and payload tags only. Customer-word tags come from the model. */
export function classifyTurn({ speaker = '', direction = '', channel = '', payload = {} } = {}) {
  const tags = [];
  if (speaker === 'assistant') tags.push('assistant_response');
  if (speaker === 'system' || /error/.test(String(channel || ''))) tags.push('support_problem');
  if (direction === 'inbound' || speaker === 'customer') tags.push('customer_request');
  if (payload?.voice || payload?.transcriptionModel) tags.push('voice_note');
  for (const tag of Array.isArray(payload?.contentTags) ? payload.contentTags : []) {
    const name = String(tag || '').trim();
    if (CONTENT_TAG_SET.has(name)) tags.push(name);
  }
  const finalTags = unique(tags);
  const category = categoryFor(finalTags);
  return {
    category,
    tags: finalTags,
    source: 'internal_speaker',
    confidence: finalTags.length ? 0.9 : 0.2,
    travelTags: [],
    outsideTags: [],
    ask: false,
  };
}

export async function classifyTurnWithModel(input = {}, options) {
  const base = classifyTurn(input);
  const text = normalize(input.text);
  if (!text || (base.tags.includes('assistant_response') && !base.tags.includes('customer_request'))) return base;
  try {
    const model = await contentTags(text, CONTENT_TAGS, options);
    const tags = unique([...base.tags, ...model.tags]);
    return {
      ...base,
      category: model.tags.length ? categoryFor(tags) : base.category,
      tags,
      source: model.tags.length ? 'model_intent' : base.source,
      confidence: model.tags.length ? 0.8 : base.confidence,
      travelTags: model.tags.filter((tag) => !tag.startsWith('outside_travel_')),
      outsideTags: model.tags.filter((tag) => tag.startsWith('outside_travel_')),
      ask: model.ask === true && model.tags.length === 0,
    };
  } catch (error) {
    return { ...base, ask: true, intentError: String(error?.message || error) };
  }
}

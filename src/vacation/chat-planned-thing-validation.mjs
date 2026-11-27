const PLAN_CATEGORIES = new Set(['activity', 'restaurant', 'hotel', 'flight', 'car', 'store']);
const FILLER_TITLES = new Set(['notes', 'them to those days', 'purple seventy bicycle']);
const STATUS_TITLE = /^(?:and )?nothing (?:has been|was|is) (?:booked|emailed|saved|sent)$/;
const TIME_ONLY_TITLE = /^(?:(?:start|arrive|leave)\s+)?(?:(?:at|around|by)\s+)?\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?[.!]?$/i;
const HOTEL_DAY_SHAPE = /\b(?:settle in|settle into|afternoon at the pool)\b|\b(?:and|then|with) pool time\b/;
const NON_ITEM_REQUEST = /^(?:(?:can|could|would) you\b|please (?:add|save|keep|tell|show)\b|we (?:would )?prefer\b|no more than\b|keep .+ open$)/;

function normalizedTitle(title, category) {
  const name = String(title ?? '').toLowerCase().replace(/['’]/g, '').replace(/\p{P}+/gu, ' ')
    .trim().replace(/^the(?:\s+|$)/, '').replace(/\s+/g, ' ');
  return category === 'car' ? name.replace(/^rides between the /, 'rides between ') : name;
}

export function validatePlannedThings(things, { customerOnly = false, existing = [] } = {}) {
  const keyFor = (category, name) => customerOnly ? name : `${category}:${name}`;
  const existingTitles = new Map();
  for (const thing of existing) {
    const key = keyFor(thing.category, normalizedTitle(thing.title, thing.category));
    const titles = existingTitles.get(key) || new Set();
    titles.add(String(thing.title || '').toLowerCase());
    existingTitles.set(key, titles);
  }
  const seen = new Set();
  return things.filter((thing) => {
    const title = String(thing?.title ?? '').trim();
    const category = thing?.category;
    const name = normalizedTitle(title, category);
    if (!name || FILLER_TITLES.has(name) || STATUS_TITLE.test(name) || TIME_ONLY_TITLE.test(title)) return false;
    if (category === 'hotel' && HOTEL_DAY_SHAPE.test(name)) return false;
    if (customerOnly && (!PLAN_CATEGORIES.has(category) || title.split(/\s+/).length > 12 || NON_ITEM_REQUEST.test(name))) return false;
    const key = keyFor(category, name);
    const titles = existingTitles.get(key);
    if (titles && (customerOnly || !titles.has(title.toLowerCase()))) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

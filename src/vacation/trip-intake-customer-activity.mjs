const ADD_ACTIVITY = /\badd\s+(?:an?\s+)?([^.,!?]{2,80}?)(?=\s+and\b|[,.!?]|$)/i;
const WEEKDAY_SUFFIX = /\s+on\s+(?:the\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b.*$/i;
const DENY_TITLE = /^(collaborator|person|someone|them|it|that|this)$/i;

export function customerNamedActivity(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const match = source.match(ADD_ACTIVITY);
  if (!match) return null;
  const title = match[1].replace(/\s+/g, ' ').trim().replace(WEEKDAY_SUFFIX, '').trim();
  if (!title || DENY_TITLE.test(title)) return null;
  return {
    title,
    category: 'activity',
    description: '',
    who: '',
    whenLabel: '',
    customerWhen: '',
    notes: [],
    collaboratorNotes: [],
    source: 'customer',
  };
}

export function namedCustomerActivities(text, activities = []) {
  const rows = Array.isArray(activities) ? [...activities] : [];
  const named = customerNamedActivity(text);
  if (!named) return rows;
  const key = named.title.toLowerCase();
  if (rows.some((thing) => String(thing?.title || thing?.name || '').toLowerCase() === key)) return rows;
  return [...rows, named];
}
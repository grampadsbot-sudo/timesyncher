const tokens = (value) => String(value || '').normalize('NFKD').toLowerCase()
  .replace(/['’‘]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const generic = new Set(['the', 'club', 'jazz', 'restaurant', 'bar', 'cafe', 'bakery', 'bistro', 'grill', 'at', 'and', 'new', 'york', 'city']);

export function pageMentionsVenue(text, title) {
  const body = ` ${tokens(text).join(' ')} `;
  const name = tokens(title);
  if (!name.length) return false;
  if (body.includes(` ${name.join(' ')} `)) return true;
  const first = name.findIndex((token) => !generic.has(token));
  if (first < 0 || name[first].length < 3) return false;
  const core = name.slice(first, first + 2);
  if (core.length > 1 && generic.has(core[1])) return body.includes(` ${core.join(' ')} `);
  return body.includes(` ${core[0]} `);
}

const words = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
const articles = new Set(['a', 'an', 'the']);
const negators = new Set(['no', 'not', 'never', 'none', 'nothing', 'nobody', 'neither']);
const auxiliaries = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would',
]);
const pronouns = new Set([
  'i', 'me', 'we', 'us', 'you', 'he', 'him', 'she', 'her', 'it', 'they', 'them',
  'this', 'that', 'these', 'those', 'someone', 'something', 'everyone', 'everything', 'each',
]);
const objectDeterminers = new Set(['a', 'an', 'the', 'my', 'your', 'our', 'their', 'its']);
const nounLinks = new Set(['and', 'or', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'to', 'with']);

function isTitledAuxiliaryName(raw, tokens, start) {
  const second = tokens[start + 1];
  if (!second || !/^\p{Lu}/u.test(raw[start]) || !/^\p{Lu}/u.test(raw[start + 1])) return false;
  if (objectDeterminers.has(second) || pronouns.has(second) || nounLinks.has(second)) return false;
  return raw.slice(start + 1).every((token, offset) => /^\p{Lu}/u.test(token) || nounLinks.has(tokens[start + 1 + offset]));
}

export function normalizeTripThingName(value) {
  const tokens = String(value ?? '').normalize('NFKC').toLowerCase().replaceAll('ß', 'ss')
    .replace(/['’]/gu, '').match(words) || [];
  return tokens.slice(articles.has(tokens[0]) ? 1 : 0).join(' ');
}

function hasClausePunctuation(text) {
  if (/[;:?!\p{Cc}]/u.test(text)) return true;
  for (const match of text.matchAll(/\s*\.\s+(?=\p{L}|\p{N})/gu)) {
    const preceding = text.slice(0, match.index).match(/\p{L}+$/u)?.[0];
    if (!preceding || preceding.length > 3 || !/^\p{Lu}/u.test(preceding)) return true;
  }
  return false;
}

export function isTripThingName(value) {
  if (typeof value !== 'string' || value.length > 280) return false;
  const text = value.normalize('NFKC').trim();
  const raw = text.match(words) || [];
  const tokens = raw.map((word) => word.toLowerCase().replaceAll('’', "'"));
  const start = articles.has(tokens[0]) ? 1 : 0;
  if (tokens.length <= start || tokens.length > 12 || !/\p{L}/u.test(text) || hasClausePunctuation(text)) return false;
  const first = tokens[start].split("'")[0];
  if (negators.has(first) || pronouns.has(first)) return false;
  const allowInitialAux = auxiliaries.has(first) && isTitledAuxiliaryName(raw, tokens, start);
  if (auxiliaries.has(first) && !allowInitialAux) return false;
  return !tokens.some((word, index) => {
    if (word.endsWith("n't") || negators.has(word)) return true;
    if (auxiliaries.has(word) && !(allowInitialAux && index === start)) return true;
    if (index <= start || !/^\p{Ll}/u.test(raw[index])) return false;
    const next = tokens[index + 1];
    if (word.endsWith('ed')) return !next || objectDeterminers.has(next) || pronouns.has(next);
    return word.endsWith('s') && next && (objectDeterminers.has(next) || pronouns.has(next));
  });
}

export function tripThingNameInText(label, text) {
  if (!isTripThingName(label)) return false;
  return ` ${normalizeTripThingName(text)} `.includes(` ${normalizeTripThingName(label)} `);
}

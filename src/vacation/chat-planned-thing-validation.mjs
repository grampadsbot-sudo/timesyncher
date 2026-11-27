const PLAN_CATEGORIES = new Set(['activity', 'restaurant', 'hotel', 'flight', 'car', 'store']);
const ARTICLES = new Set(['a', 'an', 'the']);
const PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);
const NEGATORS = new Set(['no', 'not', 'never', 'none', 'neither', 'nobody', 'nothing']);
const AUXILIARIES = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would']);
const NOUN_LINKS = new Set(['and', 'or', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'to', 'with']);
const DETERMINERS = new Set([...ARTICLES, 'this', 'that', 'these', 'those']);
const MAX_TITLE_LENGTH = 180;
const MAX_TITLE_WORDS = 12;

function normalizedTitle(title) {
  const words = String(title ?? '').normalize('NFKC').toLowerCase()
    .replace(/['’]/g, '').replace(/\p{P}+/gu, ' ').trim().split(/\s+/);
  if (ARTICLES.has(words[0])) words.shift();
  return words.join(' ');
}

function hasClause(tokens) {
  const words = tokens.map((token) => token.toLowerCase().replace(/’/g, "'"));
  const [first, second] = words;
  if (PRONOUNS.has(first) || NEGATORS.has(first)) return true;
  if (AUXILIARIES.has(first)) {
    if (!second || DETERMINERS.has(second) || PRONOUNS.has(second)) return true;
    if (tokens.slice(1).some((token, index) => !/^\p{Lu}/u.test(token) && !NOUN_LINKS.has(words[index + 1]))) return true;
  }
  return words.some((word, index) => {
    if (/(?:n't|'(?:m|re|ve|ll|d))$/.test(word) || NEGATORS.has(word)) return true;
    const previous = words[index - 1];
    const next = words[index + 1];
    if (!previous || !next || NOUN_LINKS.has(previous) || DETERMINERS.has(previous)) return false;
    if (AUXILIARIES.has(word)) return true;
    return (DETERMINERS.has(next) || PRONOUNS.has(next)) && /\p{Ll}{2,}(?:ed|s)$/u.test(tokens[index]);
  });
}

function isNameShape(title) {
  if (!title || title.length > MAX_TITLE_LENGTH || title.split(/\s+/).length > MAX_TITLE_WORDS) return false;
  if (/[;?\r\n]|[!:]\s*\p{L}|\p{L}{4,}\.\s+\p{L}|\p{Nd}{1,2}:\p{Nd}{2}/u.test(title)) return false;
  const tokens = title.match(/\p{L}[\p{L}\p{M}]*(?:['’]\p{L}+)?/gu) || [];
  return tokens.length > 0 && !hasClause(tokens);
}

export function validatePlannedThings(things, { customerOnly = false, existing = [] } = {}) {
  const keyFor = (category, name) => customerOnly ? name : `${category}:${name}`;
  const existingTitles = new Map();
  for (const thing of existing) {
    const key = keyFor(thing.category, normalizedTitle(thing.title));
    const titles = existingTitles.get(key) || new Set();
    titles.add(String(thing.title || '').toLowerCase());
    existingTitles.set(key, titles);
  }
  const seen = new Set();
  return things.filter((thing) => {
    const title = String(thing?.title ?? '').trim();
    const category = thing?.category;
    const name = normalizedTitle(title);
    if (!name || !isNameShape(title) || (customerOnly && !PLAN_CATEGORIES.has(category))) return false;
    const key = keyFor(category, name);
    const titles = existingTitles.get(key);
    if (titles && (customerOnly || !titles.has(title.toLowerCase()))) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

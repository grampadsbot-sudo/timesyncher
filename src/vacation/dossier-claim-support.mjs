const stopwords = new Set('the a an and or of to in on at for with from by is are was were be been as it its this that near'.split(' '));
const normalize = (value) => String(value || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const negation = (token) => /^(?:no|not|never|without|none|cannot|closed|unavailable|discontinued)$/.test(token) || /n't$/.test(token);
const contentTokens = (value) => value.match(/[a-z0-9]+/g)?.filter((token) => token.length >= 3 && !stopwords.has(token)) || [];
const numericTokens = (value) => value.match(/\$\s*\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?(?::\d{2})?(?:\s*(?:am|pm)\b)?|\$+/g)?.map((token) => token.replace(/\s+/g, '').replace(/(?:am|pm)$/, '').replace(/:00$/, '')) || [];

function tokenPolarities(value) {
  const polarities = new Map();
  for (const clause of normalize(value).split(/(?<!\d)[.!?]|[.!?](?!\d)|[;\n]|\b(?:but|however|although|yet)\b/)) {
    const tokens = clause.match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
    for (const [index, token] of tokens.entries()) {
      if (token.length < 3 || stopwords.has(token) || negation(token)) continue;
      const negative = tokens.slice(Math.max(0, index - 4), index + 5).some(negation);
      if (!polarities.has(token)) polarities.set(token, new Set());
      polarities.get(token).add(negative);
    }
  }
  return polarities;
}

export function claimTextContradictsPage(claimText, pageText) {
  const claim = tokenPolarities(claimText);
  const page = tokenPolarities(pageText);
  for (const [token, polarities] of claim) {
    const matched = page.get(token);
    if (!matched) continue;
    if (polarities.size > 1 || matched.size > 1 || [...polarities][0] !== [...matched][0]) return true;
  }
  return false;
}

export function claimTextWasRejected(value, rejected = []) {
  const candidate = normalize(value);
  return Boolean(candidate) && rejected.some((entry) => {
    const prior = normalize(entry);
    const words = (value) => value.match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
    return prior && (candidate.includes(prior)
      || prior.startsWith(candidate) && words(candidate).length >= words(prior).length * 0.6);
  });
}

export function claimTextVerdictEligible(value, verdicts = []) {
  return !verdicts.some((row) => normalize(row.text) === normalize(value) && row.supported !== true);
}

export function isFillerSummaryText(value, thing = '') {
  let body = normalize(value).replace(/(?:https?:\/\/|www\.)\S+/g, ' ');
  const subject = normalize(thing);
  if (subject) body = body.split(subject).join(' ');
  body = body.replace(/\bofficial(?:\s+[a-z0-9][a-z0-9'-]*){0,4}\s+(?:web\s*site|site|listing|page)\b|\bhome\s*page\b/g, ' ');
  body = body.replace(/\b(?:ta|tripadvisor|google|yelp)\s+(?=\d)/g, ' ')
    .replace(/\b\d+(?:[.,/]\d+)*\b/g, ' ');
  return contentTokens(body).length < 6;
}

export function claimTextSupportedByPage(claimText, pageText) {
  const claim = normalize(claimText);
  const page = normalize(pageText);
  if (!claim || !page) return false;
  if (claimTextContradictsPage(claim, page)) return false;
  const pageNumbers = new Set(numericTokens(page));
  if (numericTokens(claim).some((token) => !pageNumbers.has(token))) return false;
  if (page.includes(claim)) return true;
  const tokens = contentTokens(claim);
  const pageTokens = new Set(contentTokens(page));
  return tokens.length > 0 && tokens.filter((token) => pageTokens.has(token)).length / tokens.length >= 0.5;
}

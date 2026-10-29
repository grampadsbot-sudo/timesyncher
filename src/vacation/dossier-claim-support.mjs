const stopwords = new Set('the a an and or of to in on at for with from by is are was were be been as it its this that near'.split(' '));
const normalize = (value) => String(value || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const negation = (token) => /^(?:no|not|never|without|none|non|cannot|closed|unavailable|discontinued)$/.test(token) || /n't$/.test(token);
const contentTokens = (value) => value.match(/[a-z0-9]+/g)?.filter((token) => token.length >= 3 && !stopwords.has(token)) || [];
const numericTokens = (value) => value.match(/\$\s*\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?(?::\d{2})?(?:\s*(?:am|pm)\b)?|\$+/g)?.map((token) => token.replace(/\s+/g, '').replace(/(?:am|pm)$/, '').replace(/:00$/, '')) || [];

const clauseSplit = /(?<!\d)[.!?]|[.!?](?!\d)|[;\n|]|\u2026|\b(?:but|however|although|yet)\b/;

function tokenNegativePolarity(tokens, index) {
  if (index > 0 && tokens[index - 1] === 'non') return true;
  return tokens.slice(Math.max(0, index - 4), index + 5).some((token) => token !== 'non' && negation(token));
}

function tokenPolarities(value) {
  const polarities = new Map();
  for (const clause of normalize(value).split(clauseSplit)) {
    const tokens = clause.match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
    for (const [index, token] of tokens.entries()) {
      if (token.length < 3 || stopwords.has(token) || negation(token)) continue;
      const negative = tokenNegativePolarity(tokens, index);
      if (!polarities.has(token)) polarities.set(token, new Set());
      polarities.get(token).add(negative);
    }
  }
  return polarities;
}

function polarityMapsConflict(claimMap, pageMap) {
  for (const [token, polarities] of claimMap) {
    const matched = pageMap.get(token);
    if (!matched) continue;
    if (polarities.size > 1) return true;
    if (matched.size > 1) continue;
    if ([...polarities][0] !== [...matched][0]) return true;
  }
  return false;
}

function sharedContentTokenList(claimText, clauseText) {
  const claimTokens = new Set(contentTokens(normalize(claimText)));
  return contentTokens(normalize(clauseText)).filter((token) => claimTokens.has(token));
}

function clauseIsClaimFragment(claimNorm, clauseText) {
  const clause = normalize(clauseText).trim();
  if (!clause) return true;
  if (claimNorm.includes(clause)) return true;
  if (clause.includes(claimNorm)) return true;
  return false;
}

function clauseOutsideClaim(claimNorm, clauseText) {
  const clause = normalize(clauseText);
  if (!clause.includes(claimNorm)) return clause;
  return clause.split(claimNorm).join(' ');
}

function verbatimClaimContradictsPage(claimText, pageText) {
  const claimNorm = normalize(claimText);
  const claimMap = tokenPolarities(claimText);
  for (const clause of normalize(pageText).split(clauseSplit)) {
    const clauseNorm = normalize(clause).trim();
    if (!clauseNorm) continue;
    let probeText = clause;
    if (clauseNorm.includes(claimNorm)) {
      probeText = clauseOutsideClaim(claimNorm, clause);
      if (!normalize(probeText).trim()) continue;
    } else if (clauseIsClaimFragment(claimNorm, clause)) {
      continue;
    }
    const shared = sharedContentTokenList(claimText, probeText);
    if (shared.length < 2) continue;
    const clauseMap = tokenPolarities(probeText);
    for (const token of shared) {
      const claimPol = claimMap.get(token);
      const clausePol = clauseMap.get(token);
      if (!claimPol || !clausePol || claimPol.size > 1 || clausePol.size > 1) continue;
      if ([...claimPol][0] !== [...clausePol][0]) return true;
    }
  }
  return false;
}

export function claimTextContradictsPage(claimText, pageText) {
  const claimNorm = normalize(claimText);
  const pageNorm = normalize(pageText);
  if (claimNorm && pageNorm.includes(claimNorm)) {
    return verbatimClaimContradictsPage(claimText, pageText);
  }
  return polarityMapsConflict(tokenPolarities(claimText), tokenPolarities(pageText));
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
  if (claimTextContradictsPage(claimText, pageText)) return false;
  const pageNumbers = new Set(numericTokens(page));
  if (numericTokens(claim).some((token) => !pageNumbers.has(token))) return false;
  if (page.includes(claim)) return true;
  const tokens = contentTokens(claim);
  const pageTokens = new Set(contentTokens(page));
  return tokens.length > 0 && tokens.filter((token) => pageTokens.has(token)).length / tokens.length >= 0.5;
}

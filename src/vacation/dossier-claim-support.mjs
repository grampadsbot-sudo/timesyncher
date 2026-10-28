const stopwords = new Set('the a an and or of to in on at for with from by is are was were be been as it its this that near'.split(' '));
const normalize = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
const contentTokens = (value) => value.match(/[a-z0-9]+/g)?.filter((token) => token.length >= 3 && !stopwords.has(token)) || [];
const numericTokens = (value) => value.match(/\$\s*\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?(?::\d{2})?(?:\s*(?:am|pm)\b)?|\$+/g)?.map((token) => token.replace(/\s+/g, '').replace(/(?:am|pm)$/, '').replace(/:00$/, '')) || [];

export function claimTextSupportedByPage(claimText, pageText) {
  const claim = normalize(claimText);
  const page = normalize(pageText);
  if (!claim || !page) return false;
  if (page.includes(claim)) return true;
  const pageNumbers = new Set(numericTokens(page));
  if (numericTokens(claim).some((token) => !pageNumbers.has(token))) return false;
  const tokens = contentTokens(claim);
  const pageTokens = new Set(contentTokens(page));
  return tokens.length > 0 && tokens.filter((token) => pageTokens.has(token)).length / tokens.length >= 0.5;
}

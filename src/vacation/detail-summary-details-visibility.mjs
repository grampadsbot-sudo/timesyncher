function text(value) {
  return String(value ?? '');
}

export function normDetailText(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function splitDetailSentences(value) {
  const raw = text(value);
  const chunks = raw
    .split(/(?:\n+|(?<=[.!?])\s+)/)
    .map((row) => normDetailText(row))
    .filter(Boolean);
  if (!chunks.length) {
    const single = normDetailText(raw);
    return single ? [single] : [];
  }
  return chunks;
}

export function sentenceWordCount(value) {
  return normDetailText(value).split(/\s+/).filter(Boolean).length;
}

export function sentencesShareVisibleText(left, right, minWords = 8) {
  const a = normDetailText(left);
  const b = normDetailText(right);
  if (sentenceWordCount(a) < minWords || sentenceWordCount(b) < minWords) return false;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return al === bl || al.includes(bl) || bl.includes(al);
}

function textsAreNearDuplicate(summary, details) {
  const a = normDetailText(summary);
  const b = normDetailText(details);
  if (!a || !b) return false;
  if (a === b) return true;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return true;
  const short = al.length <= bl.length ? al : bl;
  const long = al.length > bl.length ? al : bl;
  if (long.includes(short) && short.length >= Math.min(80, Math.floor(long.length * 0.9))) return true;
  return false;
}

function stripSharedSentences(summary, details, minWords = 8) {
  const summarySentences = splitDetailSentences(summary);
  const detailParts = text(details).split(/\n+/).map((row) => row.trim()).filter(Boolean);
  const kept = detailParts.filter((part) => {
    if (!part) return false;
    if (sentencesShareVisibleText(summary, part, minWords)) return false;
    return !summarySentences.some((sentence) => sentencesShareVisibleText(sentence, part, minWords));
  });
  return kept.join('\n').trim();
}

export function tsVisibleSummaryAndDetails(summary, details) {
  const sum = normDetailText(summary);
  const detailRaw = text(details).trim();
  const detailNorm = normDetailText(details);
  if (!sum && !detailNorm) return { summary: '', details: '' };
  if (!sum) return { summary: '', details: detailRaw };
  if (!detailNorm) return { summary: sum, details: '' };
  if (textsAreNearDuplicate(sum, detailNorm)) {
    if (sum.length <= detailNorm.length) return { summary: sum, details: '' };
    return { summary: '', details: detailRaw };
  }
  const detailsOut = stripSharedSentences(sum, detailRaw, 8);
  return { summary: sum, details: detailsOut };
}

export function detailSummaryDetailsBundleSnippet() {
  return [
    normDetailText,
    splitDetailSentences,
    sentenceWordCount,
    sentencesShareVisibleText,
    textsAreNearDuplicate,
    stripSharedSentences,
    tsVisibleSummaryAndDetails,
  ]
    .map((fn) => `${fn.name}=${fn.toString()},`)
    .join('');
}

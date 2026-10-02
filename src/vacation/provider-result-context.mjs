function webResultAliases(name) {
  const aliases = new Set();
  const base = String(name || '').trim();
  if (base) aliases.add(base.toLowerCase());
  for (const part of base.split(/[|/–—-]/)) {
    const piece = part.trim();
    if (piece.length >= 3) aliases.add(piece.toLowerCase());
  }
  return aliases;
}

function textMentionsPhrase(text, phrase) {
  const esc = String(phrase || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, 'iu').test(String(text || ''));
}

function normalizePlaceTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().replace(/\.+$/g, '').trim();
}

function placeTitle(row) {
  if (typeof row === 'string') return normalizePlaceTitle(row.split(':')[0]);
  return normalizePlaceTitle(row?.title || row?.name || '');
}

function rejectedOrPriorRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.rejected === true || row.relevanceRejected === true || row.notCitableAsResult === true) return true;
  const source = String(row.source || row.sourceRef?.source || '').trim().toLowerCase();
  return source === 'prior_db';
}

export function citablePlaceTitles(inTurnResults = []) {
  const titles = [];
  const seen = new Set();
  for (const row of Array.isArray(inTurnResults) ? inTurnResults : []) {
    if (rejectedOrPriorRow(row)) continue;
    const title = placeTitle(row);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

export function applyInTurnCitablePlaces(facts, inTurnResults) {
  if (!facts || typeof facts !== 'object') return facts;
  if (!Array.isArray(inTurnResults) || !inTurnResults.length) return facts;
  const citablePlaces = citablePlaceTitles(inTurnResults);
  const citableKeys = new Set(citablePlaces.map((title) => title.toLowerCase()));
  const notCitableAsResult = [];
  const remember = (row) => {
    const title = placeTitle(row);
    const key = title.toLowerCase();
    if (!title || citableKeys.has(key)) return;
    if (notCitableAsResult.some((item) => item.toLowerCase() === key)) return;
    notCitableAsResult.push(title);
  };
  for (const item of facts.itinerary || []) remember(item);
  for (const item of facts.survivingPriorDbTitles || []) remember(item);
  for (const item of facts.relevanceRejections || []) remember(item);
  for (const item of facts.priorPlaces || []) remember(item);
  const itinerary = (Array.isArray(facts.itinerary) ? facts.itinerary : []).flatMap((item) => {
    const title = placeTitle(item);
    if (!title || !citableKeys.has(title.toLowerCase())) return [];
    return [typeof item === 'string' ? item : title];
  });
  const replyFacts = { ...facts, itinerary, citablePlaces };
  delete replyFacts.survivingPriorDbTitles;
  delete replyFacts.relevanceRejections;
  delete replyFacts.priorPlaces;
  if (notCitableAsResult.length) {
    replyFacts.notCitableAsResult = notCitableAsResult;
    replyFacts.notCitableAsResultRule = 'notCitableAsResult places are not results from this turn. Cite only citablePlaces.';
  }
  return replyFacts;
}

function inTurnPlaceRows(sources) {
  return (Array.isArray(sources) ? sources : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const name = String(item.name ?? item.title ?? '').trim();
    if (!name) return [];
    return [{ name }];
  });
}

function venuePhraseSourced(phrase, rows) {
  const lower = String(phrase || '').trim().toLowerCase();
  if (!lower) return false;
  for (const row of rows) {
    for (const alias of webResultAliases(row.name)) {
      if (lower === alias || lower.includes(alias) || alias.includes(lower)) return true;
    }
  }
  return false;
}

function inventedVenueMentions(text, rows) {
  if (!rows.length) return [];
  const flagged = [];
  for (const match of String(text || '').matchAll(/\b(?:at|near|including|from|visit)\s+([\p{Lu}][\p{L}'’&-]+(?:\s+[\p{Lu}][\p{L}'’&-]+)*)/gu)) {
    const phrase = match[1].replace(/\s+/g, ' ').trim();
    if (!phrase || venuePhraseSourced(phrase, rows)) continue;
    flagged.push(phrase);
  }
  return flagged;
}

function spokenPlaceName(text, index) {
  const before = String(text || '').slice(Math.max(0, index - 80), index);
  return (before.match(/([\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+[\p{Lu}][\p{L}\p{M}'’.-]*)*)\s*$/u) || [])[1] || '';
}

export function placeResultExtra(sources) {
  const items = Array.isArray(sources) ? sources : [];
  const parts = items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    if (rejectedOrPriorRow(item)) return [];
    const name = normalizePlaceTitle(item.name ?? item.title ?? '');
    return name ? [name] : [];
  });
  if (!parts.length) return '';
  return `Results: ${parts.join('; ')}.`;
}

export function unsourcedAgainstInTurnResults(reply, sources) {
  const text = String(reply || '');
  const rows = inTurnPlaceRows(sources);
  if (!rows.length) return [];
  const flagged = new Set(inventedVenueMentions(text, rows));
  for (const match of text.matchAll(/\(id:([^)\s]+)\)/g)) {
    const spoken = spokenPlaceName(text, match.index);
    if (spoken && !venuePhraseSourced(spoken, rows)) flagged.add(spoken);
  }
  return [...flagged];
}

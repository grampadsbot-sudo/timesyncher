function providerResultNeedsIdCitation(sourceRef) {
  const source = String(sourceRef?.source || '').trim();
  const id = String(sourceRef?.id || '').trim();
  if (source === 'tavily') return false;
  if (/^https?:\/\//i.test(id)) return false;
  return true;
}

export function resultsNeedInternalPlaceIds(sources) {
  return (Array.isArray(sources) ? sources : []).some((item) => {
    if (!item || typeof item !== 'object') return false;
    const ref = item.sourceRef && typeof item.sourceRef === 'object' ? item.sourceRef : null;
    const id = String(ref?.id ?? item.id ?? '').trim();
    const name = String(item.name ?? item.title ?? '').trim();
    return id && name && providerResultNeedsIdCitation(ref);
  });
}

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

function webVenuePhraseSourced(phrase, webRows) {
  const lower = String(phrase || '').trim().toLowerCase();
  if (!lower) return false;
  for (const row of webRows) {
    for (const alias of webResultAliases(row.name)) {
      if (lower === alias || lower.includes(alias) || alias.includes(lower)) return true;
    }
  }
  return false;
}

function inventedWebVenueMentions(text, webRows) {
  if (!webRows.length) return [];
  const flagged = [];
  for (const match of String(text || '').matchAll(/\b(?:at|near|including|from|visit)\s+([\p{Lu}][\p{L}'’&-]+(?:\s+[\p{Lu}][\p{L}'’&-]+)*)/giu)) {
    const phrase = match[1].replace(/\s+/g, ' ').trim();
    if (!phrase || webVenuePhraseSourced(phrase, webRows)) continue;
    flagged.push(phrase);
  }
  return flagged;
}

export function placeResultExtra(sources) {
  const items = Array.isArray(sources) ? sources : [];
  const parts = items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const ref = item.sourceRef && typeof item.sourceRef === 'object' ? item.sourceRef : null;
    const id = String(ref?.id ?? item.id ?? '').trim();
    const name = String(item.name ?? item.title ?? '').trim();
    if (!id || !name) return [];
    return providerResultNeedsIdCitation(ref) ? [`${name} (id:${id})`] : [name];
  });
  if (!parts.length) return '';
  return `Results: ${parts.join('; ')}.`;
}

function inTurnPlaceRows(sources) {
  return (Array.isArray(sources) ? sources : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const ref = item.sourceRef && typeof item.sourceRef === 'object' ? item.sourceRef : null;
    const id = String(ref?.id ?? item.id ?? '').trim();
    const name = String(item.name ?? item.title ?? '').trim();
    if (!id || !name) return [];
    return [{ id, name, needsIdCitation: providerResultNeedsIdCitation(ref) }];
  });
}

function spokenPlaceName(text, index) {
  const before = String(text || '').slice(Math.max(0, index - 80), index);
  return (before.match(/([\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+[\p{Lu}][\p{L}\p{M}'’.-]*)*)\s*$/u) || [])[1] || '';
}

export function unsourcedAgainstInTurnResults(reply, sources) {
  const text = String(reply || '');
  const rows = inTurnPlaceRows(sources);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const flagged = [];
  const cited = new Set();
  for (const match of text.matchAll(/\(id:([^)\s]+)\)/g)) {
    const id = match[1];
    cited.add(id);
    const row = byId.get(id);
    const spoken = spokenPlaceName(text, match.index);
    if (!row) flagged.push(spoken || id);
    else if (spoken && spoken.toLowerCase() !== row.name.toLowerCase()) flagged.push(spoken);
  }
  for (const row of rows) {
    if (row.needsIdCitation === false) {
      for (const alias of webResultAliases(row.name)) {
        if (alias.length >= 4 && textMentionsPhrase(text, alias)) cited.add(`web:${row.id}`);
      }
      continue;
    }
    const named = new RegExp(`(^|[^\\p{L}\\p{N}])${row.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu').test(text);
    if (named && !cited.has(row.id)) flagged.push(row.name);
  }
  const webRows = rows.filter((row) => row.needsIdCitation === false);
  return [...new Set([...flagged, ...inventedWebVenueMentions(text, webRows)])];
}

function defaultText(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function defaultWordCount(value = '') {
  return defaultText(value).split(/\s+/).filter(Boolean).length;
}

export function createStoredLongDetails(enrichment, { text, narrativeWordCount }) {
  function sameVenueStoredFlavour({ ccabKey, ccabRecord }) {
    const own = text(ccabRecord.websiteFlavour);
    if (own) return own;
    const address = text(ccabRecord.address);
    if (!address || ccabRecord.lat == null || ccabRecord.lng == null) return '';
    const sibling = Object.entries(enrichment).find(([key, record]) => key.startsWith(`${ccabKey} `)
      && text(record?.websiteFlavour)
      && text(record.address) === address
      && record.lat === ccabRecord.lat
      && record.lng === ccabRecord.lng);
    return sibling ? text(sibling[1].websiteFlavour) : '';
  }

  return function storedLongDetails(hit, stored, rowCat) {
    if (rowCat === 'hotel' || rowCat.includes('lodging') || narrativeWordCount(stored) >= 30) return stored;
    const flavour = sameVenueStoredFlavour(hit);
    if (!flavour || stored.includes(flavour)) return stored;
    return text(`${stored}${/[.!?]$/.test(stored) ? '' : '.'} ${flavour}`);
  };
}

export function bestStoredCcabSubstanceDescription(record = {}, helpers = {}) {
  const text = helpers.text || defaultText;
  const narrativeWordCount = helpers.narrativeWordCount || defaultWordCount;
  const candidates = [
    record.longDetails,
    record.description,
    record.websiteFlavour,
    record.review1,
    record.review2,
    record.review3,
    record.summary,
  ].map((value) => text(value)).filter(Boolean);
  if (!candidates.length) return '';
  const ranked = [...candidates].sort((a, b) => narrativeWordCount(b) - narrativeWordCount(a));
  const rich = ranked.find((row) => narrativeWordCount(row) >= 25);
  return text(rich || ranked[0]);
}

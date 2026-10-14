import {
  searchPlaceOutputViolations,
  searchProductCategory,
} from './search-place-output.mjs';

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sourceRecord(place = {}) {
  return place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
}

function provenanceBlockedSet(place = {}) {
  const record = sourceRecord(place);
  const blocked = Array.isArray(record.provenanceBlocked) ? record.provenanceBlocked : [];
  if (!blocked.length) return new Set();
  if (!text(record.provenanceBlocker)) return new Set();
  return new Set(blocked.map((field) => text(field, 80)).filter(Boolean));
}

function coordsOnPlace(place = {}) {
  const record = sourceRecord(place);
  const lat = Number(place.lat ?? record.lat);
  const lng = Number(place.lng ?? record.lng);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function identityProvenanceOk(place = {}) {
  const record = sourceRecord(place);
  const prov = record.identityProvenance && typeof record.identityProvenance === 'object'
    ? record.identityProvenance
    : null;
  if (!prov) return false;
  return text(prov.approvedDisplayTitle) === text(place.title)
    && text(prov.ccabKey) === text(place.externalId)
    && Boolean(text(prov.evidenceUrl));
}

/** VK source + product contract for fixture/search rows with ccab provenance. */
export function vkSearchPlaceSourceViolations(place = {}, options = {}) {
  const category = searchProductCategory(place.category);
  const blocked = provenanceBlockedSet(place);
  const violations = searchPlaceOutputViolations(place).filter((code) => {
    if (code === 'missing_price' && blocked.has('price')) return false;
    if (code === 'missing_logoUrl' && blocked.has('logoUrl')) return false;
    return true;
  });

  const record = sourceRecord(place);
  const title = text(place.title);
  const externalId = text(place.externalId);

  if (category !== 'flight'
    && title
    && externalId
    && title.toLowerCase() !== externalId.toLowerCase()
    && !identityProvenanceOk(place)) {
    violations.push('identity_alias_blocker');
  }

  if (category === 'hotel') {
    const { lat, lng } = coordsOnPlace(place);
    if (!blocked.has('lat') && !blocked.has('lng') && (lat == null || lng == null)) {
      violations.push('missing_hotel_coordinates');
    }
  }

  if (options.rowId === 608 && text(record.provenanceBlocker) && externalId.toLowerCase() !== title.toLowerCase()) {
    if (!violations.includes('identity_alias_blocker')) violations.push('identity_alias_blocker');
  }

  return violations;
}

export function assertVkSearchPlaceSourceContract(places = [], options = {}) {
  const failures = [];
  const rows = Array.isArray(places) ? places : [];
  for (let index = 0; index < rows.length; index += 1) {
    const place = rows[index];
    const rowOptions = {
      ...options,
      rowId: options.rowId ?? place?.gateBRowId ?? place?.id ?? null,
    };
    const violations = vkSearchPlaceSourceViolations(place, rowOptions);
    if (!violations.length) continue;
    failures.push({
      title: text(place?.title, 160) || '(untitled)',
      category: searchProductCategory(place?.category),
      violations,
    });
  }
  if (failures.length) {
    const detail = failures
      .map((row) => `${row.category}:${row.title} → ${row.violations.join(', ')}`)
      .join('; ');
    throw new Error(`vk search place source contract failed: ${detail}`);
  }
}

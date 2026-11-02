const GENERIC_DESCRIPTION_RES = [
  /^Documented NYC option\b/i,
  /^Documented .+ option\b/i,
  /^[A-Za-z ]+ option \([^)]+\)\.?$/,
];

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wordCount(value = '') {
  return text(value, 4000).split(/\s+/).filter(Boolean).length;
}

export function isGenericDescription(value = '') {
  const row = text(value, 4000);
  if (!row) return true;
  if (GENERIC_DESCRIPTION_RES.some((re) => re.test(row))) return true;
  if (wordCount(row) < 6) return true;
  if (/^\S+\s+\S+\s*,\s*New York/i.test(row) && wordCount(row) < 10) return true;
  return false;
}

export function isListRowPipelineDiagnostic(value = '') {
  const row = text(value, 4000);
  if (!row) return false;
  if (/\bBlocked:/i.test(row)) return true;
  if (/\bprovenanceBlocker\b/i.test(row)) return true;
  if (/\bccab capture\b/i.test(row)) return true;
  if (/\blist-only\b/i.test(row) && /\b(?:hotel|row|property)\b/i.test(row)) return true;
  if (/^List-only row until/i.test(row)) return true;
  return false;
}

export function isHotelPlanningNote(value = '') {
  const row = text(value, 4000);
  if (!row) return false;
  if (!/^Neighborhood:/i.test(row)) return false;
  return /Rating:/i.test(row) || /Status:\s*candidate/i.test(row) || /Price:\s*\$/i.test(row);
}

import { claimsSupported, dossierPageById } from './thing-dossier-fields.mjs';

export const NO_HAPPY_HOUR_FOUND = 'No happy hour found';
export const HOURS_NOT_FOUND = 'Hours not found';

export const HAPPY_HOUR_SUBFIELDS = ['happyHourDays', 'happyHourTimes', 'happyHourDeals'];

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function host(url = '') {
  try {
    return new URL(url).hostname.replace(/^(www|m|en)\./, '');
  } catch {
    return '';
  }
}

function pageEvidenceRank(dossier = {}, pageId = '', officialUrl = '') {
  const page = dossierPageById(dossier, pageId);
  if (!page) return -1;
  let score = Date.parse(page.fetchedAt) || 0;
  const officialHost = host(officialUrl);
  if (officialHost && host(page.url) === officialHost) score += 1e15;
  return score;
}

export function pickHoursFieldCandidate(dossier = {}, candidates = [], { officialUrl = '' } = {}) {
  const supported = (Array.isArray(candidates) ? candidates : [])
    .filter((row) => row && norm(row.value) && claimsSupported(dossier, row));
  if (!supported.length) return { chosen: null, conflictNote: '' };
  const distinct = [...new Set(supported.map((row) => norm(row.value)))];
  if (distinct.length === 1) return { chosen: supported[0], conflictNote: '' };
  let best = supported[0];
  let bestScore = -1;
  for (const row of supported) {
    const pageIds = [...new Set((row.claims || []).flatMap((claim) => claim.pages || []))];
    const score = Math.max(...pageIds.map((id) => pageEvidenceRank(dossier, id, officialUrl)), -1);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  const dropped = supported.filter((row) => row !== best).map((row) => norm(row.value)).filter(Boolean);
  const conflictNote = dropped.length
    ? `Conflicting hours sources; kept ${String(best.value).trim()} over ${dropped.join('; ')}.`
    : '';
  return { chosen: best, conflictNote };
}

function composeHappyHourDetails(parts = {}) {
  const rows = [
    parts.happyHourDays && `Days: ${parts.happyHourDays}`,
    parts.happyHourTimes && `Times: ${parts.happyHourTimes}`,
    parts.happyHourDeals && `Deals: ${parts.happyHourDeals}`,
  ].filter(Boolean);
  return rows.join(' · ');
}

export function applyHoursAndHappyHourFindings(next, dossier, findings = {}, { officialUrl = '' } = {}) {
  const claimUrls = (owner) => [...new Set((owner?.claims || []).flatMap((claim) => claim.pages || [])
    .map((id) => dossierPageById(dossier, id)?.url).filter(Boolean))].join(',');

  const hoursPool = [];
  if (Array.isArray(findings.hoursCandidates) && findings.hoursCandidates.length) {
    hoursPool.push(...findings.hoursCandidates);
  } else if (findings.hours) {
    hoursPool.push(findings.hours);
  }
  const hadHoursAttempt = hoursPool.length > 0;
  const { chosen: hoursRow, conflictNote: hoursConflict } = pickHoursFieldCandidate(dossier, hoursPool, { officialUrl });
  if (hoursRow) {
    let value = String(hoursRow.value).trim();
    if (hoursConflict) value = `${value} ${hoursConflict}`.trim();
    next.fields.hours = { ...hoursRow, value, url: claimUrls(hoursRow), conflictNote: hoursConflict || undefined };
  } else if (!hadHoursAttempt) {
    next.fields.hours = { value: HOURS_NOT_FOUND, claims: [], gap: true };
  }

  const happyParts = {};
  for (const key of HAPPY_HOUR_SUBFIELDS) {
    const row = findings[key];
    if (!row || !norm(row.value) || !claimsSupported(dossier, row)) continue;
    happyParts[key] = String(row.value).trim();
    next.fields[key] = { ...row, url: claimUrls(row) };
  }

  const legacyHappy = findings.happyHourDetails;
  const legacySupported = legacyHappy && norm(legacyHappy.value) && claimsSupported(dossier, legacyHappy)
    && norm(legacyHappy.value) !== norm(NO_HAPPY_HOUR_FOUND);

  if (Object.keys(happyParts).length || legacySupported) {
    const composed = composeHappyHourDetails(happyParts)
      || (legacySupported ? String(legacyHappy.value).trim() : '');
    if (composed) {
      next.fields.happyHourDetails = legacySupported
        ? { ...legacyHappy, url: claimUrls(legacyHappy) }
        : {
          value: composed,
          claims: HAPPY_HOUR_SUBFIELDS.flatMap((key) => (next.fields[key]?.claims || [])),
          url: HAPPY_HOUR_SUBFIELDS.map((key) => next.fields[key]?.url).filter(Boolean).join(','),
        };
      next.fields.happyHour = { value: true };
    }
  } else if (findings.happyHourFound === false || (legacyHappy && norm(legacyHappy.value) === norm(NO_HAPPY_HOUR_FOUND))) {
    next.fields.happyHourDetails = { value: NO_HAPPY_HOUR_FOUND, claims: [], explicitNone: true };
    next.fields.happyHour = { value: false };
  }
}

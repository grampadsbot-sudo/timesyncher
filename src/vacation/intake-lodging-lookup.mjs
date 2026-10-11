import { PlaceSearchError } from './place-search-error.mjs';

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function intakeLodgingLookupQuery(propertyName, areaHint = '') {
  const name = clean(propertyName, 180);
  const area = clean(areaHint, 180);
  if (!name) return area;
  if (!area) return name;
  return `${name}, ${area}`.slice(0, 240);
}

export function intakeLodgingLookupMissDiagnostic({
  propertyName = '',
  query = '',
  reason = '',
  provider = '',
  providerAttempts = [],
} = {}) {
  return {
    status: 'miss',
    property: clean(propertyName, 180),
    query: clean(query, 500),
    provider: clean(provider, 80),
    reason: clean(reason, 240),
    providers: (Array.isArray(providerAttempts) ? providerAttempts : []).slice(0, 12),
  };
}

export function intakeLodgingLookupOkDiagnostic({
  propertyName = '',
  query = '',
  provider = '',
  providerAttempts = [],
  thingId = '',
  addressSource = '',
  coordsSource = '',
  pickRanking = null,
} = {}) {
  const ranking = pickRanking && typeof pickRanking === 'object' ? pickRanking : null;
  return {
    status: 'ok',
    property: clean(propertyName, 180),
    query: clean(query, 500),
    provider: clean(provider, 80),
    thingId: clean(thingId, 80),
    ...(addressSource ? { addressSource: clean(addressSource, 80) } : {}),
    ...(coordsSource ? { coordsSource: clean(coordsSource, 80) } : {}),
    ...(ranking ? { pickRanking: ranking } : {}),
    providers: (Array.isArray(providerAttempts) ? providerAttempts : []).slice(0, 12),
  };
}

export function intakeLodgingLookupProviderFailure(error, providerAttempts = []) {
  if (error instanceof PlaceSearchError && error.code === 'missing_key') return true;
  const attempts = Array.isArray(providerAttempts) ? providerAttempts : (Array.isArray(error?.providers) ? error.providers : []);
  if (attempts.some((row) => String(row?.status || '').toLowerCase() === 'error')) return true;
  if (error instanceof PlaceSearchError) {
    const code = String(error.code || '').trim();
    if (code && code !== 'all_providers_failed' && code !== 'prior_db_sole_source' && code !== 'relevance_rejected_all') return true;
  }
  if (!(error instanceof PlaceSearchError) && error) return true;
  return false;
}

export function intakeLodgingLookupWithEvidence(diagnostic = {}, search = {}) {
  const providers = (Array.isArray(search?.providers) ? search.providers : []).map((row) => ({
    ...row,
    rawResults: Array.isArray(row.rawResults) ? row.rawResults : [],
  }));
  return {
    ...diagnostic,
    providers,
  };
}

export function primaryLodgingLookupProvider(providerAttempts = []) {
  const attempts = Array.isArray(providerAttempts) ? providerAttempts : [];
  const errored = attempts.find((row) => String(row?.status || '').toLowerCase() === 'error');
  if (errored) return String(errored.provider || '').trim();
  const withResults = attempts.find((row) => Number(row?.resultCount) > 0);
  if (withResults) return String(withResults.provider || '').trim();
  const live = attempts.find((row) => row?.provider && row.provider !== 'prior_db');
  return live ? String(live.provider || '').trim() : String(attempts[0]?.provider || '').trim();
}

import { cleanText } from './http.mjs';

function clean(value, max) {
  return cleanText(value, max);
}

export async function searchIntakePlace({ destination = '', title = '', query = '' } = {}) {
  const placeQuery = clean(query || destination || title, 180);
  if (!placeQuery) return { ok: false, error: 'trip place was not in the extraction' };
  try {
    const { runPublicResearch } = await import('../../scripts/vacation-public-research-worker.mjs');
    const result = await runPublicResearch({
      artifacts: { destination: placeQuery, requestText: placeQuery },
    });
    if (!Number(result?.sourceBackedCandidateCount)) {
      return { ok: false, error: clean(result?.note || result?.status || 'live search returned no place', 300) };
    }
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: clean(error?.message || error, 300) || 'live search failed' };
  }
}

export async function resolveIntakePlace({
  destination = '',
  title = '',
  destinationError = null,
  titleError = null,
  searchImpl = searchIntakePlace,
} = {}) {
  const namedDestination = clean(destination, 180);
  const namedTitle = clean(title, 180);
  const query = namedDestination || namedTitle;
  if (!query) {
    return {
      destination: '',
      title: '',
      destinationError: destinationError || 'trip place was not in the extraction',
      titleError: titleError || 'trip title was not in the extraction',
    };
  }
  if (namedDestination && namedTitle && !destinationError && !titleError) {
    return {
      destination: namedDestination,
      title: namedTitle,
      destinationError: null,
      titleError: null,
    };
  }
  let found;
  try {
    found = await searchImpl({ destination: namedDestination, title: namedTitle, query });
  } catch (error) {
    found = { ok: false, error: error?.message || error };
  }
  if (!found || found.ok !== true) {
    const error = clean(found?.error || 'live search returned no place', 300);
    return { destination: '', title: '', destinationError: error, titleError: error };
  }
  return {
    destination: namedDestination,
    title: namedTitle,
    destinationError: namedDestination ? null : (destinationError || 'trip place was not in the extraction'),
    titleError: namedTitle ? null : (titleError || 'trip title was not in the extraction'),
  };
}

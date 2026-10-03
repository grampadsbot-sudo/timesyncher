import { cleanText } from './http.mjs';
import { resolveIntakePlace } from './trip-intake-classify.mjs';

function clean(value, max) {
  return cleanText(value, max);
}

function intakePersistedTripTitle(rawTitle = '') {
  const title = clean(rawTitle, 180);
  if (!title) return '';
  if (/^(shell|intake)-[a-z0-9]+$/i.test(title)) return '';
  return title;
}

export function resolveIntakeTitleFields({
  extractedTitle = '',
  titleError = null,
  savedTripTitle = '',
} = {}) {
  const extracted = clean(extractedTitle, 180);
  const saved = intakePersistedTripTitle(savedTripTitle);
  if (extracted) return { title: extracted, titleError: titleError || null };
  if (saved) return { title: saved, titleError: null };
  return { title: '', titleError: titleError || null };
}

export async function applyIntakeExtractedTripTitle(db, tripId, {
  extractedDestination = '',
  extractedTitle = '',
  destinationError = null,
  titleError = null,
  savedTripTitle = '',
  searchImpl,
} = {}) {
  if (!db || !tripId || intakePersistedTripTitle(savedTripTitle)) return;
  if (!clean(extractedTitle, 180)) return;
  const titleFields = resolveIntakeTitleFields({ extractedTitle, titleError, savedTripTitle });
  const resolved = await resolveIntakePlace({
    destination: extractedDestination,
    title: titleFields.title,
    destinationError,
    titleError: titleFields.titleError,
    searchImpl,
  });
  const tripTitle = resolved.title;
  if (!tripTitle) return;
  await db`
    update trips
    set title = ${tripTitle},
        metadata = (coalesce(metadata, '{}'::jsonb) || ${{ titleSource: 'chat_extraction' }}) - 'titleError',
        updated_at = now()
    where id = ${tripId}
  `;
}

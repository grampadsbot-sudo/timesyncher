import { cleanText } from './http.mjs';
import { isPlaceholderTripRecord } from './owner-shell-trip.mjs';
import { resolveIntakePlace } from './trip-intake-classify.mjs';

export async function applyIntakeExtractedTripTitle(db, tripId, {
  extractedDestination = '',
  extractedTitle = '',
  destinationError = null,
  titleError = null,
  savedTripTitle = '',
  searchImpl,
} = {}) {
  if (!db || !tripId) return;
  const savedTitle = cleanText(savedTripTitle, 180);
  if (savedTitle && !isPlaceholderTripRecord({ title: savedTitle })) return;
  const extracted = cleanText(extractedTitle, 180);
  if (!extracted) return;
  const resolved = await resolveIntakePlace({
    destination: extractedDestination,
    title: extracted,
    destinationError,
    titleError,
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

import { isGenericDescription } from './list-row-generic-description.mjs';

function text(value) {
  return String(value || '').trim();
}

function narrativeWordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

export function hydrateCarListRowNarrative(place, override, source, pickLongDetails) {
  const carNarrative = pickLongDetails(place, override, source);
  if (!carNarrative || narrativeWordCount(carNarrative) < 30) return;
  override.longDetails = carNarrative;
  if (!text(override.details)) override.details = carNarrative;
  if (!text(override.description) || isGenericDescription(override.description)) {
    override.description = carNarrative;
  }
  if (!text(place.description) || narrativeWordCount(place.description) < 30) {
    place.description = carNarrative;
  }
}

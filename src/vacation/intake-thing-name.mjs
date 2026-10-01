function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Structural proper-name gate for intake Things (no category deny-list). */
export function intakeThingHasProperName(name) {
  const text = clean(name, 180);
  if (!text) return false;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  if (tokens.some((token) => /^[A-Z][a-z][a-zA-Z0-9''-]*$/.test(token))) return true;
  if (/\d/.test(text) && tokens.length >= 2) return true;
  if (tokens.every((token) => /^[a-z0-9'-]+$/.test(token))) return false;
  return false;
}

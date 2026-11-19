import { POST_INTAKE_COLLAB_COPY } from './live-app-turn.mjs';

export function postIntakeCollabCopyMissing(text) {
  const value = String(text || '');
  return !/build(?:ing)? (?:the|your) itinerary/i.test(value)
    || /you also have unlimited/i.test(value)
    || !/\bview access\b/i.test(value)
    || !/\bedit access\b/i.test(value)
    || !/email invite/i.test(value)
    || !/unlimited vacations for the whole year/i.test(value);
}

export function ensurePostIntakeCollabCopy(text) {
  let value = String(text || '').trim().replace(/\byou also have unlimited\b/gi, 'the plan includes');
  if (!value) return value;
  if (!postIntakeCollabCopyMissing(value)) return value;
  return `${value} ${POST_INTAKE_COLLAB_COPY}`;
}

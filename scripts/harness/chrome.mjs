import { readFileSync } from 'node:fs';

function loadChromeBans() {
  return JSON.parse(readFileSync(new URL('../fixtures/harness/chrome-bans.json', import.meta.url), 'utf8'));
}

export function chromeHits(text, phrases = loadChromeBans()) {
  const hay = String(text || '').toLowerCase();
  return phrases.filter((phrase) => hay.includes(String(phrase || '').toLowerCase()));
}

import { readFileSync } from 'node:fs';

export function loadBannedHosts() {
  const parsed = JSON.parse(readFileSync(new URL('../fixtures/harness/banned-hosts.json', import.meta.url), 'utf8'));
  return parsed.map((host) => String(host || '').trim().toLowerCase()).filter(Boolean);
}

export function hostIsBanned(url, hosts) {
  const href = String(url?.url || url || '').toLowerCase();
  return hosts.some((host) => host && href.includes(host));
}

export function guardedFetch(fetchImpl, hosts) {
  return async (url, options) => {
    const href = String(url?.url || url || '');
    if (hostIsBanned(href, hosts)) throw new Error('refused: harness blocked a model host');
    if (/text-to-speech|\/tts\b/i.test(href)) throw new Error('refused: harness blocked a speech host');
    return fetchImpl(url, options);
  };
}

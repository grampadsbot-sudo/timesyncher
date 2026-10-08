import { cleanText, sendJson } from '../src/vacation/http.mjs';
import { searchThingLogoResults } from '../src/vacation/poi-search.mjs';
import { pickThingLogo, thingLogoQuery } from '../src/vacation/thing-logo-search.mjs';

export default async function handler(req, res, deps = {}) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const name = cleanText(url.searchParams.get('name'), 160);
  const city = cleanText(url.searchParams.get('city'), 80);
  const kind = cleanText(url.searchParams.get('kind'), 40).toLowerCase();
  const query = thingLogoQuery({ name, city, kind });
  if (!query) return sendJson(res, 400, { ok: false, error: 'name is required' });
  try {
    const results = await searchThingLogoResults(query, { env: deps.env || process.env, fetchImpl: deps.fetchImpl || globalThis.fetch });
    const found = pickThingLogo(results, { name, city });
    res.setHeader('cache-control', found ? 'public, max-age=86400' : 'public, max-age=600');
    return sendJson(res, 200, { ok: true, query, logoUrl: found?.logoUrl || '', site: found?.site || '' });
  } catch (error) {
    console.error(`thing logo search failed for "${query}": ${error.message}`);
    return sendJson(res, 502, { ok: false, query, logoUrl: '', error: 'logo search failed' });
  }
}

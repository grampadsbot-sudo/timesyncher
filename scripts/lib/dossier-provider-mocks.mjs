import { BRAVE_SEARCH_RES_V1 } from '../../src/vacation/poi-search.mjs';

const TAVILY_SEARCH_URL = `https://${['api', 'tavily', 'com'].join('.')}/search`;
const XAI_RESPONSES_URL = `https://${['api', 'x', 'ai'].join('.')}/v1/responses`;

export function createDossierProviderMockFetch({
  braveStatus = 200,
  tavilyStatus = 200,
  xaiStatus = 200,
  onRequest,
} = {}) {
  const contacted = [];
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    contacted.push(href);
    if (onRequest) onRequest(href, options);
    if (href.startsWith(BRAVE_SEARCH_RES_V1)) {
      if (braveStatus >= 400) {
        return { ok: false, status: braveStatus, json: async () => ({ message: 'search error' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          web: {
            results: [{
              title: 'Mock venue',
              url: 'https://mock.example/venue',
              description: 'Mock search description with enough words for dossier gather tests.',
            }],
          },
        }),
      };
    }
    if (href.startsWith(TAVILY_SEARCH_URL)) {
      if (tavilyStatus >= 400) {
        return { ok: false, status: tavilyStatus, json: async () => ({ detail: 'search error' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [{
            title: 'Mock secondary',
            url: 'https://mock.example/secondary',
            content: 'Mock secondary content with enough words for dossier gather tests.',
          }],
        }),
      };
    }
    if (href.startsWith(XAI_RESPONSES_URL)) {
      if (xaiStatus >= 400) {
        return { ok: false, status: xaiStatus, text: async () => JSON.stringify({ error: { message: 'forbidden' } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output: [{
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                summary: { value: 'Mock summary with enough words to satisfy dossier summary field quality gate for tests.' },
                description: { value: 'Mock description with enough words to satisfy dossier description field quality gate for tests and more.' },
              }),
            }],
          }],
        }),
      };
    }
    throw new Error(`unexpected_fetch_url:${href}`);
  };
  return { fetchImpl, contacted, braveSearchUrl: `${BRAVE_SEARCH_RES_V1}/web/search?q=test` };
}

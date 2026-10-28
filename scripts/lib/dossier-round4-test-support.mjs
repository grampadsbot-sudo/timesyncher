import { createHash } from 'node:crypto';

export const target = {
  tripId: 'offline-trip', placeId: 'harbor-dining', title: 'Harbor Bistro', category: 'restaurant',
  website: 'https://harbor.example/', destination: 'Boston',
};
export const summary = 'Harbor Bistro serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.';
export const description = 'Harbor Bistro serves grilled fish and seasonal vegetables in a waterfront dining room. Its lunch menu includes a daily fish dish alongside the seasonal plates. Diners can choose lunch by the harbor or settle into the dining room for a meal built around fish and vegetables.';
export const page = (text = `${summary} ${description}`, index = 0) => ({
  url: `https://harbor.example/evidence/${index}`, text, fetchedAt: '2026-10-27T05:00:00Z',
  sha256: createHash('sha256').update(text).digest('hex'),
});
export const field = (value, pages = ['p1']) => ({ value, claims: [{ text: value, pages }] });
export const findings = () => ({ summary: field(summary), description: field(description) });
export const judge = async (_dossier, claims) => claims.map(({ id }) => ({ id, supported: true, reason: 'Offline paraphrase supported by the saved fixture.' }));
export const webResponse = (rows = [], status = 200, retryAfter = null) => ({
  ok: status === 200, status, headers: { get: (key) => key === 'retry-after' ? retryAfter : null },
  json: async () => ({ web: { results: rows } }),
});
export const noSleep = async () => {};

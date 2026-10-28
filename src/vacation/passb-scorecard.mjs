import { dossierPresent, dossierPresented } from './passb-dossier-presented.mjs';
import { normPassBDossierCategory } from './nyc-passb-dossier-inventory.mjs';

const PASSB_PRESENTED_BAR_PCT = 80;

export function scorePassbFixtureRows(rows = [], { placesById = {}, dossiersByPlaceId = {} } = {}) {
  const buckets = {};
  const traces = [];
  for (const row of rows) {
    const type = normPassBDossierCategory(row.cat || row.category);
    if (!buckets[type]) buckets[type] = { present: 0, presented: 0, total: 0 };
    buckets[type].total += 1;
    const place = placesById[String(row.id)] || {
      id: row.id,
      title: row.name || row.title,
      name: row.name || row.title,
      category: row.cat || row.category,
    };
    const dossier = dossiersByPlaceId[row.id] ?? dossiersByPlaceId[String(row.id)];
    const present = dossierPresent(dossier);
    const presented = dossierPresented(dossier, place);
    if (present) buckets[type].present += 1;
    if (presented) buckets[type].presented += 1;
    traces.push({
      id: row.id,
      type,
      name: place.title || place.name,
      present,
      presented,
    });
  }
  const byType = {};
  for (const [type, bucket] of Object.entries(buckets)) {
    byType[type] = {
      total: bucket.total,
      present: bucket.present,
      presented: bucket.presented,
      presentPct: bucket.total ? Math.round((100 * bucket.present) / bucket.total) : 0,
      presentedPct: bucket.total ? Math.round((100 * bucket.presented) / bucket.total) : 0,
    };
  }
  return { byType, traces };
}

export function formatPassbScorecardAscii(scorecard) {
  const lines = ['PASS B scorecard (fixture)', 'type        total  present  presented  present%  presented%'];
  for (const [type, bucket] of Object.entries(scorecard.byType).sort(([a], [b]) => a.localeCompare(b))) {
    const pad = (n, w) => String(n).padStart(w);
    lines.push([
      type.padEnd(12),
      pad(bucket.total, 5),
      pad(bucket.present, 8),
      pad(bucket.presented, 10),
      `${pad(bucket.presentPct, 3)}%`.padStart(9),
      `${pad(bucket.presentedPct, 3)}%`.padStart(11),
    ].join(' '));
  }
  lines.push('', 'row traces:');
  for (const row of scorecard.traces) {
    lines.push(`  #${row.id} ${row.type} ${row.name} present=${row.present} presented=${row.presented}`);
  }
  return lines.join('\n');
}

function passbTypesUnderPresentedBar(byType, minPct = PASSB_PRESENTED_BAR_PCT) {
  return Object.entries(byType)
    .filter(([, bucket]) => bucket.total > 0 && bucket.presentedPct < minPct)
    .map(([type, bucket]) => ({ type, presentedPct: bucket.presentedPct, total: bucket.total }));
}

export function assertPassbPresentedBar(scorecard, minPct = PASSB_PRESENTED_BAR_PCT) {
  const under = passbTypesUnderPresentedBar(scorecard.byType, minPct);
  if (!under.length) return { ok: true, under: [] };
  const detail = under.map((row) => `${row.type}=${row.presentedPct}% (${row.total})`).join(', ');
  return { ok: false, under, message: `presented bar ${minPct}% missed: ${detail}` };
}

import fs from 'node:fs';
import path from 'node:path';
import { aggregateSsrWave } from './aggregate.mjs';
import { SSR_CITATION } from './scorer.mjs';

function round3(value) {
  return Number.isFinite(value) ? (Math.round(value * 1000) / 1000).toFixed(3) : 'n/a';
}

function formatPmf(pmf) {
  return (pmf || []).map((prob, index) => `${index + 1}:${(Number(prob) * 100).toFixed(1)}%`).join(' | ');
}

function normalizeAggregate(ssrInput) {
  if (!ssrInput) return null;
  if (Array.isArray(ssrInput.by_checkpoint_construct)) return ssrInput;
  if (Array.isArray(ssrInput.checkpoints)) {
    return aggregateSsrWave([{ story_id: ssrInput.story_id || 'customer', ssr: ssrInput }]);
  }
  if (Array.isArray(ssrInput)) return aggregateSsrWave(ssrInput);
  return null;
}

export function attachSsrToDialogPack(pack, ssrInput) {
  const aggregate = normalizeAggregate(ssrInput);
  if (!aggregate || !aggregate.has_ssr) return pack;
  const aggregateRows = [
    ['Checkpoint', 'Construct', 'n', 'Mean Expected', 'Aggregate PMF (1..5)'],
    ...aggregate.by_checkpoint_construct.map((row) => [
      row.checkpoint,
      row.construct,
      String(row.n),
      round3(row.mean_expected_score),
      formatPmf(row.distribution),
    ]),
  ];
  const constructRows = [
    ['Construct', 'n', 'Mean Expected', 'Aggregate PMF (1..5)'],
    ...aggregate.by_construct.map((row) => [
      row.construct,
      String(row.n),
      round3(row.mean_expected_score),
      formatPmf(row.distribution),
    ]),
  ];
  const perCustomerRows = [
    ['Customer', 'Checkpoint', 'Construct', 'Expected Score', 'PMF (1..5)'],
    ...(aggregate.per_customer || []).map((row) => [
      row.story_id,
      row.checkpoint,
      row.construct,
      round3(row.expected_score),
      formatPmf(row.pmf),
    ]),
  ];
  const dlrComparisonRows = aggregate.dlr_comparison?.n > 0
    ? [
        ['Customer', 'Legacy Numeric (Comparison Only)', 'Source', 'Primary?'],
        ...aggregate.dlr_comparison.per_customer.map((row) => [
          row.story_id,
          String(row.legacy_numeric_score),
          row.source,
          'no (comparison only)',
        ]),
      ]
    : [];

  return {
    ...pack,
    ssr_section: {
      title: 'SSR FREE-TEXT RATINGS (PRIMARY)',
      method: aggregate.method || 'ssr-maier-2025',
      citation: aggregate.citation || SSR_CITATION,
      anchor_set_version: (aggregate.anchor_set_versions || []).join(', '),
      embedding_model: (aggregate.embedding_models || []).join(', '),
      embedding_revision: (aggregate.embedding_revisions || []).join(', '),
      aggregate_rows: aggregateRows,
      construct_rows: constructRows,
      per_customer_rows: perCustomerRows,
      dlr_comparison_rows: dlrComparisonRows,
      dlr_comparison_mean: aggregate.dlr_comparison?.mean ?? null,
    },
  };
}

export function recordDialogPdfStatus({
  generated = false,
  pdfPath = '',
  skipReason = '',
  ssrAggregate = null,
} = {}) {
  const aggregate = normalizeAggregate(ssrAggregate);
  return {
    status: generated ? 'generated' : 'skipped',
    pdf_path: pdfPath || '',
    skip_reason: generated ? '' : String(skipReason || 'dialog-pdf-skipped'),
    ssr_hook_present: true,
    ssr_aggregate_included: Boolean(aggregate && aggregate.has_ssr),
  };
}

export function attachSsrToKeepsakeMetadata({
  outDir,
  keepsakePath = '',
  ssrRecord = null,
  keepsakeStatus = 'shown',
  keepsakeNote = '',
} = {}) {
  const payload = {
    keepsake_path: keepsakePath,
    keepsake_status: keepsakeStatus === 'skipped' ? 'skipped' : 'shown',
    keepsake_note: String(keepsakeNote || (keepsakeStatus === 'skipped' ? 'keepsake skipped and recorded' : 'keepsake shown')),
    ssr_hook_present: true,
    primary_rating_method: 'ssr',
    ssr: ssrRecord || null,
  };
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'keepsake-ssr.json'), `${JSON.stringify(payload, null, 2)}\n`);
  }
  return payload;
}

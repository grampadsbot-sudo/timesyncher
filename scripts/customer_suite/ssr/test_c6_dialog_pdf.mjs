#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateSsrWave } from './aggregate.mjs';
import { collectCheckpointReactions } from './checkpoints.mjs';
import { attachSsrToDialogPack, recordDialogPdfStatus } from './dialog-hook.mjs';
import { createLocalBgeEmbedder, PINNED_EMBEDDING_MODEL, PINNED_EMBEDDING_REVISION } from './embedder.mjs';
import { scoreCustomerCheckpoints } from './scorer.mjs';
import { renderDialog } from '../../harness/live-outputs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function extractPdfTextLocal(pdfBytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-c6-pdf-'));
  const file = path.join(dir, 'dialog.pdf');
  try {
    fs.writeFileSync(file, Buffer.from(pdfBytes));
    const res = spawnSync(
      'python3',
      ['-c', 'from pypdf import PdfReader; import sys; print("\\n".join((p.extract_text() or "") for p in PdfReader(sys.argv[1]).pages))', file],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, res.stderr || 'pypdf extract failed');
    return res.stdout;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const embedder = createLocalBgeEmbedder();
const reactions = await collectCheckpointReactions({
  keepsakeStatus: 'shown',
  respond: async (ctx) => ({
    after_setup: 'Delighted with the smooth AI vacation setup experience.',
    after_keepsake: 'Loved the keepsake and would enthusiastically recommend it to friends.',
    pricing_10: 'I would gladly pay $10 right away for this vacation planner.',
    pricing_17: 'I am undecided and on the fence about paying $17.',
  })[ctx.checkpoint],
});
const ssr = scoreCustomerCheckpoints({
  storyId: 'dialog-cust-1',
  customerName: 'Avery Hale',
  reactions,
  embedder,
});
const aggregate = aggregateSsrWave([
  { story_id: 'dialog-cust-1', ssr, turns: [{ role: 'app', jev_score: 4 }] },
]);

const basePack = {
  title: 'Dialog Pack — Hilo Vacation v7 Tier 1–4',
  deploy_banner: 'BUILD live-sha-c6 | staging',
  pack_id: 'c6-ssr-dialog-test',
  footer_id: 'c6-ssr-dialog-test',
  turns_line: 'turns=2 (customer 1 / app 1)',
  cover_fit: ['models used: anthropic/claude-haiku-5.5'],
  headline: 'Live app capture with SSR primary ratings.',
  quality_rows: [['Metric', 'v6', 'v7'], ['App turns', '1', '1']],
  tier_rows: [['Tier', 'Model', 'Mean overall'], ['T2', 'anthropic/claude-haiku-5.5', '4.000']],
  timing_rows: [['Pack', 'Model(s)', 'n', 'p50 ms', 'p95 ms', 'mean ms', 'max ms'], ['v7', 'T2', '1', '1200', '1200', '1200', '1200']],
  speedup: 'gen-only median is 1200ms.',
  recipe: [['mode', 'live-app']],
  roster: ['Owner: Avery Hale (Owner)'],
  beats: 'live',
  judge: 'scores: mean 4.000',
  turns: [
    {
      label: 'T1 AVERY',
      meta: 'n=1',
      app: false,
      text: 'Plan a calm Hilo vacation.',
    },
    {
      label: 'T2 APP',
      meta: 'n=2 · model=anthropic/claude-haiku-5.5 · tier=2',
      app: true,
      text: 'Here is a relaxed Hilo vacation plan.',
      quality: 'quality: 4',
      timing: 'timing: jev=350ms gen=1200ms model=anthropic/claude-haiku-5.5 tier=2 max_tokens=900',
    },
  ],
};

const packWithSsr = attachSsrToDialogPack(basePack, aggregate);
assert.ok(packWithSsr.ssr_section);
assert.equal(packWithSsr.ssr_section.embedding_model, PINNED_EMBEDDING_MODEL);
assert.equal(packWithSsr.ssr_section.embedding_revision, PINNED_EMBEDDING_REVISION);
assert.equal(packWithSsr.ssr_section.aggregate_rows.length, 6);
assert.equal(packWithSsr.ssr_section.per_customer_rows.length, 6);

const rendered = spawnSync('python3', [path.join(root, 'scripts/live_v7_dialog_pdf.py')], {
  input: JSON.stringify(packWithSsr),
  maxBuffer: 16 * 1024 * 1024,
});
assert.equal(rendered.status, 0, rendered.stderr?.toString() || 'live_v7_dialog_pdf.py failed');
const pdfBuffer = Buffer.from(rendered.stdout);
assert.equal(pdfBuffer.subarray(0, 5).toString(), '%PDF-');

const pdfText = extractPdfTextLocal(pdfBuffer);
assert.match(pdfText, /SSR FREE-TEXT RATINGS \(PRIMARY\)/);
assert.match(pdfText, /BAAI\/bge-small-en-v1\.5/);
assert.match(pdfText, /after_setup/);
assert.match(pdfText, /after_keepsake/);
assert.match(pdfText, /pricing_10/);
assert.match(pdfText, /pricing_17/);
assert.match(pdfText, /intent-to-pay/);
assert.match(pdfText, /satisfaction/);
assert.match(pdfText, /recommend/);
assert.match(pdfText, /dialog-cust-1/);
assert.match(pdfText, /Comparison Only/);

const rendererSource = fs.readFileSync(path.join(root, 'scripts/live-transcript-dialog-pdf.mjs'), 'utf8');
assert.match(rendererSource, /attachSsrToDialogPack/);

if (fs.existsSync(path.join(root, 'node_modules/@neondatabase/serverless'))) {
  const { renderLiveTranscriptPdf } = await import('../../live-transcript-dialog-pdf.mjs');
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../../fixtures/harness/transcript-fixture.json', import.meta.url), 'utf8'),
  );
  const fullPdf = renderLiveTranscriptPdf({ ...fixture, ssrSummary: aggregate });
  const fullText = extractPdfTextLocal(fullPdf);
  assert.match(fullText, /SSR FREE-TEXT RATINGS \(PRIMARY\)/);
}

const skippedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-c6-skip-'));
try {
  const skipped = await renderDialog({
    token: 'tok',
    outDir: skippedDir,
    secrets: [],
    ssrSummary: aggregate,
    skipDialogPdf: true,
    skipReason: 'dialog-pdf-skipped-by-config',
  });
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.dialogPdfStatus.status, 'skipped');
  assert.equal(skipped.dialogPdfStatus.skip_reason, 'dialog-pdf-skipped-by-config');
  assert.equal(skipped.dialogPdfStatus.ssr_hook_present, true);
  assert.equal(skipped.dialogPdfStatus.ssr_aggregate_included, true);
  const recorded = JSON.parse(fs.readFileSync(path.join(skippedDir, 'dialog-pdf-status.json'), 'utf8'));
  assert.equal(recorded.status, 'skipped');
  assert.equal(recorded.ssr_hook_present, true);
} finally {
  fs.rmSync(skippedDir, { recursive: true, force: true });
}

const directStatus = recordDialogPdfStatus({ generated: false, skipReason: 'offline-run', ssrAggregate: aggregate });
assert.equal(directStatus.status, 'skipped');
assert.equal(directStatus.ssr_hook_present, true);

console.log('test_c6_dialog_pdf: ok');

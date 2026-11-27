import fs from 'node:fs';
import path from 'node:path';
import { couponCheck, dryRosterCoupon } from './coupon.mjs';
import { dryMediaLoad } from './media-plan.mjs';
import { validateStory } from './schema.mjs';

const DRY_ORIGIN = 'https://vacation-staging.timesyncher.com';
export const LIVE_CHECK_IDS = ['dialog-pdf', 'keepsake-pdf', 'screens', 'onboarding-screens-in-pdf', 'video-check', 'video-check-pass', 'dialog-renderer-ok', 'no-stub-chrome', 'build-sha', 'cleanup', 'stored-cost'];

function pdfEscape(text) {
  return String(text).replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
}

function writeTextPdf(file, lines) {
  const shown = lines.slice(0, 60);
  const ops = ['BT', '/F1 10 Tf', '12 TL', '40 800 Td', ...shown.map((line, index) => `${index ? 'T* ' : ''}(${pdfEscape(line).slice(0, 110)}) Tj`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  return file;
}

function dryTurns(story) {
  return (story.turns || []).map((turn, index) => ({
    n: index + 1,
    role: 'customer',
    reply_backend: story.reply_backend,
    stored_model: '',
    stored_backend: '',
    jev_score: null,
    wall_ms: null,
    cost_state: 'not-run',
    cost_amount: null,
    cost_unit: '',
    gap: '',
  }));
}

export function abArmLabel(story) {
  if (story.reply_backend === 'trip_state') return 'Trip State (OpenRouter)';
  const id = Number(story.roster?.id);
  if (!Number.isInteger(id) || id > 10) return `none (${story.reply_backend})`;
  return story.reply_backend === 'vk_bot_mcp' ? 'B vk_bot_mcp' : 'A openrouter';
}

export async function dryRunCustomer(story, options) {
  const started = new Date().toISOString();
  fs.mkdirSync(options.outDir, { recursive: true });
  const checks = [];
  const schemaErrors = validateStory(story);
  checks.push({ id: 'story-schema', pass: schemaErrors.length === 0, detail: schemaErrors.slice(0, 3).join('; ') || 'valid', artifact: 'story.json' });
  fs.writeFileSync(path.join(options.outDir, 'story.json'), `${JSON.stringify(story, null, 2)}\n`);
  let coupon = null;
  if (story.coupon) {
    try {
      coupon = dryRosterCoupon({ story, runId: options.runId, origin: DRY_ORIGIN, ledger: options.ledger });
    } catch (error) {
      coupon = { mode: 'dry', status: 'refused', pass: false, detail: String(error?.message || error).slice(0, 200) };
    }
    checks.push(couponCheck(coupon));
  }
  if (options.injectFail?.has(Number(story.roster?.id))) {
    checks.push({ id: 'injected-failure', pass: false, detail: 'dry: failure injected with --inject-fail', artifact: '' });
  }
  const label = `DRY RUN PLACEHOLDER - not a live run. No staging, no model replies, no spend. run ${options.runId} story ${story.story_id}`;
  const dialogLines = [
    'Dialog PDF (dry placeholder)', label, `Customer: ${story.customer.name} | backend: ${story.reply_backend} | A/B: ${abArmLabel(story)}`,
    `Destination: ${story.destination} ${story.dates.start} to ${story.dates.end}`, '',
    ...story.turns.flatMap((turn, index) => [`Turn ${index + 1} customer (${turn.modality}): ${turn.text}`, `Turn ${index + 1} app: not-run (dry) | model: not-run | wall ms: not-run`]),
  ];
  writeTextPdf(path.join(options.outDir, 'dialog.pdf'), dialogLines);
  writeTextPdf(path.join(options.outDir, 'keepsake.pdf'), ['Keepsake PDF (dry placeholder)', label, `Vacation: ${story.destination}`, 'No itinerary was built: the live app was not called.']);
  checks.push({ id: 'dialog-pdf-placeholder', pass: fs.statSync(path.join(options.outDir, 'dialog.pdf')).size > 0, detail: 'dry placeholder written', artifact: 'dialog.pdf' });
  checks.push({ id: 'keepsake-pdf-placeholder', pass: fs.statSync(path.join(options.outDir, 'keepsake.pdf')).size > 0, detail: 'dry placeholder written', artifact: 'keepsake.pdf' });
  const failed = checks.some((check) => check.pass !== true);
  const first = checks.find((check) => check.pass !== true);
  const card = {
    run_id: options.runId,
    story_id: story.story_id,
    reply_backend: story.reply_backend,
    mode: 'dry',
    build_sha: options.buildSha || '',
    live_sha_start: '',
    live_sha_end: '',
    started_at: started,
    ended_at: new Date().toISOString(),
    checks,
    not_run: LIVE_CHECK_IDS.map((id) => ({ id, detail: 'not-run (dry)' })),
    steps_present: [],
    steps_planned: story.steps || [],
    turns: dryTurns(story),
    cost: { state: 'not-run', amount: null, unit: '', gap: '', per_customer: null, per_100: null },
    cleanup: { deleted: {}, remaining: 0, detail: 'dry: nothing created' },
    session_ref: '',
    coupon_redemption: coupon,
    roster: story.roster || null,
    ab_arm: abArmLabel(story),
    media: dryMediaLoad(story),
    reason: failed ? (first.detail || first.id) : '',
    wave_stop: false,
    verdict: failed ? 'FAIL' : 'DRY_PASS',
  };
  fs.writeFileSync(path.join(options.outDir, 'scorecard.json'), `${JSON.stringify(card, null, 2)}\n`);
  return card;
}

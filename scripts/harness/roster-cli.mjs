import fs from 'node:fs';
import path from 'node:path';
import { dryRunCustomer } from './dry.mjs';
import { DEFAULT_FINDINGS, REQUIRED_HEADINGS } from './findings.mjs';
import { runRamp } from './ramp.mjs';
import { DEFAULT_ROSTER, RAMP_SIZES, abArms, loadRoster, loadStoriesDir, rampOrder, storyForEntry, waveStories } from './roster.mjs';

function value(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? '' : String(argv[index + 1] || '');
}

export function isRosterMode(argv) {
  return ['--roster', '--customer', '--wave-size', '--ramp', '--dry', '--stories-dir'].some((flag) => argv.includes(flag));
}

function seedDryFindings(file) {
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const real = fs.existsSync(DEFAULT_FINDINGS) ? fs.readFileSync(DEFAULT_FINDINGS, 'utf8') : '';
  const cut = real.indexOf('## Entries');
  const skeleton = cut >= 0 ? real.slice(0, cut + '## Entries'.length) : `${REQUIRED_HEADINGS[0]}\n\n${REQUIRED_HEADINGS[1]}\n\n${REQUIRED_HEADINGS[2]}`;
  fs.writeFileSync(file, `${skeleton}\n`);
  return file;
}

function validatedBackend(name) {
  if (!name) return '';
  if (name === 'openrouter' || name === 'vk_bot_mcp') return name;
  throw new Error('refused: --reply-backend must be openrouter or vk_bot_mcp');
}

export async function runRosterCli(argv, { outRoot, liveOptions = null, buildSha = '', log = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const runId = value(argv, '--run-id');
  if (!/^[a-z0-9][a-z0-9._-]{0,60}$/.test(runId)) throw new Error('refused: --run-id is required (lowercase letters, digits, . _ -)');
  const dry = argv.includes('--dry');
  const inject = value(argv, '--inject-fail');
  if (inject && !dry) throw new Error('refused: --inject-fail is dry-only');
  if (!dry && !liveOptions) throw new Error('refused: live roster run needs the staging http options');
  const forcedBackend = validatedBackend(value(argv, '--reply-backend'));
  const customers = loadRoster(value(argv, '--roster') || DEFAULT_ROSTER);
  const dialogStories = value(argv, '--stories-dir') ? loadStoriesDir(value(argv, '--stories-dir')) : null;
  const one = value(argv, '--customer');
  const waveSize = value(argv, '--wave-size');
  const modes = [Boolean(one), Boolean(waveSize), argv.includes('--ramp')].filter(Boolean).length;
  if (modes !== 1) throw new Error('refused: pass exactly one of --customer, --wave-size, --ramp');
  let sizes = RAMP_SIZES;
  let storiesFor = null;
  if (one) {
    const entry = rampOrder(customers).find((row) => String(row.id) === one);
    if (!entry) throw new Error(`refused: roster has no customer ${one}`);
    const story = storyForEntry(entry, abArms(customers), dialogStories);
    const chosen = forcedBackend ? { ...story, reply_backend: forcedBackend } : story;
    sizes = [1];
    storiesFor = () => [chosen];
  } else if (waveSize) {
    sizes = [Number(waveSize)];
    if (forcedBackend) {
      storiesFor = (size) => waveStories(customers, size, { dialogStories }).map((story) => ({ ...story, reply_backend: forcedBackend }));
    }
  } else if (forcedBackend) {
    storiesFor = (size) => waveStories(customers, size, { dialogStories }).map((story) => ({ ...story, reply_backend: forcedBackend }));
  }
  const findingsFile = value(argv, '--findings') || (dry ? seedDryFindings(path.join(outRoot, runId, 'findings.md')) : DEFAULT_FINDINGS);
  const injectFail = new Set(inject.split(',').map((id) => Number(id.trim())).filter(Number.isInteger));
  const result = await runRamp(customers, {
    ...(dry ? {} : liveOptions),
    mode: dry ? 'dry' : 'live',
    runId,
    outRoot,
    sizes,
    storiesFor,
    dialogStories,
    findingsFile,
    buildSha,
    concurrency: 1,
    keep: argv.includes('--keep'),
    injectFail,
    ...(dry ? { run: dryRunCustomer } : {}),
  });
  const summary = {
    run_id: runId,
    mode: dry ? 'dry' : 'live',
    findings: findingsFile,
    waves: result.waves.map((wave) => ({
      size: wave.size,
      run_id: wave.runId,
      ran: wave.result?.cards?.length ?? 0,
      verdicts: (wave.result?.cards || []).map((card) => `${card.story_id}:${card.verdict}`),
      coupons: (wave.result?.cards || []).map((card) => `${card.story_id}:${card.coupon_redemption?.status || 'none'}`),
      failed: wave.failed ?? Boolean(wave.refused),
      ...(wave.refused ? { refused: wave.refused } : {}),
    })),
    stopped_at: result.stopped_at,
    reason: result.reason,
  };
  log(JSON.stringify(summary));
  return { ...result, summary };
}

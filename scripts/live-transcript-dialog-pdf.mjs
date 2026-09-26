#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../src/vacation/db.mjs';
import {
  LIVE_OPENER_PRODUCER,
  LIVE_REPLY_PRODUCER,
  LIVE_TRANSCRIPT_CAPTURE,
  item34BanHit,
  loadLiveTranscriptByToken,
  transcriptToJsonl,
} from '../src/vacation/live-app-turn.mjs';
import { DIALOG_TEST_FINGERPRINT, bakeoffTierModels, isBakeoffModelId } from './vacation-app-reply-rules.mjs';

const V6_GPT5_MINI_P50_MS = 28834;
const V6_GPT5_MINI_P95_MS = 39693;
const ROSTER_NAMES = ['Kimberly', 'Tyler', 'Lauren'];

const BANNED_GENERATORS = /dialog_vacation_test_turn|dialog-pdf-openrouter-selfcall|openrouter-selfcall/i;
const CANNED_APP_REPLY = 'Got it. I saved that';

function fail(error) {
  const message = error?.message || String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

export function assertLiveTranscript(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('refused: Dialog PDF needs a live transcript document');
  }
  const generator = [doc.generator, doc.source, doc.capture, doc.via].filter(Boolean).join(' ');
  if (BANNED_GENERATORS.test(generator)) {
    throw new Error('refused: Dialog PDF will not render an OpenRouter self-call or dialog_vacation_test_turn pack');
  }
  if (doc.live !== true || doc.capture !== LIVE_TRANSCRIPT_CAPTURE) {
    throw new Error('refused: Dialog PDF requires a live vacation-app transcript (capture live-vacation-app)');
  }
  const targetPerson = String(doc.targetPerson || '').trim();
  if (!targetPerson) throw new Error('refused: Dialog PDF needs target_person for APP to <target_person> labels');
  const turns = Array.isArray(doc.turns) ? doc.turns : [];
  if (turns.length === 0) throw new Error('refused: live transcript has no turns');
  let expect = 'customer';
  let start = 0;
  if (turns[0]?.role === 'app') start = 1;
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (turn.role !== 'customer' && turn.role !== 'app') {
      throw new Error(`refused: turn ${turn.turnIndex} role must be customer or app`);
    }
    if (index >= start) {
      if (turn.role !== expect) {
        throw new Error(`refused: turn ${turn.turnIndex} is ${turn.role}; expected ${expect} so every customer turn has the live app reply`);
      }
      expect = turn.role === 'customer' ? 'app' : 'customer';
    }
    const text = String(turn.text || '');
    if (!text.trim()) throw new Error(`refused: turn ${turn.turnIndex} text is empty`);
    if (item34BanHit(text)) throw new Error(`refused: turn ${turn.turnIndex} uses split-payment jargon`);
    if (turn.storedText != null && String(turn.storedText) !== text) {
      throw new Error(`refused: turn ${turn.turnIndex} stored text does not match the customer-visible body`);
    }
    if (turn.modality !== 'text' && turn.modality !== 'voice') {
      throw new Error(`refused: turn ${turn.turnIndex} modality must be text or voice`);
    }
    if (!turn.jev || typeof turn.jev !== 'object') {
      throw new Error(`refused: turn ${turn.turnIndex} is missing Jev output`);
    }
    if (turn.jev.jevRan === true) {
      if (!Number.isInteger(Number(turn.jev.modelTier))) {
        throw new Error(`refused: turn ${turn.turnIndex} Jev ran without a model tier`);
      }
    } else if (turn.jev.jevRan !== false || !String(turn.jev.reason || '').trim()) {
      throw new Error(`refused: turn ${turn.turnIndex} Jev was skipped without jevRan false and a reason`);
    }
    if (!Number.isFinite(Number(turn.latencyMs)) || !Number.isFinite(Number(turn.sessionE2eMs))) {
      throw new Error(`refused: turn ${turn.turnIndex} is missing latency_ms or session e2e`);
    }
    if (turn.role === 'app') {
      if (turn.invented === true) throw new Error(`refused: turn ${turn.turnIndex} app text is marked invented`);
      if (text.includes(DIALOG_TEST_FINGERPRINT) || text.includes(CANNED_APP_REPLY) || BANNED_GENERATORS.test(text)) {
        throw new Error(`refused: turn ${turn.turnIndex} app text is invented or stamped for a dialog pack`);
      }
      const fixedOpener = index === 0 && (turn.fixedOpener === true || turn.replyProducer === LIVE_OPENER_PRODUCER);
      if (fixedOpener) {
        if (turn.replyProducer !== LIVE_OPENER_PRODUCER) {
          throw new Error(`refused: turn ${turn.turnIndex} fixed opener did not come from ${LIVE_OPENER_PRODUCER}`);
        }
        if (turn.jev.jevRan !== false || !String(turn.jev.reason || '').trim()) {
          throw new Error(`refused: turn ${turn.turnIndex} fixed opener must record jevRan false and a reason`);
        }
      } else {
        if (turn.replyProducer !== LIVE_REPLY_PRODUCER) {
          throw new Error(`refused: turn ${turn.turnIndex} app text did not come from ${LIVE_REPLY_PRODUCER}`);
        }
      if (turn.jev.jevRan !== true) {
        throw new Error(`refused: turn ${turn.turnIndex} app text exists without a real Jev classify`);
      }
      const modelId = String(turn.modelId || turn.model?.responseModel || turn.jev?.responseModel || '').trim();
      if (!isBakeoffModelId(modelId)) {
        throw new Error(`refused: turn ${turn.turnIndex} model is outside the bake-off map`);
      }
      const jevMs = Number(turn.jevLatencyMs ?? turn.jev?.jevLatencyMs);
      const genMs = Number(turn.genLatencyMs ?? turn.model?.genLatencyMs);
      if (!Number.isFinite(jevMs) || !Number.isFinite(genMs)) {
        throw new Error(`refused: turn ${turn.turnIndex} is missing Jev classify ms or gen ms`);
      }
      if (turn.jevBeforeModel !== true && turn.jev?.jevBeforeModel !== true) {
        throw new Error(`refused: turn ${turn.turnIndex} does not prove Jev ran before the model`);
      }
    }
    }
  }
  if (expect === 'app') throw new Error('refused: live transcript ends on a customer turn with no app reply');
  return { ...doc, targetPerson, turns };
}

export function buildTimingSummary(doc) {
  const turns = doc.turns || [];
  const last = turns[turns.length - 1];
  return {
    capture: doc.capture,
    targetPerson: doc.targetPerson,
    sessionE2eMs: last ? Number(last.sessionE2eMs) : null,
    turnCount: turns.length,
    customerTurns: turns.filter((turn) => turn.role === 'customer').length,
    appTurns: turns.filter((turn) => turn.role === 'app').length,
    voiceTurns: turns.filter((turn) => turn.modality === 'voice').length,
    turns: turns.map((turn) => ({
      turnIndex: turn.turnIndex,
      role: turn.role,
      modality: turn.modality,
      latencyMs: Number(turn.latencyMs),
      sessionE2eMs: Number(turn.sessionE2eMs),
      jevRan: turn.jev?.jevRan === true,
      modelTier: turn.jev?.jevRan === true ? turn.jev.modelTier : null,
      routeType: turn.jev?.routeType || null,
      modelId: turn.modelId || turn.model?.responseModel || turn.jev?.responseModel || null,
      jevLatencyMs: Number.isFinite(Number(turn.jevLatencyMs ?? turn.jev?.jevLatencyMs)) ? Number(turn.jevLatencyMs ?? turn.jev?.jevLatencyMs) : null,
      genLatencyMs: Number.isFinite(Number(turn.genLatencyMs ?? turn.model?.genLatencyMs)) ? Number(turn.genLatencyMs ?? turn.model?.genLatencyMs) : null,
      jevBeforeModel: turn.jevBeforeModel === true || turn.jev?.jevBeforeModel === true,
    })),
  };
}

function pdfAscii(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\n\x20-\x7E·]/g, '?');
}

function appTimingLines(turn) {
  const fixed = turn.fixedOpener === true || (turn.replyProducer === LIVE_OPENER_PRODUCER && turn.jev?.jevRan !== true);
  if (fixed || turn.jev?.jevRan !== true) return [];
  const gen = Number(turn.genLatencyMs ?? turn.model?.genLatencyMs);
  const tier = turn.jev?.modelTier;
  const model = turn.modelId || turn.model?.responseModel || turn.jev?.responseModel || 'unknown';
  return [`timing: gen=${gen}ms · tier=${tier} · model=${model}`];
}

function modelIdOf(turn) {
  return String(turn.modelId || turn.model?.responseModel || turn.jev?.responseModel || '').trim();
}

function wrapLines(text, width) {
  const out = [];
  for (const paragraph of pdfAscii(text).split('\n')) {
    let rest = paragraph;
    if (!rest) {
      out.push('');
      continue;
    }
    while (rest.length > width) {
      let cut = rest.lastIndexOf(' ', width);
      if (cut < 1) cut = width;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ /, '');
    }
    out.push(rest);
  }
  return out;
}

export function assessPackShape(doc, options = {}) {
  const checked = assertLiveTranscript(doc);
  const summary = buildTimingSummary(checked);
  const missingAppOpen = checked.turns[0]?.role !== 'app';
  const trip = String(options.trip || checked.tripTitle || checked.trip || '').trim() || 'untitled';
  const head = String(options.head || checked.head || 'not-recorded');
  const dpl = String(options.dpl || checked.dpl || 'not-recorded');
  const tierCounts = {};
  const modelIds = new Set();
  let generated = 0;
  let jevFirst = 0;
  for (const turn of checked.turns) {
    if (turn.role !== 'app' || turn.jev?.jevRan !== true) continue;
    generated += 1;
    const key = String(turn.jev.modelTier);
    tierCounts[key] = (tierCounts[key] || 0) + 1;
    const modelId = modelIdOf(turn);
    if (modelId) modelIds.add(modelId);
    if (turn.jevBeforeModel === true || turn.jev?.jevBeforeModel === true) jevFirst += 1;
  }
  const tiersUsed = Object.keys(tierCounts).sort();
  const modelsUsed = [...modelIds].sort();
  const voiceStatus = summary.voiceTurns > 0
    ? `${summary.voiceTurns} voice turn(s) in this live transcript`
    : 'PARTIAL: no voice/STT turn in this live transcript';
  return {
    status: missingAppOpen ? 'PARTIAL' : 'DONE',
    missing_app_open: missingAppOpen,
    missing_app_open_next: missingAppOpen
      ? 'Next live session must capture an app line the customer already saw before the first customer turn (onboarding opener). Do not invent that line.'
      : null,
    pack_id: `live-${checked.sessionToken || 'session'}`,
    trip,
    trip_title_source: (options.trip || checked.tripTitle || checked.trip) ? 'provided' : 'untitled_not_inferred',
    source: 'live-app',
    capture: checked.capture,
    sessionToken: checked.sessionToken || null,
    targetPerson: checked.targetPerson,
    head,
    dpl,
    voiceStatus,
    summary,
    tierCounts,
    tiersUsed,
    modelsUsed,
    jevFirst: generated > 0 && jevFirst === generated,
    grading: 'live text only',
  };
}

function percentile(values, p) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function generatedAppTurns(doc) {
  return (doc.turns || []).filter((turn) => turn.role === 'app' && turn.jev?.jevRan === true);
}

function packPages(doc, shape) {
  const name = doc.targetPerson;
  const summary = shape.summary;
  const tiersUsed = (shape.tiersUsed || []).join(', ') || 'none';
  const modelsUsed = (shape.modelsUsed || []).join(', ') || 'none';
  const generated = generatedAppTurns(doc);
  const gens = generated.map((turn) => Number(turn.genLatencyMs ?? turn.model?.genLatencyMs));
  const p50 = percentile(gens, 50);
  const p95 = percentile(gens, 95);
  const speed = p50 ? (V6_GPT5_MINI_P50_MS / p50).toFixed(1) : 'n/a';
  const map = bakeoffTierModels();
  const roster = ROSTER_NAMES.filter((person) => (doc.turns || []).some((turn) => String(turn.text || '').includes(person)));
  const cover = [
    `Dialog Pack - ${shape.trip} v7 Tier 1-4`,
    `pack_id: ${shape.pack_id}`,
    `turns=${summary.turnCount} (customer ${summary.customerTurns} / app ${summary.appTurns})`,
    'no_gpt5mini: True',
    'source=live-app (not sim)',
    `tiers used: ${tiersUsed}`,
    `models used: ${modelsUsed}`,
    '',
    'QUALITY COMPARISON',
    'vs v6 gpt-5-mini (published mainModel reference, not this session)',
    'metric | v6 gpt-5-mini | this live session',
    `gen p50 ms | ${V6_GPT5_MINI_P50_MS} | ${p50 ?? 'n/a'}`,
    `gen p95 ms | ${V6_GPT5_MINI_P95_MS} | ${p95 ?? 'n/a'}`,
    `speed vs v6 p50 | 1x | ${speed}x`,
    '',
    'Per-tier models',
    'tier | model',
    ...[1, 2, 3, 4].map((tier) => `T${tier} | ${map[tier]}`),
    '',
    'Per-tier mean overall',
    'tier | model | turns | mean gen ms',
    ...[1, 2, 3, 4].map((tier) => {
      const rows = generated.filter((turn) => Number(turn.jev?.modelTier) === tier);
      const mean = rows.length
        ? Math.round(rows.reduce((sum, turn) => sum + Number(turn.genLatencyMs ?? turn.model?.genLatencyMs ?? 0), 0) / rows.length)
        : 'n/a';
      return `T${tier} | ${map[tier]} | ${rows.length} | ${mean}`;
    }),
    '',
    'TIMINGS',
    'turn | tier | model | gen ms | jev ms',
    ...(generated.length
      ? generated.map((turn) => {
        const gen = Number(turn.genLatencyMs ?? turn.model?.genLatencyMs);
        const jev = Number(turn.jevLatencyMs ?? turn.jev?.jevLatencyMs);
        const model = modelIdOf(turn);
        return `${turn.turnIndex} | ${turn.jev?.modelTier} | ${model} | ${gen} | ${jev}`;
      })
      : ['none']),
    '',
    'Roster / Collaborators',
    roster.length ? `named in this live transcript: ${roster.join(', ')}` : 'named in this live transcript: none recorded',
  ];
  const meta = [
    'Meta',
    'source=live-app (not sim)',
    `pack_id: ${shape.pack_id}`,
    `turns: ${summary.turnCount}`,
    `tiers used: ${tiersUsed}`,
    `models used: ${modelsUsed}`,
    `session: ${doc.sessionToken || ''}`,
    `HEAD: ${shape.head}`,
    `dpl: ${shape.dpl}`,
    `voice: ${shape.voiceStatus}`,
    `status: ${shape.status}`,
    `missing_app_open: ${shape.missingAppOpen === true || shape.missing_app_open === true}`,
    `jev_first: ${shape.jevFirst === true ? 'yes' : 'no'}`,
    `session_e2e_ms: ${summary.sessionE2eMs}`,
    shape.missing_app_open
      ? 'APP open: missing from this live transcript. Not invented.'
      : 'APP open: stored live opener before the first customer line.',
    shape.missing_app_open_next || '',
  ].filter((line) => line !== undefined);
  const transcript = [];
  for (const turn of doc.turns) {
    const label = turn.role === 'app' ? `APP to ${name}:` : `${name}:`;
    transcript.push(label);
    if (turn.role === 'app' && Array.isArray(turn.beats)) {
      for (const beat of turn.beats) {
        const value = String(beat || '').trim();
        if (value) transcript.push(`beat: ${value}`);
      }
    }
    transcript.push(...wrapLines(turn.text, 88));
    if (turn.role === 'app') transcript.push(...appTimingLines(turn));
    transcript.push('');
  }
  const notes = [
    'Correction notes',
    '',
    'Blank page for a highlight pass.',
    'No invented app copy on this page.',
  ];
  return [cover, meta, transcript, notes].map((lines) => lines.flatMap((line) => wrapLines(line, 92)));
}

function paginate(lines, pageSize, header) {
  const pages = [];
  let index = 0;
  while (index < lines.length) {
    const room = pages.length === 0 ? pageSize : pageSize - 2;
    const slice = lines.slice(index, index + room);
    pages.push(pages.length === 0 || !header ? slice : [header, '', ...slice]);
    index += room;
  }
  return pages.length ? pages : [[]];
}

function pdfEscape(value) {
  return pdfAscii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/·/g, '\\267');
}

export function formatLiveTimingLine({ gen, model, tier, jevMs, maxTokens }) {
  const line = `timing: gen=${gen}ms model=${model} tier=${tier} jev=${jevMs}ms max_tokens=${maxTokens}`;
  if (/zev/i.test(line)) throw new Error('refused: timing line contained zev');
  if (!/^timing: gen=\d+ms model=\S+ tier=[1-4] jev=\d+ms max_tokens=\d+$/.test(line)) {
    throw new Error('refused: timing line is not jev=');
  }
  return line;
}

function timingStats(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, p50: 'n/a', p95: 'n/a', mean: 'n/a', max: 'n/a' };
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  const mean = Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length);
  return { count: sorted.length, p50: pick(50), p95: pick(95), mean, max: sorted[sorted.length - 1] };
}

export function rosterLines(doc) {
  const party = doc?.party || {};
  const primary = party.primary || {};
  const owner = primary.name || doc?.customerName || doc?.targetPerson || 'unknown';
  const lines = [`Owner: ${owner} (${primary.role || 'Owner'})`];
  const collaborators = Array.isArray(party.collaborators) ? party.collaborators : [];
  if (collaborators.length) {
    lines.push(`Collaborators: ${collaborators.map((person) => `${person.name} (payer=${person.payer || 'owner'})`).join(', ')}`);
  }
  const kids = Array.isArray(party.preference_subjects) ? party.preference_subjects : [];
  if (kids.length) lines.push(`Kids (silent): ${kids.map((kid) => `${kid.name} ${kid.age}`).join(', ')}`);
  const viewers = Array.isArray(party.viewers) ? party.viewers : [];
  const editors = Array.isArray(party.editors) ? party.editors : [];
  if (viewers.length || editors.length) {
    lines.push(`Viewer: ${viewers.map((person) => person.name).join(', ')} · Editor: ${editors.map((person) => person.name).join(', ')}`);
  }
  return lines;
}

export function liveV7Pack(doc, shape) {
  const generated = (doc.turns || []).filter((turn) => turn.role === 'app' && turn.jev?.jevRan === true);
  const gens = generated.map((turn) => Number(turn.genLatencyMs ?? turn.model?.genLatencyMs));
  const overall = timingStats(gens);
  const map = bakeoffTierModels();
  const trip = shape.trip || 'untitled';
  const title = `Dialog Pack — ${trip} v7 Tier 1–4`;
  const timingRows = [
    ['Pack', 'Model(s)', 'n', 'p50 ms', 'p95 ms', 'mean ms', 'max ms'],
    ['v6', 'openai/gpt-5-mini', '23', '28834', '39693', '27833', '44762'],
    ['v7 overall', 'T1–4 cycle', String(overall.count), String(overall.p50), String(overall.p95), String(overall.mean), String(overall.max)],
  ];
  for (const tier of [1, 2, 3, 4]) {
    const rows = generated.filter((turn) => Number(turn.jev?.modelTier) === tier);
    const stats = timingStats(rows.map((turn) => Number(turn.genLatencyMs ?? turn.model?.genLatencyMs)));
    timingRows.push([`v7 T${tier}`, map[tier], String(stats.count), String(stats.p50), String(stats.p95), String(stats.mean), String(stats.max)]);
  }
  const speed = Number.isFinite(Number(overall.p50)) && Number(overall.p50) > 0
    ? (V6_GPT5_MINI_P50_MS / Number(overall.p50)).toFixed(2)
    : 'n/a';
  const name = String(doc.targetPerson || 'customer').toUpperCase();
  return {
    title,
    pack_id: shape.pack_id,
    footer_id: shape.pack_id,
    turns_line: `turns=${shape.summary.turnCount} (customer ${shape.summary.customerTurns} / app ${shape.summary.appTurns}) · response_ready=n/a · needs_repair=n/a`,
    headline: 'Live app capture. Quality scores are not judged on this drop. Timings are measured gen ms.',
    quality_rows: [
      ['Metric', 'v6 gpt-5-mini', 'v7 Tier 1–4'],
      ['App turns', '23', String(generated.length)],
      ['Mean overall_quality', '3.913', 'not judged'],
      ['Histogram (overall)', '5×6, 4×13, 2×4', 'not judged'],
      ['needs_repair', '15', 'not judged'],
      ['Dialog rollup overall', '3', 'not judged'],
      ['Dialog needs_repair', 'True', 'not judged'],
      ['Dialog response_ready', 'False', 'not judged'],
    ],
    tier_rows: [
      ['Tier', 'Model', 'Mean overall'],
      ...[1, 2, 3, 4].map((tier) => [`T${tier}`, map[tier], 'not judged']),
    ],
    timing_rows: timingRows,
    speedup: `Speedup (p50): this live session is ${speed}× faster than v6 gpt-5-mini main (~28834ms → ~${overall.p50}ms). Metric: live genLatencyMs vs published v6 mainModelElapsedMs.`,
    recipe: [
      ['mode', 'live-app'],
      ['canonical', 'tier_models.json'],
      ['no_gpt5mini', 'True'],
      ['no_freestyle_app', 'True'],
      ['no_dialog_app_respond', 'True'],
      ['no_dialog_vacation_test_turn', 'True'],
      ['source', 'live-vacation-app'],
      ['tier_models', 'dialog-runners/tier_models.json'],
    ],
    roster: rosterLines(doc),
    beats: [...new Set(generated.flatMap((turn) => (Array.isArray(turn.beats) ? turn.beats : [])))].join(', ') || '(none stored)',
    judge: 'response_ready=n/a · needs_repair=n/a. scores: not judged. This live drop has no dialog judge.',
    turns: (doc.turns || []).map((turn) => {
      const app = turn.role === 'app';
      const generatedTurn = app && turn.jev?.jevRan === true;
      const beat = Array.isArray(turn.beats) && turn.beats.length ? turn.beats.join(',') : (generatedTurn ? 'live' : 'open');
      const model = modelIdOf(turn);
      const meta = [`n=${turn.turnIndex}`, `beat=${beat}`];
      if (generatedTurn) meta.push(`model=${model}`, `tier=${turn.jev.modelTier}`);
      const gen = Number(turn.genLatencyMs ?? turn.model?.genLatencyMs);
      const jevMs = Number(turn.jevLatencyMs ?? turn.jev?.jevLatencyMs);
      const maxTokens = Number(turn.maxTokens ?? turn.model?.maxTokens ?? 900);
      const speaker = app ? 'APP' : String(turn.speakerName || name).split(/\s+/)[0].toUpperCase();
      return {
        label: `T${turn.turnIndex} ${speaker}`,
        meta: meta.join(' · '),
        app,
        text: String(turn.text || ''),
        quality: generatedTurn ? 'quality: not judged' : '',
        timing: generatedTurn ? formatLiveTimingLine({
          gen,
          model,
          tier: turn.jev.modelTier,
          jevMs,
          maxTokens,
        }) : '',
      };
    }),
  };
}

export function renderLiveTranscriptPdf(doc, options = {}) {
  const checked = assertLiveTranscript(doc);
  const shape = assessPackShape(checked, options);
  const pack = liveV7Pack(checked, shape);
  const script = fileURLToPath(new URL('./live_v7_dialog_pdf.py', import.meta.url));
  const result = spawnSync('python3', [script], { input: JSON.stringify(pack), maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`refused: v7 PDF chrome failed: ${result.stderr?.toString() || result.status}`);
  }
  return Buffer.from(result.stdout);
}


export function extractPdfText(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-pdf-text-'));
  const file = path.join(dir, 'in.pdf');
  fs.writeFileSync(file, Buffer.from(buffer));
  const result = spawnSync('python3', ['-c', 'from pypdf import PdfReader; import sys; print("\\n".join((p.extract_text() or "") for p in PdfReader(sys.argv[1]).pages))', file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  if (result.status !== 0) throw new Error(result.stderr || 'pdf text extract failed');
  return result.stdout;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function transcriptFromJsonl(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('refused: Dialog PDF needs a live transcript document');
  const header = JSON.parse(lines[0]);
  const turns = lines.slice(1).map((line) => {
    const row = JSON.parse(line);
    if (row.type === 'turn') {
      const { type, ...turn } = row;
      return turn;
    }
    return row;
  });
  return { ...header, turns: header.turns || turns };
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) out[key] = true;
    else {
      out[key] = value;
      index += 1;
    }
  }
  return out;
}

async function loadTranscript(args) {
  if (args.transcript) return readJson(args.transcript);
  if (args.jsonl) return transcriptFromJsonl(args.jsonl);
  if (args.session) return loadLiveTranscriptByToken(sql(process.env), args.session);
  throw new Error('refused: pass --transcript, --jsonl, or --session. Dialog PDF will not invent a transcript.');
}

function qaInput(doc, shape) {
  return {
    pack_id: shape.pack_id,
    source: 'live-app',
    grading: 'live text only',
    status: shape.status,
    missing_app_open: shape.missing_app_open,
    missing_app_open_next: shape.missing_app_open_next,
    sessionToken: shape.sessionToken,
    targetPerson: shape.targetPerson,
    trip: shape.trip,
    head: shape.head,
    dpl: shape.dpl,
    voice: shape.voiceStatus,
    capture: shape.capture,
    turns: doc.turns.map((turn) => ({
      n: turn.turnIndex,
      speaker: turn.role === 'app' ? `APP to ${doc.targetPerson}` : doc.targetPerson,
      role: turn.role,
      modality: turn.modality,
      text: turn.text,
      latency_ms: Number(turn.latencyMs),
      session_e2e_ms: Number(turn.sessionE2eMs),
      jevRan: turn.jev?.jevRan === true,
      tier: turn.jev?.jevRan === true ? turn.jev.modelTier : null,
      route: turn.jev?.routeType || null,
      modelId: turn.modelId || turn.model?.responseModel || turn.jev?.responseModel || null,
      jevLatencyMs: Number.isFinite(Number(turn.jevLatencyMs ?? turn.jev?.jevLatencyMs)) ? Number(turn.jevLatencyMs ?? turn.jev?.jevLatencyMs) : null,
      genLatencyMs: Number.isFinite(Number(turn.genLatencyMs ?? turn.model?.genLatencyMs)) ? Number(turn.genLatencyMs ?? turn.model?.genLatencyMs) : null,
      jevBeforeModel: turn.jevBeforeModel === true || turn.jev?.jevBeforeModel === true,
    })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error('refused: --out PDF path is required');
  const transcript = assertLiveTranscript(await loadTranscript(args));
  const shape = assessPackShape(transcript, { trip: args.trip, head: args.head, dpl: args.dpl });
  const pdf = renderLiveTranscriptPdf(transcript, { trip: args.trip, head: args.head, dpl: args.dpl });
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, pdf);
  if (args.dump) fs.writeFileSync(args.dump, `${JSON.stringify(transcript, null, 2)}\n`);
  if (args.jsonlOut) fs.writeFileSync(args.jsonlOut, transcriptToJsonl(transcript));
  if (args.timing) fs.writeFileSync(args.timing, `${JSON.stringify(buildTimingSummary(transcript), null, 2)}\n`);
  if (args.state) fs.writeFileSync(args.state, `${JSON.stringify(qaInput(transcript, shape), null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: shape.status,
    missing_app_open: shape.missing_app_open,
    out: path.resolve(args.out),
    pack_id: shape.pack_id,
    turns: transcript.turns.length,
    targetPerson: transcript.targetPerson,
    sessionE2eMs: shape.summary.sessionE2eMs,
  })}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    fail(error);
    process.exit(process.exitCode || 1);
  });
}

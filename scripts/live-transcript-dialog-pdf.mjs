#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../src/vacation/db.mjs';
import {
  LIVE_OPENER_PRODUCER,
  LIVE_REPLY_PRODUCER,
  LIVE_TRANSCRIPT_CAPTURE,
  loadLiveTranscriptByToken,
  transcriptToJsonl,
} from '../src/vacation/live-app-turn.mjs';
import { DIALOG_TEST_FINGERPRINT } from './vacation-app-reply-rules.mjs';

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
      if (!modelId.includes('/')) {
        throw new Error(`refused: turn ${turn.turnIndex} app reply is missing the bake-off model id`);
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
  if (fixed) return [`jev first: skipped (${turn.jev?.reason || 'fixed_onboarding_opener'})`];
  const gen = Number(turn.genLatencyMs ?? turn.model?.genLatencyMs);
  const tier = turn.jev?.modelTier;
  const model = turn.modelId || turn.model?.responseModel || turn.jev?.responseModel || 'unknown';
  const jevMs = Number(turn.jevLatencyMs ?? turn.jev?.jevLatencyMs);
  const route = turn.jev?.routeType ? ` · route=${turn.jev.routeType}` : '';
  return [
    `timing: gen=${gen}ms · tier=${tier} · model=${model}`,
    `jev first: ${jevMs}ms${route} · e2e ${Number(turn.sessionE2eMs)}ms`,
  ];
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
  for (const turn of checked.turns) {
    if (turn.jev?.jevRan !== true) continue;
    const key = String(turn.jev.modelTier);
    tierCounts[key] = (tierCounts[key] || 0) + 1;
  }
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
    grading: 'live text only',
  };
}

function packPages(doc, shape) {
  const name = doc.targetPerson;
  const summary = shape.summary;
  const tierLine = Object.keys(shape.tierCounts).sort().map((tier) => `tier ${tier}: ${shape.tierCounts[tier]}`).join(', ') || 'none';
  const cover = [
    `Dialog Pack - ${shape.trip} (live-app)`,
    `pack_id: ${shape.pack_id}`,
    `turns: ${summary.turnCount}`,
    `customer_turns: ${summary.customerTurns}`,
    `app_turns: ${summary.appTurns}`,
    `capture=${doc.capture}`,
    `session: ${doc.sessionToken || ''}`,
    `HEAD: ${shape.head}`,
    `dpl: ${shape.dpl}`,
    `voice: ${shape.voiceStatus}`,
    `status: ${shape.status}`,
    `missing_app_open: ${shape.missingAppOpen === true || shape.missing_app_open === true}`,
    '',
    'source=live-app (not sim)',
  ];
  const meta = [
    'Meta',
    'source=live-app (not sim)',
    '',
    'Overall timing',
    `session_e2e_ms: ${summary.sessionE2eMs}`,
    `turns: ${summary.turnCount}`,
    `customer_turns: ${summary.customerTurns}`,
    `app_turns: ${summary.appTurns}`,
    `voice_turns: ${summary.voiceTurns}`,
    '',
    'Jev tier counts',
    tierLine,
    '',
    shape.missing_app_open
      ? 'APP open: missing from this live transcript. Not invented.'
      : 'APP open: present as the first live app line.',
    shape.missing_app_open_next || '',
  ].filter((line) => line !== undefined);
  const transcript = [`Full transcript - APP to ${name}:`, ''];
  for (const turn of doc.turns) {
    const label = turn.role === 'app'
      ? `T${turn.turnIndex} APP to ${name}:`
      : `T${turn.turnIndex} ${name}:`;
    transcript.push(label);
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

export function renderLiveTranscriptPdf(doc, options = {}) {
  const checked = assertLiveTranscript(doc);
  const shape = assessPackShape(checked, options);
  const [cover, meta, transcript, notes] = packPages(checked, shape);
  const pageLines = [
    ...paginate(cover, 46),
    ...paginate(meta, 46),
    ...paginate(transcript, 46, `Full transcript - APP to ${checked.targetPerson}:`),
    ...paginate(notes, 46),
  ];
  const pages = pageLines.map((lines) => {
    const commands = lines.map((line) => `(${pdfEscape(line)}) Tj T*`).join('\n');
    return `BT /F1 11 Tf 54 748 Td 14 TL\n${commands}\nET`;
  });
  if (pages.length === 0) pages.push('BT /F1 11 Tf 54 748 Td ( ) Tj ET');

  const objects = new Map();
  let nextId = 1;
  const fontId = nextId++;
  const pagesId = nextId++;
  const pageIds = [];
  const contentIds = [];
  for (const stream of pages) {
    const contentId = nextId++;
    contentIds.push(contentId);
    objects.set(contentId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    const pageId = nextId++;
    pageIds.push(pageId);
    objects.set(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
  }
  objects.set(fontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.set(pagesId, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  const catalogId = nextId++;
  objects.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < nextId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf);
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${nextId}\n`;
  pdf += '0000000000 65535 f \n';
  for (let id = 1; id < nextId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export function extractPdfText(buffer) {
  const raw = Buffer.from(buffer).toString('latin1');
  const parts = [];
  const pattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let match = pattern.exec(raw);
  while (match) {
    parts.push(match[1].replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))).replace(/\\([\\()])/g, '$1'));
    match = pattern.exec(raw);
  }
  return parts.join('\n');
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

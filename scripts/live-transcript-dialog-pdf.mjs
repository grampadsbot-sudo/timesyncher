#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../src/vacation/db.mjs';
import {
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
  for (const turn of turns) {
    if (turn.role !== 'customer' && turn.role !== 'app') {
      throw new Error(`refused: turn ${turn.turnIndex} role must be customer or app`);
    }
    if (turn.role !== expect) {
      throw new Error(`refused: turn ${turn.turnIndex} is ${turn.role}; expected ${expect} so every customer turn has the live app reply`);
    }
    expect = turn.role === 'customer' ? 'app' : 'customer';
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
      if (turn.replyProducer !== LIVE_REPLY_PRODUCER) {
        throw new Error(`refused: turn ${turn.turnIndex} app text did not come from ${LIVE_REPLY_PRODUCER}`);
      }
      if (turn.jev.jevRan !== true) {
        throw new Error(`refused: turn ${turn.turnIndex} app text exists without a real Jev classify`);
      }
      if (text.includes(DIALOG_TEST_FINGERPRINT) || text.includes(CANNED_APP_REPLY) || BANNED_GENERATORS.test(text)) {
        throw new Error(`refused: turn ${turn.turnIndex} app text is invented or stamped for a dialog pack`);
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
    })),
  };
}

function pdfAscii(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[^\n\x20-\x7E]/g, '?');
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

function transcriptLines(doc) {
  const summary = buildTimingSummary(doc);
  const lines = [
    'TimeSyncher Vacation live transcript',
    `target_person: ${doc.targetPerson}`,
    `capture: ${doc.capture}`,
    `session: ${doc.sessionToken || ''}`,
    '',
    'OVERALL TIMING',
    `session_e2e_ms: ${summary.sessionE2eMs}`,
    `turns: ${summary.turnCount}`,
    `customer_turns: ${summary.customerTurns}`,
    `app_turns: ${summary.appTurns}`,
    `voice_turns: ${summary.voiceTurns}`,
    '',
  ];
  for (const turn of doc.turns) {
    lines.push(`TURN ${turn.turnIndex}`);
    lines.push(`role: ${turn.role}`);
    lines.push(`modality: ${turn.modality}`);
    lines.push(`latency_ms: ${Number(turn.latencyMs)}`);
    lines.push(`session_e2e_ms: ${Number(turn.sessionE2eMs)}`);
    lines.push('Jev');
    lines.push(`jevRan: ${turn.jev.jevRan === true}`);
    if (turn.jev.jevRan === true) {
      lines.push(`tier: ${turn.jev.modelTier}`);
      lines.push(`route: ${turn.jev.routeType || ''}`);
      lines.push(`context: ${JSON.stringify(turn.jev.extraContext || {})}`);
      lines.push(`via: ${turn.jev.via || ''}`);
    } else {
      lines.push(`reason: ${turn.jev.reason || ''}`);
      lines.push(`via: ${turn.jev.via || ''}`);
    }
    if (turn.role === 'customer') lines.push(`${doc.targetPerson}:`);
    else lines.push(`APP to ${doc.targetPerson}:`);
    lines.push(...wrapLines(turn.text, 88));
    lines.push('');
  }
  return lines.flatMap((line) => wrapLines(line, 92));
}

function pdfEscape(value) {
  return pdfAscii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function renderLiveTranscriptPdf(doc) {
  const checked = assertLiveTranscript(doc);
  const lines = transcriptLines(checked);
  const pageSize = 46;
  const pages = [];
  for (let index = 0; index < lines.length; index += pageSize) {
    const slice = lines.slice(index, index + pageSize);
    const commands = slice.map((line) => `(${pdfEscape(line)}) Tj T*`).join('\n');
    pages.push(`BT /F1 11 Tf 54 748 Td 14 TL\n${commands}\nET`);
  }
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
    parts.push(match[1].replace(/\\([\\()])/g, '$1'));
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error('refused: --out PDF path is required');
  const transcript = assertLiveTranscript(await loadTranscript(args));
  const pdf = renderLiveTranscriptPdf(transcript);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, pdf);
  if (args.dump) fs.writeFileSync(args.dump, `${JSON.stringify(transcript, null, 2)}\n`);
  if (args.jsonlOut) fs.writeFileSync(args.jsonlOut, transcriptToJsonl(transcript));
  if (args.timing) fs.writeFileSync(args.timing, `${JSON.stringify(buildTimingSummary(transcript), null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    out: path.resolve(args.out),
    turns: transcript.turns.length,
    targetPerson: transcript.targetPerson,
    sessionE2eMs: buildTimingSummary(transcript).sessionE2eMs,
  })}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    fail(error);
    process.exit(process.exitCode || 1);
  });
}

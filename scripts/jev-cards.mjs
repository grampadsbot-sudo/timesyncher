import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REGISTRY_REL = 'evals/jev/registry.json';

function lineNumber(text, index) {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}

function blockEnd(text, start) {
  const openChar = text[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (quote === '`' && c === '$' && text[i + 1] === '{') {
        i += 2;
        let inner = 1;
        while (i < text.length && inner) {
          if (text[i] === '{') inner += 1;
          else if (text[i] === '}') inner -= 1;
          i += 1;
        }
        i -= 1;
        continue;
      }
      if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === openChar) depth += 1;
    else if (c === closeChar) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function extractAfter(text, anchor, marker) {
  const at = text.indexOf(anchor);
  if (at < 0) return null;
  const slice = text.slice(at);
  const rel = slice.indexOf(marker);
  if (rel < 0) return null;
  const brace = slice.indexOf('{', rel);
  if (brace < 0) return null;
  const end = blockEnd(slice, brace);
  return { literal: slice.slice(brace, end), index: at + brace };
}

function extractConst(text, name) {
  const re = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*`);
  const match = re.exec(text);
  if (!match) return null;
  const openAt = match.index + match[0].length;
  const open = text[openAt];
  if (open !== '{' && open !== '[') return null;
  return text.slice(openAt, blockEnd(text, openAt));
}

function hashText(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeLiteral(literal) {
  return literal.replace(/\s+/g, ' ').trim();
}

function loadRegistry(cwd = process.cwd()) {
  const file = path.join(cwd, REGISTRY_REL);
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.cards || [];
}

export function cardRecords(cwd = process.cwd()) {
  const records = [];
  for (const card of loadRegistry(cwd)) {
    const abs = path.join(cwd, card.file);
    const source = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    const marker = card.extract === 'function' ? 'function' : (card.extract === 'object' ? '=' : 'questions:');
    const found = source ? extractAfter(source, card.anchor, marker) : null;
    const literal = found ? found.literal : '';
    const cardHash = hashText(literal ? normalizeLiteral(literal) : `missing:${card.id}`);
    const labeledRel = `evals/jev/${card.id}/labeled.jsonl`;
    const labeledAbs = path.join(cwd, labeledRel);
    const labeledBody = fs.existsSync(labeledAbs) ? fs.readFileSync(labeledAbs) : null;
    const labeledSetHash = labeledBody ? hashText(labeledBody) : 'missing';
    const consts = {};
    for (const name of card.consts || []) {
      const body = extractConst(source, name);
      if (body) consts[name] = body;
    }
    const receiptAbs = path.join(cwd, 'evals/jev', card.id, 'receipt.json');
    let receipt = null;
    if (fs.existsSync(receiptAbs)) {
      try {
        receipt = JSON.parse(fs.readFileSync(receiptAbs, 'utf8'));
      } catch {
        receipt = null;
      }
    }
    records.push({
      id: card.id,
      file: card.file,
      line: found ? lineNumber(source, found.index) : 1,
      literal,
      consts,
      cardHash,
      labeledSetHash,
      labeledRel,
      modelHint: (source.slice(Math.max(0, (found ? found.index : 0) - 400), found ? found.index : 0).match(/model:\s*['"]([^'"]+)['"]/) || [])[1] || '',
      receipt,
    });
  }
  return records;
}

export function receiptMatches(record) {
  const receipt = record.receipt;
  return Boolean(receipt && receipt.passed === true && receipt.cardHash === record.cardHash && receipt.labeledSetHash === record.labeledSetHash);
}

export function jevCardFindings(cwd = process.cwd()) {
  const findings = [];
  for (const record of cardRecords(cwd)) {
    if (receiptMatches(record)) continue;
    findings.push({
      rule: 'JEV-CARD-EVAL',
      file: record.file,
      line: record.line,
      symbol_or_pattern: `${record.id} ${record.cardHash.slice(0, 12)} ${record.labeledSetHash.slice(0, 12)}`,
    });
  }
  return findings;
}

export function questionsFrom(record) {
  const context = {};
  for (const [name, literal] of Object.entries(record.consts || {})) {
    context[name] = vm.runInNewContext(`(${literal})`, {}, { timeout: 1000 });
  }
  return vm.runInNewContext(`(${record.literal})`, context, { timeout: 1000 });
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const DEFAULT_TERMS = fileURLToPath(new URL('./dialog-bar-terms.json', import.meta.url));
const RULE_ORDER = [
  'BAR-RESERVATION-PAYMENT',
  'BAR-SPLIT-PAYER',
  'BAR-UNLIMITED-WORDING',
  'BAR-THING-CUSTOMER',
  'BAR-NOTES-WHERE',
  'BAR-COLLAB-URL',
];

export function loadBarTerms(file = DEFAULT_TERMS) {
  const terms = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!terms || typeof terms.version !== 'string' || !terms.rules) throw new Error('dialog bar terms missing version or rules');
  return terms;
}

export function checkerVersion(terms = loadBarTerms()) {
  return terms.version;
}

export function gitSha(cwd = process.cwd()) {
  const shown = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  return shown.status === 0 ? shown.stdout.trim() : 'unknown';
}

function lineNumber(text, index) {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}

function snippet(value, index, length) {
  const start = Math.max(0, index - 24);
  const end = Math.min(value.length, index + length + 24);
  return value.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 80);
}

function compile(source, flags) {
  return new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
}

function customerText(value, thingPattern) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (thingPattern && thingPattern.test(trimmed) && trimmed.length <= 40) {
    thingPattern.lastIndex = 0;
    return true;
  }
  return /\s/.test(trimmed) && trimmed.length >= 12;
}

function walkStrings(text, onString) {
  let quote = '';
  let start = 0;
  let value = '';
  let valueStart = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (!quote) {
      if (c === "'" || c === '"' || c === '`') {
        quote = c;
        start = i;
        value = '';
        valueStart = i + 1;
      }
      continue;
    }
    if ((quote === "'" || quote === '"') && (c === '\n' || c === '\r')) {
      quote = '';
      continue;
    }
    if (c === '\\') {
      value += text[i + 1] || '';
      i += 1;
      continue;
    }
    if (quote === '`' && c === '$' && text[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < text.length && depth) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') depth -= 1;
        i += 1;
      }
      i -= 1;
      value += ' ';
      continue;
    }
    if (c === quote) {
      onString({ quote, start, end: i + 1, fileStart: valueStart, value });
      quote = '';
      continue;
    }
    value += c;
  }
}

function allowHits(prose, allows, rule) {
  const spans = [];
  for (const allow of allows || []) {
    if (allow.rules && !allow.rules.includes(rule)) continue;
    const re = compile(allow.pattern, 'i');
    let match = re.exec(prose);
    while (match) {
      spans.push([match.index, match.index + match[0].length]);
      if (match.index === re.lastIndex) re.lastIndex += 1;
      match = re.exec(prose);
    }
  }
  return spans;
}

function covered(spans, start, end) {
  return spans.some(([from, to]) => start < to && end > from);
}

function termHits(prose, terms, ruleId) {
  const rule = terms.rules[ruleId];
  if (!rule) return [];
  const allows = ruleId === 'BAR-RESERVATION-PAYMENT' && (terms.allow || []).some((allow) => (!allow.rules || allow.rules.includes(ruleId)) && compile(allow.pattern, 'i').test(prose))
    ? [[0, prose.length]]
    : allowHits(prose, terms.allow, ruleId);
  const hits = [];
  for (const source of rule.terms) {
    const re = compile(source, rule.flags || '');
    let match = re.exec(prose);
    while (match) {
      const end = match.index + match[0].length;
      const canonical = terms.canonicalPlan || '';
      const insideCanonical = canonical && prose.slice(Math.max(0, match.index - canonical.length), end + canonical.length).toLowerCase().includes(canonical)
        && canonical.toLowerCase().includes(match[0].toLowerCase());
      if (!covered(allows, match.index, end) && !insideCanonical) {
        hits.push({ rule: ruleId, index: match.index, length: match[0].length, match: snippet(prose, match.index, match[0].length) });
      }
      if (match.index === re.lastIndex) re.lastIndex += 1;
      match = re.exec(prose);
    }
  }
  return hits;
}

function blockEnd(text, open) {
  let depth = 0;
  let quote = '';
  for (let i = open; i < text.length; i += 1) {
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
    if (c === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

function normFile(file) {
  return String(file || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function exemptSpec(terms, ruleId) {
  return (terms.exempt && terms.exempt[ruleId]) || {};
}

function pathExempt(terms, ruleId, file) {
  return (exemptSpec(terms, ruleId).paths || []).includes(normFile(file));
}

function commentSpans(text) {
  const spans = [];
  let i = 0;
  let quote = '';
  while (i < text.length) {
    const c = text[i];
    if (quote) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (quote === '`' && c === '$' && text[i + 1] === '{') {
        i += 2;
        let depth = 1;
        while (i < text.length && depth) {
          if (text[i] === '{') depth += 1;
          else if (text[i] === '}') depth -= 1;
          i += 1;
        }
        continue;
      }
      if (c === quote) quote = '';
      i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const start = i;
      while (i < text.length && text[i] !== '\n') i += 1;
      spans.push([start, i]);
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      spans.push([start, Math.min(text.length, i + 2)]);
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    i += 1;
  }
  return spans;
}

function inSpan(spans, index) {
  return spans.some(([start, end]) => index >= start && index < end);
}

function thingInternal(terms, file, text, index, prose, comments) {
  const paths = exemptSpec(terms, 'BAR-THING-CUSTOMER').internalPaths || [];
  if (!paths.includes(normFile(file))) return false;
  if (inSpan(comments, index)) return true;
  const before = text.slice(Math.max(0, index - 80), index);
  if (/new Error\s*\(\s*['"`]?\s*$/.test(before) || /skipReason\s*:\s*['"`]?\s*$/.test(before)) return true;
  if (/^Things?$/.test(String(prose || '').trim()) && !/\|\|\s*['"`]?\s*$/.test(before)) return true;
  return false;
}

function collabUrlFindings(file, text, terms) {
  if (pathExempt(terms, 'BAR-COLLAB-URL', file)) return [];
  const spec = terms.collabUrl || {};
  const nameRe = new RegExp(spec.builderName, 'i');
  const siteRe = new RegExp(spec.sitePhrase, 'i');
  const decl = /\bfunction\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/g;
  const hits = [];
  let found = decl.exec(text);
  while (found) {
    const name = found[1];
    const open = found.index + found[0].length - 1;
    const end = blockEnd(text, open);
    if (nameRe.test(name)) {
      const body = text.slice(open, end + 1);
      walkStrings(body, (item) => {
        const raw = body.slice(item.start, item.end || Math.min(body.length, item.start + 180));
        if (item.quote !== '`' || !siteRe.test(item.value) || !raw.includes('${')) return;
        hits.push({
          rule: 'BAR-COLLAB-URL',
          file,
          line: lineNumber(text, open + item.start),
          symbol_or_pattern: snippet(raw.replace(/`/g, ''), 0, raw.length),
        });
      });
    }
    decl.lastIndex = Math.max(end + 1, found.index + found[0].length);
    found = decl.exec(text);
  }
  return hits;
}

function htmlChunks(text) {
  const chunks = [];
  const scripts = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match = scripts.exec(text);
  while (match) {
    chunks.push({ index: match.index + match[0].indexOf(match[1]), kind: 'script', text: match[1] });
    match = scripts.exec(text);
  }
  let i = 0;
  while (i < text.length) {
    const lower = text.slice(i, i + 8).toLowerCase();
    if (lower.startsWith('<style')) {
      const end = text.toLowerCase().indexOf('</style>', i);
      i = end < 0 ? text.length : end + 8;
      continue;
    }
    if (lower.startsWith('<script')) {
      const end = text.toLowerCase().indexOf('</script>', i);
      i = end < 0 ? text.length : end + 9;
      continue;
    }
    if (text[i] === '<') {
      const end = text.indexOf('>', i);
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    const start = i;
    while (i < text.length && text[i] !== '<') i += 1;
    chunks.push({ index: start, kind: 'text', text: text.slice(start, i) });
  }
  return chunks;
}

export function barFindings(file, text, terms = loadBarTerms()) {
  const value = String(text || '');
  const findings = [];
  const seen = new Set();
  const thingRe = compile(terms.rules['BAR-THING-CUSTOMER'].terms[0], terms.rules['BAR-THING-CUSTOMER'].flags || '');
  const comments = commentSpans(value);
  const push = (rule, index, symbol) => {
    const key = `${rule}\0${symbol}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ rule, file, line: lineNumber(value, index), symbol_or_pattern: symbol });
  };
  const scanProse = (prose, base) => {
    if (!customerText(prose, thingRe)) return;
    for (const ruleId of Object.keys(terms.rules)) {
      if (pathExempt(terms, ruleId, file)) continue;
      if (ruleId === 'BAR-THING-CUSTOMER' && thingInternal(terms, file, value, base, prose, comments)) continue;
      for (const hit of termHits(prose, terms, ruleId)) push(ruleId, base + hit.index, hit.match);
    }
  };
  if (file.endsWith('.html')) {
    for (const chunk of htmlChunks(value)) {
      if (chunk.kind === 'script') {
        walkStrings(chunk.text, (item) => scanProse(item.value, chunk.index + item.fileStart));
      } else scanProse(chunk.text, chunk.index);
    }
  } else {
    walkStrings(value, (item) => scanProse(item.value, item.fileStart));
  }
  for (const hit of collabUrlFindings(file, value, terms)) {
    const key = `${hit.rule}\0${hit.symbol_or_pattern}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(hit);
  }
  return findings;
}

function samePerson(left, right) {
  const a = String(left || '').trim().toLowerCase();
  const b = String(right || '').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const firstA = a.split(/\s+/)[0];
  const firstB = b.split(/\s+/)[0];
  return firstA === firstB;
}

function ownerOf(pack, turns) {
  if (Array.isArray(pack)) return (turns.find((turn) => turn.role !== 'app') || {}).speaker || '';
  const primary = pack.party && pack.party.primary;
  if (pack.targetPerson) return pack.targetPerson;
  if (primary && typeof primary === 'object') return primary.name || '';
  if (typeof primary === 'string') return primary;
  return '';
}

function normalizePack(pack) {
  if (Array.isArray(pack)) {
    const turns = pack.map((turn) => ({
      n: turn.n,
      speaker: turn.speaker === 'app' ? 'app' : turn.speaker,
      role: turn.speaker === 'app' ? 'app' : 'customer',
      text: String(turn.text || ''),
      inReplyTo: turn.in_reply_to,
    }));
    return { format: 'A', owner: ownerOf(pack, turns), turns };
  }
  if (!pack || !Array.isArray(pack.turns)) throw new Error('pack must be an array of turns or an object with turns');
  const turns = pack.turns.map((turn) => ({
    n: turn.turnIndex,
    speaker: turn.role === 'app' ? 'app' : (turn.speakerName || ''),
    role: turn.role === 'app' ? 'app' : 'customer',
    text: String(turn.text || ''),
  }));
  return { format: 'B', owner: ownerOf(pack, turns), turns };
}

function addressee(model, index) {
  const turn = model.turns[index];
  if (model.format === 'A' && turn.inReplyTo != null) {
    const parent = model.turns.find((item) => item.n === turn.inReplyTo);
    if (parent && parent.role !== 'app') return parent.speaker;
  }
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (model.turns[cursor].role !== 'app') return model.turns[cursor].speaker;
  }
  return '';
}

function previousSeatTurn(model, index, seat) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const turn = model.turns[cursor];
    if (turn.role !== 'app' && samePerson(turn.speaker, seat)) return turn;
  }
  return null;
}

export function checkDialogPack(pack, terms = loadBarTerms()) {
  const model = normalizePack(pack);
  const hits = [];
  const noteRe = compile(terms.pack.noteConfirm, 'i');
  const dayRe = compile(terms.pack.day, 'i');
  const urlRe = compile(terms.pack.vacationUrl, 'i');
  const askedRe = compile(terms.pack.askedToSend, 'i');
  model.turns.forEach((turn, index) => {
    if (turn.role !== 'app') return;
    const seat = addressee(model, index);
    for (const ruleId of Object.keys(terms.rules)) {
      for (const hit of termHits(turn.text, terms, ruleId)) {
        hits.push({ turn: turn.n, speaker: 'app', addressee: seat || '-', bar: ruleId, match: hit.match });
      }
    }
    noteRe.lastIndex = 0;
    if (noteRe.test(turn.text)) {
      dayRe.lastIndex = 0;
      if (!dayRe.test(turn.text)) {
        const confirm = turn.text.match(new RegExp(terms.pack.noteConfirm, 'i'));
        hits.push({
          turn: turn.n,
          speaker: 'app',
          addressee: seat || '-',
          bar: 'BAR-NOTES-WHERE',
          match: snippet(turn.text, confirm ? confirm.index : 0, confirm ? confirm[0].length : 12),
        });
      }
    }
    urlRe.lastIndex = 0;
    const url = urlRe.exec(turn.text);
    if (url && seat && !samePerson(seat, model.owner)) {
      const prior = previousSeatTurn(model, index, seat);
      askedRe.lastIndex = 0;
      if (!(prior && askedRe.test(prior.text))) {
        hits.push({ turn: turn.n, speaker: 'app', addressee: seat, bar: 'BAR-COLLAB-URL', match: url[0].slice(0, 80) });
      }
    }
  });
  const summary = {};
  for (const bar of RULE_ORDER) {
    const count = hits.filter((hit) => hit.bar === bar).length;
    summary[bar] = { status: count ? 'FAIL' : 'PASS', count };
  }
  return { version: terms.version, hits, summary, ok: hits.length === 0 };
}

export function formatPackReport(result, sha) {
  const lines = [`dialog-pack ${result.version} ${sha}`];
  for (const hit of result.hits) lines.push(`HIT\t${hit.turn}\t${hit.speaker}\t${hit.addressee}\t${hit.bar}\t${hit.match}`);
  for (const bar of RULE_ORDER) lines.push(`SUMMARY\t${bar}\t${result.summary[bar].status}\t${result.summary[bar].count}`);
  lines.push(`dialog pack check ${result.ok ? 'passed' : 'failed'} (${result.hits.length} hits)`);
  return `${lines.join('\n')}\n`;
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === here) {
  process.stderr.write('use scripts/check-dialog-pack.mjs\n');
}

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Baselined hits report. A hit that is not in the baseline fails.
// The baseline file may shrink against the PR base branch and may not grow.
// MODEL_CLIENT is the only module allowed to call an LLM HTTP API.
// SEARCH_MODULES are the only modules allowed to call a search or place HTTP API.
// Floating promise heuristic, one line at a time: a call to a same-file async
// function or fetch, or a .then( chain, is floating unless that line has await,
// return, or void. .then is handled on that line when it has .catch or a second
// argument. Empty catch is a catch body or .catch( callback whose body is only
// whitespace or comments. import() and export * mark every export of that
// module used. A static import { name } marks only that name.

export const MODEL_CLIENT = 'scripts/vacation-app-reply-rules.mjs';
export const SEARCH_MODULES = ['src/vacation/poi-search.mjs'];
export const SPLIT_BY_FEATURE = 'src/vacation/live-app-turn.mjs';
export const BASELINE_REL = 'scripts/code-ratchet-baseline.json';
export const BASELINE_NOTE = 'existing; ratchet only shrinks';
export const FILE_SIZE_LIMIT = 500;

export const RULE_IDS = [
  'MODEL-CLIENT-ONLY',
  'SEARCH-MODULE-ONLY',
  'NO-EMPTY-CATCH',
  'NO-FLOATING-PROMISE',
  'NO-WORKAROUND-COMMENTS',
  'FILE-SIZE-500',
  'TEST-TRIP-LITERALS',
  'DEAD-CODE',
];

const CODE_EXT = new Set(['.mjs', '.js', '.cjs', '.html']);
const MODULE_EXT = new Set(['.mjs', '.js', '.cjs']);
const ROOTS = ['src', 'routes', 'scripts', 'api'];
const GUARD = new Set([
  'scripts/check-code-ratchet.mjs',
  'scripts/test_check_code_ratchet.mjs',
]);

const LLM_HOSTS = [
  ['openrouter.ai', 'openrouter.ai'],
  ['api.x.ai', 'api.x.ai'],
  ['api.openai.com', 'api.openai.com'],
  ['api.anthropic.com', 'api.anthropic.com'],
  ['api.perplexity.ai', 'api.perplexity.ai'],
  ['generativelanguage.googleapis.com', 'generativelanguage.googleapis.com'],
  ['api.groq.com', 'api.groq.com'],
  ['api.mistral.ai', 'api.mistral.ai'],
  ['api.cohere.ai', 'api.cohere.ai'],
  ['api.cohere.com', 'api.cohere.com'],
  ['api.deepseek.com', 'api.deepseek.com'],
  ['api.together.xyz', 'api.together.xyz'],
  ['api.fireworks.ai', 'api.fireworks.ai'],
];

const SEARCH_HOSTS = [
  ['api.search.brave.com', 'brave'],
  ['overpass-api.de', 'overpass'],
  ['nominatim.openstreetmap.org', 'nominatim'],
  ['api.tavily.com', 'tavily'],
  ['serpapi.com', 'serpapi'],
  ['api.yelp.com', 'yelp'],
  ['api.foursquare.com', 'foursquare'],
  ['places-api.foursquare.com', 'foursquare'],
  ['opensource.foursquare.com', 'foursquare'],
  ['locationiq.com', 'locationiq'],
  ['maps.googleapis.com', 'google-places'],
];

const TEST_TRIP_LITERALS = [
  ['\\bKimberly\\b', 'Kimberly'],
  ['\\bTyler\\b', 'Tyler'],
  ['\\bLauren\\b', 'Lauren'],
  ['las-vegas-vacation-3', 'las-vegas-vacation-3'],
  ['las-vegas-strip-vacation', 'las-vegas-strip-vacation'],
  ['the-davidson-family-trip', 'the-davidson-family-trip'],
  ['vegas-strip-staycation', 'vegas-strip-staycation'],
  ['vegas-anniversary', 'vegas-anniversary'],
];

const WORKAROUNDS = [
  [/\bTODO\b/i, 'TODO'],
  [/\bFIXME\b/i, 'FIXME'],
  [/\bHACK\b/i, 'HACK'],
  [/\bXXX\b/i, 'XXX'],
  [/\btemporary\b/i, 'temporary'],
  [/\btemp fix\b/i, 'temp fix'],
  [/\bworkaround\b/i, 'workaround'],
  [/\bfor now\b/i, 'for now'],
  [/\bquick fix\b/i, 'quick fix'],
];

function norm(file) {
  return String(file || '').split(path.sep).join('/');
}

function lineNumber(text, index) {
  let line = 1;
  const stop = Math.min(index, text.length);
  for (let i = 0; i < stop; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

export function lineCount(text) {
  const value = String(text || '');
  if (!value) return 0;
  let count = 0;
  for (let i = 0; i < value.length; i += 1) if (value[i] === '\n') count += 1;
  return value.endsWith('\n') ? count : count + 1;
}

function add(findings, seen, rule, file, text, index, symbol, tag = '') {
  const rel = norm(file);
  const key = `${rule}\0${rel}\0${symbol}`;
  if (seen.has(key)) return;
  seen.add(key);
  const finding = { rule, file: rel, line: lineNumber(text, index), symbol };
  if (tag) finding.tag = tag;
  findings.push(finding);
}

function skipped(file) {
  const rel = norm(file);
  if (GUARD.has(rel)) return true;
  const parts = rel.split('/');
  if (parts.includes('fixtures') || parts.includes('node_modules')) return true;
  if (rel.startsWith('public/assets/') || rel.startsWith('evidence/') || rel.startsWith('artifacts/')) return true;
  return false;
}

function inScope(file) {
  const rel = norm(file);
  if (rel.startsWith('src/') || rel.startsWith('routes/') || rel.startsWith('scripts/') || rel.startsWith('api/')) return true;
  return !rel.includes('/');
}

function mask(text, { comments, strings }) {
  let out = '';
  let state = 'code';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];
    if (state === 'code') {
      if (comments && c === '/' && n === '/') { out += '  '; state = 'line'; i += 1; continue; }
      if (comments && c === '/' && n === '*') { out += '  '; state = 'block'; i += 1; continue; }
      if (strings && (c === '"' || c === "'" || c === '`')) { out += c; state = c; continue; }
      out += c;
      continue;
    }
    if (state === 'line') {
      if (c === '\n') { out += '\n'; state = 'code'; continue; }
      out += ' ';
      continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { out += '  '; state = 'code'; i += 1; continue; }
      out += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (c === '\\') { out += '  '; i += 1; continue; }
    if (c === '\n' && state !== '`') { out += '\n'; continue; }
    if (c === state) { out += c; state = 'code'; continue; }
    out += c === '\n' ? '\n' : ' ';
  }
  return out;
}

function hostFindings(file, text, findings, seen, hosts, rule, allowed) {
  if (allowed.has(norm(file))) return;
  for (const [host, symbol] of hosts) {
    const index = text.indexOf(host);
    if (index >= 0) add(findings, seen, rule, file, text, index, symbol);
  }
}

function spanBrace(text, open) {
  let depth = 0;
  let state = 'code';
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];
    if (state === 'line') {
      if (c === '\n') state = 'code';
      continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { state = 'code'; i += 1; }
      continue;
    }
    if (c === '/' && n === '/') { state = 'line'; i += 1; continue; }
    if (c === '/' && n === '*') { state = 'block'; i += 1; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function bodyEmpty(text, open) {
  const end = spanBrace(text, open);
  return text.slice(open + 1, end - 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim() === '';
}

function skipSpace(text, index) {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  return i;
}

function callbackEmpty(text, index) {
  const start = skipSpace(text, index);
  let braceAt = -1;
  if (text.startsWith('function', start)) braceAt = text.indexOf('{', start);
  else {
    const arrow = text.indexOf('=>', start);
    if (arrow < 0 || arrow - start > 200) return false;
    const bodyAt = skipSpace(text, arrow + 2);
    if (text[bodyAt] !== '{') return false;
    braceAt = bodyAt;
  }
  if (braceAt < 0) return false;
  return bodyEmpty(text, braceAt);
}

function emptyCatchFindings(file, raw, findings, seen) {
  const text = mask(raw, { comments: false, strings: true });
  const clause = /(?<![.\w$])catch\b/g;
  let match = clause.exec(text);
  while (match) {
    let i = skipSpace(text, match.index + match[0].length);
    if (text[i] === '(') {
      const close = text.indexOf(')', i);
      i = close < 0 ? i : skipSpace(text, close + 1);
    }
    if (text[i] === '{' && bodyEmpty(text, i)) add(findings, seen, 'NO-EMPTY-CATCH', file, raw, match.index, 'empty-catch');
    match = clause.exec(text);
  }
  const callbacks = /\.catch\s*\(/g;
  match = callbacks.exec(text);
  while (match) {
    if (callbackEmpty(text, match.index + match[0].length)) {
      add(findings, seen, 'NO-EMPTY-CATCH', file, raw, match.index, 'empty-catch');
    }
    match = callbacks.exec(text);
  }
}

function asyncNames(text) {
  const names = new Set(['fetch']);
  const declared = /\basync\s+function\s*\*?\s*([A-Za-z_$][\w$]*)/g;
  let match = declared.exec(text);
  while (match) {
    names.add(match[1]);
    match = declared.exec(text);
  }
  const arrows = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*async\b/g;
  match = arrows.exec(text);
  while (match) {
    names.add(match[1]);
    match = arrows.exec(text);
  }
  return names;
}

function chainHead(lines, index) {
  let start = index;
  while (start > 0 && /^\s*\./.test(lines[start])) start -= 1;
  return start;
}

function chainTail(lines, index) {
  let end = index;
  while (end + 1 < lines.length && /^\s*\./.test(lines[end + 1])) end += 1;
  return end;
}

function thenHandled(line) {
  if (!/\.then\s*\(/.test(line)) return true;
  if (/\.catch\s*\(/.test(line)) return true;
  const start = line.search(/\.then\s*\(/);
  const open = line.indexOf('(', start);
  let depth = 0;
  for (let i = open; i < line.length; i += 1) {
    if (line[i] === '(') depth += 1;
    else if (line[i] === ')') {
      depth -= 1;
      if (depth === 0) return false;
    } else if (line[i] === ',' && depth === 1) return true;
  }
  return false;
}

function floatingFindings(file, raw, findings, seen) {
  const text = mask(raw, { comments: true, strings: true });
  const names = asyncNames(text);
  const lines = text.split('\n');
  let offset = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const handled = /\b(?:await|return|void)\b/.test(line);
    if (!handled) {
      const next = lines.slice(lineIndex + 1).find((item) => item.trim());
      const chained = /\.catch\s*\(/.test(line) || (next && /^\s*\./.test(next));
      for (const name of names) {
        const declared = new RegExp(`\\basync\\s+function\\s*\\*?\\s*${name}\\s*\\(|\\b(?:const|let|var)\\s+${name}\\s*=\\s*async\\b`).test(line);
        const called = new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(line);
        if (called && !declared && !/\.then\s*\(/.test(line) && !chained) {
          add(findings, seen, 'NO-FLOATING-PROMISE', file, raw, offset + line.indexOf(name), name);
        }
      }
      const chainStart = chainHead(lines, lineIndex);
      const chain = lines.slice(chainStart, chainTail(lines, lineIndex) + 1).join('\n');
      if (/\.then\s*\(/.test(line) && !thenHandled(line) && !/\.catch\s*\(|\bawait\b/.test(chain)) {
        add(findings, seen, 'NO-FLOATING-PROMISE', file, raw, offset + line.search(/\.then/), '.then');
      }
    }
    offset += line.length + 1;
  }
}

function forEachComment(text, visit) {
  let state = 'code';
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; start = i; i += 1; continue; }
      if (c === '/' && n === '*') { state = 'block'; start = i; i += 1; continue; }
      if (c === '<' && text.startsWith('<!--', i)) { state = 'html'; start = i; i += 3; continue; }
      if (c === '"' || c === "'" || c === '`') { state = c; continue; }
      continue;
    }
    if (state === 'line') {
      if (c === '\n') { visit(text.slice(start, i), start); state = 'code'; }
      continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { visit(text.slice(start, i + 2), start); state = 'code'; i += 1; }
      continue;
    }
    if (state === 'html') {
      if (c === '-' && text.startsWith('-->', i)) { visit(text.slice(start, i + 3), start); state = 'code'; i += 2; }
      continue;
    }
    if (c === '\\') { i += 1; continue; }
    if (c === state) state = 'code';
  }
  if (state === 'line') visit(text.slice(start), start);
}

function workaroundFindings(file, text, findings, seen) {
  forEachComment(text, (comment, index) => {
    for (const [pattern, symbol] of WORKAROUNDS) {
      if (pattern.test(comment)) add(findings, seen, 'NO-WORKAROUND-COMMENTS', file, text, index, symbol);
    }
  });
}

function fileSizeFindings(file, text, findings, seen) {
  const lines = lineCount(text);
  if (lines <= FILE_SIZE_LIMIT) return;
  const tag = norm(file) === SPLIT_BY_FEATURE ? 'flagged-to-split-by-feature' : '';
  add(findings, seen, 'FILE-SIZE-500', file, text, 0, `lines:${lines}`, tag);
}

function testTripFindings(file, text, findings, seen) {
  if (norm(file).split('/').includes('fixtures')) return;
  for (const [source, symbol] of TEST_TRIP_LITERALS) {
    const index = text.search(new RegExp(source));
    if (index >= 0) add(findings, seen, 'TEST-TRIP-LITERALS', file, text, index, symbol);
  }
}

function fixtureFile(file) {
  return norm(file).split('/').includes('fixtures');
}

export function scanText(file, text) {
  if (fixtureFile(file)) return [];
  const value = String(text || '');
  const findings = [];
  const seen = new Set();
  if (!GUARD.has(norm(file))) {
    hostFindings(file, value, findings, seen, LLM_HOSTS, 'MODEL-CLIENT-ONLY', new Set([MODEL_CLIENT]));
    hostFindings(file, value, findings, seen, SEARCH_HOSTS, 'SEARCH-MODULE-ONLY', new Set(SEARCH_MODULES));
    emptyCatchFindings(file, value, findings, seen);
    floatingFindings(file, value, findings, seen);
    workaroundFindings(file, value, findings, seen);
    testTripFindings(file, value, findings, seen);
  }
  fileSizeFindings(file, value, findings, seen);
  return findings;
}

function isEntry(file) {
  return file.startsWith('api/') || file.startsWith('scripts/') || !file.includes('/');
}

function resolveSpecifier(from, spec, files) {
  if (!spec.startsWith('.')) return null;
  const rel = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.split('?')[0]));
  const candidates = [rel, `${rel}.mjs`, `${rel}.js`, `${rel}.cjs`, `${rel}/index.mjs`, `${rel}/index.js`];
  return candidates.find((item) => files.has(item)) || null;
}

function clauseUses(clause) {
  const used = { names: [], namespace: false, default: false };
  const trimmed = clause.trim();
  if (/^\*\s+as\b/.test(trimmed) || trimmed === '*') {
    used.namespace = true;
    return used;
  }
  const braceAt = trimmed.indexOf('{');
  const before = (braceAt >= 0 ? trimmed.slice(0, braceAt) : trimmed).replace(/,/g, '').trim();
  if (before) used.default = true;
  if (braceAt >= 0) {
    const body = trimmed.slice(braceAt + 1, trimmed.lastIndexOf('}'));
    for (const part of body.split(',')) {
      const source = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (!source) continue;
      if (source === 'default') used.default = true;
      else used.names.push(source);
    }
  }
  return used;
}

function publicNames(inner) {
  const names = [];
  for (const part of inner.split(',')) {
    const bits = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
    const name = (bits[bits.length - 1] || '').trim();
    if (name) names.push(name);
  }
  return names;
}

function sourceNames(inner) {
  const used = { names: [], default: false };
  for (const part of inner.split(',')) {
    const source = part.trim().split(/\s+as\s+/)[0].trim();
    if (!source) continue;
    if (source === 'default') used.default = true;
    else used.names.push(source);
  }
  return used;
}

function refTarget(from, spec, files) {
  if (spec.startsWith('.')) return resolveSpecifier(from, spec, files);
  if (spec.startsWith('/')) {
    const rel = spec.slice(1).split('?')[0];
    return files.has(rel) ? rel : null;
  }
  return null;
}

function deadCodeFindings(modules, refs = []) {
  const files = new Set(modules.keys());
  const imports = new Map();
  const exporters = new Map();
  for (const [file, raw] of modules) {
    const text = mask(raw, { comments: true, strings: false });
    const imported = [];
    const fromRe = /\bimport\s+([\s\S]*?)\s+from\s*(['"])([^'"]+)\2/g;
    let match = fromRe.exec(text);
    while (match) {
      imported.push([match[1], match[3]]);
      match = fromRe.exec(text);
    }
    const sideRe = /\bimport\s*(['"])([^'"]+)\1/g;
    match = sideRe.exec(text);
    while (match) {
      imported.push(['', match[2]]);
      match = sideRe.exec(text);
    }
    const dynRe = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
    match = dynRe.exec(text);
    while (match) {
      imported.push(['*', match[2]]);
      match = dynRe.exec(text);
    }
    const starRe = /\bexport\s*\*\s*from\s*(['"])([^'"]+)\1/g;
    match = starRe.exec(text);
    while (match) {
      imported.push(['*', match[2]]);
      match = starRe.exec(text);
    }
    const expFrom = /\bexport\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"]+)\2/g;
    match = expFrom.exec(text);
    while (match) {
      const used = sourceNames(match[1]);
      imported.push([used.default ? `default, { ${used.names.join(', ')} }` : `{ ${used.names.join(', ')} }`, match[3]]);
      match = expFrom.exec(text);
    }
    imports.set(file, imported);
    const exports = new Map();
    const mark = (name, index) => { if (name && !exports.has(name)) exports.set(name, index); };
    const patterns = [
      /\bexport\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g,
      /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    ];
    for (const pattern of patterns) {
      match = pattern.exec(text);
      while (match) {
        mark(match[1], match.index);
        match = pattern.exec(text);
      }
    }
    const def = text.search(/\bexport\s+default\b/);
    if (def >= 0) mark('default', def);
    const listRe = /\bexport\s*\{([\s\S]*?)\}/g;
    match = listRe.exec(text);
    while (match) {
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 16);
      if (!/^\s*from\b/.test(after)) {
        for (const name of publicNames(match[1])) mark(name, match.index);
      }
      match = listRe.exec(text);
    }
    exporters.set(file, exports);
  }
  const importedBy = new Map();
  const usedExports = new Map();
  const use = (file, name) => {
    if (!usedExports.has(file)) usedExports.set(file, new Set());
    usedExports.get(file).add(name);
  };
  for (const [file, specs] of imports) {
    for (const [clause, spec] of specs) {
      const target = resolveSpecifier(file, spec, files);
      if (!target) continue;
      importedBy.set(target, (importedBy.get(target) || 0) + 1);
      const used = clause === '*' ? { namespace: true, names: [], default: false } : clauseUses(clause);
      if (used.namespace) {
        for (const name of exporters.get(target).keys()) use(target, name);
      } else {
        if (used.default) use(target, 'default');
        for (const name of used.names) use(target, name);
      }
    }
  }
  for (const [from, spec] of refs) {
    const target = refTarget(from, spec, files);
    if (target) importedBy.set(target, (importedBy.get(target) || 0) + 1);
  }
  const findings = [];
  const seen = new Set();
  for (const file of modules.keys()) {
    if (isEntry(file)) use(file, 'default');
  }
  for (const [file, raw] of modules) {
    if (skipped(file)) continue;
    if (!isEntry(file) && !importedBy.has(file)) add(findings, seen, 'DEAD-CODE', file, raw, 0, 'file');
    const used = usedExports.get(file) || new Set();
    for (const [name, index] of exporters.get(file)) {
      if (!used.has(name)) add(findings, seen, 'DEAD-CODE', file, raw, index, `export:${name}`);
    }
  }
  return findings;
}

function walk(cwd) {
  const files = [];
  const visit = (abs, rel) => {
    if (!fs.existsSync(abs)) return;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      if (CODE_EXT.has(path.extname(abs)) && inScope(rel)) files.push(rel);
      return;
    }
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      visit(path.join(abs, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
    }
  };
  for (const root of ROOTS) visit(path.join(cwd, root), root);
  for (const name of fs.readdirSync(cwd)) {
    const abs = path.join(cwd, name);
    if (fs.statSync(abs).isFile() && CODE_EXT.has(path.extname(name))) files.push(name);
  }
  return files;
}

export function scanRoots(cwd = process.cwd()) {
  const files = walk(cwd);
  const findings = [];
  const modules = new Map();
  for (const file of files) {
    const text = fs.readFileSync(path.join(cwd, file), 'utf8');
    findings.push(...scanText(file, text));
    if (MODULE_EXT.has(path.extname(file))) modules.set(file, text);
  }
  const refs = [];
  for (const file of files) {
    if (!file.endsWith('.html')) continue;
    const text = fs.readFileSync(path.join(cwd, file), 'utf8');
    const scripts = /<script\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1/gi;
    let match = scripts.exec(text);
    while (match) {
      refs.push([file, match[2]]);
      match = scripts.exec(text);
    }
  }
  findings.push(...deadCodeFindings(modules, refs));
  findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file) || a.symbol.localeCompare(b.symbol) || a.line - b.line);
  return findings;
}

function sizeCap(entries, file) {
  const row = (entries || []).find((entry) => entry.rule === 'FILE-SIZE-500' && entry.file === file);
  if (!row) return FILE_SIZE_LIMIT;
  const value = Number(String(row.symbol).slice('lines:'.length));
  return Number.isFinite(value) ? value : FILE_SIZE_LIMIT;
}

export function classify(findings, baseline, baseEntries = null) {
  const keys = new Set((baseline || []).map((entry) => `${entry.rule}\0${entry.file}\0${entry.symbol}`));
  const report = [];
  const fail = [];
  for (const finding of findings) {
    if (finding.rule === 'FILE-SIZE-500') {
      const lines = Number(finding.symbol.slice('lines:'.length));
      let cap = sizeCap(baseline, finding.file);
      if (baseEntries) cap = Math.min(cap, sizeCap(baseEntries, finding.file));
      if (lines > cap) fail.push({ ...finding, symbol: `lines:${lines}>${cap}` });
      else report.push(finding);
      continue;
    }
    if (keys.has(`${finding.rule}\0${finding.file}\0${finding.symbol}`)) report.push(finding);
    else fail.push(finding);
  }
  return { report, fail };
}

export function loadBaselineFile(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('baseline must be an array');
  for (const entry of parsed) {
    for (const key of ['rule', 'file', 'symbol', 'note']) {
      if (!entry || typeof entry[key] !== 'string' || !entry[key]) throw new Error(`baseline entry missing ${key}`);
    }
    if (!RULE_IDS.includes(entry.rule)) throw new Error(`unknown baseline rule ${entry.rule}`);
  }
  return parsed;
}

export function readBaseBaseline(cwd = process.cwd()) {
  const ref = process.env.BASE || process.env.GITHUB_BASE_REF || '';
  if (!ref) return { status: 'skip' };
  const shown = spawnSync('git', ['show', `origin/${ref}:${BASELINE_REL}`], { cwd, encoding: 'utf8' });
  if (shown.status !== 0) {
    const err = shown.stderr || '';
    if (/does not exist|exists on disk, but not in/i.test(err)) return { status: 'missing' };
    return { status: 'error', error: err.trim() || 'baseline ceiling unavailable' };
  }
  const parsed = JSON.parse(shown.stdout);
  if (!Array.isArray(parsed)) return { status: 'error', error: 'base baseline is not an array' };
  return { status: 'ok', count: parsed.length, entries: parsed };
}

export function evaluate(cwd = process.cwd()) {
  const baselinePath = path.join(cwd, BASELINE_REL);
  const baseline = fs.existsSync(baselinePath) ? loadBaselineFile(baselinePath) : [];
  const findings = scanRoots(cwd);
  const base = readBaseBaseline(cwd);
  const { report, fail } = classify(findings, baseline, base.status === 'ok' ? base.entries : null);
  if (base.status === 'error') {
    fail.push({ rule: 'BASELINE-GROWTH', file: BASELINE_REL, line: 1, symbol: base.error });
  } else if (base.status === 'ok' && baseline.length > base.count) {
    fail.push({
      rule: 'BASELINE-GROWTH',
      file: BASELINE_REL,
      line: 1,
      symbol: `${baseline.length}>${base.count}`,
    });
  }
  return { report, fail, baselineCount: baseline.length, base };
}

function format(finding) {
  return `${finding.rule}\t${finding.file}:${finding.line}\t${finding.symbol}${finding.tag ? `\t${finding.tag}` : ''}`;
}

function counts(findings) {
  const tally = Object.fromEntries(RULE_IDS.map((id) => [id, 0]));
  for (const finding of findings) if (tally[finding.rule] != null) tally[finding.rule] += 1;
  return tally;
}

function main() {
  const { report, fail } = evaluate(process.cwd());
  const reportCounts = counts(report);
  const failCounts = counts(fail);
  for (const id of RULE_IDS) {
    const paths = [...new Set([...report, ...fail].filter((finding) => finding.rule === id).map((finding) => finding.file))];
    process.stdout.write(`RULE\t${id}\treport=${reportCounts[id]}\tfail=${failCounts[id]}\t${paths.join(',')}\n`);
  }
  for (const finding of report) process.stdout.write(`REPORT\t${format(finding)}\n`);
  for (const finding of fail) process.stderr.write(`FAIL\t${format(finding)}\n`);
  const summary = `code ratchet check ${fail.length ? 'failed' : 'passed'} (${report.length} report, ${fail.length} fail)\n`;
  const named = `model client ${MODEL_CLIENT}\nsearch modules ${SEARCH_MODULES.join(',')}\n`;
  process.stdout.write(named);
  (fail.length ? process.stderr : process.stdout).write(summary);
  if (fail.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

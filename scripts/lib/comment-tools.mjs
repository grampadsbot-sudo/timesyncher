import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const TS_JS_LIKE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
let tsApi = null;

function typescriptApi() {
  if (tsApi) return tsApi;
  const tsPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../apps/vacation-client/node_modules/typescript',
  );
  tsApi = require(tsPath);
  return tsApi;
}

const COMMENT_SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.py', '.sh']);

const COMMENT_ROOTS = ['src', 'apps', 'scripts', 'routes', 'api', '.cursor'];

const COMMENT_SKIP_DIRS = new Set(['node_modules', 'dist', 'public', 'evidence', 'artifacts']);

const COMMENT_PATH_PREFIX_ALLOW = [
  'scripts/fixtures/code-ratchet/',
  'public/assets/',
];

const DIRECTIVE_RES = [
  /^\s*eslint-disable(?:-next-line|-line)?(?:\s|$)/,
  /^\s*eslint-enable(?:\s|$)/,
  /^\s*@ts-expect-error\b/,
  /^\s*@ts-ignore\b/,
  /^\s*@ts-nocheck\b/,
  /^\s*@vitest-environment\b/,
  /^\s*istanbul ignore\b/i,
  /^\s*c8 ignore\b/i,
  /^\s*prettier-ignore\b/,
  /^\s*biome-ignore\b/,
  /^\s*noqa\b/i,
  /^\s*type:\s*ignore\b/i,
  /^\s*shellcheck\b/i,
  /^\s*webpack(?:ChunkName|Ignore)?\b/i,
  /sourceMappingURL=/,
];

export function norm(file) {
  return String(file || '').split(path.sep).join('/');
}

export function lineNumber(text, index) {
  let line = 1;
  const stop = Math.min(index, text.length);
  for (let i = 0; i < stop; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

export function isShebangLine(text) {
  return text.startsWith('#!');
}

export function commentBody(comment) {
  let body = comment;
  if (body.startsWith('//')) body = body.slice(2);
  else if (body.startsWith('/*')) body = body.slice(2, -2);
  else if (body.startsWith('<!--')) body = body.slice(4, -3);
  else if (body.startsWith('#')) body = body.slice(1);
  return body.trim();
}

export function isAllowedComment(comment, { ext = '', lineIndex = 0, fullLine = '' } = {}) {
  if (ext === '.sh' && lineIndex === 0 && isShebangLine(fullLine.trim())) return true;
  if (ext === '.py' && lineIndex === 0 && isShebangLine(fullLine.trim())) return true;
  const body = commentBody(comment);
  if (!body) return false;
  return DIRECTIVE_RES.some((re) => re.test(body) || re.test(fullLine.trim()));
}

function scriptKindFor(file, ext) {
  const ts = typescriptApi();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.ts') return ts.ScriptKind.TS;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function forEachJsLikeComment(file, text, visit) {
  const ts = typescriptApi();
  const ext = path.extname(file);
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file, ext));
  const seen = new Set();
  const addRange = (pos, end) => {
    const key = `${pos}:${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    visit(text.slice(pos, end), pos);
  };
  const walk = (node) => {
    ts.forEachLeadingCommentRange(text, node.getFullStart(), (pos, end) => addRange(pos, end));
    ts.forEachTrailingCommentRange(text, node.end, (pos, end) => addRange(pos, end));
    for (const child of node.getChildren(sourceFile)) walk(child);
  };
  walk(sourceFile);
}

function forEachCssComment(text, visit) {
  let state = 'code';
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];
    if (state === 'code') {
      if (c === '/' && n === '*') { state = 'block'; start = i; i += 1; continue; }
      if (c === '"' || c === "'") { state = c; continue; }
      continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { visit(text.slice(start, i + 2), start); state = 'code'; i += 1; }
      continue;
    }
    if (c === state) state = 'code';
  }
}

export function forEachComment(text, visit, { ext = '', file = 'file.mjs' } = {}) {
  if (ext === '.py') return forEachPythonComment(text, visit);
  if (ext === '.sh') return forEachShellComment(text, visit);
  if (ext === '.css') return forEachCssComment(text, visit);
  if (TS_JS_LIKE.has(ext)) return forEachJsLikeComment(file, text, visit);
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

function forEachPythonComment(text, visit) {
  let state = 'code';
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (state === 'code') {
      if (c === '#') { state = 'line'; start = i; continue; }
      if (c === '"' || c === "'") { state = c; continue; }
      continue;
    }
    if (state === 'line') {
      if (c === '\n') { visit(text.slice(start, i), start); state = 'code'; }
      continue;
    }
    if (c === '\\') { i += 1; continue; }
    if (c === state) state = 'code';
  }
  if (state === 'line') visit(text.slice(start), start);
}

function forEachShellComment(text, visit) {
  forEachPythonComment(text, visit);
}

export function scanComments(file, text) {
  const ext = path.extname(file);
  const rel = norm(file);
  const lines = text.split('\n');
  const hits = [];
  forEachComment(text, (comment, index) => {
    const line = lineNumber(text, index);
    const fullLine = lines[line - 1] || '';
    if (isAllowedComment(comment, { ext, lineIndex: line - 1, fullLine })) return;
    hits.push({ file: rel, line, comment: commentBody(comment).slice(0, 160) });
  }, { ext, file: rel });
  return hits;
}

export function stripComments(text, { ext = '', file = 'file.mjs' } = {}) {
  if (ext === '.py') return stripPythonComments(text);
  if (ext === '.sh') return stripShellComments(text);
  const lines = text.split('\n');
  const spans = [];
  forEachComment(text, (comment, start) => {
    const end = start + comment.length;
    const line = lineNumber(text, start);
    const fullLine = lines[line - 1] || '';
    if (isAllowedComment(comment, { ext, lineIndex: line - 1, fullLine })) return;
    spans.push({ start, end });
  }, { ext, file });
  if (!spans.length) return text;
  spans.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const span of spans) {
    out += text.slice(pos, span.start);
    pos = span.end;
  }
  out += text.slice(pos);
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

function stripPythonComments(text) {
  const lines = text.split('\n');
  return lines
    .map((line, index) => {
      if (index === 0 && isShebangLine(line.trim())) return line;
      let state = 'code';
      let out = '';
      for (let i = 0; i < line.length; i += 1) {
        const c = line[i];
        if (state === 'code') {
          if (c === '#') {
            const comment = line.slice(i);
            if (isAllowedComment(comment, { ext: '.py', lineIndex: index, fullLine: line })) return line;
            break;
          }
          if (c === '"' || c === "'") { out += c; state = c; continue; }
          out += c;
          continue;
        }
        if (c === state) { out += c; state = 'code'; continue; }
        out += c;
      }
      return out.replace(/\s+$/, '');
    })
    .join('\n');
}

function stripShellComments(text) {
  return stripPythonComments(text);
}

export function inCommentScope(file) {
  const rel = norm(file);
  if (COMMENT_PATH_PREFIX_ALLOW.some((prefix) => rel.startsWith(prefix))) return false;
  if (!COMMENT_SCAN_EXT.has(path.extname(rel))) return false;
  const parts = rel.split('/');
  if (parts.some((part) => COMMENT_SKIP_DIRS.has(part))) return false;
  if (rel.startsWith('apps/') && parts.includes('node_modules')) return false;
  return COMMENT_ROOTS.some((root) => rel.startsWith(`${root}/`)) || (!rel.includes('/') && COMMENT_SCAN_EXT.has(path.extname(rel)));
}

export function walkCommentFiles(rootDir = '.') {
  const files = [];
  function walk(abs, relPrefix) {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      if (COMMENT_SKIP_DIRS.has(ent.name)) continue;
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
      const absPath = path.join(abs, ent.name);
      if (ent.isDirectory()) walk(absPath, rel);
      else if (inCommentScope(rel)) files.push(norm(rel));
    }
  }
  for (const root of COMMENT_ROOTS) {
    const abs = path.join(rootDir, root);
    if (fs.existsSync(abs)) walk(abs, root);
  }
  for (const ent of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (ent.isFile() && inCommentScope(ent.name)) files.push(norm(ent.name));
  }
  return files.sort();
}

export function collectCommentEvidence(files, readFile = (f) => fs.readFileSync(f, 'utf8')) {
  const evidence = [];
  for (const file of files) {
    const text = readFile(file);
    forEachComment(text, (comment, index) => {
      evidence.push({
        file,
        line: lineNumber(text, index),
        preview: commentBody(comment).slice(0, 240),
      });
    }, { ext: path.extname(file), file });
  }
  return evidence;
}

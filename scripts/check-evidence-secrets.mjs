import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_EXT = new Set(['.json', '.jsonl', '.md', '.txt', '.html', '.js', '.mjs', '.css', '.csv', '.yml', '.yaml', '.svg']);
const ROOTS = ['evidence', 'features/proof'];

const SESSION_TOKEN = /(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])[A-Za-z0-9_-]{24}(?![A-Za-z0-9_-])/g;
const SESSION_FIELD = /"sessionToken"\s*:\s*"(?!\[redacted\]")[^"]*"/g;
const SECRET_KEY = /sk_(?:live|test|proj)_[A-Za-z0-9]{8,}|sk_[A-Za-z0-9]{24,}/g;
const OPENAI_KEY = /sk-[A-Za-z0-9]{20,}/g;
const PUBLISHABLE_KEY = /pk_(?:live|test)_[A-Za-z0-9]{8,}/g;
const GITHUB_TOKEN = /ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g;
const SLACK_TOKEN = /xox[abpr]-[A-Za-z0-9-]{10,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const NAMED_HEX = /\b(?:api[_-]?key|secret|token|sessionToken|password)\b\s*[:=]\s*['"][A-Fa-f0-9]{32,}['"]/gi;
const NAMED_B64 = /\b(?:api[_-]?key|secret|token|sessionToken|password)\b\s*[:=]\s*['"][A-Za-z0-9+/_-]{40,}={0,2}['"]/gi;
const BEARER = /Bearer\s+[A-Za-z0-9._-]{8,}/gi;
const POSTGRES = /postgres(?:ql)?:\/\/\S+/gi;

const RULES = [
  ['session-token', SESSION_TOKEN],
  ['session-token-field', SESSION_FIELD],
  ['secret-key', SECRET_KEY],
  ['openai-key', OPENAI_KEY],
  ['publishable-key', PUBLISHABLE_KEY],
  ['github-token', GITHUB_TOKEN],
  ['slack-token', SLACK_TOKEN],
  ['jwt', JWT],
  ['named-hex', NAMED_HEX],
  ['named-base64', NAMED_B64],
  ['bearer', BEARER],
  ['postgres-url', POSTGRES],
];

export function findSecretHits(text) {
  const value = String(text || '');
  const hits = [];
  for (const [rule, pattern] of RULES) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) hits.push(rule);
  }
  return hits;
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function findSecretLocations(text) {
  const value = String(text || '');
  const hits = [];
  for (const [rule, pattern] of RULES) {
    pattern.lastIndex = 0;
    const match = pattern.exec(value);
    if (match) hits.push({ rule, line: lineNumber(value, match.index) });
  }
  return hits;
}

function pdfText(file) {
  const extracted = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  if (extracted.status !== 0) return '';
  return extracted.stdout || '';
}

export function scanFile(file) {
  const ext = path.extname(file).toLowerCase();
  const raw = fs.readFileSync(file);
  const asText = raw.toString('utf8');
  if (ext === '.pdf') {
    const binaryHits = findSecretLocations(raw.toString('latin1')).filter((hit) => hit.rule !== 'session-token');
    const textHits = findSecretLocations(pdfText(file));
    return [...binaryHits, ...textHits];
  }
  if (TEXT_EXT.has(ext) || ext === '') return findSecretLocations(asText);
  return findSecretLocations(raw.toString('latin1')).filter((hit) => hit.rule !== 'session-token');
}

export function scanRoots(cwd = process.cwd(), roots = ROOTS) {
  const findings = [];
  for (const root of roots) {
    const abs = path.join(cwd, root);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) {
          for (const hit of scanFile(full)) {
            findings.push({ file: path.relative(cwd, full), ...hit });
          }
        }
      }
    }
  }
  return findings;
}

function main() {
  const findings = scanRoots(process.cwd());
  if (!findings.length) {
    process.stdout.write('evidence secret check passed\n');
    return;
  }
  for (const hit of findings) {
    process.stderr.write(`${hit.file}:${hit.line} ${hit.rule}\n`);
  }
  process.stderr.write(`evidence secret check failed (${findings.length})\n`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

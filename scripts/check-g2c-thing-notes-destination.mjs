import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const scanRoots = [
  path.join(root, 'src/vacation'),
  path.join(root, 'scripts/vacation-app-reply-rules.mjs'),
];
const bannedSnippets = [
  'productThingSummary',
  'destinationFromTexts',
  'OTHER_DESTINATION',
  'SpeediShuttle from the Kona airport',
  'Arrival into Kona',
  'People matter more than a packed list',
  'The Kailua-Kona house',
  'Garden time',
  'the arrival day, after the airport shuttle',
];
const tripLiterals = [
  'Big Island',
  'Kailua-Kona',
  'Kimberly',
  'Tyler',
  'Lauren',
  'Craig',
  'Vegas',
  'April',
  'Waikiki',
];
const cleanFiles = [
  path.join(root, 'src/vacation/trip-destination.mjs'),
];

function filesUnder(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const found = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const next = path.join(target, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(next));
    else if (entry.isFile() && entry.name.endsWith('.mjs')) found.push(next);
  }
  return found;
}

function functionBody(source, name) {
  const start = source.search(new RegExp(`export function ${name}\\b`));
  if (start < 0) return '';
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

const errors = [];
const files = scanRoots.flatMap(filesUnder);
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  for (const snippet of bannedSnippets) {
    if (text.includes(snippet)) errors.push(`${rel} still contains ${JSON.stringify(snippet)}`);
  }
}
const liveTurn = fs.readFileSync(path.join(root, 'src/vacation/live-app-turn.mjs'), 'utf8');
const span = functionBody(liveTurn, 'intakeSpan');
if (!span) errors.push('intakeSpan is missing');
else if (/big island/i.test(span)) errors.push('intakeSpan still checks a hard-coded place');
const notes = functionBody(liveTurn, 'applyCustomerNotes');
if (!notes) errors.push('applyCustomerNotes is missing');
else if (/productThingSummary|description:\s*[^'']/.test(notes)) errors.push('applyCustomerNotes still writes a thing description');
if (!/resolveTripDestination/.test(liveTurn)) errors.push('live reply does not resolve destination from the saved trip or the chat');
if (!/DESTINATION_ASK/.test(liveTurn)) errors.push('live reply does not ask when destination is missing');

for (const file of cleanFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  for (const literal of tripLiterals) {
    if (text.includes(literal)) errors.push(`${rel} contains trip literal ${JSON.stringify(literal)}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log('g2c thing-notes destination check passed');

#!/usr/bin/env node
import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { scanIntakePresentationStubs } from '../src/vacation/dossier-intake-presentation-strip.mjs';

function parseArgs(argv) {
  const file = argv[2];
  let artifact = null;
  const extras = argv.slice(3);
  for (let i = 0; i < extras.length; i += 1) {
    if (extras[i] === '--artifact' && extras[i + 1]) {
      artifact = extras[i + 1];
      i += 1;
    }
  }
  return { file, artifact };
}

const { file, artifact } = parseArgs(process.argv);
if (!file) {
  console.error('usage: node scripts/intake_presentation_stub_scan_cli.mjs <shared-trip.json> [--artifact <path>]');
  process.exit(2);
}

const shared = JSON.parse(readFileSync(file, 'utf8'));
const report = scanIntakePresentationStubs(shared, { includeMatches: true });
const stdoutPayload = {
  pass: report.pass,
  matchCount: report.matchCount,
  matches: (report.matches || []).map((m) => ({
    placeId: m.placeId,
    path: m.path,
    reason: m.reason,
    category: m.category,
    name: m.name,
    excerpt: m.excerpt,
  })),
};
const stdoutLine = `${JSON.stringify(stdoutPayload)}\n`;
const fullLine = `${JSON.stringify(report)}\n`;
if (artifact) {
  writeFileSync(artifact, fullLine);
}
writeSync(1, stdoutLine);
process.exit(report.pass ? 0 : 1);

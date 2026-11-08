#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { scanIntakePresentationStubs } from '../src/vacation/dossier-intake-presentation-strip.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/intake_presentation_stub_scan_cli.mjs <shared-trip.json>');
  process.exit(2);
}
const shared = JSON.parse(readFileSync(file, 'utf8'));
const report = scanIntakePresentationStubs(shared);
process.stdout.write(`${JSON.stringify(report)}\n`);
process.exit(report.pass ? 0 : 1);

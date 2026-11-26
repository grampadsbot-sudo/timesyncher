#!/usr/bin/env node
import {
  tripThingGateViolations,
  tripThingsRealGatePasses,
} from '../src/vacation/intake-thing-admission.mjs';

export { tripThingGateViolations, tripThingsRealGatePasses };

export function formatTripThingsRealReport(violations = []) {
  return violations.map((row) => `${row.code}\t${row.title || ''}\t${row.reason || ''}`.trim()).join('\n');
}

function parseArgs(argv) {
  const json = argv.includes('--json');
  const itinerary = [];
  for (const arg of argv) {
    if (arg.startsWith('--itinerary-title=')) itinerary.push(arg.slice('--itinerary-title='.length));
  }
  return { json, itinerary };
}

async function loadThingsFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : parsed.things || [];
}

async function main() {
  const { json, itinerary } = parseArgs(process.argv.slice(2));
  const things = await loadThingsFromStdin();
  const violations = tripThingGateViolations(things, { itineraryTitles: itinerary });
  const pass = violations.length === 0;
  if (json) {
    process.stdout.write(`${JSON.stringify({ pass, violations })}\n`);
  } else {
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'}\n`);
    if (violations.length) process.stdout.write(`${formatTripThingsRealReport(violations)}\n`);
  }
  process.exit(pass ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exit(2);
  });
}
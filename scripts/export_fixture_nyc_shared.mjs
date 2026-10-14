#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outDir = fileURLToPath(new URL('../fixture-nyc', import.meta.url));
const outPath = `${outDir}/nyc-shared.json`;

const shared = buildNycCraigKimDaybydayTrip();
shared.budget = [];

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(shared)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, wrote: outPath, places: shared.places?.length ?? 0 }));

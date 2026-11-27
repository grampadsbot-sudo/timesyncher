import fs from 'node:fs';
import path from 'node:path';

export const FINISH_ARTIFACTS = [
  'dialog-pdf',
  'keepsake-pdf',
  'screenshots',
  'admin-dialog',
  'admin-turns',
  'admin-astra-json',
  'admin-timing-summary',
];

export function finishArtifactReport({
  dialogPdf = false,
  keepsakePdf = false,
  screenshotCount = 0,
  turnCount = 0,
  astraJsonTurns = 0,
  timingTurns = 0,
} = {}) {
  const shots = Number(screenshotCount) || 0;
  const turns = Number(turnCount) || 0;
  const astra = Number(astraJsonTurns) || 0;
  const timing = Number(timingTurns) || 0;
  const present = {
    'dialog-pdf': dialogPdf === true,
    'keepsake-pdf': keepsakePdf === true,
    screenshots: shots > 0,
    'admin-dialog': dialogPdf === true && turns > 0,
    'admin-turns': turns > 0,
    'admin-astra-json': turns > 0 && astra >= turns,
    'admin-timing-summary': timing > 0,
  };
  const rows = FINISH_ARTIFACTS.map((id) => ({ id, state: present[id] ? 'present' : 'missing' }));
  const missing = rows.filter((row) => row.state === 'missing').map((row) => row.id);
  return { rows, missing, complete: missing.length === 0 };
}

export function ringArtifactMessage(report) {
  const rows = report?.rows || [];
  return rows.map((row) => `${row.id}: ${row.state}`).join('\n');
}

export function liveFinishReason({ itineraryOk, hitTurnCap, artifacts, priorReason = '' } = {}) {
  const prior = String(priorReason || '');
  if (prior && !/^(cap-without-required|missing-required)(:|$)/.test(prior)) return prior;
  const missingArtifacts = artifacts?.missing || [];
  if (itineraryOk && artifacts?.complete) return '';
  if (hitTurnCap && itineraryOk) return `missing-artifacts:${missingArtifacts.join(',')}`;
  if (hitTurnCap) {
    const missing = [itineraryOk ? null : 'itinerary', ...missingArtifacts].filter(Boolean);
    return `cap-without-required:${missing.join(',')}`;
  }
  if (!itineraryOk) return 'missing-required:itinerary';
  return `missing-artifacts:${missingArtifacts.join(',')}`;
}

function finishArtifactRecord(report, extra = {}) {
  const done = extra.itineraryOk === true && report.complete === true && extra.harnessOk !== false;
  return {
    done,
    itineraryCount: Number.isInteger(extra.itineraryCount) ? extra.itineraryCount : null,
    storagePath: extra.storagePath || '',
    artifacts: Object.fromEntries(report.rows.map((row) => [row.id, row.state])),
    missing: report.missing,
    ring: ringArtifactMessage(report),
  };
}

export function writeFinishArtifacts(outDir, report, extra = {}) {
  const record = finishArtifactRecord(report, extra);
  if (!outDir) return record;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'finish-artifacts.json'), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

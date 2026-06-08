import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildAcceptanceArtifact, renderAcceptanceCopyHtml } from '../src/onboarding/eula-acceptance-core.mjs';

const session = JSON.parse(readFileSync('public/onboarding/sessions/cd-review-current-eula.json', 'utf8'));
const eulaText = readFileSync('public/legal/eula-2026-04-initial-draft.md', 'utf8');
const receipt = buildAcceptanceArtifact({
  session,
  eulaText,
  acceptedByName: 'C D Test Acceptance',
  acceptedByClientKey: session.clientKey,
  acceptedAt: '2026-04-27T18:40:00.000Z',
  userAgent: 'node-smoke-test',
});
if (receipt.eula.status !== 'accepted') throw new Error('receipt not accepted');
if (receipt.eula.version !== '2026-04-initial-draft') throw new Error('wrong eula version');
if (!/^[a-f0-9]{64}$/.test(receipt.eula.eulaTextSha256)) throw new Error('missing EULA hash');
if (!/^[a-f0-9]{64}$/.test(receipt.receiptSha256)) throw new Error('missing receipt hash');
if (!receipt.capabilitySnapshot.selectedFunctionality.includes('calendar_management')) throw new Error('missing capability snapshot');
const outDir = 'tmp/eula-acceptance-smoke';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
writeFileSync(join(outDir, 'acceptance-copy.html'), renderAcceptanceCopyHtml({ receipt, eulaText }));
console.log(JSON.stringify({ ok: true, outDir, receiptSha256: receipt.receiptSha256, eulaTextSha256: receipt.eula.eulaTextSha256 }, null, 2));

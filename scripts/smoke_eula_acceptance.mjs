import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildAcceptanceArtifact, renderAcceptanceCopyHtml } from '../src/onboarding/eula-acceptance-core.mjs';

const eulaText = readFileSync('public/legal/terms-2026-06-advisory-only.md', 'utf8');
const session = {
  sessionId: 'cd-review-current-terms',
  clientKey: 'telegram:6373624711',
  clientLabel: 'C D',
  contact: { email: 'test-customer@example.com', phone: '+15551234567' },
  selectedFunctionality: [
    'vacation_planning_onboarding',
    'telegram_voice_note_intake',
    'hosted_itinerary_generation',
    'purchase_receipts_and_support',
    'advisory_only_no_delegated_actions',
  ],
  google: {
    policy: 'No Google OAuth access is requested for this vacation onboarding step.',
  },
  eula: { version: '2026-06-terms-advisory-only' },
};
const receipt = buildAcceptanceArtifact({
  session,
  eulaText,
  acceptedByName: 'C D Test Acceptance',
  acceptedByClientKey: session.clientKey,
  acceptedAt: '2026-04-27T18:40:00.000Z',
  userAgent: 'node-smoke-test',
});
if (receipt.eula.status !== 'accepted') throw new Error('receipt not accepted');
if (receipt.eula.version !== '2026-06-terms-advisory-only') throw new Error('wrong terms version');
if (!/^[a-f0-9]{64}$/.test(receipt.eula.eulaTextSha256)) throw new Error('missing terms hash');
if (!/^[a-f0-9]{64}$/.test(receipt.receiptSha256)) throw new Error('missing receipt hash');
if (!receipt.capabilitySnapshot.selectedFunctionality.includes('advisory_only_no_delegated_actions')) throw new Error('missing advisory-only capability snapshot');
const outDir = 'tmp/eula-acceptance-smoke';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
writeFileSync(join(outDir, 'acceptance-copy.html'), renderAcceptanceCopyHtml({ receipt, eulaText }));
console.log(JSON.stringify({ ok: true, outDir, receiptSha256: receipt.receiptSha256, eulaTextSha256: receipt.eula.eulaTextSha256 }, null, 2));

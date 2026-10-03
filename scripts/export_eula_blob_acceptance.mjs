import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import { acceptanceCopyKey, receiptKey, sessionKey } from '../src/onboarding/eula-persistent-core.mjs';

function usage() {
  console.error('Usage: node scripts/export_eula_blob_acceptance.mjs <sessionId> [outputRoot]');
  process.exit(2);
}

const sessionId = process.argv[2];
const outputRoot = process.argv[3] || 'backups/eula-acceptances';
if (!sessionId) usage();
if (!process.env.DATABASE_URL && !process.env.NEON_DATABASE_URL) {
  throw new Error('DATABASE_URL or NEON_DATABASE_URL is required');
}

const prefix = (process.env.TIMESYNCHER_EULA_BLOB_PREFIX || 'timesyncher-eula').replace(/^\/+|\/+$/g, '');
const store = new DatabaseJsonStore({ prefix });
const artifacts = [
  { label: 'session', key: sessionKey(sessionId), filename: `${sessionId}.session.json` },
  { label: 'receipt', key: receiptKey(sessionId), filename: `${sessionId}.receipt.json` },
  { label: 'acceptanceCopy', key: acceptanceCopyKey(sessionId), filename: `${sessionId}.acceptance-copy.html` },
];

const outDir = join(outputRoot, sessionId);
mkdirSync(outDir, { recursive: true });
const manifest = {
  ok: true,
  sessionId,
  exportedAt: new Date().toISOString(),
  storePrefix: prefix,
  outputDirectory: outDir,
  artifacts: [],
};

for (const artifact of artifacts) {
  const value = await store.getDocument(artifact.key);
  if (!value) throw new Error(`Missing EULA store object for ${artifact.key}`);
  const bytes = artifact.label === 'acceptanceCopy'
    ? Buffer.from(String(value.text || ''), 'utf8')
    : Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
  const outPath = join(outDir, artifact.filename);
  writeFileSync(outPath, bytes);
  manifest.artifacts.push({ ...artifact, bytes: bytes.byteLength, path: outPath });
}

const receipt = await store.getJson(receiptKey(sessionId));
manifest.receiptSha256 = receipt.receiptSha256;
manifest.acceptedAt = receipt.eula?.acceptedAt;
manifest.clientKey = receipt.clientKey;
manifest.clientLabel = receipt.clientLabel;
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));

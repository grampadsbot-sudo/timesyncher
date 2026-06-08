import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { get } from '@vercel/blob';

function usage() {
  console.error('Usage: node scripts/export_eula_blob_acceptance.mjs <sessionId> [outputRoot]');
  process.exit(2);
}

const sessionId = process.argv[2];
const outputRoot = process.argv[3] || 'backups/eula-acceptances';
if (!sessionId) usage();
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required');

const prefix = (process.env.TIMESYNCHER_EULA_BLOB_PREFIX || 'timesyncher-eula').replace(/^\/+|\/+$/g, '');
const artifacts = [
  { label: 'session', blobPath: `${prefix}/sessions/${sessionId}.json`, filename: `${sessionId}.session.json` },
  { label: 'receipt', blobPath: `${prefix}/receipts/${sessionId}.json`, filename: `${sessionId}.receipt.json` },
  { label: 'acceptanceCopy', blobPath: `${prefix}/acceptance-copies/${sessionId}.html`, filename: `${sessionId}.acceptance-copy.html` },
];

async function readPrivateBlob(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Could not read private blob ${pathname}: status ${result?.statusCode ?? 'missing'}`);
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  return bytes;
}

const outDir = join(outputRoot, sessionId);
mkdirSync(outDir, { recursive: true });
const manifest = {
  ok: true,
  sessionId,
  exportedAt: new Date().toISOString(),
  blobPrefix: prefix,
  outputDirectory: outDir,
  artifacts: [],
};

for (const artifact of artifacts) {
  const bytes = await readPrivateBlob(artifact.blobPath);
  const outPath = join(outDir, artifact.filename);
  writeFileSync(outPath, bytes);
  manifest.artifacts.push({ ...artifact, bytes: bytes.byteLength, path: outPath });
}

const receipt = JSON.parse(Buffer.from(await readPrivateBlob(`${prefix}/receipts/${sessionId}.json`)).toString('utf8'));
manifest.receiptSha256 = receipt.receiptSha256;
manifest.acceptedAt = receipt.acceptedAt;
manifest.clientKey = receipt.clientKey;
manifest.clientLabel = receipt.clientLabel;
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));

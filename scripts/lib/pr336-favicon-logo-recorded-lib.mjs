import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyDiscoveredPageIcon } from '../../src/vacation/intake-shared-place-source.mjs';

const DEFAULT_RECORDED_DIR = fileURLToPath(new URL('../fixtures/recorded-pr336-favicon-pr491-gate-b', import.meta.url));

function recordedDir(rootDir) {
  return rootDir ? String(rootDir) : DEFAULT_RECORDED_DIR;
}

const text = (value) => String(value ?? '').trim();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function listPr336FaviconLogoRecordings(options = {}) {
  return readdirSync(recordedDir(options.rootDir))
    .filter((name) => name.endsWith('.json') && !name.includes('-response'))
    .sort();
}

function readPr336FaviconLogoRecording(fileName, options = {}) {
  const root = recordedDir(options.rootDir);
  const manifest = JSON.parse(readFileSync(join(root, fileName), 'utf8'));
  const pageMeta = JSON.parse(readFileSync(join(root, manifest.pageResponseFile), 'utf8'));
  const iconMeta = manifest.expectBound === false
    ? {}
    : JSON.parse(readFileSync(join(root, manifest.iconResponseFile), 'utf8'));
  const pageBody = readFileSync(join(root, manifest.pageBodyFile));
  if (digest(pageBody) !== text(manifest.expectedPageSha256)) {
    throw new Error(`page body sha mismatch for row ${manifest.rowId}`);
  }
  const iconBodyFile = text(manifest.iconBodyFile);
  let iconBody = Buffer.alloc(0);
  if (manifest.expectBound !== false) {
    if (!iconBodyFile) throw new Error(`missing iconBodyFile for row ${manifest.rowId}`);
    iconBody = readFileSync(join(root, iconBodyFile));
    const iconSha = digest(iconBody);
    if (iconSha !== text(manifest.expectedIconSha256)) {
      throw new Error(`icon body sha mismatch for row ${manifest.rowId}`);
    }
    if (text(iconMeta.sha256) !== iconSha) {
      throw new Error(`icon response sha mismatch for row ${manifest.rowId}`);
    }
  }
  return { manifest, pageMeta, iconMeta, pageBody, iconBody };
}

function recordedFetchForPr336FaviconLogo({ pageMeta, iconMeta, pageBody, iconBody }) {
  const records = [
    {
      key: `text/html ${pageMeta.requestedUrl}`,
      status: pageMeta.status,
      url: pageMeta.finalUrl || pageMeta.requestedUrl,
      type: 'text/html; charset=UTF-8',
      body: pageBody.toString('utf8'),
    },
    {
      key: `image/* ${iconMeta.requestedUrl}`,
      status: iconMeta.status,
      url: iconMeta.finalUrl || iconMeta.requestedUrl,
      type: iconMeta.contentType || 'image/png',
      body: iconBody,
    },
  ];
  const byKey = new Map(records.map((row) => [row.key, row]));
  return async (url, options = {}) => {
    const requestKey = `${options.headers?.accept || ''} ${url}`;
    const record = byKey.get(requestKey);
    if (!record) throw new Error(`Missing recorded response: ${requestKey}`);
    return {
      ok: record.status === 200,
      status: record.status,
      url: record.url,
      headers: new Headers({ 'content-type': record.type }),
      text: async () => (Buffer.isBuffer(record.body) ? record.body.toString('utf8') : String(record.body || '')),
      arrayBuffer: async () => {
        const bytes = Buffer.isBuffer(record.body) ? record.body : Buffer.from(String(record.body || ''), 'utf8');
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
      body: { cancel: async () => {} },
    };
  };
}

export async function discoverPr336FaviconLogoFromRecording(fileName, options = {}) {
  const { manifest, pageMeta, iconMeta, pageBody, iconBody } = readPr336FaviconLogoRecording(fileName, options);
  if (manifest.expectBound === false) {
    return {
      rowId: manifest.rowId,
      logoUrl: '',
      logoProvenance: null,
      logoCaptureReason: text(manifest.expectedCaptureReason),
      pageSha256: digest(pageBody),
      iconSha256: '',
    };
  }
  const fetchImpl = recordedFetchForPr336FaviconLogo({ pageMeta, iconMeta, pageBody, iconBody });
  const thing = {
    website: manifest.website,
    metadata: { sourceRecord: { website: manifest.website } },
  };
  await applyDiscoveredPageIcon(thing, { fetchImpl });
  const source = thing.metadata.sourceRecord || {};
  const logoUrl = text(thing.metadata.logoUrl || source.logoUrl);
  const provenance = source.logoProvenance || null;
  const reason = text(thing.metadata.logoCaptureReason || source.logoCaptureReason);
  if (manifest.expectBound) {
    if (logoUrl !== text(manifest.expectedLogoUrl)) {
      throw new Error(`discovered logo mismatch for row ${manifest.rowId}: ${logoUrl}`);
    }
    if (!provenance || text(provenance.iconUrl) !== logoUrl || text(provenance.pageUrl) !== text(manifest.website)) {
      throw new Error(`discovered provenance mismatch for row ${manifest.rowId}`);
    }
  } else if (logoUrl || provenance) {
    throw new Error(`expected no-logo for row ${manifest.rowId} but got ${logoUrl}`);
  } else if (text(manifest.expectedCaptureReason) && reason !== text(manifest.expectedCaptureReason)) {
    throw new Error(`capture reason mismatch for row ${manifest.rowId}: ${reason}`);
  }
  return {
    rowId: manifest.rowId,
    logoUrl: logoUrl || '',
    logoProvenance: provenance,
    logoCaptureReason: reason || '',
    pageSha256: digest(pageBody),
    iconSha256: digest(iconBody),
  };
}

export function applyDiscoveredLogoToSnapshotRow(place = {}, discovered = {}) {
  const next = { ...place, sourceRecord: { ...(place.sourceRecord || {}) } };
  const sourceRecord = next.sourceRecord;
  delete sourceRecord.logoSearchEvidence;
  if (discovered.logoUrl && discovered.logoProvenance) {
    sourceRecord.logoUrl = discovered.logoUrl;
    sourceRecord.logoProvenance = discovered.logoProvenance;
    delete sourceRecord.logoCaptureReason;
    next.logoUrl = discovered.logoUrl;
  } else {
    delete sourceRecord.logoUrl;
    delete sourceRecord.logoProvenance;
    delete next.logoUrl;
    if (discovered.logoCaptureReason) sourceRecord.logoCaptureReason = discovered.logoCaptureReason;
    else delete sourceRecord.logoCaptureReason;
  }
  return next;
}

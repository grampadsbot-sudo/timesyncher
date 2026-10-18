import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyDiscoveredPageIcon } from '../../src/vacation/intake-shared-place-source.mjs';

const DEFAULT_RECORDED_DIR = fileURLToPath(new URL('../fixtures/recorded-ccab-logo-pr481-gate-b', import.meta.url));
function recordedDir(rootDir) {
  return rootDir ? String(rootDir) : DEFAULT_RECORDED_DIR;
}
const text = (value) => String(value ?? '').trim();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

const suffixes = ['com', 'org', 'net', 'edu', 'gov', 'test', 'example', 'co.uk', 'org.uk', 'com.au', 'github.io'];
function safeUrl(value) {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u : null;
  } catch { return null; }
}
function pathname(value) {
  try { return decodeURIComponent(safeUrl(value)?.pathname || ''); } catch { return ''; }
}
function registrable(value) {
  const host = safeUrl(value)?.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return '';
  const suffix = suffixes.filter((s) => host.endsWith(`.${s}`)).sort((a, b) => b.length - a.length)[0];
  if (!suffix) return '';
  return host.split('.').slice(-(suffix.split('.').length + 1)).join('.');
}
function guesser(value) {
  const u = safeUrl(value);
  if (!u) return false;
  const host = u.hostname;
  const onHost = (root) => host === root || host.endsWith(`.${root}`);
  return (onHost('google.com') && /^\/s2\/favicons(?:\/|$)/i.test(u.pathname))
    || (onHost('gstatic.com') && (/^\/faviconV2(?:\/|$)/i.test(u.pathname) || /^t[^.]*\.gstatic\.com$/i.test(host)))
    || ['duckduckgo.com', 'clearbit.com', 'icon.horse', 'faviconkit.com', 'favicongrabber.com', 'favicon.io'].some((h) => onHost(h));
}
function logoHasDeclaringDocument(record, logo, website) {
  const provenance = record.logoProvenance;
  if (!provenance || text(provenance.iconUrl) !== logo) return false;
  const source = safeUrl(provenance.pageUrl);
  if (!source || source.href === safeUrl(logo)?.href) return false;
  if (/\.(?:ico|png|jpe?g|gif|svg|webp)$/i.test(source.pathname) || guesser(source.href)) return false;
  if (!registrable(website) || registrable(source.href) !== registrable(website)) return false;
  if (provenance.verified === false) return false;
  return true;
}

export function effectiveCcabDeclaredLogoUrl(record = {}) {
  const website = text(record.website);
  const logo = text(record.logoUrl);
  if (!logo || guesser(logo)) return '';
  if (/\/favicon\.ico$/i.test(pathname(logo)) && !logoHasDeclaringDocument(record, logo, website)) return '';
  return logo;
}

export function listCcabLogoRecordings(options = {}) {
  return readdirSync(recordedDir(options.rootDir))
    .filter((name) => name.endsWith('.json') && !name.includes('-response'))
    .sort();
}

function readCcabLogoRecording(fileName, options = {}) {
  const root = recordedDir(options.rootDir);
  const manifest = JSON.parse(readFileSync(join(root, fileName), 'utf8'));
  const pageMeta = JSON.parse(readFileSync(join(root, manifest.pageResponseFile), 'utf8'));
  const iconMeta = JSON.parse(readFileSync(join(root, manifest.iconResponseFile), 'utf8'));
  const pageBody = readFileSync(join(root, manifest.pageBodyFile));
  const iconBodyFile = text(manifest.iconBodyFile);
  if (!iconBodyFile) throw new Error(`missing iconBodyFile for ${manifest.ccabKey}`);
  const iconBody = readFileSync(join(root, iconBodyFile));
  if (digest(pageBody) !== text(manifest.expectedPageSha256)) {
    throw new Error(`page body sha mismatch for ${manifest.ccabKey}`);
  }
  const iconSha = digest(iconBody);
  if (iconSha !== text(manifest.expectedIconSha256)) {
    throw new Error(`icon body sha mismatch for ${manifest.ccabKey}`);
  }
  if (text(iconMeta.sha256) !== iconSha) {
    throw new Error(`icon response sha mismatch for ${manifest.ccabKey}`);
  }
  return { manifest, pageMeta, iconMeta, pageBody, iconBody };
}

function recordedFetchForCcabLogo({ pageMeta, iconMeta, pageBody, iconBody }) {
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

export async function discoverCcabLogoFromRecording(fileName, options = {}) {
  const { manifest, pageMeta, iconMeta, pageBody, iconBody } = readCcabLogoRecording(fileName, options);
  const fetchImpl = recordedFetchForCcabLogo({ pageMeta, iconMeta, pageBody, iconBody });
  const thing = {
    website: manifest.website,
    metadata: { sourceRecord: { website: manifest.website } },
  };
  await applyDiscoveredPageIcon(thing, { fetchImpl });
  const source = thing.metadata.sourceRecord || {};
  const logoUrl = text(thing.metadata.logoUrl || source.logoUrl);
  const provenance = source.logoProvenance || null;
  if (logoUrl !== text(manifest.expectedLogoUrl)) {
    throw new Error(`discovered logo mismatch for ${manifest.ccabKey}: ${logoUrl}`);
  }
  if (!provenance || text(provenance.iconUrl) !== logoUrl || text(provenance.pageUrl) !== text(manifest.website)) {
    throw new Error(`discovered provenance mismatch for ${manifest.ccabKey}`);
  }
  return {
    ccabKey: manifest.ccabKey,
    logoUrl,
    logoProvenance: provenance,
    pageSha256: digest(pageBody),
    iconSha256: digest(iconBody),
  };
}

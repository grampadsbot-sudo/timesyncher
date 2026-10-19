#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchPageIconUrl } from '../src/vacation/page-icon-discovery.mjs';
import { PR336_FAVICON_PROVENANCE_ROW_IDS } from './fixtures/pr336-favicon-provenance-targets.mjs';
import { buildIconDeclarationHtml, iconLinkTagsFromHtml } from './lib/icon-declaration-html.mjs';

const SNAPSHOT_PATH = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
const RECORDED_DIR = fileURLToPath(new URL('./fixtures/recorded-pr336-favicon-pr491-gate-b', import.meta.url));

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'row';
}

function isoTimestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '').replace('Z', 'Z');
}

function extensionForContentType(contentType = '', url = '') {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('png')) return '.png';
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
  if (type.includes('gif')) return '.gif';
  if (type.includes('webp')) return '.webp';
  if (type.includes('svg')) return '.svg';
  if (type.includes('icon') || type.includes('octet-stream')) return '.ico';
  if (/\.png(?:$|\?)/i.test(url)) return '.png';
  if (/\.jpe?g(?:$|\?)/i.test(url)) return '.jpg';
  if (/\.svg(?:$|\?)/i.test(url)) return '.svg';
  return '.ico';
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { accept: 'image/*' } });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    url: response.url || url,
    contentType: response.headers.get('content-type') || '',
    buffer,
  };
}

async function fetchHtml(pageUrl) {
  const response = await fetch(pageUrl, { redirect: 'follow', headers: { accept: 'text/html' } });
  const html = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    url: response.url || pageUrl,
    html,
  };
}

async function main() {
  mkdirSync(RECORDED_DIR, { recursive: true });
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  const fetchedAt = new Date().toISOString();
  const stamp = isoTimestampForFilename();
  const results = [];

  for (const rowId of PR336_FAVICON_PROVENANCE_ROW_IDS) {
    const place = snapshot[String(rowId)];
    if (!place) throw new Error(`missing snapshot row ${rowId}`);
    const sourceRecord = place.sourceRecord || {};
    const website = sourceRecord.website || sourceRecord.url || place.url || '';
    if (!website) throw new Error(`row ${rowId} missing website`);
    const slug = slugify(place.title || place.externalId || rowId);
    const page = await fetchHtml(website);
    const iconTags = iconLinkTagsFromHtml(page.html);
    const trimmedHtml = buildIconDeclarationHtml(page.html, { title: place.title || place.externalId });
    const pageBody = Buffer.from(trimmedHtml, 'utf8');
    const pageSha = digest(pageBody);
    const pageBodyFile = `${slug}-official.html`;
    const pageResponseFile = `${slug}-official-response.json`;
    writeFileSync(join(RECORDED_DIR, pageBodyFile), pageBody);
    writeFileSync(join(RECORDED_DIR, pageResponseFile), `${JSON.stringify({
      requestedUrl: website,
      finalUrl: page.url,
      status: page.status,
      sha256: pageSha,
      fetchedAt,
      bytes: pageBody.length,
      pageBodyProvenance: {
        storedForm: 'icon-declaration-only',
        iconLinkCount: iconTags.length,
      },
    }, null, 2)}\n`);

    const discovered = page.ok
      ? await fetchPageIconUrl(page.url, { fetchImpl: globalThis.fetch })
      : { reason: `page_http_${page.status}` };
    let manifest;
    if (discovered.logoUrl) {
      const icon = await fetchBytes(discovered.logoUrl);
      if (!icon.ok || !/^image\//i.test(icon.contentType)) {
        throw new Error(`row ${rowId} icon fetch failed: ${icon.status} ${icon.contentType}`);
      }
      const ext = extensionForContentType(icon.contentType, icon.url);
      const iconBodyFile = `${slug}-declared-icon${ext}`;
      const iconResponseFile = `${slug}-declared-icon-response.json`;
      const iconSha = digest(icon.buffer);
      writeFileSync(join(RECORDED_DIR, iconBodyFile), icon.buffer);
      writeFileSync(join(RECORDED_DIR, iconResponseFile), `${JSON.stringify({
        requestedUrl: discovered.logoUrl,
        finalUrl: icon.url,
        status: icon.status,
        contentType: icon.contentType,
        sha256: iconSha,
        bytes: icon.buffer.length,
        fetchedAt,
        pageUrl: discovered.pageUrl,
      }, null, 2)}\n`);
      manifest = {
        rowId,
        website,
        pageResponseFile,
        pageBodyFile,
        iconResponseFile,
        iconBodyFile,
        expectedPageSha256: pageSha,
        expectedIconSha256: iconSha,
        expectedLogoUrl: icon.url,
        expectBound: true,
        pageBodyProvenance: {
          storedForm: 'icon-declaration-only',
          sha256: pageSha,
        },
      };
      results.push({ rowId, outcome: 'bound', logoUrl: icon.url, pageStatus: page.status });
    } else {
      manifest = {
        rowId,
        website,
        pageResponseFile,
        pageBodyFile,
        iconResponseFile: `${slug}-declared-icon-response.json`,
        iconBodyFile: '',
        expectedPageSha256: pageSha,
        expectedIconSha256: '',
        expectedLogoUrl: '',
        expectBound: false,
        expectedCaptureReason: discovered.reason || 'no_icon_answered_with_image',
        pageBodyProvenance: {
          storedForm: 'icon-declaration-only',
          sha256: pageSha,
        },
      };
      writeFileSync(join(RECORDED_DIR, manifest.iconResponseFile), `${JSON.stringify({
        requestedUrl: '',
        finalUrl: '',
        status: 0,
        contentType: '',
        sha256: '',
        bytes: 0,
        fetchedAt,
        skipped: true,
        reason: discovered.reason,
      }, null, 2)}\n`);
      results.push({ rowId, outcome: discovered.reason || 'no-declaration', pageStatus: page.status });
    }
    const manifestName = `${stamp}-row-${rowId}-${slug}.json`;
    writeFileSync(join(RECORDED_DIR, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
    results[results.length - 1].manifest = manifestName;
  }

  console.log(JSON.stringify({ ok: true, fetchedAt, recordedDir: RECORDED_DIR, results }, null, 2));
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});

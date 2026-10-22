#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TILE_PATH_RE,
  attachTileBodyHashes,
  buildTileShotRecord,
  indexBodyShaByUrl,
  isMapTileUrl,
  isPublicLogoImageUrl,
  logoRequestRecord,
  sanitizePublicImageUrl,
  sha256Bytes,
  summarizeImageHosts,
  tileRequestRecord,
} from './ops/capture/passive-acquisition.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const captureSrc = fs.readFileSync(path.join(repo, 'scripts/ops/capture/capture.mjs'), 'utf8');

assert.match(captureSrc, /watchLogos/);
assert.doesNotMatch(captureSrc, /await recordLogoShot/);
assert.doesNotMatch(captureSrc, /page.evaluate\(DOM_LOGO_EVAL/);
assert.equal(sanitizePublicImageUrl('https://secret@example.com/logo.png'), null);
assert.equal(sanitizePublicImageUrl('http://127.0.0.1/logo.png'), null);
assert.equal(sanitizePublicImageUrl('https://example.com/shared/private-token/logo.png'), null);
assert.equal(sanitizePublicImageUrl('https://example.com/logo.png?unrecognized_secret=hidden'), 'https://example.com/logo.png');
assert.match(captureSrc, /logo-log\.json/);
assert.match(captureSrc, /passive-acquisition\.mjs/);
assert.match(captureSrc, /recordLogoShot/);
assert.match(captureSrc, /buildTileShotRecord/);
assert.doesNotMatch(captureSrc, /TILE_RE\s*=/);

const tileUrl = 'https://tile.openstreetmap.org/5/10/12.png';
const tileBody = Buffer.from('fake-tile-bytes-633');
const tileHash = sha256Bytes(tileBody);
assert.ok(isMapTileUrl(tileUrl));
assert.ok(TILE_PATH_RE.test(new URL(tileUrl).pathname));

const tileRec = tileRequestRecord({
  w: 1280,
  t0: Date.now() - 50,
  url: tileUrl,
  status: 200,
  contentType: 'image/png',
  bytes: tileBody.length,
  bodySha256: tileHash,
});
assert.equal(tileRec.host, 'tile.openstreetmap.org');
assert.equal(tileRec.url, tileUrl);
assert.equal(tileRec.body_sha256, tileHash);
assert.equal(tileRec.status, 200);
assert.ok(tileRec.t_ms >= 0);

const failRec = tileRequestRecord({
  w: 390,
  t0: Date.now(),
  url: tileUrl,
  status: 0,
  contentType: null,
  bytes: 0,
  failure: 'net::ERR_HTTP2_PROTOCOL_ERROR',
});
assert.equal(failRec.failure, 'net::ERR_HTTP2_PROTOCOL_ERROR');
assert.equal(failRec.bytes, 0);
assert.equal(failRec.status, 0);

const secretLogo = 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=SECRET&raw=1';
assert.equal(sanitizePublicImageUrl(secretLogo), null);
assert.equal(isPublicLogoImageUrl(secretLogo), false);

const publicLogo = 'https://vacation-staging.timesyncher.com/ts-thing-logos/hertz.svg';
assert.equal(sanitizePublicImageUrl(publicLogo), publicLogo);
assert.ok(isPublicLogoImageUrl(publicLogo));

const logoWithKey = 'https://cdn.example.com/logo.png?api_key=strip-me&size=64';
const safeLogo = sanitizePublicImageUrl(logoWithKey);
assert.ok(safeLogo);
assert.doesNotMatch(safeLogo, /api_key/i);
assert.ok(isPublicLogoImageUrl(logoWithKey));

const logoRec = logoRequestRecord({
  w: 1280,
  t0: Date.now() - 10,
  url: publicLogo,
  status: 200,
  contentType: 'image/svg+xml',
  bytes: 120,
  bodySha256: sha256Bytes(Buffer.from('<svg/>')),
});
assert.equal(logoRec.url, publicLogo);

const requests = [tileRec, failRec];
const summaryBefore = summarizeImageHosts(requests);
assert.equal(summaryBefore['tile.openstreetmap.org 200'], 1);
assert.equal(summaryBefore['tile.openstreetmap.org 0'], 1);

const tileLog = {
  requests: [
    { ...tileRec, w: 1280, t_ms: 100 },
    { ...failRec, w: 1280, t_ms: 120 },
  ],
  shots: [],
};
const dom = {
  total: 2,
  loaded: 1,
  markers: 3,
  tiles: [
    { url: tileUrl, rect: [0, 0, 256, 256], complete: true, natural: [256, 256], loaded: true, tile_loaded_class: true },
    { url: 'https://tile.openstreetmap.org/5/10/13.png', rect: [256, 0, 256, 256], complete: false, natural: [0, 0], loaded: false, tile_loaded_class: false },
  ],
};
const shot = buildTileShotRecord({ shot: 'hotels-1280-top.png', w: 1280, dom, t: 200, tileLog });
assert.equal(shot.dom_tiles_total, 2);
assert.equal(shot.dom_tiles_loaded, 1);
assert.equal(shot.loaded_before_shot, 1);
assert.equal(shot.markers, 3);
assert.equal(shot.shot, 'hotels-1280-top.png');
assert.equal(shot.status200_so_far, 1);
assert.equal(shot.distinct_tile_bytes, 1);
assert.equal(shot.dom_tiles[0].body_sha256, tileHash);
assert.deepEqual(shot.dom_tiles[0].rect, [0, 0, 256, 256]);

const byUrl = indexBodyShaByUrl(tileLog.requests);
const attached = attachTileBodyHashes(dom.tiles, byUrl);
assert.equal(attached[0].body_sha256, tileHash);
assert.equal(attached[1].body_sha256, null);

console.log('passive-acquisition-evidence OK: url+sha256, dom tile/logo fields, host count semantics preserved');

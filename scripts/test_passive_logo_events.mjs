#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOGO_PASSIVE_OBSERVER_INIT,
  DRAIN_LOGO_PASSIVE_EVENTS_EVAL,
  correlateLogoPassiveEventsToShotRows,
  logoPassiveEventRecord,
  logoRowIdentityFromRowData,
  logoRowIdentityKey,
  logoRowKindFromRowData,
  sanitizeLogoPassiveBrowserEvent,
  sanitizePublicImageUrl,
} from './ops/capture/passive-acquisition.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const captureSrc = fs.readFileSync(path.join(repo, 'scripts/ops/capture/capture.mjs'), 'utf8');

assert.match(captureSrc, /LOGO_PASSIVE_OBSERVER_INIT/);
assert.match(captureSrc, /addInitScript\(\{ content: LOGO_PASSIVE_OBSERVER_INIT \}\)/);
assert.match(LOGO_PASSIVE_OBSERVER_INIT, /addEventListener\('load'/);
assert.match(LOGO_PASSIVE_OBSERVER_INIT, /addEventListener\('error'/);
assert.match(LOGO_PASSIVE_OBSERVER_INIT, /true\)/);

assert.equal(logoRowIdentityFromRowData({}), null);
assert.equal(
  logoRowIdentityKey(logoRowIdentityFromRowData({ thingId: '8877' })),
  'thing:8877',
);

const savedKind = logoRowKindFromRowData({ summarySrc: 'thing', hasLogo: '1', listRow: true });
const recKind = logoRowKindFromRowData({ hasLogo: '1', listRow: true });
assert.equal(savedKind, 'saved');
assert.equal(recKind, 'recommendation');

const publicLogo = 'https://vacation-staging.timesyncher.com/ts-thing-logos/hertz.svg';
const browserLoad = {
  type: 'load',
  t_ms: 42,
  url: publicLogo,
  initial_src: publicLogo,
  natural: [22, 22],
  complete: true,
  identity: {
    thing_id: '608',
    row_cat: 'cars',
    has_logo: '1',
    logo_src: publicLogo,
    row_name: 'Sample row',
  },
  row_kind: 'saved',
};
const browserError = {
  type: 'error',
  t_ms: 18,
  url: publicLogo,
  initial_src: publicLogo,
  natural: [0, 0],
  complete: false,
  identity: {
    thing_id: '608',
    row_cat: 'cars',
    has_logo: '1',
    logo_src: publicLogo,
    row_name: 'Sample row',
  },
  row_kind: 'recommendation',
};

const sanitizedLoad = sanitizeLogoPassiveBrowserEvent(browserLoad);
assert.ok(sanitizedLoad);
assert.equal(sanitizedLoad.type, 'load');
assert.equal(sanitizedLoad.url, publicLogo);
assert.equal(sanitizedLoad.identity.thing_id, '608');

const blockedUrl = sanitizeLogoPassiveBrowserEvent({
  type: 'load',
  t_ms: 1,
  url: 'https://example.com/api/shared/secret/logo.png',
  identity: { row_cat: 'x' },
});
assert.ok(blockedUrl);
assert.equal(blockedUrl.url, null);
assert.equal(sanitizeLogoPassiveBrowserEvent({ type: 'load', t_ms: 1, url: publicLogo, identity: {} }), null);

const t0 = Date.now() - 100;
const evLoad = logoPassiveEventRecord({ w: 1280, t0, browserEvent: browserLoad });
const evError = logoPassiveEventRecord({ w: 1280, t0, browserEvent: browserError });
assert.ok(evLoad);
assert.ok(evError);
assert.equal(evError.type, 'error');
assert.equal(evError.row_kind, 'recommendation');

const domLogos = [{
  row_cat: 'cars',
  url: sanitizePublicImageUrl(publicLogo),
  loaded: true,
  row_identity: logoRowIdentityFromRowData({
    thingId: '608',
    cat: 'cars',
    hasLogo: '1',
    logoSrc: publicLogo,
    name: 'Sample row',
  }),
  row_kind: 'saved',
}];

const links = correlateLogoPassiveEventsToShotRows({
  domLogos,
  events: [evError, evLoad],
  shot_t_ms: 200,
});
assert.equal(links.length, 1);
assert.deepEqual(links[0].event_indexes, [1]);
assert.ok(!links[0].event_indexes.includes(0), 'recommendation event cannot correlate to saved row');
assert.ok(links[0].event_indexes.includes(1), 'pre-shot load event correlates to final shot row');

const lateEvent = logoPassiveEventRecord({
  w: 1280,
  t0,
  browserEvent: { ...browserLoad, t_ms: 500 },
});
const linksCutoff = correlateLogoPassiveEventsToShotRows({
  domLogos,
  events: [evLoad, lateEvent],
  shot_t_ms: 100,
});
assert.deepEqual(linksCutoff[0].event_indexes, [0]);

console.log('passive-logo-events OK: identity, load/error sanitization, shot correlation');

assert.match(DRAIN_LOGO_PASSIVE_EVENTS_EVAL, /q.splice/);
assert.doesNotMatch(captureSrc, /await recordLogoShot/);
assert.ok(sanitizeLogoPassiveBrowserEvent({ ...browserLoad, identity: { ...browserLoad.identity, logo_src: publicLogo + '?token=synthetic' } }).identity.logo_src === publicLogo);
assert.deepEqual(correlateLogoPassiveEventsToShotRows({domLogos, events:[evLoad], w:390, shot_t_ms:200})[0].event_indexes, []);
const globalEvent = logoPassiveEventRecord({w:390,t0:1000,browserEvent:{...browserLoad,wall_ms:1250,t_ms:7}});
assert.equal(globalEvent.t_ms,250);

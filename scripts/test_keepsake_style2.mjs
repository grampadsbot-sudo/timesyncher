import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

import { buildStyle2Model, renderStyle2Html, realTripSummary, BOILERPLATE_RE, pickStoryCover, PRODUCT_SOT_SLUG, PRODUCT_SOT_ALIAS, PRODUCT_SOT_TWIN, PRODUCT_SOT_RECEIPT } from '../src/vacation/keepsake-style2.mjs';
import { applyCapturedLogos, captureThingLogo, thingCreateLogoFields, isBoundStoryMediaUrl } from '../src/vacation/thing-logo-capture.mjs';
import { isAirplaneGlyph, timelineIcon } from '../src/vacation/timeline-icons.mjs';
import { backfillAssignments, itineraryMinThings } from '../src/vacation/itinerary-minimums.mjs';
import { qrModules, qrSvg } from '../src/vacation/qr-svg.mjs';
import handlePdfQrSvg, { allowedQrPayload, PDF_QR_SIZE } from '../src/vacation/pdf-qr-svg-handler.mjs';
import { isKeepsakeJunkMedia, stripKeepsakeJunkMedia } from '../src/vacation/thing-media-bind.mjs';
import {
  isJourneyBookReport,
  journeyBookGate,
  isProductStyleTwo,
  normalizeReportName,
  productPdfUrl,
  productStyleTwoViewUrl,
  wantsStyleTwoView,
  PRODUCT_STYLE_TWO_REPORT,
  PRODUCT_TREK_PUBLIC,
  PRODUCT_SOT,
  PRODUCT_SOT_TWIN as HANDLER_SOT_TWIN,
  forwardedKeepsakeSearch,
  styleTwoLocationStaysOnStaging,
} from '../src/vacation/keepsake-style2-handler.mjs';
import keepsakeStyle2Handler from '../src/vacation/keepsake-style2-handler.mjs';
import { patchStyleTwoToConfigRenderer, assertPatchedStyleTwo, assertStyleTwoPatchParses, STYLE2_USES_AE, STYLE2_USES_ZU } from '../src/vacation/trek-style2-bundle.mjs';
import { applyProductKeepsakeOverrides, keepsakeListBuckets, resolveThingCoords } from '../src/vacation/keepsake-product-overrides.mjs';
import { KEEPSAKE_LIST_MINIMUMS, padKeepsakeListNames, padLiveTabRows } from '../src/vacation/keepsake-list-minimums.mjs';
import { DEFAULT_FIRST_PASS_MINIMUMS } from '../scripts/vacation-public-research-worker.mjs';

const shared = {
  trip: {
    id: 197,
    title: 'Las Vegas Vacation',
    description: 'Anniversary weekend at the Bellagio with dinner, a show, Conservatory cocktails, Carbone, and Strip wandering.',
  },
  days: [
    { id: 1236, day_number: 1 },
    { id: 1237, day_number: 2 },
  ],
  thingOverrides: {
    'place:8871': { title: 'Bellagio Conservatory — Anniversary Cocktails', category: 'other', story: 'The air smelled like wet petals and cold gin.' },
    'place:8872': { story: 'Spicy rigatoni split down the middle.' },
    'place:8873': { story: 'Paper boat of fries after the heat.' },
    'place:8869': { title: 'Bellagio — Alex & Kim Anniversary Stay', category: 'hotel', story: 'Fountain spray lit gold outside the glass.' },
  },
  places: [
    { id: 8872, name: 'Carbone at Aria', category_name: 'Restaurant', category_icon: '🍽️', image_url: '/api/bind-thing-media?shareToken=x&id=1&raw=1' },
    { id: 8873, name: 'Shake Shack near Cosmo/Aria', category_name: 'Restaurant', category_icon: '🍽️' },
    { id: 8876, name: 'Cosmopolitan shops', category_name: 'Store', category_icon: 'ShoppingBag' },
    { id: 8871, name: 'Las Vegas restaurants, activities, and shopping research queue', category_name: 'Attraction', category_icon: '🏛️' },
    { id: 8869, name: 'Las Vegas lodging research queue', category_name: 'Hotel', category_icon: '🏨' },
    { id: 8877, name: 'SFO to LAS Thu Oct 9', category_name: 'Transport', category_icon: '🚌', address: 'SFO to LAS' },
  ],
  assignments: {
    1237: [
      { place: { id: 8872, name: 'Carbone at Aria', category_name: 'Restaurant' } },
      { place: { id: 8876, name: 'Cosmopolitan shops', category_name: 'Store' } },
    ],
  },
};

const bindings = [
  { id: 's1', thingId: 8872, thingName: 'Carbone', publicUrl: '/ts-thing-media/las-vegas-vacation-3/carbone-plates-photo.jpg', mimeType: 'image/jpeg', mediaKind: 'photo' },
  { id: 's2', thingId: 8871, thingName: 'Conservatory', publicUrl: '/ts-thing-media/las-vegas-vacation-3/conservatory-photo.jpg', mimeType: 'image/jpeg', mediaKind: 'photo' },
  { id: 's3', thingId: 8869, thingName: 'Bellagio', publicUrl: '/api/bind-thing-media?shareToken=x&id=vid&raw=1', mimeType: 'application/octet-stream', mediaKind: 'video', originalName: 'bellagio-fountain-night-video.mp4' },
  {
    id: '6ba36f2a-e9f2-467e-9e61-3aac64fe165a',
    thingId: 8869,
    thingName: 'Bellagio',
    publicUrl: 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=las-vegas-vacation-3&id=6ba36f2a-e9f2-467e-9e61-3aac64fe165a&raw=1',
    mimeType: 'application/octet-stream',
    mediaKind: 'photo',
    originalName: 'bellagio-fountain-night-video.mp4',
  },
];

assert.equal(isBoundStoryMediaUrl('/api/bind-thing-media?shareToken=x&id=1&raw=1'), true);
assert.equal(captureThingLogo(shared.places[0], {}), '/ts-thing-logos/carbone.svg');
assert.equal(thingCreateLogoFields('Carbone at Aria', 'restaurant').logoUrl, '/ts-thing-logos/carbone.svg');
assert.equal(thingCreateLogoFields('Carbone at Aria', 'restaurant').icon, '🍽️');
assert.equal(thingCreateLogoFields('SFO to LAS', 'flight').isFlight, true);

const logos = applyCapturedLogos(shared);
assert.equal(logos.thingOverrides['place:8872'].logoUrl, '/ts-thing-logos/carbone.svg');
assert.equal(logos.thingOverrides['place:8872'].icon, '🍽️');
assert.ok(!isAirplaneGlyph(logos.thingOverrides['place:8876'].icon));
assert.equal(timelineIcon(shared.places[3], shared.thingOverrides['place:8871']).isFlight, false);

const summary = realTripSummary(shared);
assert.equal(BOILERPLATE_RE.test(summary), false);
assert.match(summary, /Bellagio|Carbone|anniversary/i);

const html = renderStyle2Html(shared, bindings, {
  origin: 'https://vacation-staging.timesyncher.com',
  shareToken: 'las-vegas-vacation-3',
});

assert.match(html, /data-style="2"/);
assert.match(html, /data-sole-layout="1"/);
assert.match(html, new RegExp(`data-product-sot="${PRODUCT_SOT_SLUG}"`));
assert.match(html, new RegExp(`data-product-sot-alias="${PRODUCT_SOT_ALIAS}"`));
assert.match(html, new RegExp(`data-product-receipt="${PRODUCT_SOT_RECEIPT}"`));
assert.equal(PRODUCT_SOT_SLUG, 'bot-admin/messages/time-syncher/style-2-journey-book-standard');
assert.equal(PRODUCT_SOT_ALIAS, PRODUCT_SOT_SLUG);
assert.equal(PRODUCT_SOT_TWIN, 'bot-admin/messages/time-syncher/style-2-journey-book-product-standard-20260910');
assert.equal(PRODUCT_SOT, PRODUCT_SOT_SLUG);
assert.equal(HANDLER_SOT_TWIN, PRODUCT_SOT_TWIN);
assert.equal(PRODUCT_SOT_RECEIPT, 'bot-admin/receipts/cos-style-2-journey-book-product-standard-20260910');
assert.match(html, /data-page="1"/);
assert.match(html, /data-trip-directory="1"/);
assert.match(html, /data-stories-up-front="1"/);
assert.match(html, /data-post-itinerary="1"/);
assert.match(html, /class="daily-grid"/);
assert.match(html, /class="timeline-rail"/);
assert.match(html, /data-maps="omitted"/);
assert.match(html, /data-min-things="8"/);
assert.match(html, /Anniversary weekend at the Bellagio/);
assert.match(html, /Spicy rigatoni/);
assert.match(html, /wet petals/);
assert.match(html, /carbone\.svg/);
assert.match(html, /shake-shack\.svg/);
assert.match(html, /cosmopolitan-shops\.svg/);
assert.match(html, /bellagio-conservatory\.svg/);
assert.doesNotMatch(html, /brought together your day-by-day plan/);
assert.match(html, /data-icon-type="restaurant"/);
assert.match(html, /data-icon-type="store"/);
assert.match(html, /data-icon-type="flight"/);

const page1 = html.match(/data-page="1"[\s\S]*?<\/section>/)[0];
assert.match(page1, /data-trip-directory="1"/);
assert.match(page1, /Carbone at Aria/);
assert.match(page1, /Cosmopolitan shops/);
assert.match(page1, /bellagio\.svg|bellagio-conservatory\.svg/);

const storiesIdx = html.indexOf('data-stories-up-front="1"');
const daysIdx = html.indexOf('data-print-ready="daily"');
const listsIdx = html.indexOf('data-post-itinerary="1"');
assert.ok(storiesIdx > 0 && daysIdx > storiesIdx, 'stories before itinerary');
assert.ok(listsIdx > daysIdx, 'thing lists after itinerary');

const airplaneOnNonFlight = [...html.matchAll(/data-icon-type="(?!flight)[^"]+"[\s\S]{0,220}(?:✈️|&#9992;)/g)];
assert.equal(airplaneOnNonFlight.length, 0, 'no airplane on non-flight rows');
assert.match(html, /data-story-card="1"/);
assert.match(html, /data-story-media-only="1"/);
assert.match(html, /data-video-qr="1"/);
assert.doesNotMatch(html, /bellagio-fountain-night-video\.mp4/);
assert.doesNotMatch(html, /<video /);
const hotelCard = html.match(/<article class="story-card"[^>]*data-thing-id="8869"[\s\S]*?<\/article>/)[0];
assert.match(hotelCard, /data-icon-type="hotel"/);
assert.doesNotMatch(hotelCard, /✈️/);
assert.doesNotMatch(hotelCard, /tiny-logo|thing-emoji|bellagio\.svg/);
assert.doesNotMatch(hotelCard, /data-cover-kind="photo"/);
assert.doesNotMatch(hotelCard, /<img[^>]+6ba36f2a/);
assert.match(hotelCard, /data-video-qr="1"/);
const conservatoryCard = html.match(/<article class="story-card"[^>]*data-thing-id="8871"[\s\S]*?<\/article>/)[0];
assert.match(conservatoryCard, /data-icon-type="attraction"/);
assert.doesNotMatch(conservatoryCard, /✈️/);
assert.doesNotMatch(conservatoryCard, /tiny-logo|thing-emoji/);
assert.match(conservatoryCard, /conservatory-photo\.jpg/);
assert.match(html, /data-row-thumb="1"/);
const videoCover = pickStoryCover([
  { publicUrl: '/x.mp4', mimeType: 'video/mp4', mediaKind: 'video', originalName: 'bellagio-fountain-night-video.mp4' },
], '/ts-thing-logos/bellagio.svg');
assert.equal(videoCover.kind, 'video');
const mislabeledNightVideo = pickStoryCover([
  {
    publicUrl: 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=las-vegas-vacation-3&id=6ba36f2a-e9f2-467e-9e61-3aac64fe165a&raw=1',
    mimeType: 'application/octet-stream',
    mediaKind: 'photo',
    originalName: 'bellagio-fountain-night-video.mp4',
  },
], '/ts-thing-logos/bellagio.svg');
assert.equal(mislabeledNightVideo.kind, 'video');

const model = buildStyle2Model(shared, bindings, 'https://vacation-staging.timesyncher.com');
assert.equal(model.airplaneAudit.length, 0);
assert.ok(model.stories.length >= 3);
assert.equal(model.isBoilerplate, false);
assert.equal(itineraryMinThings({}), 8);
assert.ok(model.assignedCount >= Math.min(model.placeCount, model.minThings));
const filled = backfillAssignments(shared, { TIMESYNCHER_ITINERARY_MIN_THINGS: '8' });
assert.equal(filled.shortfall, 2);
const playbackUrl = 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=las-vegas-vacation-3&id=6ba36f2a-e9f2-467e-9e61-3aac64fe165a&raw=1';
const playbackQr = qrSvg(playbackUrl, { size: PDF_QR_SIZE });
assert.match(playbackQr, /<svg[\s\S]*<rect/);
assert.match(playbackQr, /fill="#fff"/);
const darkRects = playbackQr.match(/<rect[^>]*fill="#000"/g) || [];
assert.ok(darkRects.length >= 200, 'QR matrix has dark modules');
assert.equal(darkRects.length, qrModules(playbackUrl).flat().filter(Boolean).length);
assert.equal(allowedQrPayload(playbackUrl), true);
assert.equal(allowedQrPayload('javascript:alert(1)'), false);
const qrRes = { statusCode: 0, headers: {}, body: '', setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; }, end(body) { this.body = body || ''; } };
handlePdfQrSvg({ url: `/api/pdf/qr.svg?data=${encodeURIComponent(playbackUrl)}` }, qrRes);
assert.equal(qrRes.statusCode, 200);
assert.match(qrRes.headers['content-type'], /image\/svg\+xml/);
assert.equal(qrRes.body, playbackQr);
assert.doesNotMatch(qrRes.body, /camera|placeholder|NOT_FOUND/i);

assert.equal(isKeepsakeJunkMedia({
  filename: 'carbone-neon-bind-proof.png',
  caption: 'Neon file bind proof',
  url: 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=x&id=c67aeea4&raw=1',
}), true);
assert.equal(isKeepsakeJunkMedia({
  originalName: 'carbone-bind-proof.png',
  caption: 'Carbone at Aria',
  publicUrl: 'https://travel.timesyncher.com/ts-thing-media/las-vegas-vacation-3/carbone-bind-proof.png',
}), true);
assert.equal(isKeepsakeJunkMedia({
  filename: 'carbone-plates-photo.jpg',
  caption: 'Carbone at Aria',
  url: 'https://vacation-staging.timesyncher.com/api/bind-thing-media?shareToken=x&id=bb277e4a&raw=1',
}), false);
const stripped = stripKeepsakeJunkMedia({
  media: [
    { filename: 'carbone-plates-photo.jpg', caption: 'Carbone at Aria', url: '/plates.jpg' },
    { filename: 'carbone-late-hands-photo.jpg', caption: 'Carbone at Aria', url: '/hands.jpg' },
    { filename: 'carbone-neon-bind-proof.png', caption: 'Neon file bind proof', url: '/neon.png' },
    { filename: 'carbone-bind-proof.png', caption: 'Carbone at Aria', url: 'https://travel.timesyncher.com/ts-thing-media/las-vegas-vacation-3/carbone-bind-proof.png' },
  ],
  places: [{
    id: 8872,
    name: 'Carbone at Aria',
    image_url: '/plates.jpg',
    bound_media: [
      { originalName: 'carbone-plates-photo.jpg', publicUrl: '/plates.jpg', mimeType: 'image/jpeg' },
      { originalName: 'carbone-neon-bind-proof.png', caption: 'Neon file bind proof', publicUrl: '/neon.png' },
    ],
  }],
});
assert.equal(stripped.media.length, 2);
assert.ok(stripped.media.every((item) => /plates|hands/.test(item.filename)));
assert.equal(stripped.places[0].bound_media.length, 1);
assert.doesNotMatch(JSON.stringify(stripped), /Neon file bind proof|bind-proof/i);

const overlay = await readFile(new URL('../public/ts-thing-media-overlay.js', import.meta.url), 'utf8');
assert.doesNotMatch(overlay, /wantsJourneyBook/);
assert.doesNotMatch(overlay, /document\.write/);
assert.doesNotMatch(overlay, /ts-journey-chip/);
assert.doesNotMatch(overlay, /report\/style-2/);

const patch = await readFile(new URL('../public/ts-timeline-icon-patch.js', import.meta.url), 'utf8');
assert.match(patch, /AIRPLANE/);
assert.match(patch, /printMode/);
assert.match(patch, /isPrintReport/);
assert.match(patch, /print-media-qr/);
assert.match(patch, /data:image\/svg\+xml/);
assert.match(patch, /neon file bind proof/);
assert.match(patch, /data-stories-bottom-margin/);
assert.match(patch, /padding-bottom:36mm/);
assert.match(patch, /break-inside:avoid/);
assert.match(patch, /box-decoration-break:clone/);
assert.match(patch, /display:block!important/);
assert.match(patch, /injectStoriesPrintCss/);
assert.doesNotMatch(patch, /journey\?style=2/);
assert.doesNotMatch(patch, /patchedOpen/);

const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
assert.match(vercel, /keepsakePdf/);
assert.match(vercel, /pdfQr/);
assert.match(vercel, /\/api\/pdf\/qr\\\\.svg/);
assert.match(vercel, /\/api\/pdf\/shared/);
assert.match(vercel, /report=journey/);
assert.match(vercel, /trekBundle/);
assert.match(vercel, /\/report\/\(\[\^\/\?\]\+\)/);
const itinerarySrc = await readFile(new URL('../api/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(itinerarySrc, /pdfQr/);
assert.match(itinerarySrc, /handlePdfQrSvg/);

assert.equal(normalizeReportName('style-2'), PRODUCT_STYLE_TWO_REPORT);
assert.equal(normalizeReportName(''), PRODUCT_STYLE_TWO_REPORT);
assert.equal(normalizeReportName('keepsake-style-2.pdf'), PRODUCT_STYLE_TWO_REPORT);
assert.equal(normalizeReportName('restaurants'), 'restaurants');
assert.equal(isProductStyleTwo('style-2'), true);
assert.equal(isProductStyleTwo('keepsake-style-2'), true);
assert.equal(isProductStyleTwo('restaurants'), false);
assert.equal(isJourneyBookReport('style-2'), true);
assert.equal(isJourneyBookReport('restaurants'), false);
assert.equal(journeyBookGate({ report: 'daily' }).ok, true);
assert.equal(journeyBookGate({ report: 'keepsake-style-2' }).kind, 'style-two');
assert.equal(journeyBookGate({ report: 'restaurants' }).kind, 'trek-report');

assert.equal(wantsStyleTwoView({ report: 'journey' }), true);
assert.equal(wantsStyleTwoView({ report: 'style-2' }), false);
assert.equal(
  productStyleTwoViewUrl({ shareToken: 'las-vegas-vacation-3' }),
  'https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/?printMode=report&pdfReport=keepsake-style-2',
);
const styleTwoUrl = productPdfUrl({
  shareToken: 'las-vegas-vacation-3',
  report: 'style-2',
  origin: 'https://vacation-staging.timesyncher.com',
});
assert.equal(
  styleTwoUrl,
  'https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/?printMode=report&pdfReport=keepsake-style-2',
);
assert.doesNotMatch(styleTwoUrl, /travel\.timesyncher\.com/);
assert.equal(
  styleTwoLocationStaysOnStaging(styleTwoUrl, 'https://vacation-staging.timesyncher.com'),
  true,
);
assert.equal(
  styleTwoLocationStaysOnStaging(
    'https://travel.timesyncher.com/api/pdf/shared/las-vegas-vacation-3/report/keepsake.pdf',
    'https://vacation-staging.timesyncher.com',
  ),
  false,
);

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (key, value) => {
    res.headers[String(key).toLowerCase()] = value;
  };
  res.end = (body) => {
    res.body = body || '';
  };
  return res;
}

for (const url of [
  '/api/vacation-itinerary?keepsakePdf=1&pdfPath=las-vegas-vacation-3/report/style-2',
  '/api/vacation-itinerary?keepsakePdf=1&pdfPath=las-vegas-vacation-3/report/keepsake-style-2.pdf',
  '/api/vacation-itinerary?keepsakePdf=1&shareToken=las-vegas-vacation-3&report=style-2',
]) {
  const res = mockRes();
  await keepsakeStyle2Handler({
    url,
    headers: {
      host: 'vacation-staging.timesyncher.com',
      'x-forwarded-proto': 'https',
    },
  }, res);
  assert.equal(res.statusCode, 302, url);
  assert.equal(res.headers['x-timesyncher-style2'], 'staging-ae', url);
  assert.match(res.headers.location, /vacation-staging\.timesyncher\.com\/shared\/las-vegas-vacation-3\/\?.*pdfReport=keepsake-style-2/);
  assert.doesNotMatch(res.headers.location, /travel\.timesyncher\.com/);
}
assert.equal(
  patchStyleTwoToConfigRenderer(`if(h==="report"&&g){${STYLE2_USES_ZU}}`),
  `if(h==="report"&&g){${STYLE2_USES_AE}}`,
);

const liveOverride = applyProductKeepsakeOverrides({
  places: shared.places,
  assignments: shared.assignments,
  thingOverrides: {
    'place:8871': { title: 'Bellagio Conservatory — Anniversary Cocktails', category: 'other', story: 'wet petals' },
    'place:8872': { story: 'Spicy rigatoni' },
    'place:8869': { title: 'Bellagio — Alex & Kim Anniversary Stay', category: 'hotel' },
  },
});
assert.equal(liveOverride.thingOverrides['place:8872'].category, 'restaurant');
assert.equal(liveOverride.thingOverrides['place:8876'].category, 'store');
assert.equal(liveOverride.thingOverrides['place:8873'].category, 'restaurant');
assert.equal(liveOverride.thingOverrides['place:8869'].category, 'hotel');
assert.equal(liveOverride.thingOverrides['place:8877'].category, 'flight');
assert.notEqual(liveOverride.thingOverrides['place:8871'].category, 'restaurant');
assert.notEqual(liveOverride.thingOverrides['place:8871'].category, 'store');
assert.ok(liveOverride.thingOverrides['place:8872'].lat);
assert.ok(liveOverride.thingOverrides['place:8876'].lng);
assert.equal(liveOverride.places.find((place) => String(place.id) === '8872').category.name, 'Restaurant');
const carboneAssign = (liveOverride.assignments?.['1237'] || []).find((row) => /carbone/i.test(row.place?.name || ''));
assert.equal(carboneAssign.place.lat, 36.1073);
assert.equal(carboneAssign.place.lng, -115.1766);
assert.equal(liveOverride.thingOverrides['place:8872'].timeline, true);
assert.deepEqual(resolveThingCoords({ name: 'Carbone at Aria', address: 'Aria, Las Vegas' }), [36.1073, -115.1766]);
assert.deepEqual(resolveThingCoords({ name: 'Shake Shack near Cosmo/Aria', address: 'Las Vegas Strip' }), [36.1097, -115.1739]);
assert.equal(liveOverride.thingOverrides['place:8873'].lat, 36.1097);
const buckets = keepsakeListBuckets(liveOverride);
assert.ok(buckets.Restaurants.some((row) => row.place.name.includes('Carbone')));
assert.ok(buckets.Stores.some((row) => row.place.name.includes('Cosmopolitan')));
assert.ok(!buckets['Shows, Tours and the Rest'].some((row) => /carbone|cosmopolitan shops/i.test(row.place.name)));
assert.ok(buckets.Hotels.some((row) => String(row.place.id) === '8869'));

const aeFixture = [
  STYLE2_USES_ZU,
  'const zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story)),ua=G.map(([nr,Oo])=>`<div class="summary-stat"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(""),Rn=(nr,Oo,_i=!1)=>`<section class="report-section"><h2>${an(nr)}${_i?" (continued)":""}</h2><ul class="logo-list">${Oo.map(w).join("")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=35,zr=42,Mo=()=>{Pn.push(Zn.join("")),Zn=[],sr=0};G.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const[Is,...Hl]=Pn,pc=Pr.summary?`<p class="muted">Trip summary</p><div class="keepsake-summary">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join("")}</div>`:"",gr=Pr.eventSummary?`<p class="keepsake-summary">You experienced ${Re.size} ${Re.size===1?"event":"events"} this vacation.</p>`:"",js=Pr.stories&&zt.length?`<section class="page keepsake-report keepsake-list-page">${Wi}<h2>Saved stories</h2><div class="recap-grid">${zt.map(fs).join("")}</div></section>`:"",zl=Qa.map(nr=>`<div class="keepsake-day">${op(nr,{includeMap:so(nr),brandHtml:Wi})}</div>`).join(""),wn=`<section class="page keepsake-report">${Wi}<h1>${an(la.title||"Vacation")}</h1>${pc}${gr}<div class="summary-grid">${ua}</div>${Is}</section>`,Qi=Hl.map(nr=>`<section class="page keepsake-report keepsake-list-page">${Wi}${nr}</section>`).join("");return`${wn}${Qi}${js}${zl}`}',
  'Hc=G=>`/api/pdf/qr.svg?data=${encodeURIComponent(So(G))}`',
  'zr=fo(zt).length?`<div class="style2-thing-media">${fo(zt).map(Ba).join("")}</div>`:""',
  ',[/guided walking|audio history/i,[40.7794,-73.9632]]]',
  'Mn=G=>{const Re=String(G||"").toLowerCase();return Re.includes("flight")?"flight":Re.includes("car")||Re.includes("rental")?"car":Re.includes("hotel")?"hotel":',
  'Gn=Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re))),ci=ot.filter(G=>Oc.some(Re=>or(Re).includes(G))),Qn=Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re))),ki=Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G)))',
  'It=G=>Mn(ha(G).category??Fn(G))',
  'Qn.map(G=>Oe(G))',
  'Gn.map(G=>Oe(G))',
  'ki.map(G=>Oe(G))',
  'Mo=Array.from(new Map(Qa.flatMap(di=>Ci(di)).filter(di=>(di==null?void 0:di.item)&&!["travel","travel-to-thing","transport","hotel-wake","hotel-sleep","hotel-checkout"].includes(di.type)).map(di=>{const Xi=di.item;return[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}]})).values())',
].join('\n');
const patchedAe = patchStyleTwoToConfigRenderer(aeFixture);
assertPatchedStyleTwo(patchedAe);
assert.match(patchedAe, /data-trip-directory="1"/);
assert.match(patchedAe, /data-directory-bucket=/);
assert.match(patchedAe, /data-post-itinerary="1"/);
assert.match(patchedAe, /data-story-media-only="1"/);
assert.match(patchedAe, /fo\(nr\)\.filter\(Km\)\.map\(Ba\)/);
assert.match(patchedAe, /neon file bind proof/);
assert.match(patchedAe, /originalName/);
assert.match(patchedAe, /\/api\/pdf\/qr\.svg\?data=\$\{encodeURIComponent\(So\(G\)\)\}&m=1/);
assertStyleTwoPatchParses();
assert.doesNotMatch(patchedAe, /\$\{zt\.map\(fs\)\.join\(""\)\}/);
assert.match(patchedAe, /\$\{wn\}\$\{js\}\$\{zl\}\$\{Qi\}/);
assert.doesNotMatch(patchedAe, /\$\{wn\}\$\{Qi\}\$\{js\}\$\{zl\}/);
assert.match(patchedAe, /\[\/bellagio\|conservatory\/i,\[36\.1126,-115\.1767\]\]/);
assert.match(patchedAe, /\$\{Mc\(nr\)\}/);
assert.match(patchedAe, /data-print-ready="style2"/);
assert.match(patchedAe, /data-style2-map="1"/);
assert.match(patchedAe, /data-stories-bottom-margin="1"/);
assert.match(patchedAe, /padding-bottom:36mm/);
assert.match(patchedAe, /data-stories-print-css="1"/);
assert.match(patchedAe, /break-inside:avoid/);
assert.match(patchedAe, /data-print-fill="1"/);
assert.match(patchedAe, /data-list-min=/);
assert.match(patchedAe, /"Restaurants":15/);
assert.match(patchedAe, /style2-thing-media/);
assert.doesNotMatch(patchedAe, /zl=Qa\.map\(nr=>`<div class="keepsake-day">\$\{op\(/);
assert.deepEqual(KEEPSAKE_LIST_MINIMUMS, {
  Restaurants: DEFAULT_FIRST_PASS_MINIMUMS.restaurant,
  Stores: DEFAULT_FIRST_PASS_MINIMUMS.store,
  'Shows, Tours and the Rest': DEFAULT_FIRST_PASS_MINIMUMS.rest,
});
assert.equal(padKeepsakeListNames('Restaurants', [
  { name: 'Carbone at Aria' },
  { name: 'Shake Shack near Cosmo/Aria' },
  { name: 'Lotus of Siam' },
  { name: 'Eggslut' },
]).length, 11);
assert.equal(padKeepsakeListNames('Stores', [{ name: 'Cosmopolitan shops' }]).length, 9);
assert.equal(padKeepsakeListNames('Shows, Tours and the Rest', [{ name: 'Bellagio Conservatory — Anniversary Cocktails' }]).length, 14);
assert.equal(padLiveTabRows('restaurant', [
  { name: 'Carbone at Aria' },
  { name: 'Shake Shack near Cosmo/Aria' },
  { name: 'Lotus of Siam' },
  { name: 'Eggslut' },
]).length, 11);
assert.equal(padLiveTabRows('store', [{ name: 'Cosmopolitan shops' }]).length, 9);
assert.equal(padLiveTabRows('rest', [{ name: 'Bellagio Conservatory — Anniversary Cocktails' }]).length, 14);
assert.match(patchedAe, /Re\.includes\("restaurant"\)\?"restaurant":Re\.includes\("car"\)/);
assert.match(patchedAe, /tsPad=/);
assert.match(patchedAe, /__tsLiveFill:1/);
const liveTravel = await fetch('https://travel.timesyncher.com/assets/index-BKun7ofk.js');
assert.equal(liveTravel.ok, true, 'product TREK bundle reachable');
const livePatched = patchStyleTwoToConfigRenderer(await liveTravel.text());
assertPatchedStyleTwo(livePatched);
assertStyleTwoPatchParses(livePatched);
const patchedCheckPath = '/tmp/patched-style2-check.js';
await writeFile(patchedCheckPath, livePatched);
const patchedCheck = spawnSync('node', ['--check', patchedCheckPath], { encoding: 'utf8' });
assert.equal(patchedCheck.status, 0, patchedCheck.stderr || 'patched TREK bundle failed node --check');
assert.equal(
  productPdfUrl({ shareToken: 'las-vegas-vacation-3', report: 'restaurants' }),
  `${PRODUCT_TREK_PUBLIC}/api/pdf/shared/las-vegas-vacation-3/report/restaurants.pdf`,
);
assert.equal(
  productPdfUrl({ shareToken: 'las-vegas-vacation-3', report: 'daily', pdfPath: 'las-vegas-vacation-3/daily/2.pdf' }),
  `${PRODUCT_TREK_PUBLIC}/api/pdf/shared/las-vegas-vacation-3/daily/2.pdf`,
);
assert.match(
  forwardedKeepsakeSearch(new URL('https://x.test/?ksLogo=0&ksMapOff=1,2,3&other=1')),
  /^\?ksLogo=0&ksMapOff=1(?:,|%2C)2(?:,|%2C)3$/,
);
assert.doesNotMatch(
  forwardedKeepsakeSearch(new URL('https://x.test/?ksLogo=0&other=1')),
  /other=/,
);

const create = await readFile(new URL('../scripts/trek-itinerary-edit.mjs', import.meta.url), 'utf8');
assert.match(create, /captured_logo/);
assert.match(create, /image_url/);
assert.match(create, /minThings/);
assert.match(create, /Backfilled from existing trip things/);
assert.doesNotMatch(create, /airport\|las\|boi/);

const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
assert.match(sharedApp, /index-BKun7ofk\.js/);
assert.match(sharedApp, /href="\/assets\/index-CbEHlMj6\.css"/);
assert.doesNotMatch(sharedApp, /crossorigin href="https:\/\/travel\.timesyncher\.com\/assets\/index-CbEHlMj6\.css"/);
assert.match(sharedApp, /__TS_JOURNEY_BOOK__ = false/);
assert.doesNotMatch(sharedApp, /pdfReport=keepsake/);
assert.match(sharedApp, /Record voice note/);
assert.match(sharedApp, /\/api\/shared\/\$\{encodeURIComponent\(shareToken\)\}\/audio-note/);

const trek = await readFile(new URL('../public/assets/index-0J54vUO3.js', import.meta.url), 'utf8');
assert.match(trek, /_t==="flight"\?"✈️"/);
assert.doesNotMatch(trek, /ai=Q=>gi\(Q\)\.icon\|\|Kl\(Q\)/);

console.log('keepsake style-2 tests passed');

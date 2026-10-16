#!/usr/bin/env node
import assert from 'node:assert/strict';

import { fetchPageIconUrl, iconCandidatesFromHtml } from '../src/vacation/page-icon-discovery.mjs';

const BLUE_NOTE_HEAD = `<head>
<link rel="icon" href="https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-32x32.png" sizes="32x32" />
<link rel="icon" href="https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-192x192.png" sizes="192x192" />
<link rel="apple-touch-icon" href="https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-180x180.png" />
</head>`;

const ICON_192 = 'https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-192x192.png';

function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) return { ok: false, status: 404, url, headers: new Headers(), text: async () => '', body: null };
    return {
      ok: route.status === undefined || (route.status >= 200 && route.status < 300),
      status: route.status ?? 200,
      url: route.finalUrl || url,
      headers: new Headers({ 'content-type': route.type || 'text/html; charset=UTF-8' }),
      text: async () => route.html || '',
      body: null,
    };
  };
  return { fetchImpl, calls };
}

assert.deepEqual(iconCandidatesFromHtml(BLUE_NOTE_HEAD, 'https://www.bluenotejazz.com/'), [
  ICON_192,
  'https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-32x32.png',
  'https://www.bluenotejazz.com/wp-content/uploads/2022/05/cropped-fav-180x180.png',
]);

assert.deepEqual(
  iconCandidatesFromHtml('<link rel="shortcut icon" href="/img/i.png">', 'https://venue.example/a/b'),
  ['https://venue.example/img/i.png'],
);

{
  const { fetchImpl, calls } = stubFetch({
    'https://www.bluenote.net/jazz-club-new-york/': {
      finalUrl: 'https://www.bluenotejazz.com/',
      html: BLUE_NOTE_HEAD,
    },
    [ICON_192]: { type: 'image/png' },
  });
  const got = await fetchPageIconUrl('https://www.bluenote.net/jazz-club-new-york/', { fetchImpl });
  assert.equal(got.logoUrl, ICON_192);
  assert.equal(got.pageUrl, 'https://www.bluenotejazz.com/');
  assert.equal(got.reason, '');
  assert.equal(calls[0], 'https://www.bluenote.net/jazz-club-new-york/');
  assert.equal(calls[1], ICON_192);
}

{
  const { fetchImpl } = stubFetch({
    'https://venue.example/': {
      html: '<link rel="icon" href="/bad.png" sizes="192x192"><link rel="icon" href="/good.png" sizes="32x32">',
    },
    'https://venue.example/bad.png': { type: 'text/html' },
    'https://venue.example/good.png': { type: 'image/png' },
  });
  const got = await fetchPageIconUrl('https://venue.example/', { fetchImpl });
  assert.equal(got.logoUrl, 'https://venue.example/good.png');
}

{
  const { fetchImpl } = stubFetch({ 'https://gone.example/': { html: '<title>x</title>' } });
  const got = await fetchPageIconUrl('https://gone.example/', { fetchImpl });
  assert.equal(got.logoUrl, '');
  assert.equal(got.reason, 'no_icon_answered_with_image');
}

{
  const { fetchImpl } = stubFetch({});
  assert.equal((await fetchPageIconUrl('https://down.example/', { fetchImpl })).reason, 'page_http_404');
  assert.equal((await fetchPageIconUrl('', { fetchImpl })).reason, 'no_usable_page_url');
}

console.log('test_page_icon_discovery: ok');

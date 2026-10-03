/**
 * Local fixture server for scripts/test_served_page_layout.mjs.
 * Serves vacation-app.html, shared-app.html, and the trip JSON those pages fetch.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
export const slug = 'intake-layoutchk0001';
const stampSha = 'abcdef1234567890abcdef1234567890abcdef12';
const welcome = 'Welcome. You are all set.';

export const viewports = [
  { width: 390, height: 844, tag: '390' },
  { width: 1280, height: 800, tag: '1280' },
];

export const states = ['NONE', 'ONE', 'SITE', 'MANY'];

export const sessions = {
  NONE: 'layout-none',
  ONE: 'layout-one',
  SITE: 'layout-site',
  MANY: 'layout-many',
};

export function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch (error) {
    console.error('puppeteer-core package missing, using /tmp/pptr', error?.message || error);
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function stampHtml(html) {
  const footer = `<footer data-build-stamp="1">${stampSha.slice(0, 7)}</footer>`;
  const style = '<style id="timesyncher-build-stamp-style">footer[data-build-stamp="1"]{position:fixed;bottom:0;left:0;right:0;z-index:10000;margin:0;padding:3px 8px;font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;background:rgba(12,12,12,.78);color:rgba(255,255,255,.9);pointer-events:none;}body{padding-bottom:24px!important;box-sizing:border-box;}</style>';
  let next = html;
  if (!next.includes('timesyncher-build-stamp-style')) {
    next = next.replace(/<head[^>]*>/i, (open) => `${open}${style}`);
  }
  if (!next.includes('<footer data-build-stamp="1">')) {
    next = /<\/body>/i.test(next) ? next.replace(/<\/body>/i, `${footer}</body>`) : `${next}${footer}`;
  }
  return next;
}

function sendText(res, status, body, type) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': payload.length,
  });
  res.end(payload);
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

function tripRecord(id, title, destination, publicUrl) {
  return {
    id,
    title,
    destination,
    startDate: '2027-03-10',
    endDate: '2027-03-17',
    status: 'planning',
    publicUrl,
  };
}

function appPayload(state, origin) {
  const site = `${origin}/shared/${slug}/`;
  let vacations = [];
  if (state === 'ONE') vacations = [tripRecord('trip-layout-1', 'Sample week', 'Coastal region', '')];
  if (state === 'SITE') vacations = [tripRecord('trip-layout-1', 'Sample week', 'Coastal region', site)];
  if (state === 'MANY') {
    vacations = [
      tripRecord('trip-layout-1', 'Sample week', 'Coastal region', ''),
      tripRecord('trip-layout-2', 'Second week', 'Inland region', ''),
    ];
  }
  return {
    ok: true,
    session: {
      token: sessions[state],
      status: 'active',
      customerName: 'Guest',
      email: 'guest@example.com',
      currentTripId: vacations[0]?.id || '',
      seat: null,
    },
    eula: { accepted: true, text: 'Terms' },
    vacations,
    turns: [{
      id: 'turn-welcome',
      speaker: 'assistant',
      direction: 'outbound',
      authorLabel: 'TimeSyncher',
      body: welcome,
    }],
    itinerary: [],
  };
}

function sharedPayload() {
  return {
    trip: {
      id: 1,
      title: 'Sample week',
      description: '',
      start_date: '2027-03-10',
      end_date: '2027-03-17',
      currency: 'USD',
    },
    days: [{ id: 101, trip_id: 1, day_number: 1, date: '2027-03-10', notes: '', title: '' }],
    assignments: { 101: [] },
    dayNotes: {},
    places: [],
    categories: [],
    permissions: {
      share_map: true,
      share_bookings: false,
      share_packing: false,
      share_budget: false,
      share_collab: false,
    },
    media: [],
    reservations: [],
    accommodations: [],
    packing: [],
    budget: [],
    collab: [],
    thingOverrides: {},
    liveTabLists: { hotels: [], cars: [] },
  };
}

export async function startServer() {
  const publicFiles = new Map([
    ['/vacation-app-request.js', path.join(root, 'public/vacation-app-request.js')],
    ['/ts-timeline-icon-patch.js', path.join(root, 'public/ts-timeline-icon-patch.js')],
    ['/ts-car-brand-filter.js', path.join(root, 'public/ts-car-brand-filter.js')],
    ['/ts-thing-media-overlay.js', path.join(root, 'public/ts-thing-media-overlay.js')],
    ['/post-purchase-gate.mjs', path.join(root, 'public/post-purchase-gate.mjs')],
    ['/ts-thing-media/bindings.json', path.join(root, 'public/ts-thing-media/bindings.json')],
  ]);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/assets/index-BKun7ofk.js') {
      const js = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'));
      return sendText(res, 200, js, 'text/javascript; charset=utf-8');
    }
    if (pathname === '/assets/index-CbEHlMj6.css') {
      const css = await readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'));
      return sendText(res, 200, css, 'text/css; charset=utf-8');
    }
    if (publicFiles.has(pathname)) {
      const file = await readFile(publicFiles.get(pathname));
      const type = pathname.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8';
      return sendText(res, 200, file, type);
    }
    if (pathname.startsWith('/src/')) {
      try {
        const file = await readFile(path.join(root, pathname));
        return sendText(res, 200, file, 'text/javascript; charset=utf-8');
      } catch (error) {
        console.error('missing source', pathname, error?.code || error);
        return sendJson(res, 404, { error: 'not found' });
      }
    }
    if (pathname === '/manifest.webmanifest') {
      return sendText(res, 200, JSON.stringify({ name: 'TimeSyncher Vacation', start_url: '/' }), 'application/manifest+json');
    }
    if (pathname.startsWith('/icons/') || pathname.endsWith('.png') || pathname.endsWith('.svg') || pathname.endsWith('.ico')) {
      return sendText(res, 200, '', pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
    }
    if (pathname === '/vacation-app.html') {
      const html = stampHtml(await readFile(path.join(root, 'vacation-app.html'), 'utf8'));
      return sendText(res, 200, html, 'text/html; charset=utf-8');
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) {
      const html = stampHtml(await readFile(path.join(root, 'shared-app.html'), 'utf8'));
      return sendText(res, 200, html, 'text/html; charset=utf-8');
    }
    if (pathname.startsWith('/api/vacation-itinerary')) {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const session = url.searchParams.get('session') || '';
      const state = Object.entries(sessions).find(([, token]) => token === session)?.[0];
      if (!state) return sendJson(res, 404, { ok: false, error: 'unknown session' });
      return sendJson(res, 200, appPayload(state, origin));
    }
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      const share = decodeURIComponent(sharedMatch[1]);
      if (share === slug) return sendJson(res, 200, sharedPayload());
      return sendJson(res, 404, { error: 'missing' });
    }
    if (pathname.endsWith('/edit-access')) return sendJson(res, 200, { canEdit: false });
    if (pathname.startsWith('/api/')) return sendJson(res, 200, { ok: true, notices: [], bindings: [], media: [] });
    return sendJson(res, 404, { error: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

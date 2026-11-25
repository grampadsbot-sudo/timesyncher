import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vkAdmin from '../../routes/vk-admin.mjs';
import sharedTripHandler from '../../src/vacation/shared-trip-handler.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function staticFile(pathname) {
  const rel = /^\/shared\/[^/]+\/?$/.test(pathname) ? '/shared-app.html' : pathname;
  const bases = rel.startsWith('/src/') || rel === '/shared-app.html' || rel === '/vacation-app.html' ? [ROOT] : [path.join(ROOT, 'public')];
  for (const base of bases) {
    const full = path.resolve(base, `.${rel}`);
    if (full.startsWith(base + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', TYPES['.json']);
  res.end(JSON.stringify(body));
}

async function withBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return req;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  req.body = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
  return req;
}

export async function startVkAdminLocalServer({ port = 0, ownerAppPayload = null } = {}) {
  const writes = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local.test');
    try {
      if (url.pathname === '/vacation-app/admin' || url.pathname === '/vacation-app/admin/' || url.pathname.startsWith('/api/admin')) {
        await vkAdmin(await withBody(req), res);
        return;
      }
      if (url.pathname.startsWith('/api/shared/')) {
        await sharedTripHandler(req, res);
        return;
      }
      if (ownerAppPayload && req.method === 'GET' && url.pathname === '/api/vacation-itinerary') {
        return json(res, 200, ownerAppPayload(url));
      }
      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          writes.push(`${req.method} ${url.pathname}`);
          return json(res, 405, { ok: false });
        }
        return json(res, 200, { ok: true, notices: [], bindings: [], media: [] });
      }
      const file = staticFile(url.pathname);
      if (!file) return json(res, 404, { error: 'not found' });
      res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.statusCode = 500;
      res.end('server error');
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  return {
    base: `http://127.0.0.1:${address.port}`,
    writes,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vkAdmin from '../../routes/vk-admin.mjs';
import sharedTripHandler from '../../src/vacation/shared-trip-handler.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = fs.existsSync(path.join(ROOT, 'dist')) ? path.join(ROOT, 'dist') : ROOT;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function shimRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function staticFile(pathname) {
  let p = pathname;
  if (p === '/vacation-app/admin' || p === '/vacation-app/admin/') {
    if (String(process.env.VERCEL_ENV || '') === 'production') return null;
    p = '/vacation-app-admin.html';
  } else if (p.startsWith('/shared/')) {
    p = '/shared-app.html';
  }
  const safePath = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
  const candidates = [
    path.join(DIST, safePath),
    path.join(DIST, 'public', safePath.replace(/^\//, '')),
    path.join(ROOT, safePath),
    path.join(ROOT, 'public', safePath.replace(/^\//, '')),
  ];
  for (const file of candidates) {
    if (!file.startsWith(ROOT) && !file.startsWith(DIST)) continue;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

function routeAdmin(pathname) {
  if (pathname === '/vacation-app/admin' || pathname === '/vacation-app/admin/') return { adminPage: true };
  if (pathname === '/api/admin/session') return { admin: true, parts: ['session'] };
  if (pathname === '/api/admin/customers') return { admin: true, parts: ['customers'] };
  if (pathname === '/api/admin/clear-all') return { admin: true, parts: ['clear-all'] };
  const open = pathname.match(/^\/api\/admin\/customers\/([^/]+)\/open$/);
  if (open) return { admin: true, parts: ['customers', open[1], 'open'] };
  const detail = pathname.match(/^\/api\/admin\/customers\/([^/]+)$/);
  if (detail) return { admin: true, parts: ['customers', detail[1]] };
  return null;
}

export async function startVkAdminLocalServer({ port = 0 } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local.test');
    try {
      const admin = routeAdmin(url.pathname);
      if (admin?.adminPage) {
        const vreq = {
          method: req.method,
          url: req.url,
          headers: { ...req.headers, 'x-forwarded-proto': 'http' },
          query: { adminPage: '1' },
        };
        await vkAdmin(vreq, res);
        if (!res.writableEnded) res.end();
        return;
      }
      if (admin?.admin) {
        const subpath = admin.parts.join('/');
        const vreq = {
          method: req.method,
          url: `/api/admin/${subpath}${url.search}`,
          headers: { ...req.headers, 'x-forwarded-proto': 'http' },
          body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : undefined,
          query: Object.fromEntries(url.searchParams),
        };
        await vkAdmin(vreq, shimRes(res));
        if (!res.writableEnded) res.end();
        return;
      }
      if (url.pathname.startsWith('/api/shared/') || url.pathname.startsWith('/api/shared-trip/')) {
        const vreq = {
          method: req.method,
          url: req.url,
          headers: req.headers,
        };
        await sharedTripHandler(vreq, res);
        if (!res.writableEnded) res.end();
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end('{"error":"not found"}');
        return;
      }
      const file = staticFile(url.pathname);
      if (!file) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.statusCode = 500;
      res.end('server error');
    }
  });
  await new Promise((resolve) => server.listen(port, resolve));
  const address = server.address();
  return { server, base: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
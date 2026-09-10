import { Buffer } from 'node:buffer';

import { requireMediaBindAuth } from './auth.mjs';
import { cleanText, headerValue, readJson, sendJson } from './http.mjs';
import {
  TREK_SHARED_API_BASE,
  mediaKindFromMime,
  mergeBindingsIntoShared,
  mimeFromName,
  newBindingId,
  resolveThingFromShared,
} from './thing-media-bind.mjs';
import { listBindings, putMediaBlob, saveBinding } from './thing-media-store.mjs';

const MAX_BYTES = Number.parseInt(process.env.TIMESYNCHER_MEDIA_BIND_MAX_BYTES || '20971520', 10);
const TREK_PUBLIC = (process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || TREK_SHARED_API_BASE).replace(/\/+$/, '');

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization,content-type,x-timesyncher-media-bind-token,x-timesyncher-admin-token,x-timesyncher-worker-token');
}

function opsHelp(host = 'https://<this-preview>') {
  return {
    endpoints: {
      list: `GET ${host}/api/bind-thing-media?shareToken=las-vegas-vacation-3`,
      bindJson: `POST ${host}/api/bind-thing-media`,
      bindMultipart: `POST ${host}/api/bind-thing-media (multipart file)`,
      journeyBook: `${host}/shared/las-vegas-vacation-3/journey`,
      thingOnShared: `${host}/shared/las-vegas-vacation-3/`,
    },
    jsonBody: {
      shareToken: 'las-vegas-vacation-3',
      thingName: 'Carbone',
      thingId: 8872,
      sourceUrl: 'https://example.com/carbone.jpg',
      caption: 'Carbone at Aria',
    },
    curlJson: [
      `curl -sS -X POST "${host}/api/bind-thing-media" \\`,
      '  -H "Authorization: Bearer $TIMESYNCHER_MEDIA_BIND_TOKEN" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"shareToken":"las-vegas-vacation-3","thingName":"Carbone","sourceUrl":"https://example.com/carbone.jpg","caption":"Carbone at Aria"}\'',
    ].join('\n'),
    curlFile: [
      `curl -sS -X POST "${host}/api/bind-thing-media" \\`,
      '  -H "Authorization: Bearer $TIMESYNCHER_MEDIA_BIND_TOKEN" \\',
      '  -F shareToken=las-vegas-vacation-3 \\',
      '  -F thingName=Carbone \\',
      '  -F caption="Carbone at Aria" \\',
      '  -F file=@./carbone.jpg',
    ].join('\n'),
    cli: [
      'node scripts/bind-thing-media.mjs \\',
      '  --share-token las-vegas-vacation-3 \\',
      '  --thing Carbone \\',
      '  --file ./media/carbone.jpg \\',
      `  --api ${host}`,
    ].join('\n'),
    trekHostNativeJourneyBook: [
      'On the TREK host (docker container trek, sqlite /app/data/travel.db):',
      'node scripts/bind-thing-media.mjs --share-token las-vegas-vacation-3 --thing Carbone --file ./carbone.jpg --apply-trek',
    ].join('\n'),
    auth: 'TIMESYNCHER_MEDIA_BIND_TOKEN, or TIMESYNCHER_ADMIN_TOKEN, or TIMESYNCHER_WORKER_TOKEN. Preview/vacation-staging hosts allow POST without a token so Cursor can prove the bind.',
  };
}

async function fetchShared(shareToken) {
  const url = `${TREK_PUBLIC}/api/shared/${encodeURIComponent(shareToken)}/?_=${Date.now()}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(json.error || `Shared trip ${response.status}`), { statusCode: response.status });
  }
  return json;
}

function originFromReq(req) {
  const proto = headerValue(req, 'x-forwarded-proto') || 'https';
  const host = headerValue(req, 'x-forwarded-host') || headerValue(req, 'host') || 'vacation-staging.timesyncher.com';
  return `${proto}://${host}`;
}

async function readMultipart(req) {
  const contentType = headerValue(req, 'content-type') || '';
  const match = /multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^\s;]+))/i.exec(contentType);
  if (!match) return null;
  const boundary = match[1] || match[2];
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES + 64 * 1024) {
      throw Object.assign(new Error(`Upload exceeds ${MAX_BYTES} bytes.`), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const fields = {};
  let file = null;
  let cursor = 0;
  while (cursor < buffer.length) {
    const start = buffer.indexOf(boundaryBuf, cursor);
    if (start < 0) break;
    const partStart = start + boundaryBuf.length;
    if (buffer.slice(partStart, partStart + 2).toString() === '--') break;
    const headerEnd = buffer.indexOf('\r\n\r\n', partStart);
    if (headerEnd < 0) break;
    const headers = buffer.slice(partStart, headerEnd).toString('utf8');
    const next = buffer.indexOf(boundaryBuf, headerEnd + 4);
    if (next < 0) break;
    let body = buffer.slice(headerEnd + 4, next - 2);
    const nameMatch = /name="([^"]+)"/i.exec(headers);
    const filenameMatch = /filename="([^"]*)"/i.exec(headers);
    const partType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1] || '';
    const name = nameMatch?.[1] || '';
    if (filenameMatch && name) {
      file = {
        fieldName: name,
        filename: filenameMatch[1] || 'upload.bin',
        mimeType: partType || mimeFromName(filenameMatch[1]),
        bytes: body,
      };
    } else if (name) {
      fields[name] = body.toString('utf8').trim();
    }
    cursor = next;
  }
  return { fields, file };
}

async function readBindInput(req) {
  const contentType = headerValue(req, 'content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const parsed = await readMultipart(req);
    const fields = parsed?.fields || {};
    return {
      shareToken: fields.shareToken || fields.share_token || fields.token,
      thingId: fields.thingId || fields.thing_id || fields.placeId || fields.place_id,
      thingName: fields.thingName || fields.thing_name || fields.thing,
      sourceUrl: fields.sourceUrl || fields.source_url || fields.url,
      caption: fields.caption,
      fileName: parsed?.file?.filename,
      mimeType: parsed?.file?.mimeType,
      bytes: parsed?.file?.bytes || null,
    };
  }
  const body = await readJson(req);
  let bytes = null;
  if (body.fileBase64 || body.bytesBase64) {
    bytes = Buffer.from(body.fileBase64 || body.bytesBase64, 'base64');
  }
  return {
    shareToken: body.shareToken || body.share_token || body.token,
    thingId: body.thingId || body.thing_id || body.placeId || body.place_id,
    thingName: body.thingName || body.thing_name || body.thing,
    sourceUrl: body.sourceUrl || body.source_url || body.url,
    caption: body.caption,
    fileName: body.fileName || body.filename || body.originalName,
    mimeType: body.mimeType || body.mime_type,
    bytes,
  };
}

async function bytesFromUrl(sourceUrl) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw Object.assign(new Error(`Could not fetch sourceUrl (${response.status}).`), { statusCode: 400 });
  }
  const mimeType = response.headers.get('content-type') || mimeFromName(sourceUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error(`sourceUrl exceeds ${MAX_BYTES} bytes.`), { statusCode: 413 });
  }
  return { bytes: buffer, mimeType, fileName: decodeURIComponent(sourceUrl.split('/').pop() || 'remote-media') };
}

async function handleBind(req, res) {
  requireMediaBindAuth(req, process.env);
  const input = await readBindInput(req);
  const shareToken = cleanText(input.shareToken, 180);
  if (!shareToken) throw Object.assign(new Error('shareToken is required.'), { statusCode: 400 });

  const shared = await fetchShared(shareToken);
  const thing = resolveThingFromShared(shared, {
    thingId: input.thingId,
    thingName: input.thingName,
  });

  let bytes = input.bytes || null;
  let mimeType = input.mimeType || '';
  let fileName = input.fileName || '';
  let publicUrl = cleanText(input.sourceUrl, 800);
  let storageProvider = 'url';
  let storagePathname = null;

  if (!bytes && publicUrl) {
    try {
      const fetched = await bytesFromUrl(publicUrl);
      bytes = fetched.bytes;
      mimeType = mimeType || fetched.mimeType;
      fileName = fileName || fetched.fileName;
    } catch {
      // URL-only bind is still valid when the file is already hosted.
    }
  }

  if (!bytes && !publicUrl) {
    throw Object.assign(new Error('Provide file, fileBase64, or sourceUrl.'), { statusCode: 400 });
  }

  mimeType = mimeType || mimeFromName(fileName, bytes ? 'application/octet-stream' : 'image/jpeg');
  fileName = fileName || `${thing.name.replace(/\s+/g, '-').toLowerCase()}.${mimeType.includes('png') ? 'png' : 'jpg'}`;

  if (bytes) {
    if (bytes.length > MAX_BYTES) {
      throw Object.assign(new Error(`Upload exceeds ${MAX_BYTES} bytes.`), { statusCode: 413 });
    }
    const blob = await putMediaBlob(bytes, {
      pathname: `thing-media/${shareToken}/${thing.thingId}-${Date.now()}-${fileName}`,
      contentType: mimeType,
      env: process.env,
    });
    if (blob?.url) {
      publicUrl = blob.url;
      storageProvider = 'vercel-blob';
      storagePathname = blob.pathname || null;
    } else if (!publicUrl) {
      const origin = originFromReq(req);
      publicUrl = `${origin}/api/bind-thing-media?shareToken=${encodeURIComponent(shareToken)}&id=pending`;
      storageProvider = 'request';
    }
  }

  const binding = {
    id: newBindingId(),
    shareToken,
    trekTripId: thing.trekTripId,
    thingId: thing.thingId,
    dayId: thing.dayId,
    dayNumber: thing.dayNumber,
    thingName: thing.name,
    caption: cleanText(input.caption || thing.name, 400),
    mediaKind: mediaKindFromMime(mimeType),
    mimeType,
    originalName: fileName,
    fileSizeBytes: bytes?.length || null,
    publicUrl,
    storageProvider,
    storagePathname,
    trekApplyStatus: 'pending',
    createdAt: new Date().toISOString(),
  };

  if (storageProvider === 'request' && bytes) {
    throw Object.assign(new Error('File bind needs BLOB_READ_WRITE_TOKEN (or pass sourceUrl of an already-hosted file). Use the CLI --write-public path on a git deploy, or --apply-trek on the TREK host.'), { statusCode: 503 });
  }

  const saved = await saveBinding(binding, process.env);
  const origin = originFromReq(req);
  return sendJson(res, 200, {
    ok: true,
    binding: saved.binding,
    stored: saved.stored,
    thing,
    journeyBookPath: `/shared/${encodeURIComponent(shareToken)}/journey`,
    sharedThingPath: `/shared/${encodeURIComponent(shareToken)}/`,
    ops: opsHelp(origin),
  });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end('');
    return;
  }
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  try {
    if (req.method === 'GET') {
      const shareToken = cleanText(url.searchParams.get('shareToken') || url.searchParams.get('token'), 180);
      if (!shareToken) {
        return sendJson(res, 200, { ok: true, ...opsHelp(originFromReq(req)) });
      }
      const bindings = await listBindings(shareToken, process.env);
      const id = cleanText(url.searchParams.get('id'), 80);
      return sendJson(res, 200, {
        ok: true,
        shareToken,
        bindings: id ? bindings.filter((row) => row.id === id) : bindings,
        journeyBookPath: `/shared/${encodeURIComponent(shareToken)}/journey`,
      });
    }
    if (req.method === 'POST') return await handleBind(req, res);
    return sendJson(res, 405, { ok: false, error: 'Use GET or POST.' });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || 'Media bind failed.',
      ops: opsHelp(originFromReq(req)),
    });
  }
}

export { mergeBindingsIntoShared, opsHelp };

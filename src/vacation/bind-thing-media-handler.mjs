import { Buffer } from 'node:buffer';

import { requireMediaBindAuth } from './auth.mjs';
import { cleanText, headerValue, readJson, sendJson } from './http.mjs';
import { hasDatabase } from './db.mjs';
import {
  TREK_SHARED_API_BASE,
  chooseMediaStorage,
  mediaKindFromMime,
  mergeBindingsIntoShared,
  mimeFromName,
  newBindingId,
  resolveThingFromShared,
  sniffMediaType,
} from './thing-media-bind.mjs';
import { getBindingMedia, listBindings, putMediaBlob, saveBinding } from './thing-media-store.mjs';

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
      journeyBook: `${host}/shared/las-vegas-vacation-3/journey?style=2`,
      style2Pdf: `${host}/api/pdf/shared/las-vegas-vacation-3/report/style-2`,
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
    storage: 'Multipart/file and fileBase64 bind to Neon (thing_media_bindings.file_bytes) when DATABASE_URL is set. Blob is optional and is skipped when it fails or is suspended. sourceUrl-only binds an already-hosted public URL with no upload.',
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

  const sourceUrl = cleanText(input.sourceUrl, 800);
  let bytes = input.bytes || null;
  let mimeType = input.mimeType || '';
  let fileName = input.fileName || '';

  if (!bytes && !sourceUrl) {
    throw Object.assign(new Error('Provide file, fileBase64, or sourceUrl.'), { statusCode: 400 });
  }
  if (bytes && bytes.length > MAX_BYTES) {
    throw Object.assign(new Error(`Upload exceeds ${MAX_BYTES} bytes.`), { statusCode: 413 });
  }

  fileName = fileName || decodeURIComponent((sourceUrl.split('/').pop() || '')) || `${thing.name.replace(/\s+/g, '-').toLowerCase()}.${String(mimeType).includes('png') ? 'png' : 'jpg'}`;
  mimeType = sniffMediaType(bytes, fileName || sourceUrl, mimeType);

  const bindingId = newBindingId();
  let blobUrl = '';
  let storagePathname = null;
  if (bytes && !hasDatabase(process.env)) {
    const blob = await putMediaBlob(bytes, {
      pathname: `thing-media/${shareToken}/${thing.thingId}-${Date.now()}-${fileName}`,
      contentType: mimeType,
      env: process.env,
    });
    blobUrl = blob?.url || '';
    storagePathname = blob?.pathname || null;
  }

  const storage = chooseMediaStorage({
    bytes,
    sourceUrl,
    blobUrl,
    hasDatabase: hasDatabase(process.env),
    origin: originFromReq(req),
    shareToken,
    bindingId,
  });
  if (storage.error === 'no-store') {
    throw Object.assign(new Error('File bind needs DATABASE_URL (Neon) or a working Blob store, or pass sourceUrl of an already-hosted file. Use CLI --write-public on a git deploy, or --apply-trek on the TREK host.'), { statusCode: 503 });
  }
  if (storage.error === 'no-input') {
    throw Object.assign(new Error('Provide file, fileBase64, or sourceUrl.'), { statusCode: 400 });
  }

  const binding = {
    id: bindingId,
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
    publicUrl: storage.publicUrl,
    storageProvider: storage.storageProvider,
    storagePathname,
    trekApplyStatus: 'pending',
    createdAt: new Date().toISOString(),
  };

  const saved = await saveBinding(binding, process.env, {
    bytes: storage.storeBytes ? bytes : null,
  });
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
      const id = cleanText(url.searchParams.get('id'), 80);
      const raw = url.searchParams.get('raw') === '1' || url.searchParams.get('raw') === 'true';
      if (raw && shareToken && id) {
        const media = await getBindingMedia(shareToken, id, process.env);
        if (!media) {
          return sendJson(res, 404, { ok: false, error: 'Bound media bytes were not found.' });
        }
        res.statusCode = 200;
        res.setHeader('content-type', media.mimeType);
        res.setHeader('cache-control', 'public, max-age=3600');
        res.setHeader('content-disposition', `inline; filename="${media.originalName.replace(/"/g, '')}"`);
        res.end(media.bytes);
        return;
      }
      if (!shareToken) {
        return sendJson(res, 200, { ok: true, ...opsHelp(originFromReq(req)) });
      }
      const bindings = await listBindings(shareToken, process.env);
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

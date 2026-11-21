import { sql } from '../src/vacation/db.mjs';
import { cleanText, headerValue, readJson, sendJson } from '../src/vacation/http.mjs';
import { readCookie, verifiedOwnerWebGrant, webAccessCookieName, webAccessForSession } from '../src/vacation/web-access.mjs';
import { MCP_TOOLS } from '../src/vacation/mcp-tools.mjs';
import {
  authenticateMcpToken,
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from '../src/vacation/mcp-tokens.mjs';
import {
  handleUploadMedia,
  receiveSignedMediaUpload,
} from '../src/vacation/mcp-media-service.mjs';
import {
  approveVacationChangeSet,
  declineVacationChangeSet,
  getVacationChangeSetPreview,
  handleCommitImport,
  handleDescribeImportFormat,
  handlePreviewImport,
  handleReadVacation,
  handleStartImport,
  handleUpdateVacation,
  listVacationChangeSets,
} from '../src/vacation/mcp-service.mjs';

const MCP_PROTOCOL_VERSION = ['2025', '03', '26'].join('-');

let mcpDatabaseOverride = null;
let mcpClockOverride = null;

export function useVacationMcpDatabase(db) {
  mcpDatabaseOverride = db || null;
}

export function setVacationMcpClock(clockFn) {
  mcpClockOverride = typeof clockFn === 'function' ? clockFn : null;
}

function openDb() {
  return mcpDatabaseOverride || sql(process.env);
}

function nowFn() {
  return mcpClockOverride ? mcpClockOverride() : new Date();
}

function extractMcpBearer(req) {
  const auth = headerValue(req, 'authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (match) return match[1].trim();
  return cleanText(headerValue(req, 'x-vk-mcp-token'), 300);
}

function requestBaseUrl(req) {
  const host = cleanText(headerValue(req, 'x-forwarded-host') || headerValue(req, 'host'), 200);
  if (host) {
    const proto = cleanText(headerValue(req, 'x-forwarded-proto'), 20) || 'https';
    return `${proto}://${host}`;
  }
  return String(process.env.TIMESYNCHER_SITE_BASE_URL || 'https://www.timesyncher.com').replace(/\/+$/, '');
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body instanceof Uint8Array) return Buffer.from(req.body);
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function resolveEditorAccess(db, req, { tripId = '', shareToken = '' }) {
  const sessionToken = readCookie(req, webAccessCookieName()) || cleanText(headerValue(req, 'x-timesyncher-web-access-token'), 400);
  if (!sessionToken) {
    throw Object.assign(new Error('Owner or collaborator sign-in is required.'), { statusCode: 401, code: 'editor_auth_required' });
  }
  const grant = await webAccessForSession(db, {
    sessionToken,
    tripId: cleanText(tripId, 80) || '',
    shareToken: cleanText(shareToken, 240) || '',
    env: process.env,
  });
  if (!grant) {
    throw Object.assign(new Error('You do not have edit access for this vacation.'), { statusCode: 403, code: 'editor_access_denied' });
  }
  const verified = grant.role === 'owner'
    ? await verifiedOwnerWebGrant(db, grant, grant.trip_id)
    : grant;
  if (!verified) {
    throw Object.assign(new Error('Owner edit access could not be verified for this vacation.'), { statusCode: 403, code: 'editor_access_denied' });
  }
  return {
    tripId: String(verified.trip_id),
    ownerCustomerId: verified.owner_customer_id ? String(verified.owner_customer_id) : null,
    email: String(verified.email || ''),
    role: verified.role === 'owner' ? 'owner' : 'collaborator',
  };
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  };
}

function jsonRpcSuccess(id, result) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
}

async function executeMcpTool(db, tokenRecord, name, args, req) {
  const ctx = { baseUrl: requestBaseUrl(req), now: nowFn, env: process.env };
  if (name === 'describe_import_format') return handleDescribeImportFormat(tokenRecord, args);
  if (name === 'start_import') return handleStartImport(db, tokenRecord, args);
  if (name === 'upload_media') return handleUploadMedia(db, tokenRecord, args, ctx);
  if (name === 'preview_import') return handlePreviewImport(db, tokenRecord, args);
  if (name === 'commit_import') return handleCommitImport(db, tokenRecord, args);
  if (name === 'read_vacation') return handleReadVacation(db, tokenRecord, args);
  if (name === 'update_vacation') return handleUpdateVacation(db, tokenRecord, args);
  throw Object.assign(new Error(`Unknown MCP tool "${cleanText(name, 80)}".`), { statusCode: 404, code: 'unknown_tool' });
}

async function handleJsonRpcMessage(db, req, message) {
  const id = message?.id ?? null;
  const method = cleanText(message?.method, 100);
  const params = message?.params && typeof message.params === 'object' ? message.params : {};
  const rawToken = extractMcpBearer(req);

  if (method === 'initialize') {
    if (rawToken) await authenticateMcpToken(db, rawToken, { env: process.env, now: nowFn });
    return jsonRpcSuccess(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'vacay-keepsake-mcp', version: '1.0.0' },
    });
  }
  if (method === 'notifications/initialized') {
    return null;
  }
  if (method === 'ping') {
    return jsonRpcSuccess(id, {});
  }
  if (method === 'tools/list' || method === 'list_tools') {
    if (rawToken) await authenticateMcpToken(db, rawToken, { env: process.env, now: nowFn });
    return jsonRpcSuccess(id, { tools: MCP_TOOLS });
  }
  if (method === 'tools/call') {
    const tokenRecord = await authenticateMcpToken(db, rawToken, { env: process.env, now: nowFn });
    const toolName = cleanText(params.name, 100);
    const toolArgs = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
    const payload = await executeMcpTool(db, tokenRecord, toolName, toolArgs, req);
    return jsonRpcSuccess(id, {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      structuredContent: payload,
      isError: false,
    });
  }
  return jsonRpcError(id, -32601, `Unsupported MCP method "${method}".`);
}

function subPartsFromUrl(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const mcpIdx = parts.indexOf('mcp');
  return mcpIdx >= 0 ? parts.slice(mcpIdx + 1) : [];
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const sub = subPartsFromUrl(url);
  const db = openDb();

  try {
    if (sub.length === 0) {
      if (req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          name: 'vacay-keepsake-mcp',
          protocolVersion: MCP_PROTOCOL_VERSION,
          transport: 'streamable-http',
          endpoint: '/api/mcp',
          capabilities: { tools: { listChanged: false } },
          tools: MCP_TOOLS,
        });
      }
      if (req.method === 'POST') {
        const body = await readJson(req);
        try {
          const response = await handleJsonRpcMessage(db, req, body);
          if (response === null) {
            res.statusCode = 202;
            res.setHeader('cache-control', 'no-store');
            return res.end();
          }
          return sendJson(res, 200, response);
        } catch (error) {
          const status = Number(error?.statusCode || 400);
          const rpcCode = status === 401 ? -32001 : (status === 403 ? -32003 : -32602);
          return sendJson(res, status >= 400 && status < 600 ? status : 400, jsonRpcError(
            body?.id ?? null,
            rpcCode,
            String(error?.message || 'MCP request failed.'),
            { code: error?.code || 'mcp_error', ...(error?.details ? { details: error.details } : {}) },
          ));
        }
      }
      return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    }

    if (sub[0] === 'upload' && sub[1] && req.method === 'PUT') {
      const buffer = await readRawBody(req);
      const result = await receiveSignedMediaUpload(db, {
        mediaId: decodeURIComponent(sub[1]),
        exp: url.searchParams.get('exp'),
        sig: url.searchParams.get('sig'),
        buffer,
        contentType: headerValue(req, 'content-type') || '',
        now: nowFn,
        env: process.env,
      });
      return sendJson(res, 200, result);
    }

    if (sub[0] === 'media' && sub[1] && req.method === 'GET') {
      const mediaId = decodeURIComponent(sub[1]);
      const rawToken = extractMcpBearer(req);
      const sessionToken = readCookie(req, webAccessCookieName()) || cleanText(headerValue(req, 'x-timesyncher-web-access-token'), 400);
      if (!rawToken && !sessionToken) {
        return sendJson(res, 401, { ok: false, code: 'media_auth_required', error: 'Authentication is required to view staged vacation media.' });
      }
      let tokenRecord = null;
      if (rawToken) {
        tokenRecord = await authenticateMcpToken(db, rawToken, { env: process.env, now: nowFn });
      }
      const rows = await db`
        select scope_trip_id, upload_status, mime_type, filename, file_bytes
        from vacation_mcp_draft_media
        where id = ${mediaId}
        limit 1
      `;
      const row = rows[0];
      if (!row || !row.file_bytes) return sendJson(res, 404, { ok: false, error: 'Media not found.' });
      if (tokenRecord) {
        if (String(row.scope_trip_id) !== String(tokenRecord.tripId)) {
          return sendJson(res, 403, { ok: false, code: 'vacation_scope_mismatch', error: 'This AI access token is scoped to a different vacation.' });
        }
      } else {
        await resolveEditorAccess(db, req, { tripId: String(row.scope_trip_id) });
      }
      res.statusCode = 200;
      res.setHeader('content-type', row.mime_type || 'application/octet-stream');
      res.setHeader('cache-control', 'private, no-store');
      return res.end(Buffer.isBuffer(row.file_bytes) ? row.file_bytes : Buffer.from(row.file_bytes));
    }

    if (sub[0] === 'tokens') {
      if (req.method === 'GET' && sub.length === 1) {
        const editor = await resolveEditorAccess(db, req, {
          tripId: url.searchParams.get('tripId') || url.searchParams.get('vacationId') || '',
          shareToken: url.searchParams.get('shareToken') || '',
        });
        const tokens = await listMcpTokens(db, { tripId: editor.tripId });
        return sendJson(res, 200, { ok: true, vacationId: editor.tripId, mcpEndpoint: `${requestBaseUrl(req)}/api/mcp`, tokens });
      }
      if (req.method === 'POST' && sub.length === 1) {
        const body = await readJson(req);
        const editor = await resolveEditorAccess(db, req, {
          tripId: body.tripId || body.vacationId || url.searchParams.get('tripId') || '',
          shareToken: body.shareToken || url.searchParams.get('shareToken') || '',
        });
        const requestedRole = body.role === 'owner' && editor.role === 'owner' ? 'owner' : 'collaborator';
        const created = await createMcpToken(db, {
          tripId: editor.tripId,
          ownerCustomerId: editor.ownerCustomerId,
          createdByEmail: editor.email,
          label: cleanText(body.label, 120) || 'AI access',
          role: requestedRole,
          expiresAt: body.expiresAt || body.expires_at || null,
          expiresInDays: body.expiresInDays ?? body.expires_in_days ?? null,
          now: nowFn,
          env: process.env,
        });
        return sendJson(res, 201, { ok: true, token: created.token, record: created.record, mcpEndpoint: `${requestBaseUrl(req)}/api/mcp` });
      }
      if ((req.method === 'POST' && sub[2] === 'revoke') || (req.method === 'DELETE' && sub.length === 2)) {
        const body = req.method === 'POST' ? await readJson(req) : {};
        const editor = await resolveEditorAccess(db, req, {
          tripId: body.tripId || body.vacationId || url.searchParams.get('tripId') || '',
          shareToken: body.shareToken || url.searchParams.get('shareToken') || '',
        });
        const revoked = await revokeMcpToken(db, { tripId: editor.tripId, tokenId: decodeURIComponent(sub[1]) });
        return sendJson(res, 200, { ok: true, record: revoked });
      }
    }

    if (sub[0] === 'changes') {
      if (req.method === 'GET' && sub.length === 1) {
        const editor = await resolveEditorAccess(db, req, {
          tripId: url.searchParams.get('tripId') || url.searchParams.get('vacationId') || '',
          shareToken: url.searchParams.get('shareToken') || '',
        });
        const changes = await listVacationChangeSets(db, { tripId: editor.tripId });
        return sendJson(res, 200, { ok: true, vacationId: editor.tripId, changes });
      }
      if (req.method === 'GET' && sub.length === 2) {
        const editor = await resolveEditorAccess(db, req, {
          tripId: url.searchParams.get('tripId') || url.searchParams.get('vacationId') || '',
          shareToken: url.searchParams.get('shareToken') || '',
        });
        const change = await getVacationChangeSetPreview(db, { tripId: editor.tripId, changeSetId: decodeURIComponent(sub[1]) });
        return sendJson(res, 200, { ok: true, change });
      }
      if (req.method === 'POST' && sub[1] && sub[2] === 'approve') {
        const body = await readJson(req);
        const editor = await resolveEditorAccess(db, req, {
          tripId: body.tripId || body.vacationId || url.searchParams.get('tripId') || '',
          shareToken: body.shareToken || url.searchParams.get('shareToken') || '',
        });
        const result = await approveVacationChangeSet(db, {
          tripId: editor.tripId,
          changeSetId: decodeURIComponent(sub[1]),
          actorEmail: editor.email,
          actorRole: editor.role,
          previewHash: cleanText(body.preview_hash || body.previewHash, 128),
        });
        return sendJson(res, 200, result);
      }
      if (req.method === 'POST' && sub[1] && sub[2] === 'decline') {
        const body = await readJson(req);
        const editor = await resolveEditorAccess(db, req, {
          tripId: body.tripId || body.vacationId || url.searchParams.get('tripId') || '',
          shareToken: body.shareToken || url.searchParams.get('shareToken') || '',
        });
        const result = await declineVacationChangeSet(db, {
          tripId: editor.tripId,
          changeSetId: decodeURIComponent(sub[1]),
          actorEmail: editor.email,
          actorRole: editor.role,
          reason: body.reason || '',
        });
        return sendJson(res, 200, result);
      }
    }

    return sendJson(res, 404, { ok: false, error: 'MCP route not found.' });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return sendJson(res, status >= 400 && status < 600 ? status : 500, {
      ok: false,
      code: error?.code || 'mcp_request_failed',
      error: String(error?.message || 'Unable to complete MCP request.'),
    });
  }
}

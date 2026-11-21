import crypto from 'node:crypto';
import { buildCarmelWeekendFixture } from '../lib/c10-test-media.mjs';
import { VIEWPORTS, assertStagingUrl, registerSecret } from './config.mjs';
import { Scenario, newViewportPage, runScenario, visibleText } from './harness.mjs';

async function closePair(pair) {
  for (const entry of Object.values(pair)) {
    await entry.context.close().catch(() => null);
  }
}

async function openPair(browser) {
  const pair = {};
  for (const vp of VIEWPORTS) {
    pair[vp.name] = await newViewportPage(browser, vp);
  }
  return pair;
}

function pageMap(pair) {
  return { 'iphone-390': pair['iphone-390'].page, 'desktop-1280': pair['desktop-1280'].page };
}

async function mcpRpc(endpointUrl, token, method, params = {}) {
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`MCP ${method} failed (http ${res.status}): ${JSON.stringify(data.error || data).slice(0, 220)}`);
  }
  return data.result;
}

async function runLiveMcpImport({ base, copyText }) {
  const endpointMatch = copyText.match(/MCP endpoint:\s*(https?:\/\/\S+)/i);
  const bearerMatch = copyText.match(/Authorization:\s*Bearer\s+(\S+)/i);
  if (!endpointMatch || !bearerMatch) {
    throw new Error('AI import handoff text missing MCP endpoint or Bearer token');
  }
  const endpointUrl = endpointMatch[1].trim();
  const origin = assertStagingUrl(endpointUrl);
  const resolvedEndpoint = `${origin}${new URL(endpointUrl).pathname}`;
  const rawToken = bearerMatch[1].trim();
  registerSecret(rawToken);

  const listed = await mcpRpc(resolvedEndpoint, rawToken, 'tools/list');
  const toolNames = (listed?.tools || []).map((t) => t.name);
  const requiredTools = ['describe_import_format', 'start_import', 'upload_media', 'preview_import', 'commit_import'];
  const missingTools = requiredTools.filter((name) => !toolNames.includes(name));
  if (missingTools.length) throw new Error(`MCP tools/list missing ${missingTools.join(', ')}`);

  const formatRes = await mcpRpc(resolvedEndpoint, rawToken, 'tools/call', { name: 'describe_import_format', arguments: {} });
  const hasSchema = Boolean(formatRes?.structuredContent?.example);

  const { draft, mediaFiles } = buildCarmelWeekendFixture();
  const startRes = await mcpRpc(resolvedEndpoint, rawToken, 'tools/call', {
    name: 'start_import',
    arguments: { ...draft, apply_mode: 'populate_scoped' },
  });
  const draftId = startRes?.structuredContent?.draft_id || '';
  if (!draftId) throw new Error('start_import returned no draft_id');

  const reqUpload = await mcpRpc(resolvedEndpoint, rawToken, 'tools/call', {
    name: 'upload_media',
    arguments: {
      action: 'request_upload',
      draft_id: draftId,
      files: mediaFiles.map((f) => ({
        filename: f.filename,
        mime_type: f.mime_type,
        media_kind: f.media_kind,
        caption: f.caption,
        ...(f.thing_ref ? { thing_ref: f.thing_ref } : {}),
      })),
    },
  });
  const slots = reqUpload?.structuredContent?.uploads || [];
  if (slots.length !== mediaFiles.length) throw new Error(`expected ${mediaFiles.length} upload slots, got ${slots.length}`);
  for (let i = 0; i < slots.length; i += 1) {
    const slotUrl = new URL(slots[i].upload_url, base);
    assertStagingUrl(slotUrl.href);
    const putRes = await fetch(slotUrl.href, {
      method: 'PUT',
      headers: { 'content-type': mediaFiles[i].mime_type },
      body: mediaFiles[i].bytes,
      signal: AbortSignal.timeout(45000),
    });
    if (!putRes.ok) throw new Error(`media PUT ${mediaFiles[i].filename} failed (${putRes.status})`);
  }
  await mcpRpc(resolvedEndpoint, rawToken, 'tools/call', {
    name: 'upload_media',
    arguments: { action: 'finalize', draft_id: draftId, media_ids: slots.map((s) => s.media_id) },
  });

  const previewRes = await mcpRpc(resolvedEndpoint, rawToken, 'tools/call', {
    name: 'preview_import',
    arguments: { draft_id: draftId },
  });
  const preview = previewRes?.structuredContent?.preview || {};
  const previewHash = previewRes?.structuredContent?.preview_hash || preview.preview_hash || '';
  if (!previewHash) throw new Error('preview_import returned no preview_hash');

  const commitRes = await mcpRpc(resolvedEndpoint, rawToken, 'tools/call', {
    name: 'commit_import',
    arguments: { draft_id: draftId, preview_hash: previewHash },
  });
  return {
    hasSchema,
    draftId,
    previewHash,
    importedMediaCount: (preview.media || []).length,
    skippedMediaCount: (preview.skipped_media || []).length,
    commitStatus: commitRes?.structuredContent?.status || '',
  };
}

async function scrollChatBottom(pages) {
  for (const page of Object.values(pages)) {
    await page.evaluate(() => {
      const m = document.getElementById('messages');
      if (m) m.scrollTop = m.scrollHeight;
    }).catch(() => null);
  }
}

export async function s6ChatFirstAiImportMcp(run, ctx) {
  const sc = new Scenario(run, 'S6', 'Chat-first AI import through MCP');
  if (!ctx.ownerSessionToken || !ctx.trip2?.id) {
    sc.blocked = 'S1/S5 did not produce owner session and target vacation for MCP import';
    sc.finishedAt = new Date().toISOString();
    return sc;
  }
  return runScenario(sc, async () => {
    const pair = await openPair(ctx.browser);
    try {
      const pages = pageMap(pair);
      const mobile = pages['iphone-390'];
      const desktop = pages['desktop-1280'];
      const appUrl = `${ctx.base}/vacation-app.html?session=${encodeURIComponent(ctx.ownerSessionToken)}&tripId=${encodeURIComponent(ctx.trip2.id)}`;
      await Promise.all([
        mobile.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
        desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      ]);
      await Promise.all([
        mobile.waitForSelector('#messageText', { timeout: 30000 }),
        desktop.waitForSelector('#messageText', { timeout: 30000 }),
      ]);

      await mobile.fill('#messageText', 'I want to import vacation details from my AI');
      await mobile.click('#sendButton');
      await mobile.waitForSelector('[data-ts-ai-import-card="1"]', { timeout: 45000 });
      await desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await desktop.waitForSelector('[data-ts-ai-import-card="1"]', { timeout: 30000 });

      await sc.expectText(mobile, 'ai-handoff', /AI Import/i, { viewport: '390', selector: '[data-ts-ai-import-card="1"]' });
      await sc.expectCleanCopy(mobile, 'ai-handoff', { viewport: '390', selector: '[data-ts-ai-import-card="1"]', requireVacation: false, requireAi: true, forbidTrip: true });
      await sc.expectCleanCopy(mobile, 'ai-handoff', { viewport: '390', selector: '.chat-pane', requireVacation: true, requireAi: true, forbidTrip: true });
      await sc.expectCleanCopy(desktop, 'ai-handoff', { viewport: '1280', selector: '.chat-pane', requireVacation: true, requireAi: true, forbidTrip: true });
      await scrollChatBottom(pages);
      await sc.shoot('ai-handoff', pages);

      const copyText = await mobile.evaluate(() => {
        const card = document.querySelector('[data-ts-ai-import-card="1"]');
        const tokenId = card?.getAttribute('data-token-id') || '';
        return window.tsVacationAppAiImport?.lookupCopyText(tokenId) || '';
      });
      sc.check('ai-handoff', 'handoff copy payload contains MCP endpoint and Bearer token', /MCP endpoint:/i.test(copyText) && /Authorization:\s*Bearer\s+vkm_/i.test(copyText), copyText ? 'present' : 'missing');

      const staged = await runLiveMcpImport({ base: ctx.base, copyText });
      sc.check('mcp-staged', 'MCP commit_import staged preview with placed and skipped media', staged.commitStatus === 'pending_approval' && staged.importedMediaCount >= 5 && staged.skippedMediaCount >= 2, JSON.stringify({ status: staged.commitStatus, importedMedia: staged.importedMediaCount, skippedMedia: staged.skippedMediaCount }));

      await Promise.all([
        mobile.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
        desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      ]);
      await Promise.all([
        mobile.waitForSelector('[data-ts-ai-approval-card="1"][data-card-status="pending_approval"]', { timeout: 30000 }),
        desktop.waitForSelector('[data-ts-ai-approval-card="1"][data-card-status="pending_approval"]', { timeout: 30000 }),
      ]);
      const cardSel = '[data-ts-ai-approval-card="1"][data-card-status="pending_approval"]';
      const initialPreview = await mobile.evaluate((sel) => {
        const card = document.querySelector(sel);
        return {
          thingThumbs: card ? card.querySelectorAll('[data-ts-media-strip="thing"] [data-ts-preview-thumb="1"]').length : 0,
          dayThumbs: card ? card.querySelectorAll('[data-ts-media-strip="day"] [data-ts-preview-thumb="1"]').length : 0,
          wontThumbs: card ? card.querySelectorAll('[data-ts-mcp-preview-wont-import="1"] [data-ts-preview-thumb="1"]').length : 0,
          text: String(card?.innerText || ''),
        };
      }, cardSel);
      sc.check('preview-card', 'visible text shows preview items, attached Thing/Day media, and Wont be imported list', initialPreview.thingThumbs >= 3 && initialPreview.dayThumbs >= 1 && initialPreview.wontThumbs === 2 && /Won't be imported/i.test(initialPreview.text) && /Carmel Belle/i.test(initialPreview.text), JSON.stringify({ thingThumbs: initialPreview.thingThumbs, dayThumbs: initialPreview.dayThumbs, wontThumbs: initialPreview.wontThumbs }));
      await sc.expectCleanCopy(mobile, 'preview-card', { viewport: '390', selector: cardSel, requireVacation: true, requireAi: true, forbidTrip: true });
      await sc.expectCleanCopy(desktop, 'preview-card', { viewport: '1280', selector: cardSel, requireVacation: true, requireAi: true, forbidTrip: true });
      await scrollChatBottom(pages);
      await sc.shoot('preview-card', pages);

      await mobile.fill('#messageText', 'move the bookshop to Day 2');
      await mobile.click('#sendButton');
      await mobile.waitForSelector('[data-ts-ai-approval-card="1"][data-preview-version="2"][data-card-status="pending_approval"]', { timeout: 45000 });
      await desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await desktop.waitForSelector('[data-ts-ai-approval-card="1"][data-preview-version="2"]', { timeout: 30000 });

      const v2Text = await visibleText(mobile, '[data-ts-ai-approval-card="1"][data-preview-version="2"]');
      sc.check('chat-change-request', 'visible text shows chat change request moved Pilgrim Way Bookshop to Day 2', /Pilgrim Way Bookshop/i.test(v2Text) && /Updated in this preview/i.test(v2Text), v2Text.slice(0, 260));
      await scrollChatBottom(pages);
      await sc.shoot('chat-change-request', pages);

      await mobile.fill('#messageText', 'the seashell photo was dinner on day 2');
      await mobile.click('#sendButton');
      await mobile.waitForSelector('[data-ts-ai-approval-card="1"][data-preview-version="3"][data-card-status="pending_approval"]', { timeout: 45000 });
      await desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await desktop.waitForSelector('[data-ts-ai-approval-card="1"][data-preview-version="3"]', { timeout: 30000 });

      const v3Sel = '[data-ts-ai-approval-card="1"][data-preview-version="3"]';
      const v3State = await mobile.evaluate((sel) => {
        const card = document.querySelector(sel);
        return {
          wontThumbs: card ? card.querySelectorAll('[data-ts-mcp-preview-wont-import="1"] [data-ts-preview-thumb="1"]').length : 0,
          dayThumbs: card ? card.querySelectorAll('[data-ts-media-strip="day"] [data-ts-preview-thumb="1"]').length : 0,
        };
      }, v3Sel);
      sc.check('chat-rescue', 'chat rescue moved seashell photo out of Wont be imported onto Day 2', v3State.wontThumbs === 1 && v3State.dayThumbs >= 2, JSON.stringify(v3State));
      await sc.expectCleanCopy(mobile, 'chat-rescue', { viewport: '390', selector: v3Sel, requireVacation: true, requireAi: true, forbidTrip: true });
      await scrollChatBottom(pages);
      await sc.shoot('chat-rescue', pages);

      await mobile.click(`${v3Sel} [data-ai-chat-approve]`);
      await mobile.waitForSelector('[data-ai-approval-state="approved"]', { timeout: 45000 });
      await desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await desktop.waitForSelector('[data-ai-approval-state="approved"]', { timeout: 30000 });
      await sc.expectText(mobile, 'approved-live', /Approved and live on your vacation/i, { viewport: '390' });
      await sc.expectText(desktop, 'approved-live', /Approved and live on your vacation/i, { viewport: '1280' });
      await sc.expectCleanCopy(mobile, 'approved-live', { viewport: '390', selector: '.chat-pane', requireVacation: true, requireAi: true, forbidTrip: true });
      await scrollChatBottom(pages);
      await sc.shoot('approved-live', pages);

      const sharedRes = await fetch(`${ctx.base}/api/shared/${encodeURIComponent(ctx.trip2.shareToken)}/`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      const shared = await sharedRes.json().catch(() => ({}));
      const names = (shared.places || []).map((p) => String(p.name || p.title || ''));
      const boundCount = (shared.places || []).reduce((acc, p) => acc + (Array.isArray(p.bound_media) ? p.bound_media.length : 0), 0)
        + (Array.isArray(shared.media) ? shared.media.length : 0);
      sc.check('approved-live', 'live shared vacation contains imported Things and attached media', names.includes('Carmel Belle') && names.includes('Point Lobos') && names.includes('Pilgrim Way Bookshop') && boundCount >= 1, JSON.stringify({ places: names, boundCount }));
      ctx.s6Approved = true;
      sc.meta = { draftId: staged.draftId, places: names, boundCount };
    } finally {
      await closePair(pair);
    }
  });
}

export async function s7ShareLinkView(run, ctx) {
  const sc = new Scenario(run, 'S7', 'Share link view');
  const shareToken = ctx.trip2?.shareToken || ctx.trip1?.shareToken || '';
  if (!shareToken) {
    sc.blocked = 'no throwaway vacation share link available from earlier scenarios';
    sc.finishedAt = new Date().toISOString();
    return sc;
  }
  return runScenario(sc, async () => {
    const pair = await openPair(ctx.browser);
    try {
      const pages = pageMap(pair);
      const mobile = pages['iphone-390'];
      const desktop = pages['desktop-1280'];
      const shareUrl = `${ctx.base}/shared/${encodeURIComponent(shareToken)}/`;
      await Promise.all([
        mobile.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
        desktop.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      ]);
      await Promise.all([
        mobile.waitForFunction(() => /Carmel|Monterey/i.test(document.body?.innerText || ''), null, { timeout: 45000 }),
        desktop.waitForFunction(() => /Carmel|Monterey/i.test(document.body?.innerText || ''), null, { timeout: 45000 }),
      ]);
      await mobile.waitForTimeout(800);
      await desktop.waitForTimeout(800);

      const expectedTitle = ctx.trip2?.shareToken === shareToken ? /Carmel Weekend|Carmel Belle|Point Lobos/i : /Monterey/i;
      await sc.expectText(mobile, 'share-view', expectedTitle, { viewport: '390' });
      await sc.expectText(desktop, 'share-view', expectedTitle, { viewport: '1280' });
      await sc.expectCleanCopy(mobile, 'share-view', { viewport: '390', requireVacation: false, forbidTrip: true });
      await sc.expectCleanCopy(desktop, 'share-view', { viewport: '1280', requireVacation: false, forbidTrip: true });

      const editRes = await fetch(`${ctx.base}/api/shared/${encodeURIComponent(shareToken)}/edit-access`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      const editAccess = await editRes.json().catch(() => ({}));
      sc.check('share-view', 'anonymous viewer does not receive edit access', editAccess?.canEdit === false, JSON.stringify(editAccess));
      await sc.shoot('share-view', pages);
      sc.meta = { shareToken, canEdit: editAccess?.canEdit };
    } finally {
      await closePair(pair);
    }
  });
}

export async function s8PdfKeepsake(run, ctx) {
  const sc = new Scenario(run, 'S8', 'PDF / keepsake generation');
  const shareToken = ctx.trip2?.shareToken || ctx.trip1?.shareToken || '';
  if (!shareToken) {
    sc.blocked = 'no throwaway vacation share link available from earlier scenarios';
    sc.finishedAt = new Date().toISOString();
    return sc;
  }
  return runScenario(sc, async () => {
    const pair = await openPair(ctx.browser);
    try {
      const pages = pageMap(pair);
      const mobile = pages['iphone-390'];
      const desktop = pages['desktop-1280'];
      const shareUrl = `${ctx.base}/shared/${encodeURIComponent(shareToken)}/`;
      await Promise.all([
        mobile.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
        desktop.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      ]);
      await Promise.all([
        mobile.waitForFunction(() => /Carmel|Monterey/i.test(document.body?.innerText || ''), null, { timeout: 45000 }),
        desktop.waitForFunction(() => /Carmel|Monterey/i.test(document.body?.innerText || ''), null, { timeout: 45000 }),
      ]);
      await mobile.waitForTimeout(1000);

      const hasPdfButton = (await desktop.locator('[aria-label="PDFs"]').count()) > 0
        || (await mobile.locator('[aria-label="PDFs"]').count()) > 0;
      if (!hasPdfButton) {
        sc.skipped = true;
        sc.meta = { exposed: false, reason: 'PDF / keepsake control is not exposed on the shared vacation view' };
        sc.notes.push('PDF/keepsake control not exposed; skipped per S8 spec');
        return;
      }

      const menuPage = (await desktop.locator('[aria-label="PDFs"]').count()) > 0 ? desktop : mobile;
      await menuPage.click('[aria-label="PDFs"]');
      await menuPage.waitForFunction(() => /Style one|Style two|Keepsake|Complete/i.test(document.body?.innerText || ''), null, { timeout: 15000 });
      await sc.expectText(menuPage, 'pdf-menu', /Style one|Style two|Keepsake/i);
      await sc.shoot('pdf-menu', pages);

      const journeyUrl = `${ctx.base}/shared/${encodeURIComponent(shareToken)}/journey?style=1&printMode=report&pdfReport=keepsake`;
      await Promise.all([
        mobile.goto(journeyUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
        desktop.goto(journeyUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      ]);
      await Promise.all([
        mobile.waitForFunction(() => Boolean(document.querySelector('[data-ae-print="1"], [data-print-ready]')) || /Carmel|Monterey/i.test(document.body?.innerText || ''), null, { timeout: 45000 }),
        desktop.waitForFunction(() => Boolean(document.querySelector('[data-ae-print="1"], [data-print-ready]')) || /Carmel|Monterey/i.test(document.body?.innerText || ''), null, { timeout: 45000 }),
      ]);
      await mobile.waitForTimeout(800);
      await desktop.waitForTimeout(800);
      await sc.expectText(mobile, 'keepsake-view', /Carmel Weekend|Monterey/i, { viewport: '390' });
      await sc.expectText(desktop, 'keepsake-view', /Carmel Weekend|Monterey/i, { viewport: '1280' });
      await sc.expectCleanCopy(mobile, 'keepsake-view', { viewport: '390', requireVacation: true, forbidTrip: false });
      await sc.expectCleanCopy(desktop, 'keepsake-view', { viewport: '1280', requireVacation: true, forbidTrip: false });
      await sc.shoot('keepsake-view', pages);

      const pdfRes = await fetch(`${ctx.base}/api/pdf/shared/${encodeURIComponent(shareToken)}/report/complete-list.pdf`, {
        headers: { accept: 'application/pdf' },
        signal: AbortSignal.timeout(45000),
      });
      const bytes = Buffer.from(await pdfRes.arrayBuffer());
      const isPdf = pdfRes.status === 200 && bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 500;
      sc.check('pdf-produced', 'keepsake PDF endpoint returns valid %PDF document', isPdf, `http ${pdfRes.status}, bytes=${bytes.length}`);
      sc.meta = { exposed: true, produced: isPdf, pdfBytes: bytes.length };
    } finally {
      await closePair(pair);
    }
  });
}

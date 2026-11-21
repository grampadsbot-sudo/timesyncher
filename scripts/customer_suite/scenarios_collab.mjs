import { VIEWPORTS, assertSafeThrowaway, registerSecret } from './config.mjs';
import { Scenario, newViewportPage, runScenario, visibleText } from './harness.mjs';

function intakeShareSlug(tripId) {
  const hex = String(tripId || '').replace(/-/g, '').toLowerCase().slice(0, 12);
  if (!/^[0-9a-f]{12}$/.test(hex)) return '';
  return `intake-${hex}`;
}

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

export async function s4CollaboratorInvite(run, ctx) {
  const sc = new Scenario(run, 'S4', 'Collaborator invite');
  if (!ctx.ownerSessionToken || !ctx.trip1?.id) {
    sc.blocked = 'S1/S2 did not produce an owner session and vacation';
    sc.finishedAt = new Date().toISOString();
    return sc;
  }
  return runScenario(sc, async () => {
    const collabEmail = `vksuite+${run.id.toLowerCase()}+collab@example.test`;
    const collabName = 'Morgan Reed';
    assertSafeThrowaway({ email: collabEmail, displayName: collabName });
    ctx.emails.push(collabEmail);

    const inviteRes = await fetch(
      `${ctx.base}/api/vacation-itinerary?app=1&session=${encodeURIComponent(ctx.ownerSessionToken)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          action: 'collaborator-invite',
          tripId: ctx.trip1.id,
          name: collabName,
          email: collabEmail,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const inviteBody = await inviteRes.json().catch(() => ({}));
    const inviteId = inviteBody?.inviteResult?.inviteId || inviteBody?.seats?.[0]?.inviteId || '';
    sc.check('invite-sent', 'owner invited second throwaway collaborator', inviteRes.ok && Boolean(inviteId), inviteId ? 'invite-created' : JSON.stringify(inviteBody).slice(0, 180));
    if (!inviteId) return;

    const acceptUrl = `${ctx.base}/accept/vacation-collaborator-${encodeURIComponent(inviteId)}`;
    const pair = await openPair(ctx.browser);
    try {
      const pages = pageMap(pair);
      const mobile = pages['iphone-390'];
      const desktop = pages['desktop-1280'];
      await Promise.all([
        mobile.goto(acceptUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
        desktop.goto(acceptUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      ]);
      await Promise.all([
        mobile.waitForSelector('#form, #messageText', { timeout: 30000 }),
        desktop.waitForSelector('#form, #messageText', { timeout: 30000 }),
      ]);
      await sc.expectText(mobile, 'collab-accept', /Review & continue|Vacay Keepsake/i, { viewport: '390' });
      await sc.expectCleanCopy(mobile, 'collab-accept', { viewport: '390', selector: '#form', requireVacation: false, forbidTrip: true });
      await sc.expectCleanCopy(mobile, 'collab-accept', { viewport: '390', selector: 'body', requireVacation: true, forbidTrip: false });
      await sc.expectCleanCopy(desktop, 'collab-accept', { viewport: '1280', selector: '#form', requireVacation: false, forbidTrip: true });
      await sc.shoot('collab-accept', pages);

      if (await mobile.locator('#form').count()) {
        const dialogMessages = [];
        mobile.on('dialog', async (dialog) => {
          dialogMessages.push(dialog.message());
          await dialog.dismiss().catch(() => null);
        });
        await mobile.fill('#name', collabName);
        await mobile.check('#agree');
        const btn = mobile.locator('#form button.btn');
        await btn.scrollIntoViewIfNeeded();
        const acceptRespPromise = mobile.waitForResponse(
          (res) => res.url().includes('/api/eula') && res.request().method() === 'POST',
          { timeout: 30000 },
        );
        await btn.click({ force: true });
        const acceptResp = await acceptRespPromise;
        const acceptJson = await acceptResp.json().catch(() => ({}));
        sc.check('collab-accept', 'collaborator terms accept POST returned 201', acceptResp.status() === 201 && acceptJson.ok !== false, `http ${acceptResp.status()} ${acceptJson.error || dialogMessages.join('; ') || 'ok'}`);
        if (acceptJson.redirectUrl) {
          await mobile.waitForURL(/\/vacation-app\.html/, { timeout: 30000 }).catch(async () => {
            await mobile.goto(acceptJson.redirectUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          });
        } else {
          await mobile.waitForURL(/\/vacation-app\.html/, { timeout: 30000 });
        }
      }
      await mobile.waitForSelector('#messageText', { timeout: 35000 });
      const collabToken = new URL(mobile.url()).searchParams.get('session') || '';
      registerSecret(collabToken);
      sc.check('collab-joined', 'collaborator landed in signed-in vacation app', collabToken.length >= 10, collabToken ? 'session-active' : 'missing');

      const collabAppUrl = `${ctx.base}/vacation-app.html?session=${encodeURIComponent(collabToken)}`;
      await desktop.goto(collabAppUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await desktop.waitForSelector('#messageText', { timeout: 35000 });
      await sc.expectCleanCopy(mobile, 'collab-joined', { viewport: '390', selector: '.chat-pane', requireVacation: true, forbidTrip: true });
      await sc.expectCleanCopy(desktop, 'collab-joined', { viewport: '1280', selector: '.chat-pane', requireVacation: true, forbidTrip: true });
      await sc.shoot('collab-joined', pages);

      const beforeCount = await mobile.locator('#messages .bubble').count();
      const editMsg = 'Please note that we prefer ocean-view rooms and a relaxed morning pace for this vacation.';
      await mobile.fill('#messageText', editMsg);
      await mobile.click('#sendButton');
      await mobile.waitForFunction(
        (prev) => {
          const typing = document.getElementById('tsTyping');
          const status = document.getElementById('composerStatus');
          const hasErr = Boolean(status && !status.hidden && String(status.textContent || '').trim());
          const bubbles = document.querySelectorAll('#messages .bubble');
          return !typing && (hasErr || bubbles.length >= prev + 2);
        },
        beforeCount,
        { timeout: 90000 },
      );
      const statusText = await mobile.evaluate(() => {
        const el = document.getElementById('composerStatus');
        return el && !el.hidden ? String(el.textContent || '').trim() : '';
      });
      sc.check('collab-edit', 'collaborator edit turn succeeded without error', statusText === '', statusText || 'ok');

      await desktop.goto(collabAppUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await desktop.waitForSelector('#messages .bubble', { timeout: 30000 });
      const persisted = await visibleText(desktop, '#messages');
      sc.check('collab-edit', 'visible text shows collaborator edit persisted across reload', /ocean-view|relaxed morning/i.test(persisted), persisted.slice(-260));
      await sc.expectCleanCopy(mobile, 'collab-edit', { viewport: '390', selector: '.chat-pane', requireVacation: true, forbidTrip: true });
      await sc.expectCleanCopy(desktop, 'collab-edit', { viewport: '1280', selector: '.chat-pane', requireVacation: true, forbidTrip: true });
      await sc.shoot('collab-edit', pages);
      sc.meta = { inviteId, collaboratorEdited: true };
    } finally {
      await closePair(pair);
    }
  });
}

async function ensureSecondVacation(ctx) {
  if (ctx.trip2?.id) return ctx.trip2;
  const ownerRows = await ctx.db`select id::text as id from customers where lower(email) = ${ctx.ownerEmail.toLowerCase()} limit 1`;
  const ownerId = ownerRows[0]?.id;
  if (!ownerId) throw new Error('owner customer row missing for S5 second vacation');
  const title = 'Carmel Weekend';
  const destination = 'Carmel-by-the-Sea, CA';
  assertSafeThrowaway({ title, destination, email: ctx.ownerEmail });
  const inserted = await ctx.db`
    insert into trips (customer_id, title, destination, start_date, end_date, status, metadata)
    values (
      ${ownerId}, ${title}, ${destination}, '2026-07-03'::date, '2026-07-05'::date, 'planning',
      ${{ harnessTag: ctx.tag, source: 'vk_customer_suite_s5', timezone: 'America/Los_Angeles', intakeShare: true }}
    )
    returning id::text as id
  `;
  const tripId = inserted[0].id;
  const shareToken = intakeShareSlug(tripId);
  const publicUrl = `${ctx.base}/shared/${encodeURIComponent(shareToken)}/`;
  await ctx.db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) || ${{
      publicSlug: shareToken,
      shareToken,
      sharedToken: shareToken,
      publicUrl,
      intakeShare: true,
      shortName: 'Carmel July 2026',
    }},
      updated_at = now()
    where id = ${tripId}
  `;
  ctx.trip2 = { id: tripId, title, destination, shareToken, publicUrl };
  return ctx.trip2;
}

export async function s5VacationSwitcher(run, ctx) {
  const sc = new Scenario(run, 'S5', 'Vacation switcher');
  if (!ctx.ownerSessionToken || !ctx.trip1?.id) {
    sc.blocked = 'S1/S2 did not produce an owner session and first vacation';
    sc.finishedAt = new Date().toISOString();
    return sc;
  }
  return runScenario(sc, async () => {
    const trip2 = await ensureSecondVacation(ctx);
    const pair = await openPair(ctx.browser);
    try {
      const pages = pageMap(pair);
      const mobile = pages['iphone-390'];
      const desktop = pages['desktop-1280'];
      const startUrl = `${ctx.base}/vacation-app.html?session=${encodeURIComponent(ctx.ownerSessionToken)}&tripId=${encodeURIComponent(ctx.trip1.id)}`;
      await Promise.all([
        mobile.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
        desktop.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      ]);
      await Promise.all([
        mobile.waitForSelector('#tripButton', { timeout: 30000 }),
        desktop.waitForSelector('#tripButton', { timeout: 30000 }),
      ]);

      await Promise.all([mobile.click('#tripButton'), desktop.click('#tripButton')]);
      await Promise.all([
        mobile.waitForFunction(() => document.querySelector('#vacationDropdown')?.classList.contains('open'), null, { timeout: 10000 }),
        desktop.waitForFunction(() => document.querySelector('#vacationDropdown')?.classList.contains('open'), null, { timeout: 10000 }),
      ]);
      await sc.expectText(mobile, 'switcher-open', /Carmel Weekend/i, { viewport: '390', selector: '#vacationDropdown' });
      await sc.expectText(desktop, 'switcher-open', /Carmel Weekend/i, { viewport: '1280', selector: '#vacationDropdown' });
      await sc.expectCleanCopy(mobile, 'switcher-open', { viewport: '390', selector: '#appHeader', requireVacation: false, forbidTrip: true });
      await sc.shoot('switcher-open', pages);

      await Promise.all([
        mobile.click(`.trip-option[data-trip-id="${trip2.id}"]`),
        desktop.click(`.trip-option[data-trip-id="${trip2.id}"]`),
      ]);
      await Promise.all([
        mobile.waitForFunction(
          (slug) => {
            const label = document.querySelector('#tripButton .trip-trigger-title')?.textContent || '';
            const frame = document.querySelector('.site-pane iframe');
            return /Carmel/i.test(label) && (!frame || String(frame.getAttribute('src') || '').includes(slug));
          },
          trip2.shareToken,
          { timeout: 30000 },
        ),
        desktop.waitForFunction(
          (slug) => {
            const label = document.querySelector('#tripButton .trip-trigger-title')?.textContent || '';
            const frame = document.querySelector('.site-pane iframe');
            return /Carmel/i.test(label) && (!frame || String(frame.getAttribute('src') || '').includes(slug));
          },
          trip2.shareToken,
          { timeout: 30000 },
        ),
      ]);
      await sc.expectText(mobile, 'switcher-landed', /Carmel/i, { viewport: '390', selector: '#tripButton' });
      await sc.expectText(desktop, 'switcher-landed', /Carmel/i, { viewport: '1280', selector: '#tripButton' });
      await sc.expectCleanCopy(mobile, 'switcher-landed', { viewport: '390', selector: '.chat-pane', requireVacation: true, forbidTrip: true });
      await sc.expectCleanCopy(desktop, 'switcher-landed', { viewport: '1280', selector: '.chat-pane', requireVacation: true, forbidTrip: true });
      await sc.shoot('switcher-landed', pages);
      sc.meta = { fromTripId: ctx.trip1.id, toTripId: trip2.id, toShareToken: trip2.shareToken };
    } finally {
      await closePair(pair);
    }
  });
}

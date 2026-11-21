import { VIEWPORTS, assertSafeThrowaway, registerSecret } from './config.mjs';
import { createThrowawayCoupon } from './cleanup.mjs';
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

async function completeWebsiteCouponSignup({ sc, pages, base, contact, couponCode, checkHomepageCopy = false }) {
  const mobile = pages['iphone-390'];
  const desktop = pages['desktop-1280'];
  await Promise.all([
    mobile.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 45000 }),
    desktop.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 45000 }),
  ]);
  await Promise.all([
    mobile.waitForSelector('#orderForm', { timeout: 25000 }),
    desktop.waitForSelector('#orderForm', { timeout: 25000 }),
  ]);
  if (checkHomepageCopy) {
    await sc.expectText(mobile, 'website-step1', /Start your Vacay Keepsake/i, { viewport: '390' });
    await sc.expectText(mobile, 'website-step1', /AI vacation assistant/i, { viewport: '390' });
    await sc.expectCleanCopy(mobile, 'website-step1', { viewport: '390', selector: '.checkout-panel', requireVacation: true, forbidTrip: true });
    await sc.expectCleanCopy(desktop, 'website-step1', { viewport: '1280', selector: '.checkout-panel', requireVacation: true, forbidTrip: true });
    await sc.expectCleanCopy(mobile, 'website-step1', { viewport: '390', selector: '.hero-copy', requireVacation: true, requireAi: true, forbidTrip: true });
  }
  for (const page of [mobile, desktop]) {
    await page.fill('input[name="firstName"]', contact.firstName);
    await page.fill('input[name="lastName"]', contact.lastName);
    await page.fill('input[name="email"]', contact.email);
  }
  await sc.shoot('website-step1', pages);

  for (const page of [mobile, desktop]) {
    await page.click('#continueBtn');
    await page.waitForSelector('#step2:not(.hidden)', { timeout: 25000 });
    await page.fill('#couponCode', couponCode);
    await page.waitForSelector('#couponPayBtn:not([hidden])', { timeout: 25000 });
  }
  await sc.expectText(mobile, 'website-step2', /Redeem coupon/i, { viewport: '390', selector: '#step2' });
  await sc.expectCleanCopy(mobile, 'website-step2', { viewport: '390', selector: '.checkout-panel', requireVacation: true, forbidTrip: true });
  await sc.shoot('website-step2', pages);

  await Promise.all([
    mobile.waitForURL(/\/order-success\.html/, { timeout: 45000 }),
    mobile.click('#couponPayBtn'),
  ]);
  await mobile.waitForFunction(() => Boolean(new URL(location.href).searchParams.get('session')), null, { timeout: 25000 });
  const sessionToken = new URL(mobile.url()).searchParams.get('session') || '';
  registerSecret(sessionToken);
  sc.check('order-success', 'order-success redirect carries real session token', sessionToken.length >= 16, sessionToken ? 'present' : 'missing');

  const successUrl = `${base}/order-success.html?session=${encodeURIComponent(sessionToken)}`;
  await desktop.goto(successUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await Promise.all([
    mobile.waitForSelector('#purchaseLink:not(.hidden), #openApp:not(.hidden)', { timeout: 25000 }),
    desktop.waitForSelector('#purchaseLink:not(.hidden), #openApp:not(.hidden)', { timeout: 25000 }),
  ]);
  await sc.expectText(mobile, 'order-success', /Purchase confirmed/i, { viewport: '390' });
  await sc.expectCleanCopy(mobile, 'order-success', { viewport: '390', requireVacation: true, forbidTrip: true });
  await sc.expectCleanCopy(desktop, 'order-success', { viewport: '1280', requireVacation: true, forbidTrip: true });
  await sc.shoot('order-success', pages);

  await Promise.all([
    mobile.waitForURL(/\/vacation-app\.html/, { timeout: 45000 }),
    mobile.click('#purchaseLink:not(.hidden), #openApp:not(.hidden)'),
  ]);
  await mobile.waitForSelector('#eulaScreen, #messageText', { timeout: 30000 });
  const appUrl = `${base}/vacation-app.html?session=${encodeURIComponent(sessionToken)}`;
  await desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await desktop.waitForSelector('#eulaScreen, #messageText', { timeout: 30000 });

  if (await mobile.locator('#eulaScreen').count()) {
    await sc.expectText(mobile, 'terms-gate', /Review Terms & Privacy/i, { viewport: '390' });
    await sc.expectCleanCopy(mobile, 'terms-gate', { viewport: '390', selector: '#eulaForm', requireVacation: false, forbidTrip: true });
    await sc.expectCleanCopy(mobile, 'terms-gate', { viewport: '390', selector: '#eulaScreen', requireVacation: true, forbidTrip: false });
    await sc.shoot('terms-gate', pages);
    await mobile.fill('#eulaName', contact.displayName);
    await mobile.check('#eulaAgree');
    await mobile.click('#eulaAgreeButton');
    await mobile.waitForSelector('#messageText', { timeout: 35000 });
    await desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await desktop.waitForSelector('#messageText', { timeout: 35000 });
  }

  await Promise.all([
    mobile.waitForSelector('#messages .bubble', { timeout: 30000 }),
    desktop.waitForSelector('#messages .bubble', { timeout: 30000 }),
  ]);
  await sc.expectText(mobile, 'signed-in-app', /vacation/i, { viewport: '390' });
  await sc.expectText(desktop, 'signed-in-app', /vacation/i, { viewport: '1280' });
  await sc.expectCleanCopy(mobile, 'signed-in-app', { viewport: '390', requireVacation: true, forbidTrip: true });
  await sc.expectCleanCopy(desktop, 'signed-in-app', { viewport: '1280', requireVacation: true, forbidTrip: true });
  await sc.shoot('signed-in-app', pages);
  return sessionToken;
}

export async function s1Signup(run, ctx) {
  const sc = new Scenario(run, 'S1', 'Sign up');
  return runScenario(sc, async () => {
    const email = `vksuite+${run.id.toLowerCase()}+owner@example.test`;
    const contact = { firstName: 'Avery', lastName: 'Hale', displayName: 'Avery Hale', email };
    assertSafeThrowaway(contact);
    ctx.emails.push(email);
    const coupon = await createThrowawayCoupon(ctx.base, ctx.adminToken, {
      tag: ctx.tag,
      plan: 'unlimited',
      label: `VK Suite S1 ${run.id}`,
    });
    ctx.couponIds.push(coupon.id);
    const pair = await openPair(ctx.browser);
    try {
      const pages = pageMap(pair);
      const token = await completeWebsiteCouponSignup({
        sc,
        pages,
        base: ctx.base,
        contact,
        couponCode: coupon.code,
        checkHomepageCopy: false,
      });
      ctx.ownerSessionToken = token;
      ctx.ownerEmail = email;
      ctx.ownerName = contact.displayName;
      sc.meta = { ownerEmailDomain: 'example.test', reachedSignedInApp: Boolean(token) };
    } finally {
      await closePair(pair);
    }
  });
}

export async function s2VacationByChat(run, ctx) {
  const sc = new Scenario(run, 'S2', 'Create a vacation by chat');
  if (!ctx.ownerSessionToken) {
    sc.blocked = 'S1 did not produce a signed-in owner session';
    sc.finishedAt = new Date().toISOString();
    return sc;
  }
  return runScenario(sc, async () => {
    const pair = await openPair(ctx.browser);
    try {
      const pages = pageMap(pair);
      const mobile = pages['iphone-390'];
      const desktop = pages['desktop-1280'];
      const appUrl = `${ctx.base}/vacation-app.html?session=${encodeURIComponent(ctx.ownerSessionToken)}`;
      await Promise.all([
        mobile.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
        desktop.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      ]);
      await Promise.all([
        mobile.waitForSelector('#messageText', { timeout: 30000 }),
        desktop.waitForSelector('#messageText', { timeout: 30000 }),
      ]);
      const beforeCount = await mobile.locator('#messages .bubble').count();
      const prompt = 'Let us plan our Monterey Summer Escape vacation to Monterey, California from 2026-07-03 to 2026-07-05 for Avery Hale and Morgan Reed.';
      await mobile.fill('#messageText', prompt);
      await mobile.click('#sendButton');
      await mobile.waitForFunction(
        (prev) => {
          const typing = document.getElementById('tsTyping');
          const status = document.getElementById('composerStatus');
          const hasErr = Boolean(status && !status.hidden && String(status.textContent || '').trim());
          const bubbles = document.querySelectorAll('#messages .bubble');
          return !typing && (hasErr || bubbles.length >= prev + 2 || Boolean(document.querySelector('.site-pane iframe')));
        },
        beforeCount,
        { timeout: 90000 },
      );

      const statusText = await mobile.evaluate(() => {
        const el = document.getElementById('composerStatus');
        return el && !el.hidden ? String(el.textContent || '').trim() : '';
      });
      sc.check('chat-create', 'no composer error banner', statusText === '', statusText || 'none');

      const appRes = await fetch(`${ctx.base}/api/vacation-itinerary?app=1&session=${encodeURIComponent(ctx.ownerSessionToken)}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      const appData = await appRes.json().catch(() => ({}));
      const createdTrip = appData.trip || (appData.vacations || []).find((v) => v?.id && v?.destination) || (appData.vacations || [])[0] || null;
      sc.check('chat-create', 'vacation created through chat has id and destination', Boolean(createdTrip?.id && (createdTrip.destination || createdTrip.title)), createdTrip ? `${createdTrip.title || ''} (${createdTrip.destination || ''})` : 'missing');
      if (createdTrip?.id) {
        assertSafeThrowaway({
          tripId: createdTrip.id,
          title: createdTrip.title,
          destination: createdTrip.destination,
          shareToken: createdTrip.shareToken,
        });
        ctx.trip1 = {
          id: createdTrip.id,
          title: createdTrip.title || 'Monterey',
          destination: createdTrip.destination || 'Monterey, California',
          shareToken: createdTrip.shareToken || '',
          publicUrl: createdTrip.publicUrl || '',
        };
      }

      const syncedUrl = createdTrip?.id
        ? `${ctx.base}/vacation-app.html?session=${encodeURIComponent(ctx.ownerSessionToken)}&tripId=${encodeURIComponent(createdTrip.id)}`
        : appUrl;
      await Promise.all([
        mobile.goto(syncedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
        desktop.goto(syncedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }),
      ]);
      await Promise.all([
        mobile.waitForSelector('#messages .bubble', { timeout: 30000 }),
        desktop.waitForSelector('#messages .bubble', { timeout: 30000 }),
      ]);
      const chatBody = await visibleText(mobile, '#messages');
      sc.check('chat-create', 'visible text mentions Monterey', /Monterey/i.test(chatBody), chatBody.slice(-260));
      await sc.expectCleanCopy(mobile, 'chat-create', { viewport: '390', selector: '.chat-pane', requireVacation: true, forbidTrip: true });
      await sc.expectCleanCopy(desktop, 'chat-create', { viewport: '1280', selector: '.chat-pane', requireVacation: true, forbidTrip: true });
      await sc.shoot('chat-create', pages);
      sc.meta = { tripId: ctx.trip1?.id || null, shareToken: ctx.trip1?.shareToken || null };
    } finally {
      await closePair(pair);
    }
  });
}

export async function s3WebsiteFlow(run, ctx) {
  const sc = new Scenario(run, 'S3', 'Website flow');
  return runScenario(sc, async () => {
    const cfgRes = await fetch(`${ctx.base}/api/checkout-config`, { signal: AbortSignal.timeout(20000) });
    const cfg = await cfgRes.json().catch(() => ({}));
    const pk = String(cfg?.publishableKey || '');
    sc.check('stripe-safety', 'no Stripe live publishable key exposed', !pk.startsWith('pk_live_'), pk ? pk.slice(0, 10) : 'test-or-disabled');

    const email = `vksuite+${run.id.toLowerCase()}+web@example.test`;
    const contact = { firstName: 'Quinn', lastName: 'Brooks', displayName: 'Quinn Brooks', email };
    assertSafeThrowaway(contact);
    ctx.emails.push(email);
    const coupon = await createThrowawayCoupon(ctx.base, ctx.adminToken, {
      tag: ctx.tag,
      plan: 'single',
      label: `VK Suite S3 ${run.id}`,
    });
    ctx.couponIds.push(coupon.id);
    const pair = await openPair(ctx.browser);
    try {
      const pages = pageMap(pair);
      const token = await completeWebsiteCouponSignup({
        sc,
        pages,
        base: ctx.base,
        contact,
        couponCode: coupon.code,
        checkHomepageCopy: true,
      });
      sc.meta = { websiteEmailDomain: 'example.test', reachedWorkspace: Boolean(token), stripeLiveBlocked: !pk.startsWith('pk_live_') };
    } finally {
      await closePair(pair);
    }
  });
}

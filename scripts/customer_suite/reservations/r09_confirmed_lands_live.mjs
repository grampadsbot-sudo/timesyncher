import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r09');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8');
  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');
  const token = extractBearerFromCopyText(setup.json.reservationCard.copyText);
  await ctx.mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'polling', poll_interval_minutes: 5 } }, token);

  const ask = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8 at 8:00 PM on 2026-07-08');
  const reqId = ask.json.reservationCard.requestId;

  const submitted = await ctx.mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: {
      request_id: reqId,
      status: 'confirmed',
      date: '2026-07-08',
      time: '8:00 PM',
      party_size: 8,
      confirmation_number: 'CARB-8842',
      notes: 'Main dining room booth',
    },
  }, token);
  assert.equal(submitted.status, 200);
  assert.equal(submitted.json.result.structuredContent.status, 'booked');
  assert.equal(submitted.json.result.structuredContent.published, true);
  assert.equal(submitted.json.result.structuredContent.booked_by_label, 'Booked by your AI');

  const shared = await ctx.apiCall(`/api/shared/${encodeURIComponent(ctx.vacation1.shareToken)}/`);
  assert.equal(shared.status, 200);
  const carbone = (shared.json.places || []).find((p) => /Carbone/i.test(p.name));
  assert.ok(carbone, 'matching Thing must exist in shared payload');
  assert.equal(carbone.booked_by_ai, true);
  assert.equal(carbone.confirmation_number, 'CARB-8842');

  const loaded = await ctx.chatLoad(ctx.owner.appSession, ctx.vacation1.id);
  assert.ok((loaded.json.turns || []).some((t) => t.payload?.reservationCard?.status === 'booked' && /CARB-8842/.test(t.body)));

  const chatUrl = ctx.live
    ? `${ctx.origin}/vacation-app.html?session=${encodeURIComponent(ctx.owner.appSession)}&tripId=${encodeURIComponent(ctx.vacation1.id)}`
    : `${ctx.origin}/chat-view?session=${encodeURIComponent(ctx.owner.appSession)}&tripId=${encodeURIComponent(ctx.vacation1.id)}`;
  const chatShots = await ctx.captureViewports('r09-chat-booked', {
    url: chatUrl,
    prepare: async (page) => {
      await page.waitForSelector('[data-ai-reservation-status="booked"]', { timeout: 15000 });
    },
  });

  const sharedUrl = `${ctx.origin}/shared/${encodeURIComponent(ctx.vacation1.shareToken)}/`;
  const thingShots = await ctx.captureViewports('r09-thing-booked', {
    url: sharedUrl,
    webToken: ctx.owner.webToken,
    prepare: async (page) => {
      await page.waitForFunction(() => document.body.innerText.includes('Carbone'), { timeout: 20000 });
      await page.evaluate(() => {
        const candidates = [...document.querySelectorAll('button, [role="button"], [data-list-row]')];
        const hit = candidates.find((el) => /Carbone/i.test(el.textContent || ''));
        if (hit) hit.click();
      });
      await page.waitForSelector('[data-ts-booked-by-ai="1"]', { timeout: 15000 });
      const bannerText = await page.$eval('[data-ts-booked-by-ai="1"]', (el) => el.textContent || '');
      assert.match(bannerText, /Booked by your AI/i);
      assert.match(bannerText, /CARB-8842/);
      assert.match(bannerText, /8:00 PM/);
    },
  });
  assert.equal(chatShots.length, 2);
  assert.equal(thingShots.length, 2);
  console.log('r09_confirmed_lands_live passed', [...chatShots, ...thingShots].map((s) => s.path).join(', '));
} finally {
  await ctx.cleanup();
}

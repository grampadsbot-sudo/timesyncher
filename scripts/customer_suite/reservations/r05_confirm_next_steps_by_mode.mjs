import assert from 'node:assert/strict';
import { createReservationsSuiteContext } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r05');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8 on Wednesday');
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');

  const resA = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, JSON.stringify({ mode: 'webhook', webhook_url: ctx.webhook.url }));
  assert.match(resA.json.reply, /You're set up for reservations/i);
  assert.match(resA.json.reply, /just ask Vacay Keepsake.*wait/i);

  const resB = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, JSON.stringify({ mode: 'polling', poll_interval_minutes: 9 }));
  assert.match(resB.json.reply, /You're set up for reservations/i);
  assert.match(resB.json.reply, /within about 9 minutes/i);

  const resC = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, JSON.stringify({ mode: 'manual' }));
  assert.match(resC.json.reply, /You're set up for reservations/i);
  assert.match(resC.json.reply, /check my VK reservations/i);

  const chatUrl = ctx.live
    ? `${ctx.origin}/vacation-app.html?session=${encodeURIComponent(ctx.owner.appSession)}&tripId=${encodeURIComponent(ctx.vacation1.id)}`
    : `${ctx.origin}/chat-view?session=${encodeURIComponent(ctx.owner.appSession)}&tripId=${encodeURIComponent(ctx.vacation1.id)}`;

  const shots = await ctx.captureViewports('r05-confirm-modes', {
    url: chatUrl,
    prepare: async (page) => {
      await page.waitForSelector('[data-ts-ai-reservation-connected="1"]', { timeout: 15000 });
      const modes = await page.$$eval('[data-ts-ai-reservation-connected="1"]', (els) => els.map((e) => e.getAttribute('data-reservation-mode')));
      assert.ok(modes.includes('webhook') && modes.includes('polling') && modes.includes('manual'));
    },
  });
  assert.equal(shots.length, 2);
  console.log('r05_confirm_next_steps_by_mode passed', shots.map((s) => s.path).join(', '));
} finally {
  await ctx.cleanup();
}

import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r02');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8 on Wednesday');
  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes, set it up');
  assert.equal(setup.status, 201);
  const card = setup.json.reservationCard;
  assert.equal(card?.kind, 'ai_reservation_setup');
  assert.match(card.mcpEndpoint, /\/api\/mcp$/);
  const token = extractBearerFromCopyText(card.copyText);
  assert.ok(token.startsWith('vkr_'));
  assert.equal(card.maskedToken.includes(token), false);
  assert.match(card.copyText, /\(a\)/i);
  assert.match(card.copyText, /\(b\)/i);
  assert.match(card.copyText, /\(c\)/i);
  assert.match(card.copyText, /check my VK reservations/i);
  assert.doesNotMatch(card.copyText, /\btrips?\b/i);

  const chatUrl = ctx.live
    ? `${ctx.origin}/vacation-app.html?session=${encodeURIComponent(ctx.owner.appSession)}&tripId=${encodeURIComponent(ctx.vacation1.id)}`
    : `${ctx.origin}/chat-view?session=${encodeURIComponent(ctx.owner.appSession)}&tripId=${encodeURIComponent(ctx.vacation1.id)}`;

  const shots = await ctx.captureViewports('r02-setup-card', {
    url: chatUrl,
    prepare: async (page) => {
      await page.waitForSelector('[data-ts-ai-reservation-setup="1"]', { timeout: 15000 });
      await page.evaluate((connId, fullText) => {
        window.__tsCopied = '';
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text) => { window.__tsCopied = text; } },
        });
        window.tsVacationAppAiImport.rememberCopyText(`res:${connId}`, fullText);
      }, card.connectionId, card.copyText);
      const maskedDom = await page.$eval('[data-ts-ai-reservation-setup="1"] [data-ts-ai-masked-token="1"]', (el) => el.textContent || '');
      assert.equal(maskedDom.includes(token), false, 'token must stay masked in UI');
      await page.click('[data-ai-reservation-copy]');
      const copied = await page.evaluate(() => window.__tsCopied);
      assert.equal(copied, card.copyText);
    },
  });
  assert.equal(shots.length, 2);
  console.log('r02_setup_card passed', shots.map((s) => s.path).join(', '));
} finally {
  await ctx.cleanup();
}

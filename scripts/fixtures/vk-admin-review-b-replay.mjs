import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { playWithAdminArtifacts } from '../harness/runtime.mjs';

export async function replayVkAdminReviewHarness({
  id, failed = false, fixture, outRoot, png, sha, put, fetchStaging, staging,
}) {
  const outDir = `${outRoot}/${id}`;
  const [customer, app] = fixture.turns;
  const stored = [];
  let opened = 0;
  let closed = 0;
  const result = await playWithAdminArtifacts({
    origin: staging, token: 'fixture-browser-session', tripId: id, outDir, put,
    secrets: ['fixture-browser-session'], fetchImpl: fetchStaging, replyBackend: 'vk_bot_mcp',
    loadTranscript: async () => ({ ...fixture, turns: stored }),
    play: async (capture) => {
      for (let turn = 1; turn <= (failed ? 2 : 5); turn += 1) {
        const text = `Customer line ${turn}`;
        stored.push({ ...customer, turnIndex: turn * 2 - 1, text, storedText: text });
        stored.push({ ...app, turnIndex: turn * 2, quality: { ...app.quality, comment: `Reply ${turn} addresses the trip.` } });
        await capture({ tripId: id, turn, text });
      }
      if (failed) {
        const text = 'Stored customer message with no reply';
        stored.push({ ...customer, turnIndex: 5, text, storedText: text, buildSha: sha });
        throw new Error('simulated mid-run failure');
      }
      await capture({ tripId: id, turn: 5, text: 'Customer line 5' });
      await capture({ tripId: id, turn: 6, text: 'Customer line 6' });
      return { reason: '', liveShaStart: sha };
    },
    openPage: async () => {
      opened += 1;
      return { close: async () => { closed += 1; }, page: {
        async goto(url) { assert.equal(new URL(url).searchParams.get('tripId'), id); },
        async waitForFunction(_callback, line) { assert.match(line, /^Customer line [1-5]$/); },
        locator(selector) {
          assert.equal(selector, '#messages');
          return { evaluate: async () => {} };
        },
        async screenshot({ path: file }) { await fs.writeFile(file, png); return png; },
      } };
    },
  });
  assert.deepEqual([opened, closed], [1, 1]);
  return { ...result, outDir };
}
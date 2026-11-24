#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AB_SET_SIZE, DEFAULT_ROSTER, RAMP_SIZES, abArms, couponCodeFor, kidAges, loadRoster, loadStoriesDir,
  rampOrder, rosterToStory, validateRosterEntry, waveStories,
} from './harness/roster.mjs';
import { validateStory, validateWave } from './harness/schema.mjs';

const fixture = fileURLToPath(new URL('./fixtures/harness/vk-roster.json', import.meta.url));
const customers = loadRoster(fixture);
assert.equal(customers.length, 100);
assert.match(DEFAULT_ROSTER, /customer-rosters-r2-job/);
if (fs.existsSync(DEFAULT_ROSTER)) {
  assert.deepEqual(loadRoster(DEFAULT_ROSTER), customers, 'fixture copy matches the host r2 roster');
}

assert.equal(customers.filter((entry) => entry.party_type === 'Solo traveller').length, 0);
assert.equal(customers.filter((entry) => entry.budget_band === 'Budget').length, 0);
assert.equal(customers.filter((entry) => entry.budget_band === 'Mid').length, 62);
assert.equal(customers.filter((entry) => entry.budget_band === 'Splurge').length, 38);
assert.equal(customers.filter((entry) => entry.is_family === true).length, 72);

const all = waveStories(customers, 100);
assert.deepEqual(validateWave(all), []);
assert.equal(JSON.stringify(waveStories(customers, 100)), JSON.stringify(all));
assert.equal(new Set(all.map((story) => story.story_id)).size, 100);
assert.equal(new Set(all.map((story) => story.coupon.code)).size, 100);
all.forEach((story, index) => {
  assert.equal(story.story_id, `vk-${String(index + 1).padStart(3, '0')}`);
  assert.equal(story.coupon.code, couponCodeFor(index + 1));
  assert.equal(story.roster.id, index + 1);
  assert.ok(story.turns.length >= 3);
  assert.ok(story.dates.start <= story.dates.end);
  const days = (Date.parse(story.dates.end) - Date.parse(story.dates.start)) / 86400000 + 1;
  assert.equal(days, customers[index].length_days);
  const people = 1 + story.party.collaborators.length + story.party.kids.length;
  assert.equal(people, customers[index].travelers);
  const text = JSON.stringify(story.turns);
  assert.equal(/\btrips?\b/i.test(text), false);
  assert.equal(/craig/i.test(JSON.stringify(story.customer) + JSON.stringify(story.party)), false);
});

const one = all[0];
assert.equal(one.destination, 'Orlando theme parks, FL');
assert.deepEqual(one.party.kids.map((kid) => kid.age), [6, 9]);
assert.equal(one.party.collaborators.length, 1);
assert.match(one.turns[0].text, /5-day vacation to Orlando theme parks, FL/);
assert.match(one.turns[0].text, /mid-range/);
assert.equal(one.roster.budget, 'Mid');
assert.equal(one.roster.tech_comfort, 'Medium');
assert.equal(one.roster.planner, 'Mom');
assert.equal(one.roster.source, 'templated');
assert.equal(one.coupon.misuse, false);

assert.deepEqual(kidAges('1 single mom and twins age 7'), [7, 7]);
assert.deepEqual(kidAges('2 grandparents, 4 parents, and 4 kids ages 4 to 12'), [4, 7, 9, 12]);
assert.deepEqual(kidAges('2 parents and teen 14'), [14]);
assert.deepEqual(kidAges('2 grandparents, 2 parents, and 3 kids 7, 10, and 13'), [7, 10, 13]);
assert.deepEqual(kidAges('5 college friends in their late 20s'), []);
assert.equal(all[7].roster.label, 'Brooks family');
assert.equal(all[7].roster.party_type, 'Family (young kids)');
assert.equal(all[7].party.kids.length, 2);

const byId = (id) => all[id - 1];
assert.match(byId(11).turns[0].text, /full hour-by-hour plan/);
assert.match(byId(69).turns.map((turn) => turn.text).join(' '), /keepsake not ready/);
assert.match(byId(27).turns.map((turn) => turn.text).join(' '), /switch the vacation to San Diego[\s\S]*back to Los Angeles/);
assert.match(byId(95).turns.map((turn) => turn.text).join(' '), /switch the vacation to Dublin[\s\S]*back to Galway/);
assert.match(byId(34).turns.map((turn) => turn.text).join(' '), /mixing up the dates[\s\S]*airport/);
assert.match(byId(87).turns.map((turn) => turn.text).join(' '), /train or picking up a rental car/);
assert.match(byId(54).turns.at(-1).text, /have to go/);
assert.ok(byId(54).turns.length < byId(1).turns.length);
assert.deepEqual([byId(4).coupon.misuse, byId(4).coupon.misuse_kind], [true, 'expired-promo']);
assert.deepEqual([byId(82).coupon.misuse, byId(82).coupon.misuse_kind], [true, 'stack']);
assert.equal(all.filter((story) => story.roster.edge_case).length, 10);
assert.equal(byId(14).turns.some((turn) => /not great with apps/.test(turn.text)), true);

assert.deepEqual(RAMP_SIZES, [1, 5, 20, 100]);
assert.deepEqual(rampOrder([...customers].reverse()).map((row) => row.id), customers.map((row) => row.id));
assert.deepEqual(waveStories(customers, 5).map((story) => story.story_id), ['vk-001', 'vk-002', 'vk-003', 'vk-004', 'vk-005']);
assert.throws(() => waveStories(customers, 0), /outside/);
assert.throws(() => waveStories(customers, 101), /outside/);

const arms = abArms(customers);
assert.equal(arms.size, AB_SET_SIZE);
const open = [...arms].filter(([, arm]) => arm === 'openrouter').map(([id]) => id).sort((a, b) => a - b);
const mcp = [...arms].filter(([, arm]) => arm === 'vk_bot_mcp').map(([id]) => id).sort((a, b) => a - b);
assert.deepEqual(open, [1, 2, 3, 5, 9]);
assert.deepEqual(mcp, [4, 6, 7, 8, 10]);
const types = new Map();
for (const entry of customers.slice(0, 10)) {
  const row = types.get(entry.party_type) || { openrouter: 0, vk_bot_mcp: 0 };
  row[arms.get(entry.id)] += 1;
  types.set(entry.party_type, row);
}
for (const [type, row] of types) assert.ok(Math.abs(row.openrouter - row.vk_bot_mcp) <= 1, `party type ${type} split evenly`);
assert.equal(all.slice(10).every((story) => story.reply_backend === 'openrouter'), true);

assert.match(validateRosterEntry({ ...customers[0], payment_mode: 'card' }).join(' '), /test_coupon/);
assert.match(validateRosterEntry({ ...customers[0], test_coupon: 'VK-TEST-002' }).join(' '), /VK-TEST-001/);
assert.throws(() => rosterToStory({ ...customers[0], payment_mode: 'card' }), /refused/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-stories-'));
const written = { ...rosterToStory(customers[0]), turns: [{ speaker: 'Sofia Lopez', modality: 'text', text: 'Dialog wrote this richer opening line.' }] };
delete written.coupon;
delete written.roster;
fs.writeFileSync(path.join(dir, 'vk-001.json'), JSON.stringify(written));
const dialogStories = loadStoriesDir(dir);
const replaced = waveStories(customers, 2, { dialogStories });
assert.equal(replaced[0].turns[0].text, 'Dialog wrote this richer opening line.');
assert.equal(replaced[0].roster.source, 'stories-dir');
assert.equal(replaced[0].coupon.code, 'VK-TEST-001');
assert.equal(replaced[1].roster.source, 'templated');
assert.deepEqual(validateStory(replaced[0]), []);
fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ story_id: 'Bad Id' }));
assert.throws(() => loadStoriesDir(dir), /not a valid story/);
fs.rmSync(dir, { recursive: true, force: true });

console.log('test_vk_customer_harness_roster_adapter: ok');

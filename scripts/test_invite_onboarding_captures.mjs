import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureVacationInviteOnboarding } from './harness/onboarding-invites.mjs';
import { STAGING_HARNESS_ORIGIN } from './harness/env.mjs';
import { shotBlank } from './harness/onboarding-screens.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';
import { listReviewArtifacts, loadReviewArtifact, LocalVkAdminStore } from '../src/vacation/vk-admin-review-storage.mjs';

const origin = STAGING_HARNESS_ORIGIN;
const tripId = 'aaaaaaaa-0000-0000-0000-000000001184';
const ownerId = 'bbbbbbbb-0000-0000-0000-000000001184';
const tag = 'harness:invite-capture-fixture:vk-001';
const title = 'Orchard vacation fixture';
const metadata = { publicSlug: 'fixture-orchard', harnessTag: tag };
const people = {
  collaborator: { name: 'Riley Hale', email: 'riley@harness.invalid', role: 'telegram_collaborator', id: 'collab-fixture' },
  editor: { name: 'Avery Hale', email: 'avery@harness.invalid', role: 'web_editor', id: 'editor-fixture' },
};
const sent = [];
let inviteRow;
let tagged = 0;
const db = async (parts, ...values) => {
  const query = parts.join('?').replace(/\s+/g, ' ').trim();
  if (query.startsWith('select title, metadata from trips where id = ? and customer_id')) {
    assert.deepEqual(values, [tripId, ownerId, tag]);
    return [{ title, metadata }];
  }
  if (query.startsWith('select distinct on (mail.role')) {
    assert.deepEqual(values, [tripId, tripId]);
    return [...sent];
  }
  if (query.startsWith('select id, email from customers')) return [];
  if (query.startsWith('insert into vacation_collaborator_invites')) {
    const [owner_customer_id, trip_id, , , requested_for, , , inviteMeta] = values;
    inviteRow = { id: people.collaborator.id, owner_customer_id, trip_id, requested_for, metadata: inviteMeta };
    return [inviteRow];
  }
  if (query.startsWith('select title, metadata from trips')) return [{ title, metadata }];
  if (query.includes('from vacation_collaborator_invites i') && query.includes('where i.id')) {
    return [{ ...inviteRow, trip_title: title, owner_display_name: 'Harper Hale' }];
  }
  if (/^(create table|alter table|create unique index)/.test(query)) return [];
  if (query.startsWith('select trips.*')) return [{ title, metadata, owner_display_name: 'Harper Hale' }];
  if (query.startsWith('insert into vacation_web_access_grants')) {
    const [owner_customer_id, trip_id, email, display_name, role] = values;
    assert.equal(role, 'web_editor');
    return [{ id: people.editor.id, owner_customer_id, trip_id, email, display_name, role }];
  }
  if (query.startsWith('select id, status') && query.includes('from outbound_emails')) return [];
  if (query.startsWith('insert into outbound_emails')) {
    const [customerId, email, subject, html, , provider, , status, , mailMeta] = values;
    assert.equal(customerId, ownerId);
    assert.equal(provider, 'harness_stub');
    assert.equal(status, 'stubbed');
    const person = Object.values(people).find((guest) => guest.email === email);
    assert.ok(person);
    assert.equal(mailMeta.collaboratorInviteId || mailMeta.webAccessGrantId, person.id);
    sent.push({ role: person.role, name: person.name, invite_id: person.id, email, subject, html, status });
    return [{ id: `outbox-${sent.length}` }];
  }
  if (query.startsWith('with guest as')) {
    assert.equal(values[1], people.collaborator.email);
    tagged += 1;
    return [];
  }
  assert.fail('unexpected invite replay query');
};

const sharedPath = `/shared/${metadata.publicSlug}/`;
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1">';
const acceptRequests = [];
const sharedAccess = [];
const { chromium } = loadVkAdminPlaywright();
const browser = await chromium.launch();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vk-invite-onboarding-'));
try {
  const store = new LocalVkAdminStore(path.join(outDir, 'store'));
  const result = await captureVacationInviteOnboarding({
    db, ownerCustomerId: ownerId, tripId, tag, origin, env: {}, outDir,
    story: { coupon: {}, steps: ['collaborator'], party: {
      collaborators: [people.collaborator], editors: [people.editor], viewers: [{}],
    } },
    openStore: () => store,
    openPage: async () => {
      const context = await browser.newContext({ isMobile: true, hasTouch: true });
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        assert.equal(url.origin, origin);
        const html = (body, headers = {}) => route.fulfill({
          contentType: 'text/html', body: `<html><head>${viewport}</head><body>${body}</body></html>`, headers,
        });
        if (url.pathname.startsWith('/accept/vacation-collaborator-')) {
          acceptRequests.push('collaborator');
          return html('<h1>Review &amp; continue</h1><form id="form" action="/vacation-app.html"><input id="name" required><input id="agree" type="checkbox" required><input name="session" type="hidden" value="fixture"><button class="btn">Continue</button></form>');
        }
        if (url.pathname === '/vacation-app.html') return html('<h1>Welcome, Riley</h1><input id="messageText">');
        if (url.pathname === '/api/vacation-itinerary' && url.searchParams.get('action') === 'accept') {
          acceptRequests.push('editor');
          return html(`<main><h1>Website editing enabled</h1><a href="${sharedPath}">Open vacation</a></main>`,
            { 'set-cookie': 'fixture-edit=1; Path=/; Secure' });
        }
        if (url.pathname === sharedPath) return html(`<h1>${title}</h1>`);
        if (url.pathname.endsWith('/edit-access')) {
          const canEdit = (await request.headerValue('cookie') || '').includes('fixture-edit=1');
          sharedAccess.push(canEdit);
          return route.fulfill({ json: { canEdit, ...(canEdit ? { role: 'web_editor' } : {}) } });
        }
        return route.abort();
      });
      return { page: await context.newPage(), close: () => context.close() };
    },
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(acceptRequests, ['collaborator', 'editor']);
  assert.deepEqual(sharedAccess, [true, false]);
  assert.deepEqual(sent.map(({ email }) => email), [people.collaborator.email, people.editor.email]);
  assert.equal(tagged, 1);
  const { onboardingCaptures } = await listReviewArtifacts(store, tripId);
  assert.deepEqual(onboardingCaptures.map(({ artifact }) => artifact).sort(),
    result.uploaded.map(({ artifact }) => artifact).sort());
  for (const { artifact, width } of onboardingCaptures) {
    const bytes = await loadReviewArtifact(store, tripId, artifact);
    assert.equal(shotBlank(bytes), false);
    assert.equal(bytes.readUInt32BE(16), width);
  }
  assert.ok(result.uploaded.every(({ vacationId }) => vacationId === tripId));
  for (const [role, stages] of [
    ['telegram_collaborator', ['invite-email', 'accept-link', 'sign-in-or-join', 'first-view']],
    ['web_editor', ['invite-email', 'accept-link', 'sign-in-or-join', 'first-view']],
    ['viewer', ['shared-landing']],
  ]) {
    const captures = result.uploaded.filter((capture) => capture.role === role);
    for (const width of [390, 430]) {
      assert.deepEqual(captures.filter((capture) => capture.width === width).map(({ screen }) => screen), stages);
    }
    assert.equal(captures.length, stages.length * 2);
  }
} finally {
  await browser.close();
  await fs.rm(outDir, { recursive: true, force: true });
}
console.log('ok - invite emails and onboarding replay for collaborator, editor and URL-only viewer at 390 and 430');

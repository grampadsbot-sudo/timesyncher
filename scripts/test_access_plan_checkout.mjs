import assert from 'node:assert/strict';
import { normalizeAccessPlanRow, priceAccessPlanRow } from '../src/vacation/access-plan.mjs';

const familyPlan = [
  {
    name: 'Mom',
    email: 'mom@example.com',
    role: 'owner_media',
    photoUpload: true,
    videoUpload: true,
    payerEmail: 'dad@example.com',
    scope: 'single_trip',
  },
  {
    name: 'Dad',
    email: 'dad@example.com',
    role: 'web_editor',
  },
  {
    name: 'Adult Kid',
    email: 'kid@example.com',
    role: 'collaborator',
    photoUpload: true,
    payerEmail: 'dad@example.com',
  },
  {
    name: 'Grandparent',
    role: 'viewer',
  },
];

process.env.TIMESYNCHER_CHECKOUT_CURRENCY = 'usd';
const [ownerMedia, editor, collaborator, viewer] = familyPlan.map((row) => normalizeAccessPlanRow(row));
assert.equal(ownerMedia.role, 'owner_media');
assert.equal(ownerMedia.canEditSite, true);
assert.equal(ownerMedia.canUploadPhotos, true);
assert.equal(ownerMedia.canUploadVideos, true);
assert.equal(ownerMedia.payerEmail, 'dad@example.com');

assert.equal(editor.role, 'web_editor');
assert.equal(editor.canEditSite, true);
assert.equal(editor.canTextOrVoice, false);
assert.equal(priceAccessPlanRow(editor).amountCents, 0);

process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS = '2100';
process.env.TIMESYNCHER_MEDIA_PRICE_CENTS = '1700';
const collaboratorPrice = priceAccessPlanRow(collaborator);
assert.equal(collaborator.role, 'telegram_collaborator');
assert.equal(collaborator.canTextOrVoice, true);
assert.equal(collaboratorPrice.amountCents, 3800);
assert.equal(collaboratorPrice.planCode, 'telegram_collaborators_single_trip');

const ownerMediaPrice = priceAccessPlanRow(ownerMedia);
assert.equal(ownerMediaPrice.amountCents, 1700);
assert.equal(ownerMediaPrice.planCode, 'owner_media');

assert.equal(viewer.role, 'viewer');
assert.equal(viewer.email, null);
assert.equal(priceAccessPlanRow(viewer).amountCents, 0);

const groupedTotal = [ownerMedia, collaborator]
  .filter((row) => row.payerEmail === 'dad@example.com')
  .reduce((sum, row) => sum + priceAccessPlanRow(row).amountCents, 0);
assert.equal(groupedTotal, 5500);

console.log('access plan checkout policy smoke passed');

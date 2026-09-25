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

const collaboratorPrice = priceAccessPlanRow(collaborator);
assert.equal(collaborator.role, 'telegram_collaborator');
assert.equal(collaborator.canTextOrVoice, true);
assert.equal(collaboratorPrice.amountCents, 2000);
assert.equal(collaboratorPrice.planCode, 'telegram_collaborators_single_trip');

const ownerMediaPrice = priceAccessPlanRow(ownerMedia);
assert.equal(ownerMediaPrice.amountCents, 2200);
assert.equal(ownerMediaPrice.planCode, 'owner_media_single_vacation');

assert.equal(viewer.role, 'viewer');
assert.equal(viewer.email, null);
assert.equal(priceAccessPlanRow(viewer).amountCents, 0);

const groupedTotal = [ownerMedia, collaborator]
  .filter((row) => row.payerEmail === 'dad@example.com')
  .reduce((sum, row) => sum + priceAccessPlanRow(row).amountCents, 0);
assert.equal(groupedTotal, 4200);

console.log('access plan checkout policy smoke passed');

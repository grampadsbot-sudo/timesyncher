#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { purchaseEmail } from '../../../../src/vacation/email.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const staging = 'https://vacation-staging.timesyncher.com';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : (process.argv[index + 1] || '');
}

function launchUrlFromEmail(html = '', text = '') {
  const href = html.match(/href="([^"]*vacation-app\.html\?session=[^"]+)"/i)?.[1]
    || text.match(/https?:\/\/\S*vacation-app\.html\?session=\S+/i)?.[0]
    || '';
  return href.replace(/[>\s]+$/, '');
}

function wrongLaunch(html = '', text = '') {
  const blob = `${html}\n${text}`;
  const hrefs = [...blob.matchAll(/href="([^"]+)"/gi)].map((match) => match[1]);
  const textUrls = blob.match(/https?:\/\/\S+/gi) || [];
  return [...hrefs, ...textUrls].filter((url) => /order-success|\/accept\//i.test(url));
}

export function assertProductSource({ orderSuccess, vacationApp, email }) {
  const errors = [];
  if (!/Check your email and click the link in that email/i.test(orderSuccess)) {
    errors.push('order-success does not tell the customer to click the email link');
  }
  if (/id="openApp"|id="acceptEula"|\/accept\//i.test(orderSuccess)) {
    errors.push('order-success still treats Open App or /accept as the customer path');
  }
  if (!email.launchUrl.includes('/vacation-app.html?session=')) {
    errors.push('purchase email launch URL is not the app URL');
  }
  if (/order-success|\/accept\//i.test(`${email.textBody}\n${email.htmlBody}`)) {
    errors.push('purchase email points at order-success or /accept');
  }
  if (!/state\.eula\?\.accepted !== true/.test(vacationApp) || !/id="eulaScreen"/.test(vacationApp)) {
    errors.push('app URL does not paint the EULA before the workspace');
  }
  if (!/no vacations yet/.test(vacationApp) || !/chat-only/.test(vacationApp)) {
    errors.push('onboarding empty workspace is missing');
  }
  return errors;
}

export function assertEvidencePack(files) {
  const errors = [];
  const html = files.html || '';
  const text = files.text || '';
  if (!html.trim() && !text.trim()) {
    errors.push('evidence skips email');
    return errors;
  }
  const launch = launchUrlFromEmail(html, text);
  if (!/\/vacation-app\.html\?session=[A-Za-z0-9_-]+/.test(launch)) {
    errors.push('email does not launch the app URL');
  }
  if (wrongLaunch(html, text).length) {
    errors.push('email launch still uses order-success or /accept');
  }
  const notes = files.notes;
  if (!Array.isArray(notes)) {
    errors.push('browser notes missing; cannot prove EULA was opened from the email');
    return errors;
  }
  const emailStep = notes.find((step) => step.step === 'email');
  const eula = notes.find((step) => step.step === 'eula-first');
  const chat = notes.find((step) => step.step === 'onboarding');
  const ack = notes.find((step) => step.step === 'order-success');
  if (!emailStep?.href || emailStep.href !== launch) {
    errors.push('evidence did not open the email launch link');
  }
  if (ack && (/\/accept\//.test(JSON.stringify(ack)) || (ack.buttons || []).some((label) => /open timesyncher vacation/i.test(label)))) {
    errors.push('order-success evidence still uses Open App or /accept');
  }
  if (!eula || eula.hasEula !== true || eula.hasWorkspace === true || !/\/vacation-app\.html\?session=/.test(eula.url || '')) {
    errors.push('EULA was not the first screen of the app URL');
  }
  if (eula && launch && eula.url !== launch) {
    errors.push('EULA screen was not the email launch URL');
  }
  if (!chat || chat.tripLabel !== 'no vacations yet' || chat.chatOnly !== true || chat.hasEula === true) {
    errors.push('onboarding chat did not follow EULA accept');
  }
  return errors;
}

async function readSource() {
  const [orderSuccess, vacationApp, eulaText] = await Promise.all([
    readFile(path.join(root, 'order-success.html'), 'utf8'),
    readFile(path.join(root, 'vacation-app.html'), 'utf8'),
    readFile(path.join(root, 'public/legal/terms-2026-06-advisory-only.md'), 'utf8'),
  ]);
  if (/telegram|telegraph|bot-intake|bot intake/i.test(eulaText)) {
    throw new Error('customer terms still name Telegram, telegraph, or bot intake');
  }
  const email = purchaseEmail({
    contact: { firstName: 'Alex' },
    token: 'session-token',
    env: { TIMESYNCHER_SITE_BASE_URL: staging },
  });
  return { orderSuccess, vacationApp, email };
}

async function readEvidence(dir) {
  async function optional(name) {
    try {
      return await readFile(path.join(dir, name), 'utf8');
    } catch {
      return '';
    }
  }
  const notesRaw = await optional('browser-notes.json');
  return {
    html: await optional('purchase-email.html'),
    text: await optional('purchase-email.txt'),
    notes: notesRaw ? JSON.parse(notesRaw) : null,
  };
}

async function doctor() {
  const errors = [];
  const order = await fetch(`${staging}/order-success.html`);
  const orderHtml = await order.text();
  if (!order.ok) errors.push(`order-success HTTP ${order.status}`);
  if (!/Check your email/i.test(orderHtml)) errors.push('live order-success missing email CTA');
  if (/id="openApp"|id="acceptEula"/i.test(orderHtml)) errors.push('live order-success still has Open App or EULA accept');
  const app = await fetch(`${staging}/vacation-app.html`);
  const appHtml = await app.text();
  if (!app.ok) errors.push(`vacation-app HTTP ${app.status}`);
  const script = appHtml.match(/src="([^"]*vacationApp-[^"]+\.js)"/)?.[1];
  if (!script) errors.push('live app shell has no vacation app script');
  else {
    const js = await fetch(new URL(script, staging)).then((response) => response.text());
    if (!js.includes('eulaScreen') || !js.includes('eulaAgreeButton')) errors.push('live app bundle has no in-app EULA screen');
  }
  return errors;
}

async function liveSession(launch) {
  const session = new URL(launch).searchParams.get('session');
  const response = await fetch(`${staging}/api/vacation-itinerary?app=1&session=${encodeURIComponent(session)}`);
  const body = await response.json();
  if (!response.ok || body.ok === false) return [`app session HTTP ${response.status}`];
  if (body.eula?.accepted === true) return [];
  if (!body.eula || body.eula.accepted === true || !body.eula.text) {
    return ['pending app session did not return EULA text for the first screen'];
  }
  return [];
}

function fail(errors) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exit(1);
}

async function selfCheck() {
  const dir = await mkdtemp(path.join(tmpdir(), 'ts-email-eula-'));
  try {
    const baseNotes = [
      { step: 'email', href: 'https://vacation-staging.timesyncher.com/vacation-app.html?session=abc' },
      { step: 'eula-first', url: 'https://vacation-staging.timesyncher.com/vacation-app.html?session=abc', hasEula: true, hasWorkspace: false },
      { step: 'onboarding', url: 'https://vacation-staging.timesyncher.com/vacation-app.html?session=abc', hasEula: false, tripLabel: 'no vacations yet', chatOnly: true },
    ];
    const cases = [
      { name: 'skips email', html: '', text: '', notes: baseNotes, expect: /skips email/ },
      {
        name: 'email opens order-success',
        html: '<a href="https://vacation-staging.timesyncher.com/order-success.html?session=abc">Open</a>',
        text: '',
        notes: baseNotes,
        expect: /order-success or \/accept|does not launch the app URL/,
      },
      {
        name: 'email opens /accept',
        html: '<a href="https://vacation-staging.timesyncher.com/accept/vacation-abc">Review</a>',
        text: '',
        notes: baseNotes,
        expect: /order-success or \/accept|does not launch the app URL/,
      },
    ];
    for (const item of cases) {
      const caseDir = path.join(dir, item.name.replace(/\s+/g, '-'));
      await mkdir(caseDir, { recursive: true });
      if (item.html) await writeFile(path.join(caseDir, 'purchase-email.html'), item.html);
      if (item.text) await writeFile(path.join(caseDir, 'purchase-email.txt'), item.text);
      await writeFile(path.join(caseDir, 'browser-notes.json'), JSON.stringify(item.notes));
      const errors = assertEvidencePack(await readEvidence(caseDir));
      if (!errors.some((error) => item.expect.test(error))) {
        throw new Error(`${item.name} did not fail closed: ${errors.join('; ') || 'no errors'}`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const source = await readSource();
const sourceErrors = assertProductSource(source);
if (sourceErrors.length) fail(sourceErrors);

if (process.argv.includes('--self-check')) {
  await selfCheck();
  console.log('self-check ok');
}

if (process.argv.includes('--doctor') || process.argv.includes('--live')) {
  const doctorErrors = await doctor();
  if (doctorErrors.length) fail(doctorErrors);
  console.log('doctor ok');
}

const evidenceDir = argValue('--evidence');
if (evidenceDir) {
  const evidence = await readEvidence(evidenceDir);
  const evidenceErrors = assertEvidencePack(evidence);
  if (process.argv.includes('--live') && !evidenceErrors.length) {
    evidenceErrors.push(...await liveSession(launchUrlFromEmail(evidence.html, evidence.text)));
  }
  if (evidenceErrors.length) fail(evidenceErrors);
  console.log(`evidence ok ${evidenceDir}`);
}

console.log('post-purchase email eula verification passed');

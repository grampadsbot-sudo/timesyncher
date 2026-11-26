import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseJsonStore, LocalJsonStore } from '../onboarding/eula-persistent-store.mjs';
import { hasDatabase, sql } from './db.mjs';

export class LocalVkAdminStore extends LocalJsonStore {
  async putWelcome(key, value) {
    const path = this.path(key);
    mkdirSync(dirname(path), { recursive: true });
    try {
      writeFileSync(path, JSON.stringify(value), { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

class DatabaseVkAdminStore extends DatabaseJsonStore {
  async putWelcome(key, value) {
    const db = sql(this.env);
    await db`
      insert into eula_store_objects (key, document, updated_at)
      values (${this.key(key)}, ${value}, now())
      on conflict (key) do nothing
    `;
  }
}

export function vkAdminStorage(env) {
  if (hasDatabase(env)) return new DatabaseVkAdminStore({ prefix: 'vk-admin-review', env });
  if (env.VERCEL || env.VERCEL_ENV) throw new Error('VK admin storage requires a vacation database');
  return new LocalVkAdminStore('runtime/vk-admin-review');
}

const MAX_BYTES = 3 * 1024 * 1024;
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pdf = Buffer.from('%PDF-');
const turnNumbers = [1, 2, 3, 4, 5];

function readBase64(value, remaining = MAX_BYTES) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(remaining / 3) * 4) return null;
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > remaining || bytes.toString('base64') !== value) return null;
  return bytes;
}

export function noteFromBody(body, vacationId) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const files = body.attachments ?? [];
  if (text.length > 16000 || !Array.isArray(files) || files.length > 6 || (!text && !files.length)) return null;
  let remaining = MAX_BYTES;
  const attachments = [];
  for (const file of files) {
    const bytes = readBase64(file?.data, remaining);
    if (!bytes || typeof file.name !== 'string' || !file.name.trim()) return null;
    remaining -= bytes.length;
    attachments.push({ name: file.name.trim().slice(0, 180), data: file.data });
  }
  return { id: randomUUID(), at: new Date().toISOString(), text, attachments, vacationId };
}

export function presentNote({ id, at, text, attachments, vacationId, kind }) {
  return { id, at, text, vacationId, kind, attachments: attachments.map(({ name }) => ({ name })) };
}

export function notesPath(customerId, vacationId) {
  if (customerId != null) return `notes/customer-${encodeURIComponent(customerId)}`;
  return vacationId ? `notes/vacation-${encodeURIComponent(vacationId)}` : 'notes/general';
}

export async function saveWelcome(store, member, vacation) {
  const path = notesPath(member.id, vacation.tripId);
  const title = vacation.title || vacation.destination || vacation.label;
  const place = vacation.destination && !title.toLowerCase().includes(vacation.destination.toLowerCase())
    ? ` in ${vacation.destination}` : '';
  const dates = [vacation.startDate, vacation.endDate].filter(Boolean).join(' to ');
  const text = `Welcome to ${member.customer_label}'s vacation. ${title}${place}${dates ? ` · ${dates}` : ''}.`;
  await store.putWelcome(`${path}/welcome.json`, {
    id: 'welcome', kind: 'welcome', at: new Date().toISOString(), text, vacationId: vacation.tripId, attachments: [],
  });
}

export async function listNotes(store, customerId, vacationId, legacySources) {
  const paths = new Map([[notesPath(customerId, vacationId), vacationId]]);
  for (const source of legacySources) {
    const path = notesPath(source.customerId, source.vacationId);
    if (!paths.has(path)) paths.set(path, source.vacationId);
  }
  const lists = await Promise.all([...paths].map(async ([path, vacationId]) =>
    (await store.listJson(path)).map((note) => ({ vacationId, ...note }))));
  const notes = lists.flat().sort((a, b) =>
    Number(b.kind === 'welcome') - Number(a.kind === 'welcome') || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return notes.filter((note, index) => note.kind !== 'welcome' || index === 0).map(presentNote);
}

export async function loadNoteFile(store, customerId, vacationId, legacy, id, index, recordId) {
  if (!uuid.test(id) || !/^\d$/.test(index)) return null;
  const note = await store.getJson(`${notesPath(customerId, vacationId)}/${id}.json`)
    || (recordId && await store.getJson(`${notesPath(recordId, vacationId)}/${id}.json`))
    || (legacy ? await store.getJson(`${notesPath(null, vacationId)}/${id}.json`) : null);
  const file = note?.attachments?.[Number(index)];
  return file ? Buffer.from(file.data, 'base64') : null;
}

function artifactPath(vacationId, artifact) {
  return `artifacts/${encodeURIComponent(vacationId)}/${artifact}.json`;
}

export function artifactType(artifact) {
  if (/^turn-[1-5]$/.test(artifact)) return 'image/png';
  return artifact === 'dialog-pdf' || artifact === 'keepsake-pdf' ? 'application/pdf' : '';
}

export async function saveReviewArtifact(store, vacationId, artifact, data) {
  const bytes = readBase64(data);
  const type = artifactType(artifact);
  const signature = type === 'application/pdf' ? pdf : png;
  if (!type || !bytes?.subarray(0, signature.length).equals(signature)) return false;
  await store.putJson(artifactPath(vacationId, artifact), { data });
  return true;
}

export async function loadReviewArtifact(store, vacationId, artifact) {
  const file = await store.getJson(artifactPath(vacationId, artifact));
  return file?.data ? Buffer.from(file.data, 'base64') : null;
}

export async function listReviewArtifacts(store, vacationId) {
  const captures = await Promise.all(turnNumbers.map(async (turn) => {
    const capture = await store.getJson(artifactPath(vacationId, `turn-${turn}`));
    return capture ? turn : null;
  }));
  const [dialog, keepsake, review] = await Promise.all(['dialog-pdf', 'keepsake-pdf', 'review'].map((artifact) => (
    store.getJson(artifactPath(vacationId, artifact))
  )));
  return {
    turns: captures.filter(Boolean),
    dialogPdf: Boolean(dialog?.data),
    keepsakePdf: Boolean(keepsake?.data),
    review,
  };
}

export async function saveReviewResults(store, vacationId, { qa, survey }) {
  if (qa == null && survey == null) return false;
  const review = { qa: qa ?? null, survey: survey ?? null };
  if (Buffer.byteLength(JSON.stringify(review)) > 64000) return false;
  const key = artifactPath(vacationId, 'review');
  await store.putJson(key, { ...await store.getJson(key), ...Object.fromEntries(Object.entries(review).filter(([, v]) => v != null)) });
  return true;
}

import { randomUUID } from 'node:crypto';

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

export function noteFromBody(body) {
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
  return { id: randomUUID(), at: new Date().toISOString(), text, attachments };
}

export function presentNote({ id, at, text, attachments }) {
  return { id, at, text, attachments: attachments.map(({ name }) => ({ name })) };
}

export function notesPath(customer) {
  return `notes/${customer === null ? 'general' : `vacation-${encodeURIComponent(customer)}`}`;
}

export async function listNotes(store, customer) {
  const notes = await store.listJson(notesPath(customer));
  return notes.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).map(presentNote);
}

export async function loadNoteFile(store, customer, id, index) {
  if (!uuid.test(id) || !/^\d$/.test(index)) return null;
  const note = await store.getJson(`${notesPath(customer)}/${id}.json`);
  const file = note?.attachments?.[Number(index)];
  return file ? Buffer.from(file.data, 'base64') : null;
}

function artifactPath(vacationId, artifact) {
  return `artifacts/${encodeURIComponent(vacationId)}/${artifact}.json`;
}

export function artifactType(artifact) {
  if (/^turn-[1-5]$/.test(artifact)) return 'image/png';
  return artifact === 'dialog-pdf' ? 'application/pdf' : '';
}

export async function saveReviewArtifact(store, vacationId, artifact, data) {
  const bytes = readBase64(data);
  const signature = artifact === 'dialog-pdf' ? pdf : png;
  if (!artifactType(artifact) || !bytes?.subarray(0, signature.length).equals(signature)) return false;
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
  return {
    turns: captures.filter(Boolean),
    dialogPdf: Boolean(await store.getJson(artifactPath(vacationId, 'dialog-pdf'))),
    review: await store.getJson(artifactPath(vacationId, 'review')),
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

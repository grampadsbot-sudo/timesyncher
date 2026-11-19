import { normalizeSha } from '../void-stale-build.mjs';

export function stampMissingDriveSha(doc, sha) {
  const drive = normalizeSha(sha);
  if (!doc || typeof doc !== 'object' || !drive) return doc;
  const turns = (Array.isArray(doc.turns) ? doc.turns : []).map((turn) => {
    if (normalizeSha(turn?.buildSha)) return turn;
    return { ...turn, buildSha: drive };
  });
  const next = { ...doc, turns };
  if (!normalizeSha(next.buildSha)) next.buildSha = drive;
  if (!normalizeSha(next.driveBuildEnd)) next.driveBuildEnd = drive;
  return next;
}

export async function resolveDriveSha(buildSha, origin, fetchImpl) {
  const given = normalizeSha(buildSha);
  if (given) return given;
  if (!origin || typeof fetchImpl !== 'function') return '';
  try {
    const response = await fetchImpl(new URL('/api/version', origin));
    const body = await response.json();
    return normalizeSha(body?.sha);
  } catch {
    return '';
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(`${JSON.stringify(body)}\n`);
}

export default function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method not allowed' });
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.TIMESYNCHER_BUILD_SHA || '').trim().toLowerCase();
  return send(res, 200, { ok: true, sha });
}

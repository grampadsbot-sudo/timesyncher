const EPS = 0.01;
const r2 = (n) => Math.round(n * 100) / 100;
const roundBox = (b) => b && Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v]));

function shift(rect, offset) {
  if (!rect) return rect;
  return {
    left: rect.left + offset.x,
    top: rect.top + offset.y,
    right: rect.right + offset.x,
    bottom: rect.bottom + offset.y,
    width: rect.width,
    height: rect.height,
  };
}

function anchorRendered(anchor) {
  if (!anchor || anchor.missing) return false;
  const w = Number(anchor.width);
  const h = Number(anchor.height);
  return Number.isFinite(w) && Number.isFinite(h) && w >= 1 && h >= 1;
}

export function judgeBoxAlign(assertion, m, offset = { x: 0, y: 0 }, top = { vw: 390, vh: 844 }) {
  const a = assertion.anchor || {};
  const tol = a.tol_px != null ? a.tol_px : 2;
  if (!a.left && !a.right && !a.same_row) {
    return { pass: false, observed: { error: 'box_align needs left, right, and/or same_row' } };
  }
  if (!m.found) return { pass: false, observed: { found: false } };
  if (!m.anchor || m.anchor.missing) {
    return { pass: false, observed: { found: m.found, rendered: m.rendered, anchor: 'missing' } };
  }
  const checks = {};
  let ok = Boolean(m.rendered);
  if (a.left) {
    const got = m.rect.left;
    const want = m.anchor[a.left];
    const d = got - want;
    checks.left = { edge: a.left, delta: r2(d), tol_px: tol };
    if (!(Number.isFinite(want) && Math.abs(d) <= tol + EPS)) ok = false;
  }
  if (a.right) {
    const got = m.rect.right;
    const want = m.anchor[a.right];
    const d = got - want;
    checks.right = { edge: a.right, delta: r2(d), tol_px: tol };
    if (!(Number.isFinite(want) && Math.abs(d) <= tol + EPS)) ok = false;
  }
  if (a.same_row) {
    if (!anchorRendered(m.anchor)) {
      checks.same_row = {
        overlap: false,
        reason: 'zero_size_anchor',
        subject: roundBox(m.rect),
        anchor: roundBox(m.anchor),
      };
      ok = false;
    } else {
      const overlap = m.rect.top <= m.anchor.bottom + tol + EPS && m.anchor.top <= m.rect.bottom + tol + EPS;
      checks.same_row = { overlap, subject: roundBox(m.rect), anchor: roundBox(m.anchor) };
      if (!overlap) ok = false;
    }
  }
  return {
    pass: ok,
    observed: { rect: roundBox(shift(m.rect, offset)), anchor: roundBox(m.anchor), checks, rendered: m.rendered },
  };
}

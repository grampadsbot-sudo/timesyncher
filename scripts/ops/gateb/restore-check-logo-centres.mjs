/** Logo/tab vertical centre checks for restore-check structure mode (#432, #433). */
import {
  chipCaptureClipRelation,
  isCaptureCoverageGap,
  viewportCaptureFrame,
} from './lib/gate-b-shell-layout-checker.mjs';

export function runLogoCentres({ spec, out, Cd, W, Hc, VW, regions: r }) {
  const INK_BBOX_THR = 24;
  const MASS_THR = 18;
  const TAB_TOL = 0.5;
  const CHIP_TOL = 0.5;
  const bad = [];
  const nameBad = [];
  const captureCoverageGaps = [];
  out.logo_centres = [];

  function logoChipRectFromBox(box) {
    const [x, y, w, h] = box;
    return { left: x, top: y, right: x + w, bottom: y + h };
  }

  function resolveCaptureFrame() {
    if (spec.capture_frame && typeof spec.capture_frame === 'object') {
      return spec.capture_frame;
    }
    const vh = (r && r.viewport && r.viewport[1]) || Hc;
    return viewportCaptureFrame(VW, vh);
  }

  const captureFrame = resolveCaptureFrame();

  function insetBox(box, inset) {
    const [cx, cy, cw, ch] = box;
    const x0 = Math.round(cx + inset);
    const x1 = Math.round(cx + cw - 1 - inset);
    const y0 = Math.round(cy + inset);
    const y1 = Math.round(cy + ch - 1 - inset);
    return { cx, cy, cw, ch, x0, x1, y0, y1 };
  }

  function ringBackground(x0, x1, y0, y1) {
    const ring = new Map();
    const addRing = (x, y) => {
      const k = (y * W + x) * 4;
      const key = `${Cd[k]},${Cd[k + 1]},${Cd[k + 2]}`;
      ring.set(key, (ring.get(key) || 0) + 1);
    };
    for (let x = x0; x <= x1; x += 1) {
      addRing(x, y0);
      addRing(x, y1);
    }
    for (let y = y0; y <= y1; y += 1) {
      addRing(x0, y);
      addRing(x1, y);
    }
    let bgKey = null;
    let bgN = -1;
    for (const [key, n] of ring) {
      if (n > bgN) {
        bgN = n;
        bgKey = key;
      }
    }
    return bgKey.split(',').map(Number);
  }

  function inkBboxCenterY(x0, x1, y0, y1, gx0, gx1, bg) {
    let mn = null;
    let mx = null;
    for (let y = Math.max(0, y0); y <= Math.min(Hc - 1, y1); y += 1) {
      for (let x = Math.max(0, gx0); x <= Math.min(VW - 1, gx1); x += 1) {
        const k = (y * W + x) * 4;
        if (Math.max(Math.abs(Cd[k] - bg[0]), Math.abs(Cd[k + 1] - bg[1]), Math.abs(Cd[k + 2] - bg[2])) > INK_BBOX_THR) {
          if (mn === null || y < mn) mn = y;
          if (mx === null || y > mx) mx = y;
        }
      }
    }
    if (mn === null) return null;
    return { gc: (mn + mx + 1) / 2, glyph_y: [mn, mx], metric: 'ink-bbox' };
  }

  function massCentreY(x0, x1, y0, y1, gx0, gx1, bg) {
    let sumY = 0;
    let mass = 0;
    for (let y = Math.max(0, y0); y <= Math.min(Hc - 1, y1); y += 1) {
      for (let x = Math.max(0, gx0); x <= Math.min(VW - 1, gx1); x += 1) {
        const k = (y * W + x) * 4;
        const a = Cd[k + 3];
        if (a < 16) continue;
        const dr = Math.abs(Cd[k] - bg[0]);
        const dg = Math.abs(Cd[k + 1] - bg[1]);
        const db = Math.abs(Cd[k + 2] - bg[2]);
        if (dr + dg + db < MASS_THR) continue;
        const weight = (dr + dg + db) * (a / 255);
        sumY += y * weight;
        mass += weight;
      }
    }
    if (mass <= 0) return null;
    return { gc: sumY / mass, mass, metric: 'mass-centre' };
  }

  function judgeContainer(entry, measureFn, tol) {
    const { where, box, gx, gw, inset, name, name_cy: nameCy } = entry;
    const { cx, cy, cw, ch, x0, x1, y0, y1 } = insetBox(box, inset);
    const bg = ringBackground(x0, x1, y0, y1);
    const gx0 = Math.max(x0, Math.round(gx - 3));
    const gx1 = Math.min(x1, Math.round(gx + gw + 3));
    const measured = measureFn(x0, x1, y0, y1, gx0, gx1, bg);
    if (!measured) {
      bad.push(`${where} (no glyph drawn)`);
      out.logo_centres.push({ where, ink: false });
      return;
    }
    const cc = cy + ch / 2;
    const off = +(measured.gc - cc).toFixed(1);
    out.logo_centres.push({ where, off, ...measured });
    if (Math.abs(off) > tol) {
      bad.push(`${where} off by ${Math.abs(off).toFixed(1)} px (${off > 0 ? 'low' : 'high'}, tolerance ${tol} px)`);
    }
    if (nameCy != null) {
      const no = +(measured.gc - nameCy).toFixed(1);
      if (Math.abs(no) > CHIP_TOL) {
        nameBad.push(`${name || '?'} off by ${Math.abs(no).toFixed(1)} px (${no > 0 ? 'logo low' : 'logo high'} vs name, tolerance ${CHIP_TOL} px)`);
      }
    }
  }

  for (const t of spec.tab_boxes || []) {
    if (!t.icon || !t.box || t.box[0] < 0 || t.box[0] + t.box[2] > VW) continue;
    judgeContainer(
      { where: `tab ${t.text}`, box: t.box, gx: t.icon[0], gw: t.icon[2], inset: 3 },
      massCentreY,
      TAB_TOL,
    );
  }
  for (const c of spec.logo_chips || []) {
    if (!c.box || c.box[0] < 0 || c.box[0] + c.box[2] > VW) continue;
    const chipRect = logoChipRectFromBox(c.box);
    if (isCaptureCoverageGap(chipRect, captureFrame)) {
      const relation = chipCaptureClipRelation(chipRect, captureFrame);
      const label = c.name || '?';
      captureCoverageGaps.push({ name: label, relation });
      out.logo_centres.push({
        where: `row logo ${label}`,
        capture_coverage_gap: true,
        capture_clip_relation: relation,
      });
      continue;
    }
    judgeContainer(
      {
        where: `row logo ${c.name || '?'}`,
        box: c.box,
        gx: c.box[0],
        gw: c.box[2],
        inset: 1,
        name: c.name,
        name_cy: c.name_cy,
      },
      inkBboxCenterY,
      CHIP_TOL,
    );
  }
  if (captureCoverageGaps.length) {
    out.capture_coverage_gaps = captureCoverageGaps;
    out.reasons.push(
      `capture coverage gap: ${captureCoverageGaps.map((g) => `row logo ${g.name} (chip ${g.relation} capture frame)`).join('; ')}`,
    );
  }
  if (bad.length) out.reasons.push(`logo not vertically centred: ${bad.join('; ')}`);
  if (nameBad.length) out.reasons.push(`logo not centred with name: ${nameBad.join('; ')}`);
}

export function inkBboxCenterYFromRgba(data, width, height, threshold = 24) {
  if (!width || !height || !data || data.length < width * height * 4) return null;
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const bg = [0, 0, 0];
  for (const [x, y] of corners) {
    const p = (y * width + x) * 4;
    bg[0] += data[p];
    bg[1] += data[p + 1];
    bg[2] += data[p + 2];
  }
  bg[0] /= 4;
  bg[1] /= 4;
  bg[2] /= 4;
  let minY = null;
  let maxY = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const k = (y * width + x) * 4;
      const a = data[k + 3];
      if (a < 20) continue;
      const dr = Math.max(
        Math.abs(data[k] - bg[0]),
        Math.abs(data[k + 1] - bg[1]),
        Math.abs(data[k + 2] - bg[2]),
      );
      if (dr <= threshold) continue;
      if (minY === null || y < minY) minY = y;
      if (maxY === null || y > maxY) maxY = y;
    }
  }
  if (minY === null || maxY === null) return null;
  return (minY + maxY) / 2;
}

export function objectFitContainContentRect(imgRect, naturalWidth, naturalHeight) {
  const r = imgRect;
  if (!naturalWidth || !naturalHeight) {
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  const scale = Math.min(r.width / naturalWidth, r.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    top: r.top + (r.height - height) / 2,
    left: r.left + (r.width - width) / 2,
    width,
    height,
  };
}

export function inkScreenCenterY({ inkCenterY, naturalHeight, contentRect }) {
  if (inkCenterY == null || !naturalHeight || !contentRect || !contentRect.height) return null;
  return contentRect.top + (inkCenterY / naturalHeight) * contentRect.height;
}

export function verticalNudgePxForInkCenter({ inkCenterY, naturalHeight, displayHeight }) {
  if (inkCenterY == null || !naturalHeight || !displayHeight) return 0;
  const scale = displayHeight / naturalHeight;
  return (naturalHeight / 2 - inkCenterY) * scale;
}

export function verticalNudgePxForInkToScreenTarget({ inkCenterY, naturalWidth, naturalHeight, imgRect, targetScreenY }) {
  if (inkCenterY == null || !naturalHeight || targetScreenY == null || !imgRect) return 0;
  const content = objectFitContainContentRect(imgRect, naturalWidth, naturalHeight);
  const inkY = inkScreenCenterY({ inkCenterY, naturalHeight, contentRect: content });
  if (inkY == null) return 0;
  return targetScreenY - inkY;
}

function centerThingLogoInk(img) {
  if (!img || img.dataset.tsLogoInkDone === '1') return;
  if (img.dataset.tsLogoInkQueued === '1') return;
  img.dataset.tsLogoInkQueued = '1';
  const run = () => {
    try {
      if (!img || img.dataset.tsLogoInkDone === '1') return;
      const chip = img.closest('[data-ts-logo-chip]');
      if (!chip) return;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (nw < 2 || nh < 2) return;
      const dispH = img.getBoundingClientRect().height;
      if (dispH < 2) return;
      const maxSide = 72;
      const side = Math.max(nw, nh);
      const sampleScale = side > maxSide ? maxSide / side : 1;
      const cw = Math.max(2, Math.round(nw * sampleScale));
      const ch = Math.max(2, Math.round(nh * sampleScale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      try {
        ctx.drawImage(img, 0, 0, cw, ch);
      } catch {
        img.dataset.tsLogoInkDone = '1';
        return;
      }
      let data;
      try {
        data = ctx.getImageData(0, 0, cw, ch).data;
      } catch {
        img.dataset.tsLogoInkDone = '1';
        return;
      }
      const corners = [[0, 0], [cw - 1, 0], [0, ch - 1], [cw - 1, ch - 1]];
      const bg = [0, 0, 0];
      for (let i = 0; i < 4; i += 1) {
        const p = (corners[i][1] * cw + corners[i][0]) * 4;
        bg[0] += data[p];
        bg[1] += data[p + 1];
        bg[2] += data[p + 2];
      }
      bg[0] /= 4;
      bg[1] /= 4;
      bg[2] /= 4;
      let minY = null;
      let maxY = null;
      const thr = 24;
      for (let y = 0; y < ch; y += 1) {
        for (let x = 0; x < cw; x += 1) {
          const k = (y * cw + x) * 4;
          const a = data[k + 3];
          if (a < 20) continue;
          const dr = Math.max(
            Math.abs(data[k] - bg[0]),
            Math.abs(data[k + 1] - bg[1]),
            Math.abs(data[k + 2] - bg[2]),
          );
          if (dr <= thr) continue;
          if (minY === null || y < minY) minY = y;
          if (maxY === null || y > maxY) maxY = y;
        }
      }
      if (minY === null || maxY === null) {
        img.dataset.tsLogoInkDone = '1';
        return;
      }
      const inkCySample = (minY + maxY) / 2;
      const inkCy = inkCySample / sampleScale;
      const imgRect = img.getBoundingClientRect();
      const row = img.closest('li[data-list-row]');
      const nameEl = row ? row.querySelector('[data-ts-list-row-name]') : null;
      let targetY = null;
      if (nameEl) {
        const firstText = [...nameEl.querySelectorAll('span,strong')].find(
          (e) => !e.children.length && String(e.textContent || '').trim(),
        );
        const label = firstText || nameEl.querySelector('strong') || nameEl;
        const nr = label.getBoundingClientRect();
        if (nr.height > 0) targetY = nr.top + nr.height / 2;
      }
      if (targetY == null) {
        const chipRect = chip.getBoundingClientRect();
        targetY = chipRect.top + chipRect.height / 2;
      }
      const ir = imgRect;
      const fitScale = Math.min(ir.width / nw, ir.height / nh);
      const fitH = nh * fitScale;
      const contentTop = ir.top + (ir.height - fitH) / 2;
      const inkScreenY = contentTop + (inkCy / nh) * fitH;
      const dy = targetY - inkScreenY;
      if (Math.abs(dy) > 0.01) img.style.transform = `translateY(${dy}px)`;
      img.dataset.tsLogoInkDone = '1';
    } catch {
      img.dataset.tsLogoInkDone = '1';
    } finally {
      delete img.dataset.tsLogoInkQueued;
    }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}

export function thingLogoInkCenterBundleSnippet() {
  const fn = centerThingLogoInk.toString().replace(/\s+/g, ' ').trim();
  const bodyFromOpen = fn.slice(fn.indexOf('('));
  return `function tsCenterThingLogoInk${bodyFromOpen}`;
}

const THING_LOGO_CHIP_DC_INK_PATCH = 'dc=({item:G,size:Re=28})=>{const zt=_l(G),ua=Pc(G);return n.jsxs("span",{"data-ts-logo-chip":"1","aria-hidden":"true",style:{width:Re,height:Re,minWidth:Re,borderRadius:9,background:"#f8fafc",border:"1px solid #e5e7eb",display:"inline-grid",placeItems:"center",position:"relative",overflow:"hidden",fontSize:Math.max(14,Math.round(Re*.62)),lineHeight:1,boxShadow:"0 1px 2px rgba(15,23,42,0.05)",boxSizing:"border-box"},children:zt?[n.jsx("img",{className:"tiny-logo",src:zt,alt:"",loading:"lazy",onError:Rn=>{Rn.currentTarget.style.display="none"},ref:Rn=>{if(Rn&&Rn.complete&&Rn.naturalWidth>1)tsCenterThingLogoInk(Rn)},onLoad:Rn=>{tsCenterThingLogoInk(Rn.currentTarget)},style:{maxWidth:"100%",maxHeight:"100%",width:"auto",height:"auto",objectFit:"contain",objectPosition:"center center",display:"block"}})]:[n.jsx("span",{style:{display:"grid",placeItems:"center",width:"100%",height:"100%",lineHeight:1},children:ua})]})}';

const THING_LOGO_INK_ANCHOR = 'function pze({places:e=[],dayPlaces:t=[]';

export function patchThingLogoInkCenterInBundle(js = '', dcNeedles = []) {
  let out = String(js || '');
  if (!out.includes('function tsCenterThingLogoInk(')) {
    if (!out.includes(THING_LOGO_INK_ANCHOR)) {
      throw new Error('trek bundle missing anchor for thing logo ink centering');
    }
    out = out.replace(THING_LOGO_INK_ANCHOR, `${thingLogoInkCenterBundleSnippet()}${THING_LOGO_INK_ANCHOR}`);
  }
  for (const needle of dcNeedles) {
    if (out.includes(needle)) {
      out = out.replace(needle, THING_LOGO_CHIP_DC_INK_PATCH);
      return out;
    }
  }
  if (!out.includes('tsCenterThingLogoInk(Rn.currentTarget)')) {
    throw new Error('trek bundle dc() logo chip ink patch did not apply');
  }
  return out;
}

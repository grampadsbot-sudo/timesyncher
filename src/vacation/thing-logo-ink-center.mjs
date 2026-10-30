import thingLogoInkOffsets from './thing-logo-ink-offsets.json' with { type: 'json' };

export function normalizeThingLogoUrl(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s, 'https://timesyncher.invalid/');
    return u.href.split('#')[0];
  } catch {
    return s;
  }
}

export function inkCenterYNaturalFromTable(table, src, naturalHeight) {
  const key = normalizeThingLogoUrl(src);
  const row = table && table[key];
  if (!row || row.nh < 2 || row.inkCy == null) return null;
  const nh = Number(naturalHeight) || row.nh;
  if (Math.abs(nh - row.nh) > 2) return (row.inkCy / row.nh) * nh;
  return row.inkCy;
}

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

export function listRowFirstNameLineCenterY(chip) {
  if (!chip) return null;
  const listRow = chip.closest('li[data-list-row], li[data-ts-list-row]');
  const nameEl = listRow ? listRow.querySelector('[data-ts-list-row-name]') : null;
  if (!nameEl) return null;
  const doc = nameEl.ownerDocument;
  const tw = doc.createTreeWalker(nameEl, NodeFilter.SHOW_TEXT);
  let nd;
  while ((nd = tw.nextNode())) {
    if (!String(nd.textContent || '').trim()) continue;
    const rg = doc.createRange();
    rg.selectNodeContents(nd);
    const rs = [...rg.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (rs.length) {
      const line = rs.sort((a, b) => a.top - b.top || a.left - b.left)[0];
      return line.top + line.height / 2;
    }
  }
  const nr = nameEl.getBoundingClientRect();
  if (nr.height > 0) return nr.top + nr.height / 2;
  return null;
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
      if (nw < 2 || nh < 2) {
        const fb = chip.querySelector('.tsv-logo-fallback');
        if (fb) centerThingLogoFallbackEl(fb);
        img.dataset.tsLogoInkDone = '1';
        return;
      }
      const src = img.currentSrc || img.src || '';
      const key = (() => {
        const s = String(src || '').trim();
        if (!s) return '';
        try {
          const u = new URL(s, document.baseURI || 'https://timesyncher.invalid/');
          return u.href.split('#')[0];
        } catch {
          return s;
        }
      })();
      const row = key && TS_LOGO_INK_CY ? TS_LOGO_INK_CY[key] : null;
      let inkCy = null;
      if (row && row.nh > 1 && row.inkCy != null) {
        inkCy = Math.abs(nh - row.nh) > 2 ? (row.inkCy / row.nh) * nh : row.inkCy;
      }
      if (inkCy == null) {
        const fb = chip.querySelector('.tsv-logo-fallback');
        if (fb) centerThingLogoFallbackEl(fb);
        img.dataset.tsLogoInkDone = '1';
        return;
      }
      const imgRect = img.getBoundingClientRect();
      let targetY = listRowFirstNameLineCenterY(chip);
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

function centerThingLogoFallbackEl(fb) {
  if (!fb || fb.dataset.tsLogoInkDone === '1') return;
  if (fb.dataset.tsLogoInkQueued === '1') return;
  fb.dataset.tsLogoInkQueued = '1';
  const run = () => {
    try {
      if (!fb || fb.dataset.tsLogoInkDone === '1') return;
      const chip = fb.closest('[data-ts-logo-chip]');
      if (!chip) return;
      const listRow = chip.closest('li[data-list-row], li[data-ts-list-row]');
      const cat = String(listRow?.getAttribute('data-thing-category') || '').toLowerCase();
      if (cat !== 'car' && cat !== 'flight') {
        fb.style.transform = 'translateY(-2.5px)';
        fb.dataset.tsLogoInkDone = '1';
        return;
      }
      const chipRect = chip.getBoundingClientRect();
      if (chipRect.height < 1) return;
      let targetY = listRowFirstNameLineCenterY(chip);
      if (targetY == null) targetY = chipRect.top + chipRect.height / 2;
      const glyphRect = fb.getBoundingClientRect();
      const glyphCy = glyphRect.top + glyphRect.height / 2;
      let dy = targetY - glyphCy;
      if (cat === 'car') dy -= 3;
      if (Math.abs(dy) > 0.01) fb.style.transform = `translateY(${dy}px)`;
      fb.dataset.tsLogoInkDone = '1';
    } catch {
      fb.dataset.tsLogoInkDone = '1';
    } finally {
      delete fb.dataset.tsLogoInkQueued;
    }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}

function minifyFn(fn) {
  return fn.toString().replace(/\s+/g, ' ').trim();
}

const BUNDLE_INK_RUNTIME_FNS = [
  inkBboxCenterYFromRgba,
  listRowFirstNameLineCenterY,
  centerThingLogoInk,
  centerThingLogoFallbackEl,
];

const BUNDLE_INK_RENAMES = [
  ['function inkBboxCenterYFromRgba', 'function tsInkBboxCenterYFromRgba'],
  ['function listRowFirstNameLineCenterY', 'function tsListRowFirstNameLineCenterY'],
  ['function centerThingLogoInk', 'function tsCenterThingLogoInk'],
  ['function centerThingLogoFallbackEl', 'function tsCenterThingLogoFallbackEl'],
  ['inkBboxCenterYFromRgba(', 'tsInkBboxCenterYFromRgba('],
  ['listRowFirstNameLineCenterY(', 'tsListRowFirstNameLineCenterY('],
  ['centerThingLogoFallbackEl(', 'tsCenterThingLogoFallbackEl('],
];

export function thingLogoInkCenterBundleSnippet(offsetTable = thingLogoInkOffsets) {
  const tableJson = JSON.stringify(offsetTable || {});
  let body = BUNDLE_INK_RUNTIME_FNS.map((fn) => minifyFn(fn)).join(' ');
  for (const [from, to] of BUNDLE_INK_RENAMES) body = body.split(from).join(to);
  return `const TS_LOGO_INK_CY=${tableJson};${body}`;
}

const THING_LOGO_CHIP_DC_INK_PATCH = 'dc=({item:G,size:Re=28})=>{const zt=_l(G),ua=Pc(G);return n.jsxs("span",{"data-ts-logo-chip":"1","aria-hidden":"true",style:{width:Re,height:Re,minWidth:Re,borderRadius:9,background:"#f8fafc",border:"1px solid #e5e7eb",display:"inline-grid",placeItems:"center",position:"relative",overflow:"hidden",fontSize:Math.max(14,Math.round(Re*.62)),lineHeight:1,boxShadow:"0 1px 2px rgba(15,23,42,0.05)",boxSizing:"border-box"},children:[n.jsx("span",{className:"tsv-logo-fallback",ref:Rn=>{Rn&&tsCenterThingLogoFallbackEl(Rn)},style:{display:"grid",placeItems:"center",width:"100%",height:"100%",lineHeight:1,gridArea:"1/1"},children:ua}),zt?n.jsx("img",{className:"tiny-logo",src:zt,alt:"",loading:"lazy",onError:Rn=>{const ua=Rn.currentTarget;ua.style.display="none";const Xi=ua.closest("[data-ts-logo-chip]"),ts=Xi&&Xi.querySelector(".tsv-logo-fallback");ts&&tsCenterThingLogoFallbackEl(ts)},ref:Rn=>{if(!Rn||!Rn.complete)return;if(Rn.naturalWidth>1)tsCenterThingLogoInk(Rn);else{const ua=Rn.closest("[data-ts-logo-chip]"),ts=ua&&ua.querySelector(".tsv-logo-fallback");ts&&tsCenterThingLogoFallbackEl(ts)}},onLoad:Rn=>{tsCenterThingLogoInk(Rn.currentTarget)},style:{maxWidth:"100%",maxHeight:"100%",width:"auto",height:"auto",objectFit:"contain",objectPosition:"center center",display:"block",gridArea:"1/1",background:"#f8fafc"}}):null]})}';

const THING_LOGO_INK_ANCHOR = 'function pze({places:e=[],dayPlaces:t=[]';

export function patchThingLogoInkCenterInBundle(js = '', dcNeedles = []) {
  let out = String(js || '');
  const table = thingLogoInkOffsets;
  const snippet = thingLogoInkCenterBundleSnippet(table);
  if (!out.includes('function tsCenterThingLogoInk(')) {
    if (!out.includes(THING_LOGO_INK_ANCHOR)) {
      throw new Error('trek bundle missing anchor for thing logo ink centering');
    }
    out = out.replace(THING_LOGO_INK_ANCHOR, `${snippet}${THING_LOGO_INK_ANCHOR}`);
  } else if (!out.includes('const TS_LOGO_INK_CY=')) {
    out = out.replace(/function tsCenterThingLogoInk\([^)]*\)\{[\s\S]*?\}(?=function )/, snippet);
    if (!out.includes('const TS_LOGO_INK_CY=')) {
      const prefix = snippet.split('function tsCenterThingLogoInk')[0];
      out = out.replace('function tsCenterThingLogoInk(', `${prefix}function tsCenterThingLogoInk(`);
    }
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
  if (!out.includes('tsCenterThingLogoFallbackEl(')) {
    throw new Error('trek bundle dc() emoji fallback name-line center patch did not apply');
  }
  return out;
}

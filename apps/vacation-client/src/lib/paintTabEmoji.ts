
function backdropRgb(node: HTMLElement): [number, number, number] {
  let el: HTMLElement | null = node;
  while (el) {
    const raw = getComputedStyle(el).backgroundColor;
    const match = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (match && (match[4] == null || Number(match[4]) >= 0.05)) {
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    el = el.parentElement;
  }
  return [255, 255, 255];
}

function compositedInkOffsetY(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  cssHeight: number,
  bg: [number, number, number],
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  if (!width || !height) return 0;
  const img = ctx.getImageData(0, 0, width, height);
  let sum = 0;
  let mass = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const cover = img.data[i + 3] / 255;
      if (cover <= 0) continue;
      const r = img.data[i] * cover + bg[0] * (1 - cover);
      const g = img.data[i + 1] * cover + bg[1] * (1 - cover);
      const b = img.data[i + 2] * cover + bg[2] * (1 - cover);
      const dist = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
      if (dist < 18) continue;
      const weight = dist * cover;
      sum += y * weight;
      mass += weight;
    }
  }
  if (!mass) return 0;
  return sum / mass / dpr - cssHeight / 2;
}

function settleShift(
  paint: (shift: number) => void,
  offsetAt: () => number,
  target: number,
) {
  let best = target;
  let bestAbs = Number.POSITIVE_INFINITY;
  const score = (shift: number) => {
    paint(shift);
    const err = offsetAt() - target;
    const abs = Math.abs(err);
    if (abs < bestAbs) {
      bestAbs = abs;
      best = shift;
    }
    return err;
  };
  for (let shift = target - 2; shift <= target + 2.001; shift += 0.25) score(shift);
  const err = score(best);
  score(best - err);
  paint(best);
  return offsetAt();
}

function labelInkOffsetY(label: HTMLElement) {
  const sample = document.createElement('canvas');
  const cssHeight = 32;
  const cssWidth = 96;
  const dpr = window.devicePixelRatio || 1;
  sample.width = cssWidth * dpr;
  sample.height = cssHeight * dpr;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  const cs = getComputedStyle(label);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const row = (label.textContent || '').trim().slice(0, 18);
  if (!row) return 0;
  ctx.fillText(row, 2, cssHeight / 2);
  return compositedInkOffsetY(ctx, dpr, cssHeight, [255, 255, 255]);
}

export function paintAlignedEmoji(
  node: HTMLCanvasElement,
  emoji: string,
  cssSize: number,
  label: HTMLElement | null = null,
  bias = 0,
) {
  if (!node || !emoji) return;
  const dpr = window.devicePixelRatio || 1;
  node.width = cssSize * dpr;
  node.height = cssSize * dpr;
  const ctx = node.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const cs = getComputedStyle(node);
  const fontSize = Math.max(10, cssSize - 4);
  const font = `${cs.fontWeight || '600'} ${fontSize}px ${cs.fontFamily}`;
  const visible = label && getComputedStyle(label).display !== 'none' ? label : null;
  const target = (visible ? labelInkOffsetY(visible) : 0) + bias;
  const bg = backdropRgb(node);
  const paint = (shift: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize, cssSize);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cssSize / 2, cssSize / 2 + shift);
  };
  const placed = settleShift(
    (shift) => {
      paint(shift);
      node.toDataURL();
    },
    () => compositedInkOffsetY(ctx, dpr, cssSize, bg),
    target,
  );
  return placed;
}

function paintLabelInk(label: HTMLElement, iconOffset: number) {
  const button = label.closest('button');
  if (!button || getComputedStyle(label).display === 'none') {
    label.style.color = '';
    label.querySelector('canvas.tsv-tab-label-ink')?.remove();
    return;
  }
  const text = (label.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return;
  const color = getComputedStyle(button).color;
  const bg = backdropRgb(button);
  const box = label.getBoundingClientRect();
  const cssW = box.width;
  const cssH = box.height;
  if (cssW < 1 || cssH < 1) return;
  const dpr = window.devicePixelRatio || 1;
  let canvas = label.querySelector('canvas.tsv-tab-label-ink') as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'tsv-tab-label-ink';
    canvas.setAttribute('aria-hidden', 'true');
    label.appendChild(canvas);
  }
  canvas.width = Math.max(1, Math.ceil(cssW * dpr));
  canvas.height = Math.max(1, Math.ceil(cssH * dpr));
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  label.style.position = 'relative';
  label.style.color = 'transparent';
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const font = `${getComputedStyle(label).fontWeight} ${getComputedStyle(label).fontSize} ${getComputedStyle(label).fontFamily}`;
  const paint = (shift: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, cssH / 2 + shift);
    canvas.toDataURL();
  };
  settleShift(paint, () => compositedInkOffsetY(ctx, dpr, cssH, bg), iconOffset);
}

const RIGID_TABS = new Set(['day-by-day', 'flights', 'budget']);

const INK_CHANNEL_DELTA = 24;

export function inkBBoxCentre(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bg: [number, number, number],
): { cx: number; cy: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const cover = data[i + 3] / 255;
      if (cover <= 0) continue;
      const r = data[i] * cover + bg[0] * (1 - cover);
      const g = data[i + 1] * cover + bg[1] * (1 - cover);
      const b = data[i + 2] * cover + bg[2] * (1 - cover);
      const delta = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
      if (delta <= INK_CHANNEL_DELTA) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { cx: (minX + maxX + 1) / 2, cy: (minY + maxY + 1) / 2 };
}

export function settleCentreShift(
  paint: (shiftX: number, shiftY: number) => void,
  measure: () => { x: number; y: number },
): { x: number; y: number } {
  let bestX = 0;
  let bestY = 0;
  let bestAbsY = Number.POSITIVE_INFINITY;
  let bestAbsX = Number.POSITIVE_INFINITY;
  let bestMag = Number.POSITIVE_INFINITY;
  const consider = (shiftX: number, shiftY: number) => {
    paint(shiftX, shiftY);
    const off = measure();
    const absY = Math.abs(off.y);
    const absX = Math.abs(off.x);
    const mag = Math.abs(shiftX) + Math.abs(shiftY);
    const yWin = absY < bestAbsY - 1e-6;
    const yTie = Math.abs(absY - bestAbsY) <= 1e-6;
    const xWin = absX < bestAbsX - 1e-6;
    const xTie = Math.abs(absX - bestAbsX) <= 1e-6;
    if (yWin || (yTie && (xWin || (xTie && mag < bestMag)))) {
      bestAbsY = absY;
      bestAbsX = absX;
      bestMag = mag;
      bestX = shiftX;
      bestY = shiftY;
    }
  };
  const scan = (axis: 'x' | 'y') => {
    const fixedX = bestX;
    const fixedY = bestY;
    for (let shift = -4; shift <= 4.001; shift += 0.25) {
      if (axis === 'y') consider(fixedX, shift);
      else consider(shift, fixedY);
    }
  };
  scan('y');
  scan('x');
  scan('y');
  paint(bestX, bestY);
  return { x: bestX, y: bestY };
}

function centreContainer(node: HTMLElement): HTMLElement {
  if (node.closest('[data-ts-category-tab-icon]')) {
    return (node.closest('button') as HTMLElement | null) || node;
  }
  return (node.closest('.tsv-logo-chip') as HTMLElement | null) || node;
}

function targetInCanvas(node: HTMLCanvasElement, cssW: number, cssH: number) {
  const container = centreContainer(node);
  const canvasBox = node.getBoundingClientRect();
  const box = container.getBoundingClientRect();
  if (canvasBox.width < 1 || canvasBox.height < 1 || box.width < 1 || box.height < 1) {
    return { x: cssW / 2, y: cssH / 2 };
  }
  return {
    x: box.left + box.width / 2 - canvasBox.left,
    y: box.top + box.height / 2 - canvasBox.top,
  };
}

export function paintCenteredEmoji(
  node: HTMLCanvasElement,
  emoji: string,
  cssSize: number,
  fontPx = Math.max(10, cssSize - 4),
) {
  if (!node || !emoji || cssSize < 1) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = cssSize;
  const cssH = cssSize;
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  node.width = bw;
  node.height = bh;
  const ctx = node.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const scaleX = bw / cssW;
  const scaleY = bh / cssH;
  const cs = getComputedStyle(node);
  const font = `${cs.fontWeight || '600'} ${fontPx}px ${cs.fontFamily}`;
  const bg = backdropRgb(centreContainer(node));
  const target = targetInCanvas(node, cssW, cssH);
  const paint = (shiftX: number, shiftY: number) => {
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cssW / 2 + shiftX, cssH / 2 + shiftY);
    node.toDataURL();
  };
  const measure = () => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    if (!width || !height) return { x: 0, y: 0 };
    const img = ctx.getImageData(0, 0, width, height);
    const centre = inkBBoxCentre(img.data, width, height, bg);
    if (!centre) return { x: 100, y: 100 };
    return {
      x: (centre.cx * cssW) / width - target.x,
      y: (centre.cy * cssH) / height - target.y,
    };
  };
  settleCentreShift(paint, measure);
}

function screenshotInkOffsetY(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  cssHeight: number,
  bg: [number, number, number],
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  if (!width || !height) return 0;
  const src = ctx.getImageData(0, 0, width, height);
  const pixels = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const cover = src.data[i + 3] / 255;
    pixels[i] = src.data[i] * cover + bg[0] * (1 - cover);
    pixels[i + 1] = src.data[i + 1] * cover + bg[1] * (1 - cover);
    pixels[i + 2] = src.data[i + 2] * cover + bg[2] * (1 - cover);
    pixels[i + 3] = 255;
  }
  const at = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const backdrop = corners
    .reduce((acc, pixel) => [acc[0] + pixel[0], acc[1] + pixel[1], acc[2] + pixel[2]], [0, 0, 0])
    .map((value) => value / corners.length);
  let sum = 0;
  let mass = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const dist =
        Math.abs(pixels[i] - backdrop[0]) +
        Math.abs(pixels[i + 1] - backdrop[1]) +
        Math.abs(pixels[i + 2] - backdrop[2]);
      if (dist < 18) continue;
      sum += y * dist;
      mass += dist;
    }
  }
  if (!mass) return 0;
  return sum / mass / dpr - cssHeight / 2;
}

function blitCenteredLabel(label: HTMLElement) {
  const button = label.closest('button');
  if (!button || getComputedStyle(label).display === 'none') {
    label.style.color = '';
    label.querySelector('canvas.tsv-tab-label-ink')?.remove();
    return;
  }
  const text = (label.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return;
  const color = getComputedStyle(button).color;
  const bg = backdropRgb(button);
  const box = label.getBoundingClientRect();
  const cssW = box.width;
  const cssH = box.height;
  if (cssW < 1 || cssH < 1) return;
  const dpr = window.devicePixelRatio || 1;
  const pad = 8;
  const sampleH = cssH + pad * 2;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(cssW * dpr));
  off.height = Math.max(1, Math.ceil(sampleH * dpr));
  const offCtx = off.getContext('2d', { willReadFrequently: true });
  if (!offCtx) return;
  const font = `${getComputedStyle(label).fontWeight} ${getComputedStyle(label).fontSize} ${getComputedStyle(label).fontFamily}`;
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  offCtx.clearRect(0, 0, cssW, sampleH);
  offCtx.font = font;
  offCtx.fillStyle = color;
  offCtx.textAlign = 'left';
  offCtx.textBaseline = 'middle';
  offCtx.fillText(text, 0, sampleH / 2);
  const com = screenshotInkOffsetY(offCtx, dpr, sampleH, bg);
  let canvas = label.querySelector('canvas.tsv-tab-label-ink') as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'tsv-tab-label-ink';
    canvas.setAttribute('aria-hidden', 'true');
    label.appendChild(canvas);
  }
  canvas.width = Math.max(1, Math.ceil(cssW * dpr));
  canvas.height = Math.max(1, Math.ceil(cssH * dpr));
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  label.style.position = 'relative';
  label.style.color = 'transparent';
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const destH = canvas.height;
  const inkDeviceY = (sampleH / 2 + com) * dpr;
  const sy = inkDeviceY - destH / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(off, 0, sy, off.width, destH, 0, 0, canvas.width, destH);
  canvas.toDataURL();
}

export function paintTabEmoji(node: HTMLCanvasElement, emoji: string) {
  if (!node || !emoji) return;
  const chip = node.closest('[data-ts-category-tab-icon]') as HTMLElement | null;
  if (chip) {
    chip.style.setProperty('display', 'inline-flex', 'important');
    chip.style.setProperty('align-items', 'center', 'important');
    chip.style.setProperty('justify-content', 'center', 'important');
    chip.style.setProperty('line-height', '1', 'important');
    chip.style.setProperty('position', 'relative', 'important');
    chip.style.setProperty('top', '0px', 'important');
    chip.style.setProperty('align-self', 'center', 'important');
    const font = getComputedStyle(chip);
    node.style.fontFamily = font.fontFamily;
    node.style.fontSize = font.fontSize;
    node.style.fontWeight = font.fontWeight;
  }
  const btn = chip?.closest('button') as HTMLButtonElement | null;
  if (btn) {
    btn.style.alignItems = 'center';
    btn.style.lineHeight = '1';
    const label = [...btn.children].find((n) => n !== chip && !n.hasAttribute('data-ts-logo-chip')) as
      | HTMLElement
      | undefined;
    if (label) {
      label.style.lineHeight = '1';
      if (getComputedStyle(label).display !== 'none') {
        label.style.alignItems = 'center';
        label.style.verticalAlign = 'middle';
      }
    }
  }
  const tabId = chip?.getAttribute('data-tab-category') || '';
  paintCenteredEmoji(node, emoji, 16);
  if (!btn) return;
  const label = [...btn.children].find((n) => n !== chip && !n.hasAttribute('data-ts-logo-chip')) as
    | HTMLElement
    | undefined;
  if (!label) return;
  if (RIGID_TABS.has(tabId)) blitCenteredLabel(label);
  else paintLabelInk(label, 0);
}

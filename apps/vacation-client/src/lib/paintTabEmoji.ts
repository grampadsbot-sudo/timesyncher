
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

function blitCenteredEmoji(node: HTMLCanvasElement, emoji: string, cssSize: number) {
  const dpr = window.devicePixelRatio || 1;
  const pad = 12;
  const box = cssSize + pad * 2;
  const off = document.createElement('canvas');
  off.width = Math.ceil(box * dpr);
  off.height = Math.ceil(box * dpr);
  const offCtx = off.getContext('2d', { willReadFrequently: true });
  if (!offCtx) return 0;
  const font = getComputedStyle(node);
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  offCtx.clearRect(0, 0, box, box);
  offCtx.font = `${font.fontWeight || '600'} ${Math.max(10, cssSize - 4)}px ${font.fontFamily}`;
  offCtx.textAlign = 'center';
  offCtx.textBaseline = 'middle';
  offCtx.fillText(emoji, box / 2, box / 2);
  const bg = backdropRgb(node);
  const com = screenshotInkOffsetY(offCtx, dpr, box, bg);
  node.width = Math.ceil(cssSize * dpr);
  node.height = Math.ceil(cssSize * dpr);
  const ctx = node.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  const destH = node.height;
  const inkDeviceY = (box / 2 + com) * dpr;
  const sy = inkDeviceY - destH / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, node.width, node.height);
  ctx.drawImage(off, 0, sy, off.width, destH, 0, 0, node.width, destH);
  node.toDataURL();
  return screenshotInkOffsetY(ctx, dpr, cssSize, bg);
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
  if (RIGID_TABS.has(tabId)) {
    blitCenteredEmoji(node, emoji, 16);
    if (btn) {
      const label = [...btn.children].find((n) => n !== chip && !n.hasAttribute('data-ts-logo-chip')) as
        | HTMLElement
        | undefined;
      if (label) blitCenteredLabel(label);
    }
    return;
  }
  const iconOffset = paintAlignedEmoji(node, emoji, 16, null, 0) ?? 0;
  if (btn) {
    const label = [...btn.children].find((n) => n !== chip && !n.hasAttribute('data-ts-logo-chip')) as
      | HTMLElement
      | undefined;
    if (label) paintLabelInk(label, iconOffset);
  }
}

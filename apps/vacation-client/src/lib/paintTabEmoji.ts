
function inkOffsetY(ctx: CanvasRenderingContext2D, dpr: number, cssHeight: number) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, width, height);
  let sum = 0;
  let mass = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = img.data[(y * width + x) * 4 + 3];
      if (a < 20) continue;
      sum += y * a;
      mass += a;
    }
  }
  if (!mass) return 0;
  return sum / mass / dpr - cssHeight / 2;
}

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

function colorInkOffsetY(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  cssHeight: number,
  bg: [number, number, number],
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, width, height);
  let sum = 0;
  let mass = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const a = img.data[i + 3];
      if (a < 16) continue;
      const cover = a / 255;
      const r = img.data[i] * cover + bg[0] * (1 - cover);
      const g = img.data[i + 1] * cover + bg[1] * (1 - cover);
      const b = img.data[i + 2] * cover + bg[2] * (1 - cover);
      const dist = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
      if (dist < 18) continue;
      sum += y * dist;
      mass += dist;
    }
  }
  if (!mass) return 0;
  return sum / mass / dpr - cssHeight / 2;
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
  return inkOffsetY(ctx, dpr, cssHeight);
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
  const font = `${cs.fontWeight || '600'} ${cs.fontSize || '16px'} ${cs.fontFamily}`;
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
  let best = target;
  let bestAbs = Number.POSITIVE_INFINITY;
  const score = (shift: number) => {
    paint(shift);
    node.toDataURL();
    const err = Math.abs(colorInkOffsetY(ctx, dpr, cssSize, bg) - target);
    if (err < bestAbs) {
      bestAbs = err;
      best = shift;
    }
  };
  for (let step = -4; step <= 4.001; step += 0.5) score(target + step);
  paint(best);
  node.toDataURL();
  return colorInkOffsetY(ctx, dpr, cssSize, bg);
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
  let best = 0;
  let bestAbs = Number.POSITIVE_INFINITY;
  for (let shift = -2; shift <= 3.001; shift += 0.25) {
    paint(shift);
    const err = Math.abs(colorInkOffsetY(ctx, dpr, cssH, bg) - iconOffset);
    if (err < bestAbs) {
      bestAbs = err;
      best = shift;
    }
  }
  paint(best);
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
  const iconOffset = paintAlignedEmoji(node, emoji, 16, null, 0) ?? 0;
  if (btn) {
    const label = [...btn.children].find((n) => n !== chip && !n.hasAttribute('data-ts-logo-chip')) as
      | HTMLElement
      | undefined;
    if (label) paintLabelInk(label, iconOffset);
  }
}

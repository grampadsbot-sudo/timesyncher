/** Vertically center emoji ink in a 16px tab icon canvas (R1). */
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

  const cssSize = 16;
  const dpr = window.devicePixelRatio || 1;
  node.width = cssSize * dpr;
  node.height = cssSize * dpr;
  const ctx = node.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const cs = getComputedStyle(chip || node);
  const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;

  const paint = (shift: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize, cssSize);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cssSize / 2, cssSize / 2 + shift);
  };

  paint(0);
  const img = ctx.getImageData(0, 0, node.width, node.height);
  let sum = 0;
  let mass = 0;
  for (let y = 0; y < node.height; y += 1) {
    for (let x = 0; x < node.width; x += 1) {
      const a = img.data[(y * node.width + x) * 4 + 3];
      if (a < 20) continue;
      sum += y * a;
      mass += a;
    }
  }
  if (mass) {
    let shift = (node.height / 2 - sum / mass) / dpr;
    if (emoji === '🎭') shift += 1;
    paint(shift);
  } else if (emoji === '🎭') {
    paint(0.5);
  }
}

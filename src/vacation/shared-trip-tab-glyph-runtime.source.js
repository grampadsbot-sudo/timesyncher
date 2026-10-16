function tsBackdropRgb(node) {
  var el = node;
  while (el) {
    var raw = getComputedStyle(el).backgroundColor;
    var match = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (match && (match[4] == null || Number(match[4]) >= 0.05)) {
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    el = el.parentElement;
  }
  return [255, 255, 255];
}

function tsScreenshotInkOffsetY(ctx, dpr, cssHeight, bg) {
  var width = ctx.canvas.width;
  var height = ctx.canvas.height;
  if (!width || !height) return 0;
  var src = ctx.getImageData(0, 0, width, height);
  var pixels = new Uint8ClampedArray(src.data.length);
  for (var i = 0; i < src.data.length; i += 4) {
    var cover = src.data[i + 3] / 255;
    pixels[i] = src.data[i] * cover + bg[0] * (1 - cover);
    pixels[i + 1] = src.data[i + 1] * cover + bg[1] * (1 - cover);
    pixels[i + 2] = src.data[i + 2] * cover + bg[2] * (1 - cover);
    pixels[i + 3] = 255;
  }
  function at(x, y) {
    var j = (y * width + x) * 4;
    return [pixels[j], pixels[j + 1], pixels[j + 2]];
  }
  var corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  var backdrop = corners
    .reduce(function (acc, pixel) {
      return [acc[0] + pixel[0], acc[1] + pixel[1], acc[2] + pixel[2]];
    }, [0, 0, 0])
    .map(function (value) {
      return value / corners.length;
    });
  var sum = 0;
  var mass = 0;
  for (var y = 0; y < height; y += 1) {
    for (var x = 0; x < width; x += 1) {
      var k = (y * width + x) * 4;
      var dist =
        Math.abs(pixels[k] - backdrop[0]) +
        Math.abs(pixels[k + 1] - backdrop[1]) +
        Math.abs(pixels[k + 2] - backdrop[2]);
      if (dist < 18) continue;
      sum += y * dist;
      mass += dist;
    }
  }
  if (!mass) return 0;
  return sum / mass / dpr - cssHeight / 2;
}

function tsBlitCenteredEmoji(node, emoji, cssSize) {
  var dpr = window.devicePixelRatio || 1;
  var pad = 12;
  var box = cssSize + pad * 2;
  var off = document.createElement('canvas');
  off.width = Math.ceil(box * dpr);
  off.height = Math.ceil(box * dpr);
  var offCtx = off.getContext('2d', { willReadFrequently: true });
  if (!offCtx) return 0;
  var font = getComputedStyle(node);
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  offCtx.clearRect(0, 0, box, box);
  offCtx.font = (font.fontWeight || '600') + ' ' + Math.max(10, cssSize - 4) + 'px ' + font.fontFamily;
  offCtx.textAlign = 'center';
  offCtx.textBaseline = 'middle';
  offCtx.fillText(emoji, box / 2, box / 2);
  var bg = tsBackdropRgb(node);
  var com = tsScreenshotInkOffsetY(offCtx, dpr, box, bg);
  node.width = Math.ceil(cssSize * dpr);
  node.height = Math.ceil(cssSize * dpr);
  var ctx = node.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  var destH = node.height;
  var inkDeviceY = (box / 2 + com) * dpr;
  var sy = inkDeviceY - destH / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, node.width, node.height);
  ctx.drawImage(off, 0, sy, off.width, destH, 0, 0, node.width, destH);
  node.toDataURL();
  return tsScreenshotInkOffsetY(ctx, dpr, cssSize, bg);
}

function tsBlitCenteredLabel(label) {
  var button = label.closest('button');
  if (!button || getComputedStyle(label).display === 'none') {
    label.style.color = '';
    var old = label.querySelector('canvas.tsv-tab-label-ink');
    if (old) old.remove();
    return;
  }
  var text = (label.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return;
  var color = getComputedStyle(button).color;
  var bg = tsBackdropRgb(button);
  var box = label.getBoundingClientRect();
  var cssW = box.width;
  var cssH = box.height;
  if (cssW < 1 || cssH < 1) return;
  var dpr = window.devicePixelRatio || 1;
  var pad = 8;
  var sampleH = cssH + pad * 2;
  var off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(cssW * dpr));
  off.height = Math.max(1, Math.ceil(sampleH * dpr));
  var offCtx = off.getContext('2d', { willReadFrequently: true });
  if (!offCtx) return;
  var font =
    getComputedStyle(label).fontWeight +
    ' ' +
    getComputedStyle(label).fontSize +
    ' ' +
    getComputedStyle(label).fontFamily;
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  offCtx.clearRect(0, 0, cssW, sampleH);
  offCtx.font = font;
  offCtx.fillStyle = color;
  offCtx.textAlign = 'left';
  offCtx.textBaseline = 'middle';
  offCtx.fillText(text, 0, sampleH / 2);
  var com = tsScreenshotInkOffsetY(offCtx, dpr, sampleH, bg);
  var canvas = label.querySelector('canvas.tsv-tab-label-ink');
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
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  var destH = canvas.height;
  var inkDeviceY = (sampleH / 2 + com) * dpr;
  var sy = inkDeviceY - destH / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(off, 0, sy, off.width, destH, 0, 0, canvas.width, destH);
  canvas.toDataURL();
}

function tsPaintTabEmoji(node, emoji) {
  if (!node || !emoji) return;
  var chip = node.closest('[data-ts-category-tab-icon]') || node.parentElement;
  if (chip) {
    chip.style.setProperty('display', 'inline-flex', 'important');
    chip.style.setProperty('align-items', 'center', 'important');
    chip.style.setProperty('justify-content', 'center', 'important');
    chip.style.setProperty('line-height', '1', 'important');
    chip.style.setProperty('position', 'relative', 'important');
    chip.style.setProperty('top', '0px', 'important');
    chip.style.setProperty('align-self', 'center', 'important');
    chip.style.setProperty('background', '#ffffff', 'important');
    chip.style.setProperty('box-sizing', 'border-box', 'important');
    var chipFont = getComputedStyle(chip);
    node.style.fontFamily = chipFont.fontFamily;
    node.style.fontSize = chipFont.fontSize;
    node.style.fontWeight = chipFont.fontWeight;
  }
  var btn = chip && chip.closest('button');
  if (btn) {
    btn.style.alignItems = 'center';
    btn.style.lineHeight = '1';
    var label = []
      .slice.call(btn.children)
      .filter(function (n) {
        return n !== chip && !n.hasAttribute('data-ts-logo-chip');
      })[0];
    if (label) {
      label.style.lineHeight = '1';
      if (getComputedStyle(label).display !== 'none') {
        label.style.alignItems = 'center';
        label.style.verticalAlign = 'middle';
      }
    }
  }
  var emojiWrap = node.parentElement;
  if (emojiWrap && emojiWrap.getAttribute('data-ts-tab-emoji') === '1') {
    emojiWrap.style.display = 'inline-flex';
    emojiWrap.style.alignItems = 'center';
    emojiWrap.style.justifyContent = 'center';
    emojiWrap.style.width = '100%';
    emojiWrap.style.height = '100%';
    emojiWrap.style.lineHeight = '1';
  }
  var cssSize = 16;
  var chipBox = chip && chip.getBoundingClientRect();
  if (chipBox && chipBox.width > 0) cssSize = chipBox.width;
  tsBlitCenteredEmoji(node, emoji, cssSize);
  if (btn) {
    var labelBlit = []
      .slice.call(btn.children)
      .filter(function (n) {
        return n !== chip && !n.hasAttribute('data-ts-logo-chip');
      })[0];
    if (labelBlit) tsBlitCenteredLabel(labelBlit);
  }
}

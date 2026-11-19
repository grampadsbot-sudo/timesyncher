import { inflateSync } from 'node:zlib';
import { assertThrowaway } from './protected.mjs';

export const ONBOARDING_SCREENS = [
  { id: 'homepage', title: 'Homepage' },
  { id: 'checkout-contact', title: 'Checkout step 1 contact' },
  { id: 'checkout-payment', title: 'Checkout step 2 payment' },
  { id: 'order-success', title: 'Order success' },
  { id: 'purchase-email', title: 'Purchase email' },
  { id: 'app-entry', title: 'App entry' },
  { id: 'terms-gate', title: 'Terms gate' },
  { id: 'welcome', title: 'Welcome messages' },
  { id: 'first-talk', title: 'First talk screen' },
];

export const ONBOARDING_WIDTHS = [390, 430];
export const ONBOARDING_ENGINE = 'webkit';

export function onboardingLabel(id, width) {
  return `onboarding ${id} ${width}`;
}

function laterLabel(file) {
  const name = String(file || '').split(/[\\/]/).pop().replace(/\.png$/i, '');
  return `later ${name}`;
}

export function refusedOnboardingTarget(value) {
  const text = String(value || '');
  if (/8CQX/i.test(text) || /d0463815/i.test(text)) return 'protected-target';
  if (/(?:share|slug|trip(?:id)?|session)[^a-z0-9]{0,12}99(?:[^0-9]|$)/i.test(text)) return 'protected-target';
  return '';
}

export function assertOnboardingCustomer(customer) {
  assertThrowaway({
    name: customer?.name,
    displayName: customer?.name,
    email: customer?.email,
  });
  const reason = refusedOnboardingTarget(`${customer?.email || ''} ${customer?.name || ''}`);
  if (reason) throw new Error(`refused: ${reason}`);
  return customer;
}

function unfilterPng(buffer) {
  if (!buffer || buffer.length < 32 || buffer[0] !== 0x89) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  if (buffer[24] !== 8 || (colorType !== 2 && colorType !== 6) || width < 1 || height < 1) return null;
  const channels = colorType === 6 ? 4 : 3;
  let offset = 8;
  const parts = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') parts.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!parts.length) return null;
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const rows = [];
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const row = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const up = y ? rows[y - 1][index] : 0;
      const upLeft = y && index >= channels ? rows[y - 1][index - channels] : 0;
      let value = raw[cursor];
      cursor += 1;
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(up - upLeft);
        const pb = Math.abs(left - upLeft);
        const pc = Math.abs(left + up - 2 * upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = (value + predictor) & 255;
      }
      row[index] = value;
    }
    rows.push(row);
  }
  return { width, height, channels, rows };
}

export function shotBlank(buffer) {
  let parsed;
  try {
    parsed = unfilterPng(buffer);
  } catch {
    return true;
  }
  if (!parsed || parsed.width < 8 || parsed.height < 8) return true;
  const colors = new Set();
  for (let y = 0; y < parsed.height; y += 2) {
    const row = parsed.rows[y];
    for (let x = 0; x < parsed.width; x += 2) {
      const index = x * parsed.channels;
      colors.add(`${row[index]},${row[index + 1]},${row[index + 2]}`);
      if (x + 1 < parsed.width) {
        const next = (x + 1) * parsed.channels;
        colors.add(`${row[next]},${row[next + 1]},${row[next + 2]}`);
      }
      if (colors.size > 1) return false;
    }
  }
  return true;
}

export function orderCustomerPages(shots, laterFiles = []) {
  const pages = [];
  for (const screen of ONBOARDING_SCREENS) {
    for (const width of ONBOARDING_WIDTHS) {
      const shot = (shots || []).find((item) => item.id === screen.id && item.width === width);
      if (!shot?.file || shot.missing || shot.blank || shot.gap) continue;
      pages.push({ label: onboardingLabel(screen.id, width), image: shot.file });
    }
  }
  for (const file of laterFiles || []) {
    if (!file) continue;
    pages.push({ label: laterLabel(file), image: file });
  }
  return pages;
}

export function assessOnboardingScreens({ shots = [], pdfText = '', termsClick = '' } = {}) {
  const gaps = [];
  for (const screen of ONBOARDING_SCREENS) {
    for (const width of ONBOARDING_WIDTHS) {
      const shot = shots.find((item) => item.id === screen.id && item.width === width);
      if (shot?.gap) gaps.push(shot.gap);
      else if (!shot || shot.missing || !shot.file) gaps.push(`missing ${screen.id} ${width}`);
      else if (shot.blank) gaps.push(`blank ${screen.id} ${width}`);
    }
  }
  if (termsClick !== 'ui') gaps.push('terms-gate: not a ui click');
  const text = String(pdfText || '');
  let cursor = 0;
  for (const screen of ONBOARDING_SCREENS) {
    for (const width of ONBOARDING_WIDTHS) {
      const label = onboardingLabel(screen.id, width);
      const at = text.indexOf(label, cursor);
      if (at < 0) gaps.push(`pdf missing ${screen.id} ${width}`);
      else cursor = at + label.length;
    }
  }
  const laterAt = text.indexOf('later ');
  if (laterAt >= 0 && (cursor === 0 || laterAt < text.indexOf(onboardingLabel('homepage', ONBOARDING_WIDTHS[0])))) {
    gaps.push('onboarding is not the opening');
  }
  if (!gaps.length) return { ok: true, detail: `${ONBOARDING_SCREENS.length * ONBOARDING_WIDTHS.length} screens` };
  return { ok: false, detail: gaps[0] };
}

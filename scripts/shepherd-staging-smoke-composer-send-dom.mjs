/** Read composer send-button accessibility metadata for visual judge context (harness-only). */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

export async function readComposerSendButtonDomContext(page) {
  return page.evaluate(() => {
    const composer = document.querySelector('form#composer, form.composer#composer, #composer');
    if (!composer) return null;
    const grid = composer.querySelector('.compose-grid') || composer;
    const buttons = grid.querySelectorAll('button');
    const composerRect = composer.getBoundingClientRect();
    for (const btn of buttons) {
      const aria = btn.getAttribute('aria-label')?.trim() || '';
      const title = btn.getAttribute('title')?.trim() || '';
      const text = String(btn.textContent || '').replace(/\s+/g, ' ').trim();
      const name = aria || title || text;
      if (/^send$/i.test(name) || btn.id === 'sendButton') {
        const btnRect = btn.getBoundingClientRect();
        const st = getComputedStyle(btn);
        const visible = st.display !== 'none'
          && st.visibility !== 'hidden'
          && Number(st.opacity) > 0
          && !btn.disabled
          && btnRect.width >= 1
          && btnRect.height >= 1;
        return {
          id: btn.id || '',
          role: btn.getAttribute('role') || 'button',
          ariaLabel: aria || null,
          title: title || null,
          type: btn.getAttribute('type') || '',
          visible,
          bboxInComposer: {
            x: btnRect.left - composerRect.left,
            y: btnRect.top - composerRect.top,
            width: btnRect.width,
            height: btnRect.height,
          },
        };
      }
    }
    return null;
  });
}

export function sendDomStructurallyConfirmsVisibleSend(sendDom) {
  if (!sendDom) return false;
  const sendName = String(sendDom.ariaLabel || sendDom.title || '').trim();
  const sendConfirmed = sendDom.id === 'sendButton' || /^send$/i.test(sendName);
  if (!sendConfirmed) return false;
  if (sendDom.visible === false) return false;
  const bbox = sendDom.bboxInComposer;
  if (!bbox || Number(bbox.width) < 1 || Number(bbox.height) < 1) return false;
  return true;
}

export function sendBboxHasInkInComposerPng(pngBuffer, sendDom, { minDarkPixels = 4 } = {}) {
  if (!sendDomStructurallyConfirmsVisibleSend(sendDom)) {
    return { hasInk: false, sampled: 0, darkPixels: 0, skipped: 'send_dom_not_visible' };
  }
  const png = PNG.sync.read(pngBuffer);
  const bbox = sendDom.bboxInComposer;
  const x0 = Math.max(0, Math.floor(bbox.x));
  const y0 = Math.max(0, Math.floor(bbox.y));
  const x1 = Math.min(png.width, Math.ceil(bbox.x + bbox.width));
  const y1 = Math.min(png.height, Math.ceil(bbox.y + bbox.height));
  let darkPixels = 0;
  let sampled = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * png.width + x) * 4;
      sampled += 1;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (r < 235 || g < 235 || b < 235) darkPixels += 1;
    }
  }
  return { hasInk: darkPixels >= minDarkPixels, sampled, darkPixels };
}

/** Reconcile judge rubric 2 on live DOM structure; APP FAIL when DOM and crop disagree. */
export function reconcileVisualJudgeComposerSend(verdict, sendDom, opts = {}) {
  if (!verdict || verdict.pass === true) return verdict;
  const structural = sendDomStructurallyConfirmsVisibleSend(sendDom);
  if (!structural) return verdict;

  const composerPngBuffer = opts.composerPngBuffer;
  if (composerPngBuffer) {
    const ink = sendBboxHasInkInComposerPng(composerPngBuffer, sendDom);
    if (!ink.hasInk) {
      return {
        ...verdict,
        pass: false,
        failures: [
          ...(verdict.failures || []).filter((row) => String(row?.rubricItem || '') !== '2'),
          {
            rubricItem: 'app',
            reason: 'APP FAIL: live DOM confirms visible Send in composer crop bounds but send bbox pixels lack ink',
          },
        ],
      };
    }
  }

  const failures = (verdict.failures || []).filter((row) => String(row?.rubricItem || '') !== '2');
  if (failures.length === 0) {
    return { ...verdict, pass: true, failures: [], reconcile: 'structure_dom_send' };
  }
  return { ...verdict, pass: false, failures };
}

export function formatComposerSendDomContextForJudge(sendDom) {
  if (!sendDom) {
    return 'Composer send control (live DOM): not found in form#composer.';
  }
  const bbox = sendDom.bboxInComposer;
  const bboxLine = bbox
    ? `- bbox in composer (px): x=${Math.round(bbox.x)} y=${Math.round(bbox.y)} w=${Math.round(bbox.width)} h=${Math.round(bbox.height)}`
    : '- bbox in composer: (none)';
  const lines = [
    'Composer send control (live DOM — authoritative for accessibility; icon-only up-arrow is valid):',
    `- element id: ${sendDom.id || '(none)'}`,
    `- role: ${sendDom.role || 'button'}`,
    `- aria-label: ${sendDom.ariaLabel ?? '(none)'}`,
    `- title: ${sendDom.title ?? '(none)'}`,
    `- type: ${sendDom.type || '(none)'}`,
    `- visible in composer: ${sendDom.visible === false ? 'no' : 'yes'}`,
    bboxLine,
    'PASS visual rubric item 2 when this send control is visible in the crop (up-arrow icon, no text label required).',
  ];
  return lines.join('\n');
}

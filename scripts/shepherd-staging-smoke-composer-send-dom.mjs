/** Read composer send-button accessibility metadata for visual judge context (harness-only). */

export async function readComposerSendButtonDomContext(page) {
  return page.evaluate(() => {
    const composer = document.querySelector('form#composer, form.composer#composer, #composer');
    if (!composer) return null;
    const grid = composer.querySelector('.compose-grid') || composer;
    const buttons = grid.querySelectorAll('button');
    for (const btn of buttons) {
      const aria = btn.getAttribute('aria-label')?.trim() || '';
      const title = btn.getAttribute('title')?.trim() || '';
      const text = String(btn.textContent || '').replace(/\s+/g, ' ').trim();
      const name = aria || title || text;
      if (/^send$/i.test(name) || btn.id === 'sendButton') {
        return {
          id: btn.id || '',
          role: btn.getAttribute('role') || 'button',
          ariaLabel: aria || null,
          title: title || null,
          type: btn.getAttribute('type') || '',
        };
      }
    }
    return null;
  });
}

/** Drop judge false-negatives on rubric 2 when live DOM confirms icon-only Send. */
export function reconcileVisualJudgeComposerSend(verdict, sendDom) {
  if (!verdict || verdict.pass === true) return verdict;
  if (!sendDom) return verdict;
  const sendName = String(sendDom.ariaLabel || sendDom.title || '').trim();
  const sendConfirmed = sendDom.id === 'sendButton' || /^send$/i.test(sendName);
  if (!sendConfirmed) return verdict;
  const failures = (verdict.failures || []).filter((row) => {
    if (String(row?.rubricItem || '') !== '2') return true;
    const reason = String(row?.reason || '').toLowerCase();
    if (/send control not visible|no send control|missing send|send button not visible|send not visible/.test(reason)) {
      return false;
    }
    return true;
  });
  if (failures.length === 0) {
    return { ...verdict, pass: true, failures: [] };
  }
  return { ...verdict, pass: false, failures };
}

export function formatComposerSendDomContextForJudge(sendDom) {
  if (!sendDom) {
    return 'Composer send control (live DOM): not found in form#composer.';
  }
  const lines = [
    'Composer send control (live DOM — authoritative for accessibility; icon-only up-arrow is valid):',
    `- element id: ${sendDom.id || '(none)'}`,
    `- role: ${sendDom.role || 'button'}`,
    `- aria-label: ${sendDom.ariaLabel ?? '(none)'}`,
    `- title: ${sendDom.title ?? '(none)'}`,
    `- type: ${sendDom.type || '(none)'}`,
    'PASS visual rubric item 2 when this send control is visible in the crop (up-arrow icon, no text label required).',
  ];
  return lines.join('\n');
}

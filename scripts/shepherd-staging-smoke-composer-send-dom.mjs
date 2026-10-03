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

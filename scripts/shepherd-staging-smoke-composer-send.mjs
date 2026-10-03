/** Harness-only composer send control checks (in-browser + fixture tests). */

export function composerSendHelperSource() {
  return `
function tsAccessibleName(el) {
  if (!el) return '';
  const aria = el.getAttribute('aria-label');
  if (aria && String(aria).trim()) return String(aria).trim();
  const title = el.getAttribute('title');
  if (title && String(title).trim()) return String(title).trim();
  return String(el.textContent || '').replace(/\\s+/g, ' ').trim();
}

function tsFindComposerSendButton(composer) {
  if (!composer) return null;
  const buttons = composer.querySelectorAll('button');
  for (const btn of buttons) {
    if (/^send$/i.test(tsAccessibleName(btn))) return btn;
  }
  return null;
}

function tsSendButtonFailureReason(send, composer, vw, vh) {
  if (!composer) return 'composer form#composer missing';
  if (!send) return 'composer must expose a visible Send button (accessible name Send inside form#composer)';
  const st = getComputedStyle(send);
  if (send.disabled) return 'Send button is disabled';
  if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return 'Send button is hidden';
  if (st.pointerEvents === 'none') return 'Send button is not tappable (pointer-events: none)';
  const r = send.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return 'Send button has zero size';
  if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return 'Send button is outside the viewport';
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || (hit !== send && !send.contains(hit))) return 'Send button is covered (elementFromPoint miss)';
  return null;
}
`.trim();
}

export function evaluateComposerControlsOnly(ctx) {
  const {
    querySelector,
    getComputedStyle,
    push,
    applies,
    rectObj,
    elementFromPoint = (x, y) => document.elementFromPoint(x, y),
    innerWidth = window.innerWidth,
    innerHeight = window.innerHeight,
  } = ctx;
  if (!applies('composer_controls_only')) return;
  const composer = querySelector('form#composer, form.composer#composer, #composer');
  const grid = composer?.querySelector('.compose-grid') || composer;
  if (!composer || !grid) {
    push('form#composer', 'composer_controls_only', 'composer form#composer missing', {});
    return;
  }
  const textarea = querySelector('#messageText, textarea[name="message"], #composer textarea');
  const attach = querySelector('#attachButton');
  const voice = querySelector('#voiceButton');
  const send = (() => {
    const buttons = grid.querySelectorAll('button');
    for (const btn of buttons) {
      const aria = btn.getAttribute('aria-label')?.trim();
      const title = btn.getAttribute('title')?.trim();
      const name = aria || title || String(btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^send$/i.test(name)) return btn;
    }
    return null;
  })();

  const sendFail = (() => {
    if (!send) return 'composer must expose a visible Send button (accessible name Send inside form#composer)';
    const st = getComputedStyle(send);
    if (send.disabled) return 'Send button is disabled';
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return 'Send button is hidden';
    if (st.pointerEvents === 'none') return 'Send button is not tappable (pointer-events: none)';
    const r = send.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return 'Send button has zero size';
    const vw = innerWidth;
    const vh = innerHeight;
    if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return 'Send button is outside the viewport';
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = elementFromPoint(cx, cy);
    if (!hit || (hit !== send && !send.contains(hit))) return 'Send button is covered (elementFromPoint miss)';
    return null;
  })();
  if (sendFail) {
    push('form#composer button[aria-label="Send"]', 'composer_controls_only', sendFail, { send: send ? rectObj(send) : null });
  }

  const controls = grid.querySelectorAll('button, input, textarea, select');
  for (const el of controls) {
    const st = getComputedStyle(el);
    if (st.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const id = el.id || '';
    const isSend = el === send;
    const ok = id === 'attachButton' || id === 'voiceButton' || isSend || el === textarea || id === 'messageText';
    if (!ok) {
      push('#composer', 'composer_controls_only', `unexpected composer control ${id || el.tagName}`, { el: rectObj(el) });
      break;
    }
  }
  if (!attach || !voice) {
    push('#composer', 'composer_controls_only', 'composer missing file-add or speak button', { attach: Boolean(attach), voice: Boolean(voice) });
  }
}

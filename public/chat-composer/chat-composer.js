window.tsChatComposer = (() => {
  const icons = {
    clip: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21.4 11.6-8.7 8.7a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.6-8.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mic: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" stroke="currentColor" stroke-width="2"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const DEFAULT_ACCEPT = 'image/*,video/*,.pdf,.txt,.ics,.csv,.json';
  const MAX_FILES = 6;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attr = (name, value) => (value ? ` ${name}="${esc(value)}"` : '');
  const byId = (id) => document.getElementById(id);

  function markup(options = {}) {
    const o = {
      messageLabel: 'Message',
      placeholder: '',
      autocomplete: '',
      attachLabel: 'Add file',
      speakLabel: 'Speak',
      sendLabel: 'Send',
      accept: DEFAULT_ACCEPT,
      aboveAttachments: '',
      ...options,
    };
    return `<form class="composer" id="composer">
              <p id="composerStatus" role="status" aria-live="polite" hidden style="margin:0 0 8px;color:var(--danger);font-weight:750;font-size:14px"></p>
              ${o.aboveAttachments}<div class="attachment-row" id="attachmentRow"></div>
              <div class="compose-grid">
                <button class="icon-button" id="attachButton" type="button" aria-label="${esc(o.attachLabel)}" title="${esc(o.attachLabel)}">${icons.clip}</button>
                <textarea id="messageText" name="message" rows="1" aria-label="${esc(o.messageLabel)}"${attr('placeholder', o.placeholder)}${attr('autocomplete', o.autocomplete)} enterkeyhint="send"></textarea>
                <span class="voice-mic-wrap"><button class="icon-button" id="voiceButton" type="button" aria-label="${esc(o.speakLabel)}" title="${esc(o.speakLabel)}">${icons.mic}</button><span id="voiceElapsed" hidden aria-live="off"></span></span><button class="icon-button" id="sendButton" type="submit" aria-label="${esc(o.sendLabel)}" title="${esc(o.sendLabel)}">${icons.send}</button>
              </div>
              <input id="fileInput" type="file" accept="${esc(o.accept)}" multiple hidden>
            </form>`;
  }

  function attachmentChips(files, note = '') {
    return Array.from(files || []).map((file) => `<span class="chip">${esc(file.name)} · ${note ? esc(note) : `${Math.ceil(file.size / 1024)} KB`}</span>`).join('');
  }

  function renderAttachments(files, note = '') {
    const row = byId('attachmentRow');
    if (!row) return;
    row.innerHTML = attachmentChips(files, note);
  }

  function resizeComposer(target) {
    const el = target || document.getElementById('messageText');
    if (!el || !el.style) return;
    const cs = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(el) : null;
    const minHeight = Number.parseFloat(cs?.minHeight) || 42;
    const parsedMax = Number.parseFloat(cs?.maxHeight);
    const maxHeight = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 150;
    const borderY = (Number.parseFloat(cs?.borderTopWidth) || 0) + (Number.parseFloat(cs?.borderBottomWidth) || 0);
    const prevScrollTop = Number(el.scrollTop || 0);
    const prevOverflow = Number(el.scrollHeight || 0) > Number(el.clientHeight || 0) + 1;
    const wasAtBottom = prevOverflow && prevScrollTop + Number(el.clientHeight || 0) >= Number(el.scrollHeight || 0) - 2;
    const valLen = String(el.value || '').length;
    const atEnd = typeof el.selectionStart === 'number'
      && el.selectionStart === el.selectionEnd
      && el.selectionEnd === valLen;
    el.style.overflowY = 'hidden';
    el.style.height = 'auto';
    const measured = Number(el.scrollHeight || 0);
    const rawHeight = measured > 0 ? measured + borderY : minHeight;
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, Math.ceil(rawHeight)));
    const overflowing = rawHeight > maxHeight + 0.5;
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = overflowing ? 'auto' : 'hidden';
    if (overflowing) {
      if (wasAtBottom || (!prevOverflow && (atEnd || document.activeElement !== el))) {
        el.scrollTop = el.scrollHeight;
      } else if (prevScrollTop > 0) {
        el.scrollTop = prevScrollTop;
      }
    } else {
      el.scrollTop = 0;
    }
  }

  function bindComposerAutosize() {
    const textarea = document.getElementById('messageText');
    if (!textarea) return;
    const sync = () => resizeComposer(textarea);
    textarea.addEventListener('input', sync);
    textarea.addEventListener('change', sync);
    const form = textarea.form || textarea.closest?.('form') || null;
    form?.addEventListener?.('reset', () => queueMicrotask(sync));
    if (window.__tsComposerResizeListener) {
      window.removeEventListener('resize', window.__tsComposerResizeListener);
    }
    const onWindowResize = () => {
      if (textarea.isConnected === false) {
        window.removeEventListener('resize', onWindowResize);
        return;
      }
      sync();
    };
    window.__tsComposerResizeListener = onWindowResize;
    window.addEventListener('resize', onWindowResize);
    sync();
  }

  function bind({ getState, onSubmit, onFiles = null, maxFiles = MAX_FILES }) {
    const attachButton = byId('attachButton');
    const fileInput = byId('fileInput');
    const messageText = byId('messageText');
    const composer = byId('composer');
    if (!attachButton || !fileInput || !messageText || !composer) return false;
    attachButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (event) => {
      const files = Array.from(event.target.files || []).slice(0, maxFiles);
      getState().attachments = files;
      renderAttachments(files);
      messageText.focus();
      if (onFiles) onFiles(files, event);
    });
    window.tsVacationAppChrome.bindVoice(getState);
    bindComposerAutosize();
    let shiftBreak = false, imeBreak = false;
    const enterSend = (event, fromBreak) => {
      const state = getState();
      const skip = shiftBreak || imeBreak || event.isComposing === true || event.keyCode === 229 || event.shiftKey === true || event.repeat;
      if (fromBreak) { shiftBreak = false; imeBreak = false; }
      if (skip || (!messageText.value.trim() && !state.attachments.length && !state.sending)) return;
      event.preventDefault(); if (!state.sending) composer.requestSubmit();
    };
    messageText.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      shiftBreak = event.shiftKey === true; imeBreak = event.isComposing === true || event.keyCode === 229;
      enterSend(event, false);
    });
    messageText.addEventListener('beforeinput', (event) => {
      if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') enterSend(event, true);
    });
    composer.addEventListener('submit', onSubmit);
    return true;
  }

  return { markup, renderAttachments, resizeComposer, bindComposerAutosize, bind };
})();

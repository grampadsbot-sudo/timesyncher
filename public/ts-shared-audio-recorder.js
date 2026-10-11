(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;
  const shareToken = decodeURIComponent(sharedMatch[1]);
  const maxAudioBytes = 4 * 1024 * 1024;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let timerId = 0;
  let finishMode = 'cancel';
  let pendingBlob = null;
  let speechTranscript = '';
  let recognition = null;
  let recordingBar = null;
  let editPanel = null;

  function canRecord() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  }

  function formatElapsed(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function setIcon(button, name) {
    button.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path></svg>';
  }

  function micButton() {
    return document.querySelector('[data-ts-shared-audio]');
  }

  function ensureRecordingUi() {
    if (!recordingBar) {
      recordingBar = document.createElement('div');
      recordingBar.className = 'ts-shared-audio-recording-bar';
      recordingBar.setAttribute('role', 'status');
      recordingBar.setAttribute('aria-live', 'polite');
      recordingBar.innerHTML = '<span data-ts-voice-elapsed>0:00</span><div class="ts-shared-audio-recording-actions"><button type="button" data-ts-voice-send>Send</button><button type="button" data-ts-voice-stop>Stop</button><button type="button" data-ts-voice-cancel>Cancel</button></div>';
      recordingBar.querySelector('[data-ts-voice-send]').addEventListener('click', () => {
        if (recorder?.state === 'recording') {
          finishMode = 'send';
          recorder.stop();
        }
      });
      recordingBar.querySelector('[data-ts-voice-stop]').addEventListener('click', () => {
        if (recorder?.state === 'recording') {
          finishMode = 'stop-edit';
          recorder.stop();
        }
      });
      recordingBar.querySelector('[data-ts-voice-cancel]').addEventListener('click', () => {
        if (recorder?.state === 'recording') {
          finishMode = 'cancel';
          recorder.stop();
          return;
        }
        cleanupRecording({ resetMic: true });
      });
      document.body.appendChild(recordingBar);
    }
    if (!editPanel) {
      editPanel = document.createElement('div');
      editPanel.className = 'ts-shared-audio-edit';
      editPanel.innerHTML = '<textarea data-ts-voice-edit-text aria-label="Voice note transcript" placeholder="Edit transcript before sending"></textarea><div class="ts-shared-audio-edit-actions"><button type="button" data-ts-voice-edit-cancel>Cancel</button><button type="button" data-ts-voice-edit-send>Send</button></div>';
      editPanel.querySelector('[data-ts-voice-edit-cancel]').addEventListener('click', () => {
        pendingBlob = null;
        editPanel.classList.remove('is-active');
        resetMicButton();
      });
      editPanel.querySelector('[data-ts-voice-edit-send]').addEventListener('click', () => {
        if (!pendingBlob) {
          editPanel.classList.remove('is-active');
          resetMicButton();
          return;
        }
        const editedTranscript = editPanel.querySelector('[data-ts-voice-edit-text]').value.trim();
        const blob = pendingBlob;
        pendingBlob = null;
        editPanel.classList.remove('is-active');
        submit(blob, { editedTranscript });
      });
      document.body.appendChild(editPanel);
    }
  }

  function updateTimerDisplay() {
    if (!recordingBar || !startedAt) return;
    const elapsed = recordingBar.querySelector('[data-ts-voice-elapsed]');
    if (elapsed) elapsed.textContent = formatElapsed(Date.now() - startedAt);
  }

  function startTimer() {
    clearInterval(timerId);
    updateTimerDisplay();
    timerId = window.setInterval(updateTimerDisplay, 1000);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = 0;
  }

  function stopSpeechCapture() {
    if (!recognition) return speechTranscript;
    try {
      recognition.stop();
    } catch (err) {
      /* ignore duplicate stop */
    }
    recognition = null;
    return speechTranscript;
  }

  function startSpeechCapture() {
    speechTranscript = '';
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const parts = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || '';
        if (piece) parts.push(piece);
      }
      speechTranscript = parts.join(' ').trim();
    };
    recognition.onerror = () => {
      recognition = null;
    };
    try {
      recognition.start();
    } catch (err) {
      recognition = null;
    }
  }

  function stopStreamTracks() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function hideRecordingBar() {
    recordingBar?.classList.remove('is-active');
  }

  function resetMicButton() {
    const button = micButton();
    if (!button) return;
    button.disabled = false;
    button.classList.remove('is-recording');
    setIcon(button, 'mic');
  }

  function cleanupRecording({ resetMic = false } = {}) {
    stopTimer();
    stopSpeechCapture();
    stopStreamTracks();
    recorder = null;
    chunks = [];
    startedAt = 0;
    finishMode = 'cancel';
    hideRecordingBar();
    if (resetMic) resetMicButton();
  }

  function showEditPanel(transcript) {
    ensureRecordingUi();
    const textarea = editPanel.querySelector('[data-ts-voice-edit-text]');
    textarea.value = transcript || '';
    editPanel.classList.add('is-active');
    textarea.focus();
  }

  function toast(message, tone = '') {
    let el = document.querySelector('.ts-shared-audio-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ts-shared-audio-toast';
      document.body.appendChild(el);
    }
    el.className = `ts-shared-audio-toast ${tone}`.trim();
    el.textContent = message;
    clearTimeout(el.__hideTimer);
    el.__hideTimer = setTimeout(() => el.remove(), tone === 'error' ? 6500 : 4200);
  }

  function preferredType() {
    const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return options.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read audio note.'));
      reader.readAsDataURL(blob);
    });
  }

  async function submit(blob, { editedTranscript = '' } = {}) {
    const button = micButton();
    if (button) button.disabled = true;
    toast('Sending voice note...');
    const durationSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;
    try {
      const audioDataUrl = await blobToDataUrl(blob);
      if (blob.size > maxAudioBytes) {
        throw new Error('Audio note is too large. Please keep recordings under about 45 seconds.');
      }
      const payload = { audioDataUrl, durationSeconds };
      if (editedTranscript) payload.editedTranscript = editedTranscript;
      const response = await fetch(`/api/shared/${encodeURIComponent(shareToken)}/audio-note`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || 'Could not send voice note.');
      toast('Voice note queued for this itinerary.', 'ok');
    } catch (err) {
      toast(err?.message || 'Could not send voice note.', 'error');
    } finally {
      cleanupRecording({ resetMic: true });
      if (button) button.disabled = false;
    }
  }

  async function start(button) {
    if (recorder?.state === 'recording') return;
    ensureRecordingUi();
    pendingBlob = null;
    editPanel?.classList.remove('is-active');
    chunks = [];
    finishMode = 'cancel';
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = preferredType();
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
      const mode = finishMode;
      const transcript = stopSpeechCapture();
      stopStreamTracks();
      stopTimer();
      hideRecordingBar();
      finishMode = 'cancel';
      recorder = null;
      chunks = [];
      if (mode === 'cancel') {
        startedAt = 0;
        resetMicButton();
        return;
      }
      if (mode === 'stop-edit') {
        pendingBlob = blob;
        startedAt = 0;
        resetMicButton();
        showEditPanel(transcript);
        return;
      }
      submit(blob).catch(() => {});
    }, { once: true });
    startedAt = Date.now();
    startSpeechCapture();
    recorder.start();
    button.classList.add('is-recording');
    button.disabled = true;
    recordingBar.classList.add('is-active');
    startTimer();
    toast('Recording...');
  }

  async function beginRecording(event) {
    const button = event.currentTarget;
    if (recorder?.state === 'recording') return;
    try {
      await start(button);
    } catch (err) {
      cleanupRecording({ resetMic: true });
      toast(err?.message || 'Microphone access was blocked.', 'error');
    }
  }

  window.addEventListener('pagehide', () => {
    if (recorder?.state === 'recording') {
      finishMode = 'cancel';
      try {
        recorder.stop();
      } catch (err) {
        cleanupRecording();
      }
      return;
    }
    cleanupRecording();
  });

  function installButton() {
    if (document.querySelector('[data-ts-shared-audio]')) return true;
    const tripButton = document.querySelector('[data-trip-view-root]');
    const printButton = document.querySelector('[data-print-menu-root]');
    const row = tripButton?.parentElement || printButton?.parentElement;
    if (!row) return false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ts-shared-audio-button';
    button.dataset.tsSharedAudio = '1';
    button.setAttribute('aria-label', 'Record voice note');
    button.title = 'Record voice note';
    setIcon(button, 'mic');
    if (!canRecord()) {
      button.disabled = true;
      button.title = 'Microphone recording is unavailable in this browser';
    } else {
      button.addEventListener('click', beginRecording);
    }
    row.insertBefore(button, printButton || null);
    return true;
  }

  const observer = new MutationObserver(() => {
    if (installButton()) observer.disconnect();
  });
  if (!installButton()) observer.observe(document.documentElement, { childList: true, subtree: true });
})();

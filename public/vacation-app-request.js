function reloadSiteIframeAfterItineraryEdit() {
  const iframe = document.querySelector('.site-pane iframe');
  if (!iframe?.src) return;
  try {
    const url = new URL(iframe.src, window.location.href);
    url.searchParams.set('tsVacationEdit', String(Date.now()));
    iframe.src = url.href;
  } catch {
    void 0;
  }
}

function installVacationChatItineraryEditHook() {
  if (window.__tsVacationItineraryEditHook) return;
  window.__tsVacationItineraryEditHook = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function vacationChatFetch(input, init) {
    const response = await nativeFetch(input, init);
    try {
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = typeof input === 'string' ? input : input?.url || '';
      if (method === 'POST' && url.includes('/api/vacation-itinerary')) {
        const data = await response.clone().json();
        if (data?.itineraryEdit?.applied === true) reloadSiteIframeAfterItineraryEdit();
      }
    } catch {
      void 0;
    }
    return response;
  };
}

installVacationChatItineraryEditHook();

window.tsVacationAppRequest = {
  AppRequestError: class AppRequestError extends Error {
    constructor(message, { customerMessage = '', response = null } = {}) {
      super(message);
      this.customerMessage = customerMessage;
      this.response = response;
    }
  },
  customerSafeErrorMessage(error, data = null) {
    const payload = data || error?.response || {};
    if (payload.customerMessage) return String(payload.customerMessage);
    if (error?.customerMessage) return String(error.customerMessage);
    return 'Something went wrong. Please try again.';
  },
  showComposerStatus(message) {
    const node = document.getElementById('composerStatus');
    if (!node) return;
    const text = String(message || '').trim();
    if (!text) {
      node.hidden = true;
      node.textContent = '';
      return;
    }
    node.hidden = false;
    node.textContent = text;
  },
  failAppRequest(data, fallbackMessage) {
    const internal = [data?.code, data?.reason || data?.error].filter(Boolean).join(': ') || fallbackMessage;
    throw new window.tsVacationAppRequest.AppRequestError(internal, {
      customerMessage: data?.customerMessage,
      response: data,
    });
  },
  CHAT_SEND_TIMEOUT_MS: 90_000,
  beginChatSendAbort(timeoutMs = window.tsVacationAppRequest.CHAT_SEND_TIMEOUT_MS) {
    const sendController = new AbortController();
    const sendTimeout = setTimeout(() => sendController.abort(), timeoutMs);
    return { signal: sendController.signal, clear() { clearTimeout(sendTimeout); } };
  },
  handleChatSendFailure(error, { messages, showComposerStatus, customerSafeErrorMessage, stopProgressPoll }) {
    document.getElementById('tsTyping')?.remove();
    console.error(error);
    if (error?.name === 'AbortError') {
      messages.insertAdjacentHTML('beforeend', '<article class="bubble" role="alert"><small>TimeSyncher</small>That took too long — please try again.</article>');
      showComposerStatus('');
    } else {
      showComposerStatus(customerSafeErrorMessage(error, error?.response));
    }
    stopProgressPoll();
  },
  resolveCurrentTripId({ vacations, tripId, urlTripId, sessionTripId, fallbackTripId }) {
    const requestedTripId = tripId || urlTripId || '';
    const allowedTrip = requestedTripId && (vacations || []).some((item) => item.id === requestedTripId) ? requestedTripId : '';
    return allowedTrip || sessionTripId || fallbackTripId || '';
  },
  initialTripIdFromSearch(searchParams) {
    return String(searchParams?.get('tripId') || '').trim();
  },
};

window.tsVacationAppProgress = {
  attach(api) {
    const { getState, setState, getSessionToken, loadApp, currentTrip, realSiteUrl } = api;

    function searchProgressActive(trip, siteUrl) {
      const progress = getState().searchProgress;
      if (!progress || siteUrl) return false;
      if (['failed', 'cancelled', 'ready', 'idle'].includes(String(progress.stage || ''))) return false;
      return progress.stage === 'searching' || progress.stage === 'building';
    }

    function stopProgressPoll() {
      const state = getState();
      if (state.progressPollTimer) {
        clearTimeout(state.progressPollTimer);
        setState({ progressPollTimer: null });
      }
      if (state.progressPollVisibilityBound) {
        document.removeEventListener('visibilitychange', state.progressPollVisibilityBound);
        setState({ progressPollVisibilityBound: null });
      }
    }

    function progressPollTerminal(stage) {
      const value = String(stage || '');
      return ['failed', 'cancelled', 'ready', 'idle'].includes(value);
    }

    function paintSearchProgress(progress) {
      const rootNode = document.getElementById('searchProgressRows');
      const status = document.getElementById('searchProgressStatus');
      if (!rootNode) return;
      const order = Array.isArray(progress.typeOrder) ? progress.typeOrder : Object.keys(progress.counts || {});
      const existing = new Map([...rootNode.querySelectorAll('.search-progress-row')].map((row) => [row.dataset.type, row]));
      for (const type of order) {
        const count = Number(progress.counts?.[type] || 0);
        if (!count) continue;
        let row = existing.get(type);
        if (!row) {
          row = document.createElement('div');
          row.className = 'search-progress-row';
          row.dataset.type = type;
          row.innerHTML = '<span class="label"></span><span class="count"></span>';
          rootNode.appendChild(row);
          existing.set(type, row);
        }
        row.querySelector('.label').textContent = type;
        row.querySelector('.count').textContent = String(count);
      }
      if (status) {
        const building = progress.stage === 'building' || Boolean(progress.buildingLabel);
        status.hidden = !building;
        status.textContent = progress.buildingLabel || 'Building itinerary…';
      }
    }

    function applyServerProgress(progress, trip, publicUrl) {
      if (!progress) return;
      const state = getState();
      const now = Date.now();
      const sameCounts = JSON.stringify(state.searchProgress?.counts || {}) === JSON.stringify(progress.counts || {});
      if (sameCounts && state.searchProgress?.stage === progress.stage && now - state.lastProgressUiAt < 1000) {
        setState({ searchProgress: progress });
        return;
      }
      setState({ searchProgress: progress, lastProgressUiAt: now });
      paintSearchProgress(progress);
      const tripRecord = trip || currentTrip();
      const url = realSiteUrl(publicUrl || tripRecord?.publicUrl, tripRecord);
      if (progress.stage === 'ready' && progress.websiteReady && url) {
        stopProgressPoll();
        loadApp(tripRecord?.id || state.currentTripId);
      }
      if (progress.stage === 'failed' || progress.stage === 'cancelled') stopProgressPoll();
    }

    function startProgressPoll(tripId) {
      stopProgressPoll();
      const token = getSessionToken();
      if (!tripId || !token) return;
      let delayMs = 15000;
      const onVisibilityChange = () => {
        if (document.hidden) return;
        const state = getState();
        if (!state.progressPollTimer) return;
        clearTimeout(state.progressPollTimer);
        const timer = setTimeout(runPoll, 0);
        setState({ progressPollTimer: timer });
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      setState({ progressPollVisibilityBound: onVisibilityChange });
      const runPoll = async () => {
        if (document.hidden) {
          const timer = setTimeout(runPoll, Math.max(delayMs, 60000));
          setState({ progressPollTimer: timer });
          return;
        }
        try {
          const query = new URLSearchParams({ app: '1', session: token, tripId, progressOnly: '1' });
          const res = await fetch(`/api/vacation-itinerary?${query.toString()}`);
          const data = await res.json();
          if (!res.ok || data.ok === false) {
            const timer = setTimeout(runPoll, delayMs);
            setState({ progressPollTimer: timer });
            return;
          }
          applyServerProgress(
            data.searchProgress,
            data.trip || currentTrip(),
            data.publicUrl || data.trip?.publicUrl,
          );
          if (progressPollTerminal(data.searchProgress?.stage)) {
            stopProgressPoll();
            return;
          }
          delayMs = Math.min(Math.round(delayMs * 1.5), 120000);
        } catch (error) {
          void error;
        }
        const timer = setTimeout(runPoll, delayMs);
        setState({ progressPollTimer: timer });
      };
      runPoll();
    }

    return { searchProgressActive, stopProgressPoll, startProgressPoll, applyServerProgress, paintSearchProgress };
  },
};

window.tsVacationAppChrome = {
  bindVoice(getState) {
    const showStatus = window.tsVacationAppRequest.showComposerStatus;
    const voiceButton = document.getElementById('voiceButton');
    const messageText = document.getElementById('messageText');
    const voiceElapsed = document.getElementById('voiceElapsed');
    if (!voiceButton) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const unsupportedMessage = 'Voice dictation is not available in this browser.';
    const retryMessage = "Didn't catch that — tap the mic and try again.";
    const uaString = String(navigator.userAgent || '');
    const iosDevice = /iPhone|iPad|iPod/i.test(uaString);

    const browserMicLabel = () => {
      const ua = String(navigator.userAgent || '');
      if (/Brave/i.test(ua)) return 'Brave';
      if (/CriOS|Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
      if (/FxiOS|Firefox/i.test(ua)) return 'Firefox';
      if (/EdgiOS|Edg/i.test(ua)) return 'Edge';
      if (/Safari/i.test(ua)) return 'Safari';
      return 'your browser';
    };

    const micBlockedMessage = () => (
      iosDevice
        ? `Microphone access is blocked. On iPhone, open Settings › ${browserMicLabel()} › Microphone and turn it on, then try again.`
        : 'Microphone access is blocked. Allow microphone for this site in your browser settings, then try again.'
    );

    if (!SpeechRecognition) {
      const voiceWrap = voiceButton.closest('.voice-mic-wrap');
      if (voiceWrap) voiceWrap.hidden = true;
      else voiceButton.hidden = true;
      return;
    }

    let mediaStream = null;
    let activeRecognition = null;
    let recording = false;
    let timerInterval = null;
    let recordingStartedAt = 0;

    const formatElapsed = (ms) => {
      const totalSec = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSec / 60);
      const seconds = totalSec % 60;
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };

    const stopTimer = () => {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      recordingStartedAt = 0;
      if (voiceElapsed) {
        voiceElapsed.hidden = true;
        voiceElapsed.textContent = '';
      }
    };

    const startTimer = () => {
      if (!voiceElapsed) return;
      recordingStartedAt = Date.now();
      voiceElapsed.hidden = false;
      voiceElapsed.textContent = '0:00';
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        if (!recordingStartedAt) return;
        voiceElapsed.textContent = formatElapsed(Date.now() - recordingStartedAt);
      }, 250);
    };

    const finishRecording = () => {
      recording = false;
      getState().voiceMode = false;
      voiceButton.classList.remove('recording');
      stopTimer();
      activeRecognition = null;
      messageText?.focus();
    };

    const ensureMediaStream = async () => {
      if (mediaStream) return mediaStream;
      const getUserMedia = navigator.mediaDevices?.getUserMedia;
      if (!getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
      mediaStream = await getUserMedia.call(navigator.mediaDevices, { audio: true });
      return mediaStream;
    };

    const attachRecognition = () => {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onstart = () => {
        recording = true;
        getState().voiceMode = true;
        voiceButton.classList.add('recording');
        startTimer();
      };
      recognition.onend = () => {
        finishRecording();
      };
      recognition.onresult = (event) => {
        const text = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim();
        if (text) {
          messageText.value = text;
          getState().voiceArmed = true;
          showStatus('');
        }
      };
      recognition.onerror = (event) => {
        const code = String(event.error || '');
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          showStatus(micBlockedMessage());
        } else if (code === 'no-speech' || code === 'aborted' || code === 'audio-capture' || code === 'network') {
          showStatus(retryMessage);
        } else if (code) {
          showStatus(retryMessage);
        }
        recording = false;
        getState().voiceMode = false;
        voiceButton.classList.remove('recording');
        stopTimer();
      };
      return recognition;
    };

    voiceButton.addEventListener('click', async () => {
      if (recording) return;
      try {
        await ensureMediaStream();
      } catch (error) {
        const name = String(error?.name || '');
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          showStatus(micBlockedMessage());
          return;
        }
        showStatus(unsupportedMessage);
        return;
      }
      activeRecognition = attachRecognition();
      try {
        activeRecognition.start();
      } catch (error) {
        const name = String(error?.name || '');
        const message = String(error?.message || '');
        if (name === 'NotAllowedError' || message.includes('not-allowed')) {
          showStatus(micBlockedMessage());
          return;
        }
        showStatus(retryMessage);
      }
    });
  },
  bindFullScreen() {
    const button = document.getElementById('fullScreenButton');
    const app = document.querySelector('.app');
    if (!button || !app) return;
    button.addEventListener('click', () => {
      const on = app.classList.toggle('site-fullscreen');
      const label = on ? 'Exit full screen' : 'Full screen';
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', label);
      const text = button.querySelector('.fs-label');
      if (text) text.textContent = on ? 'Exit' : 'Full screen';
      else button.textContent = label;
    });
  },
  bindSplitter() {
    const workspace = document.getElementById('workspace');
    const splitter = document.getElementById('splitter');
    const splitterRow = document.getElementById('splitterRow');
    const app = document.querySelector('.app');
    const siteFrame = document.querySelector('.site-pane iframe');
    if (!workspace || !splitter) return;
    const dragRow = splitterRow || splitter;
    const splitterPx = () => Math.max(44, dragRow.getBoundingClientRect().height || 44);
    let dragging = false;
    let activePointerId = null;
    let touchId = null;
    let shield = document.getElementById('splitterDragShield');
    const ensureShield = () => {
      if (shield) return shield;
      shield = document.createElement('div');
      shield.id = 'splitterDragShield';
      shield.setAttribute('data-splitter-drag-shield', '1');
      shield.setAttribute('aria-hidden', 'true');
      shield.style.cssText = 'position:fixed;inset:0;z-index:99999;touch-action:none;cursor:row-resize;display:none;';
      document.body.appendChild(shield);
      return shield;
    };
    const resize = (clientY) => {
      const rect = workspace.getBoundingClientRect();
      const usable = Math.max(1, rect.height - splitterPx());
      const sitePx = Math.min(usable, Math.max(0, clientY - rect.top));
      const sitePct = (sitePx / usable) * 100;
      const clamped = Math.min(99.5, Math.max(0.5, sitePct));
      workspace.style.setProperty('--site-height', `${clamped}fr`);
      workspace.style.setProperty('--chat-height', `${100 - clamped}fr`);
    };
    const beginDrag = (clientY, pointerId) => {
      dragging = true;
      activePointerId = pointerId ?? null;
      if (app) app.classList.add('splitter-dragging');
      if (siteFrame) siteFrame.style.pointerEvents = 'none';
      ensureShield().style.display = 'block';
      resize(clientY);
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      activePointerId = null;
      touchId = null;
      if (app) app.classList.remove('splitter-dragging');
      if (siteFrame) siteFrame.style.pointerEvents = '';
      if (shield) shield.style.display = 'none';
    };
    const moveDrag = (clientY) => {
      if (dragging) resize(clientY);
    };
    const passiveTouch = { passive: false };
    const onPointerDown = (event) => {
      event.preventDefault();
      if (splitter.setPointerCapture) {
        try { splitter.setPointerCapture(event.pointerId); } catch {}
      }
      beginDrag(event.clientY, event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!dragging || (activePointerId !== null && event.pointerId !== activePointerId)) return;
      event.preventDefault();
      moveDrag(event.clientY);
    };
    const pickTouch = (event) => {
      const list = event.changedTouches || event.touches || [];
      if (touchId === null) return list[0] || null;
      return [...list].find((item) => item.identifier === touchId) || list[0] || null;
    };
    const onTouchStart = (event) => {
      const touch = pickTouch(event);
      if (!touch) return;
      event.preventDefault();
      touchId = touch.identifier;
      beginDrag(touch.clientY, null);
    };
    const onTouchMove = (event) => {
      if (!dragging) return;
      const touch = pickTouch(event);
      if (!touch) return;
      event.preventDefault();
      moveDrag(touch.clientY);
    };
    const onTouchEnd = (event) => {
      if (!dragging) return;
      event.preventDefault();
      endDrag();
    };
    const bindHandle = (node) => {
      if (!node) return;
      node.addEventListener('pointerdown', onPointerDown);
      node.addEventListener('pointermove', onPointerMove);
      node.addEventListener('pointerup', endDrag);
      node.addEventListener('pointercancel', endDrag);
      node.addEventListener('touchstart', onTouchStart, passiveTouch);
      node.addEventListener('touchmove', onTouchMove, passiveTouch);
      node.addEventListener('touchend', onTouchEnd, passiveTouch);
      node.addEventListener('touchcancel', onTouchEnd, passiveTouch);
    };
    bindHandle(splitter);
    bindHandle(splitterRow);
    const overlay = ensureShield();
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerup', endDrag);
    overlay.addEventListener('pointercancel', endDrag);
    overlay.addEventListener('touchmove', onTouchMove, passiveTouch);
    overlay.addEventListener('touchend', onTouchEnd, passiveTouch);
    overlay.addEventListener('touchcancel', onTouchEnd, passiveTouch);
  },
};

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
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voiceButton = document.getElementById('voiceButton');
    if (!SpeechRecognition) {
      voiceButton.disabled = true;
      voiceButton.title = 'Voice dictation is not available in this browser';
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => {
      getState().voiceMode = true;
      voiceButton.classList.add('recording');
    };
    recognition.onend = () => {
      getState().voiceMode = false;
      voiceButton.classList.remove('recording');
      document.getElementById('messageText')?.focus();
    };
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim();
      if (text) {
        document.getElementById('messageText').value = text;
        getState().voiceArmed = true;
      }
    };
    voiceButton.addEventListener('click', () => recognition.start());
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
      button.textContent = label;
    });
  },
  bindSplitter() {
    const workspace = document.getElementById('workspace');
    const splitter = document.getElementById('splitter');
    if (!workspace || !splitter) return;
    const splitterPx = splitter.getBoundingClientRect().height || 10;
    let dragging = false;
    const resize = (clientY) => {
      const rect = workspace.getBoundingClientRect();
      const usable = Math.max(1, rect.height - splitterPx);
      const sitePx = Math.min(usable, Math.max(0, clientY - rect.top));
      const sitePct = (sitePx / usable) * 100;
      const clamped = Math.min(99.5, Math.max(0.5, sitePct));
      workspace.style.setProperty('--site-height', `${clamped}fr`);
      workspace.style.setProperty('--chat-height', `${100 - clamped}fr`);
    };
    const stopDrag = () => { dragging = false; };
    splitter.addEventListener('pointerdown', (event) => {
      dragging = true;
      splitter.setPointerCapture(event.pointerId);
      resize(event.clientY);
    });
    splitter.addEventListener('pointermove', (event) => {
      if (dragging) resize(event.clientY);
    });
    splitter.addEventListener('pointerup', stopDrag);
    splitter.addEventListener('pointercancel', stopDrag);
  },
};

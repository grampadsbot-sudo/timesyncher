window.startVkAdminReview = (() => {
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chatText = (value) => safe(String(value || '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, '$1$2'));
  const chevron = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const check = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m20 6-11 11-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const brandLockup = '<div class="brand vk-app-brand" data-vk-wordmark="1"><img class="mark" src="/brand/vk-book-logo.svg" alt="Vacay Keepsake" width="28" height="30" /><span class="vk-print-wordmark">vacay <i>keepsake</i></span></div>';
  const views = [
    ['chat', 'Dialog'], ['travel-summary', 'Travel Summary'], ['trip', 'Vacation site'], ['keepsake', 'Keepsake'],
    ['onboarding', 'Onboarding'], ['captures', 'Chat screenshots'], ['vacations', 'All vacations'],
  ];
  const allCustomersIntro = 'Choose a customer to drill down into their trips, chat and QA.';
  const showTestCustomersKey = 'vkAdminShowTestCustomers';
  const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const state = { customers: new Map(), opened: [], recent: new Set(), details: new Map(), artifacts: new Map(),
    selection: null, view: 'all', attachments: [], voiceMode: false, voiceArmed: false, sending: false, opening: false,
    travelSummaries: new Map(), travelSummaryTurn: null,
    showTestCustomers: false, hiddenTestCount: 0, loadingCustomers: false };
  let notesRequest = 0;
  let root;

  const getState = () => state;
  const viewTrip = () => state.selection?.tripId;
  const customer = () => state.customers.get(state.selection?.key);
  const customerParam = (id) => id == null ? '' : `?customerId=${encodeURIComponent(id)}`;
  const notesQuery = (tripId, id) => {
    if (!tripId) return '';
    const params = new URLSearchParams({ vacationId: tripId });
    if (id != null) params.set('customerId', id);
    return `?${params}`;
  };
  const artifactsPath = (id) => `customers/${encodeURIComponent(id)}/artifacts`;
  const accountKey = (member, tripId) => member.id == null ? `vacation:${tripId}` : `customer:${member.id}`;
  const groupMembers = (group) => group.customers.length ? group.customers : [{ id: null, customer_label: group.label }];
  const testPill = (group) => group.testTag ? ` <small class="admin-test-tag">${safe(group.testTag)}</small>` : '';

  async function api(path, init) {
    const res = await fetch(`/api/admin/${path}`, { credentials: 'same-origin', ...init });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function turnMarkup(turn) {
    const user = turn.speaker === 'customer' || turn.direction === 'inbound';
    const label = String(turn.authorLabel || '').trim() || (user ? 'Customer' : 'Vacay Keepsake');
    const welcome = Boolean(turn.payload?.welcomeAudience);
    return `<article class="bubble ${user ? 'user' : ''}"><small>${safe(label)}</small>${user ? safe(turn.body) : window.tsVacationAppWelcome.turnHtml(turn.body, chatText, { welcome })}${user ? '' : (window.tsVacationAppAiImport?.renderTurnCardHtml(turn) || '')}</article>`;
  }

  function lockReplay(pane) {
    pane?.querySelectorAll('button, input, textarea, select').forEach((el) => { el.disabled = true; });
    pane?.querySelectorAll('[contenteditable]').forEach((el) => el.setAttribute('contenteditable', 'false'));
  }

  function viewMenuActions(vac, artifacts) {
    if (!vac) return '';
    const rows = [];
    const tripPath = artifactsPath(vac.tripId);
    const statusRow = (label) =>
      `<span class="trip-option admin-view-status" role="option" aria-disabled="true"><span></span><span class="trip-option-text"><b>${safe(label)}</b></span></span>`;
    const actionRow = (title, href, attrs = '') =>
      `<a class="trip-option admin-view-action" href="${href}" role="option" ${attrs}><span></span><span class="trip-option-text"><b>${safe(title)}</b></span></a>`;
    if (state.view === 'chat') {
      if (artifacts?.dialogPdf) rows.push(actionRow('Dialog PDF', `/api/admin/${tripPath}/dialog-pdf`, 'data-dialog-pdf="1" download'));
      else if (artifacts?.failed) rows.push(statusRow('Dialog PDF could not be loaded.'));
      else if (artifacts) rows.push(statusRow('No Dialog PDF yet'));
    }
    if (state.view === 'keepsake') {
      const share = vac.shareSlug ? encodeURIComponent(vac.shareSlug) : '';
      if (artifacts?.keepsakePdf) rows.push(actionRow('Keepsake PDF', `/api/admin/${tripPath}/keepsake-pdf`, 'data-keepsake-pdf download'));
      if (share) rows.push(actionRow('Generate', `/api/pdf/shared/${share}/report/keepsake-style-2.pdf`, 'data-keepsake-generate target="_blank" rel="noopener"'));
    }
    if (!rows.length) return '';
    return `<div class="admin-header-actions" role="group" aria-label="View actions">${rows.join('')}</div>`;
  }

  function switcher() {
    const account = customer();
<<<<<<< HEAD
    const viewLabel = views.find(([id]) => id === state.view)?.[1];
    const current = account ? (state.view === 'travel-summary' ? viewLabel : `${viewLabel} · ${account.name}`) : 'All Customers';
=======
    const vac = account ? state.details.get(viewTrip()) : null;
    const artifacts = vac ? state.artifacts.get(vac.tripId) : null;
    const current = account ? `${views.find(([id]) => id === state.view)[1]} · ${account.name}` : 'All Customers';
>>>>>>> origin/vk
    const option = (id, title, on, sub = '', attrs = '') => {
      return `<button class="trip-option ${on ? 'active' : ''}" type="button" data-trip-id="${safe(id)}" ${attrs} role="option" aria-selected="${on}"><span>${on ? check : ''}</span><span class="trip-option-text"><b>${safe(title)}</b>${sub ? `<small>${safe(sub)}</small>` : ''}</span></button>`;
    };
    const viewOptions = account ? views
      .filter(([id]) => id !== 'vacations' || account.vacations.length > 1)
      .map(([id, label]) => option(id, label, id === state.view, '', `data-view="${id}"`)).join('') : '';
    const viewActions = account ? viewMenuActions(vac, artifacts) : '';
    const runs = [...state.recent].map((key) => {
      const entry = state.customers.get(key);
      if (!entry) return '';
      const latest = entry.vacations[0];
      return `<div data-run-group="${safe(latest.tripId)}">${option(key, entry.name, false, latest.destination, `data-open-account="${safe(key)}"`)}</div>`;
    }).join('');
    const clear = state.opened.length ? '<button class="trip-option admin-clear-all" type="button" data-clear-all="1"><span></span><span class="trip-option-text"><b>Clear all</b></span></button>' : '';
    return `<div class="vacation-dropdown" id="vacationDropdown" data-trip-switcher-root="1"><button class="trip-button" id="tripButton" data-trip-switcher="1" type="button" aria-haspopup="listbox" aria-expanded="false"><span class="trip-trigger-text"><span class="trip-trigger-title">${safe(current)}</span></span>${chevron}</button><div class="trip-list" role="listbox">${viewOptions ? `<div class="admin-header-views" role="group" aria-label="Vacation views">${viewOptions}</div>` : ''}${viewActions}${option('all', 'All Customers', !account)}${runs}${clear}</div></div>`;
  }

  function customerList() {
    const intro = `<p class="admin-view-note" data-admin-customers-intro="1">${safe(allCustomersIntro)}</p>`;
    const count = state.hiddenTestCount ? ` (${safe(state.hiddenTestCount)})` : '';
    const toggle = `<label class="admin-view-note admin-test-toggle"><input type="checkbox" data-admin-show-test${state.showTestCustomers ? ' checked' : ''} /> Show test customers${count}</label><p class="admin-view-note" role="status" data-admin-customers-status hidden></p>`;
    return `<div class="admin-customers" data-admin-customers="1">${intro}${toggle}${[...state.customers].map(([key, account]) => {
      const latest = account.vacations[0];
      const coupon = account.coupon ? `<small class="admin-coupon">${safe(account.coupon)}</small>` : '';
      return `<section class="admin-group" data-trip-group="${safe(latest.tripId)}" data-sort-at="${safe(latest.sortAt)}"><header><b>${safe(account.name)}${testPill(latest)}</b><small>${safe(latest.destination)} · <time datetime="${safe(latest.sortAt)}">${safe(latest.sortAt.slice(0, 10))}</time></small>${coupon}</header><button class="admin-open" type="button" data-customer-id="${safe(account.id)}" data-open-account="${safe(key)}" aria-label="Open ${safe(account.name)}">${state.recent.has(key) ? 'Opened' : 'Open'}</button></section>`;
    }).join('')}</div>`;
  }

  function vacationList() {
    return `<div class="admin-customers" data-admin-vacations>${customer().vacations.map((vac) =>
      `<section class="admin-group"><header><b>${safe(vac.title || vac.destination || vac.label)}${testPill(vac)}</b><small>${safe(vac.destination)} · <time datetime="${safe(vac.sortAt)}">${safe(vac.sortAt.slice(0, 10))}</time></small></header><button class="admin-open" type="button" data-open-vacation="${safe(vac.tripId)}">${vac.tripId === viewTrip() ? 'Current vacation' : 'Open'}</button></section>`).join('')}</div>`;
  }

  const usdActual = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 8 });
  const usdEstimated = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

  function costLines(costs) {
    return `<span data-cost="actual">Actual ${usdActual.format(costs.actual)}</span> <span data-cost="estimated">Estimated ${usdEstimated.format(costs.estimated)}</span>${costs.unpriced ? ` <span data-cost="unpriced">${costs.unpriced} unpriced</span>` : ''}`;
  }

  function dialogResults(vac) {
    return [['QA', vac.qa], ['Survey', vac.survey]].filter(([, data]) => data != null).map(([label, data]) =>
      `<section class="admin-result" data-review-result="${label.toLowerCase()}"><h3>${label}</h3><pre>${safe(typeof data === 'string' ? data : JSON.stringify(data, null, 2))}</pre></section>`).join('');
  }

  function dialog(vac, artifacts) {
    const turns = (vac.turns || []).map((turn, index) => {
      if (turn.speaker === 'system' || turn.direction === 'system') return '';
      const detail = vac.replyDetails?.[index];
      if (detail && turn.fixedOpener === true && !detail.model && !detail.priced) {
        return `${turnMarkup(turn)}<p class="admin-reply-detail"><strong>Opening greeting (no model, no cost)</strong></p>`;
      }
      const meta = detail ? `<p class="admin-reply-detail"><strong>${safe(detail.model || 'Model unavailable')}</strong> · ${detail.priced ? costLines(detail.costs) : '<span data-cost="unpriced">unpriced</span>'}</p>` : '';
      return `${turnMarkup(turn)}${meta}`;
    }).join('');
    return `<div class="admin-dialog-head"><div class="admin-costs" data-vacation-total aria-label="Vacation total"><strong>Vacation total</strong> ${costLines(vac.costs)}</div></div><div class="messages" id="customerChatReplay" data-readonly="true" aria-readonly="true" aria-label="${safe(vac.label)} chat (read only)">${turns || '<p class="admin-empty">No chat turns are stored for this vacation yet.</p>'}</div>${dialogResults({ qa: artifacts?.review?.qa ?? vac.qa, survey: artifacts?.review?.survey ?? vac.survey })}`;
  }

  function vacationSite(vac) {
    if (!vac.shareSlug) return '<p class="admin-empty">No trip is stored for this vacation yet.</p>';
    const src = `/shared/${encodeURIComponent(vac.shareSlug)}/?embed=1`;
    return `<iframe title="${safe(vac.label)} trip (view only)" src="${src}" credentialless sandbox="allow-scripts allow-same-origin" data-trip-frame="1"></iframe>`;
  }

  function keepsake(vac) {
    if (!vac.shareSlug) return '<p class="admin-empty">No keepsake is available for this vacation yet.</p>';
    const share = encodeURIComponent(vac.shareSlug);
    const preview = `/shared/${share}/journey?style=2&printMode=report&pdfReport=keepsake-style-2`;
    return `<iframe title="${safe(vac.label)} keepsake" src="${preview}" credentialless data-keepsake-frame></iframe>`;
  }

  function travelSummaryCover(snapshot) {
    if (!snapshot || !['tripName', 'where', 'who', 'transport', 'description'].some((field) => snapshot[field])) {
      return '<p class="admin-empty" role="status">No travel details recorded for this turn.</p>';
    }
    const facts = [['where', 'Where'], ['who', 'Who'], ['transport', 'Getting there']]
      .filter(([field]) => snapshot[field])
      .map(([field, label]) => `<div><dt>${label}</dt><dd data-travel-field="${field}">${safe(snapshot[field])}</dd></div>`).join('');
    return `<article class="admin-travel-cover" data-travel-cover>${snapshot.tripName ? `<header><img src="/brand/vk-book-logo.svg" alt="" width="30" height="32"><h1 data-travel-field="tripName">${safe(snapshot.tripName)}</h1></header>` : ''}${facts ? `<dl>${facts}</dl>` : ''}${snapshot.description ? `<p data-travel-field="description">${safe(snapshot.description)}</p>` : ''}</article>`;
  }

  function travelSummary(vac) {
    const result = state.travelSummaries.get(vac.tripId);
    if (!result) return '<p class="admin-empty" role="status">Loading Travel Summary…</p>';
    if (result.failed) return '<p class="admin-empty" role="status">Travel Summary could not be loaded.</p>';
    const { snapshots } = result;
    if (!snapshots.length) return '<p class="admin-empty" role="status">No customer turns recorded for this vacation.</p>';
    const chosen = snapshots.findIndex(({ turnId }) => turnId === state.travelSummaryTurn);
    const index = chosen < 0 ? snapshots.length - 1 : chosen;
    const snapshot = snapshots[index];
    return `<section class="admin-travel" aria-label="Travel Summary"><div class="admin-travel-scrubber"><label for="adminTravelTurn">Turn</label><input id="adminTravelTurn" type="range" min="1" max="${snapshots.length}" value="${index + 1}" aria-valuetext="${snapshot.turnNumber} of ${snapshots.length}"${snapshots.length === 1 ? ' disabled' : ''}><output for="adminTravelTurn">${snapshot.turnNumber} / ${snapshots.length}</output></div><div data-travel-snapshot="${safe(snapshot.turnId)}">${travelSummaryCover(snapshot)}</div></section>`;
  }

  function scrubTravelSummary(event) {
    const control = event.target;
    if (control.id !== 'adminTravelTurn') return;
    const { snapshots } = state.travelSummaries.get(viewTrip());
    const snapshot = snapshots[control.valueAsNumber - 1];
    if (!snapshot) return;
    state.travelSummaryTurn = snapshot.turnId;
    control.setAttribute('aria-valuetext', `${snapshot.turnNumber} of ${snapshots.length}`);
    const view = control.closest('.admin-travel');
    view.querySelector('output').textContent = `${snapshot.turnNumber} / ${snapshots.length}`;
    const content = view.querySelector('[data-travel-snapshot]');
    content.dataset.travelSnapshot = snapshot.turnId;
    content.innerHTML = travelSummaryCover(snapshot);
  }

  function onboarding(vac, artifacts) {
    const sessions = vac.onboarding || [];
    const replay = sessions.length ? `<div class="admin-replay" data-onboarding-replay aria-label="Onboarding replay">${sessions.map((session) => `<section>
      <h3>${safe(session.currentStep?.replaceAll('_', ' ') || 'Onboarding')}</h3><p>${safe(session.status?.replaceAll('_', ' '))}</p>
      <ol>${session.events.map((event) => `<li><span>${safe(event.label)}</span> <time datetime="${safe(event.at)}">${safe(new Date(event.at).toLocaleString())}</time></li>`).join('')}</ol>
    </section>`).join('')}</div>` : '';
    if (!artifacts) return replay + '<p class="admin-empty">Loading onboarding captures…</p>';
    if (artifacts.failed) return replay + '<p class="admin-empty" role="status">Onboarding captures could not be loaded.</p>';
    const shots = artifacts.onboardingCaptures || [];
    const harnessRun = String(vac.harnessTag || '').trim();
    if (!shots.length && harnessRun) {
      return `${replay}<p class="admin-error" role="alert" data-onboarding-missing="1" data-harness-run="${safe(harnessRun)}">Onboarding captures missing for this run <strong>${safe(harnessRun)}</strong>.</p>`;
    }
    if (!shots.length) return replay || '<p class="admin-empty">No onboarding is stored for this vacation yet.</p>';
    const guests = new Map();
    for (const shot of shots) {
      const key = `${shot.role}/${shot.guest}`;
      if (!guests.has(key)) guests.set(key, []);
      guests.get(key).push(shot);
    }
    const groups = [...guests.values()];
    const sections = groups.map((group) => {
      const { role, roleLabel } = group[0];
      const sameRole = groups.filter(([shot]) => shot.role === role);
      const label = sameRole.length > 1 ? `${roleLabel} ${sameRole.indexOf(group) + 1}` : roleLabel;
      const figures = group.map(({ artifact, title, screen, width, vacationId }) => `<figure data-onboarding-stage="${safe(screen)}"
        data-onboarding-role="${safe(role)}" data-vacation-id="${safe(vacationId)}" data-capture-width="${safe(width)}">
        <figcaption>${safe(title)} · ${safe(width)} px</figcaption><img src="/api/admin/${artifactsPath(vac.tripId)}/${encodeURIComponent(artifact)}"
          alt="${safe(`${label} ${title}`)}" width="${safe(width)}" height="844" loading="lazy"></figure>`).join('');
      return `<section aria-label="${safe(label)}"><h3 class="admin-replay">${safe(label)}</h3><div class="admin-captures">${figures}</div></section>`;
    });
    return replay + sections.join('');
  }

  function captures(vac, artifacts) {
    if (!artifacts) return '<p class="admin-empty">Loading captures…</p>';
    if (artifacts.failed) return '<p class="admin-empty" role="status">Captures could not be loaded.</p>';
    if (!artifacts.turns.length) return '<p class="admin-empty">No captures</p>';
    return `<div class="admin-captures">${artifacts.turns.map((turn) =>
      `<figure><figcaption>Turn ${turn}</figcaption><img src="/api/admin/${artifactsPath(vac.tripId)}/turn-${turn}" alt="Chat after customer turn ${turn}" data-capture-turn="${turn}" width="390" height="844" loading="lazy"></figure>`).join('')}</div>`;
  }

  function sitePane() {
    if (state.view === 'all') return `<div class="site-pane" id="sitePane" data-kind="customers">${customerList()}</div>`;
    const vac = state.details.get(viewTrip());
    return `<div class="site-pane admin-vacation" id="sitePane" data-kind="${state.view}" data-run="${safe(vac.tripId)}"><div class="admin-view-panel">${viewContent(vac)}</div></div>`;
  }

  function viewContent(vac) {
    const renderView = { chat: dialog, 'travel-summary': travelSummary, trip: vacationSite, keepsake, onboarding, captures, vacations: vacationList }[state.view];
    return renderView(vac, state.artifacts.get(vac.tripId));
  }

  function renderGate(message = '') {
    root.innerHTML = `<main class="session-gate"><section class="gate-card">${brandLockup}<h1>Admin review</h1>${message ? `<p class="error" role="alert">${safe(message)}</p>` : '<p>Sign in to review customer vacations.</p>'}<form class="session-form" id="adminLogin"><input id="adminLoginInput" name="login" type="password" placeholder="Admin sign-in" autocomplete="current-password" required><button type="submit">Sign in</button></form></section></main>`;
    document.getElementById('adminLogin').addEventListener('submit', signIn);
  }

  function render() {
    const composer = customer() ? window.tsChatComposer.markup({ messageLabel: 'Admin message' }) : '';
    root.innerHTML = `<main class="app" data-admin="1"><header class="topbar" id="appHeader">${brandLockup}${switcher()}</header><section class="workspace" id="workspace">${sitePane()}<div class="splitter-row" id="splitterRow"><span class="splitter-track" id="splitterTrack" aria-hidden="true"></span><button class="splitter" id="splitter" type="button" aria-label="Resize review and chat panels"></button></div><section class="chat-pane" aria-label="Admin thread"><div class="messages" id="messages" data-screen="admin"></div>${composer}</section></section></main>`;
    document.title = 'Vacay Keepsake admin';
    lockReplay(document.getElementById('customerChatReplay'));
    window.tsVacationAppChrome.bindSplitter();
    if (composer) {
      window.tsChatComposer.bind({ getState, onSubmit: adminSubmit });
      window.tsChatComposer.renderAttachments(state.attachments);
    }
    void refreshNotes();
  }

  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'tripButton') {
      event.stopPropagation();
      const open = document.getElementById('vacationDropdown').classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    } else if (button.dataset.view) {
      state.view = button.dataset.view;
      renderViewPane();
      if (state.view === 'travel-summary') void loadTravelSummary(viewTrip());
      document.getElementById('tripButton').focus();
    } else if (button.dataset.tripId === 'all') showCustomer(null);
    else if (button.hasAttribute('data-clear-all')) void clearAll();
    else if (button.dataset.openAccount) void openVacation(button.dataset.openAccount);
    else if (button.dataset.openVacation) void openVacation(state.selection.key, button.dataset.openVacation);
  }

  function renderViewPane() {
    const pane = document.getElementById('sitePane');
    const vac = state.details.get(viewTrip());
    pane.dataset.kind = state.view;
    pane.dataset.run = vac.tripId;
    pane.querySelector('.admin-view-panel').innerHTML = viewContent(vac);
    lockReplay(document.getElementById('customerChatReplay'));
    document.getElementById('vacationDropdown').outerHTML = switcher();
  }

  function renderNote(note, customerId) {
    const query = notesQuery(note.vacationId, customerId);
    const welcome = note.kind === 'welcome';
    const links = note.attachments.map((file, index) =>
      `<a href="/api/admin/notes/${safe(note.id)}/${index}${safe(query)}" download="${safe(file.name)}">${safe(file.name)}</a>`).join(' ');
    return `<article class="bubble admin-note${welcome ? '' : ' user'}" data-admin-note data-vacation-id="${safe(note.vacationId)}"${welcome ? ' data-admin-welcome' : ''}><small>${welcome ? 'Vacay Keepsake' : 'Admin'} · <time datetime="${safe(note.at)}">${safe(new Date(note.at).toLocaleString())}</time></small>${safe(note.text)}${links ? `<div class="admin-note-files">${links}</div>` : ''}</article>`;
  }

  async function refreshNotes() {
    const id = customer()?.id;
    const request = ++notesRequest;
    const result = await api(`notes${notesQuery(viewTrip(), id)}`).catch(() => null);
    if (request !== notesRequest) return;
    const pane = document.getElementById('messages');
    if (!pane) return;
    if (result?.res.ok) pane.innerHTML = result.data.notes.map((note) => renderNote(note, id)).join('');
    else pane.innerHTML = '<p class="admin-empty" role="status">Notes could not be loaded.</p>';
    pane.scrollTop = pane.scrollHeight;
  }

  function encodeFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, data: String(reader.result).split(',')[1] });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function adminSubmit(event) {
    event.preventDefault();
    const textarea = document.getElementById('messageText');
    const text = textarea.value.trim();
    if (!customer() || state.sending || (!text && !state.attachments.length)) return;
    const key = state.selection.key;
    const customerId = customer().id == null ? null : String(customer().id);
    const vacationId = viewTrip();
    const files = state.attachments;
    const send = document.getElementById('sendButton');
    state.sending = true;
    send.disabled = true;
    try {
      if (files.reduce((sum, file) => sum + file.size, 0) > 3 * 1024 * 1024) throw new Error('The combined upload limit is 3 MB.');
      const attachments = await Promise.all(files.map(encodeFile));
      const { res, data } = await api('notes', json('POST', { customerId, vacationId, text, attachments }));
      if (!res.ok) throw new Error(data.error || 'Note could not be saved.');
      if (textarea.isConnected) {
        if (textarea.value.trim() === text) textarea.value = '';
        if (state.attachments === files) state.attachments = [];
        window.tsChatComposer.renderAttachments(state.attachments);
        window.tsChatComposer.resizeComposer(textarea);
        textarea.focus();
      }
      if (state.selection?.key === key) await refreshNotes();
    } catch (error) {
      if (textarea.isConnected) window.tsChatComposer.renderAttachments(files, error?.message || 'Note could not be saved.');
    } finally {
      state.sending = false;
      send.disabled = false;
    }
  }

  async function signIn(event) {
    event.preventDefault();
    const input = document.getElementById('adminLoginInput');
    const { res } = await api('session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: input.value }) });
    input.value = '';
    if (res.status === 503) return renderGate('Admin sign-in is not configured here.');
    if (!res.ok) return renderGate('Sign-in failed.');
    return refresh();
  }

  function indexCustomers(groups) {
    state.customers.clear();
    for (const group of groups) {
      for (const member of groupMembers(group)) {
        const key = accountKey(member, group.tripId);
        if (!state.customers.has(key)) {
          state.customers.set(key, { id: member.id, name: member.customer_label, coupon: member.test_coupon, vacations: [] });
        }
        state.customers.get(key).vacations.push(group);
      }
      if (state.opened.includes(group.tripId)) state.recent.add(accountKey(groupMembers(group)[0], group.tripId));
    }
  }

  const fetchCustomers = (includeTest) => api(includeTest ? 'customers?includeTest=1' : 'customers');

  function updateCustomers(data) {
    state.opened = data.opened || [];
    state.hiddenTestCount = data.hiddenTestCount || 0;
    indexCustomers(data.groups || []);
  }

  async function setTestCustomers(input) {
    if (state.opening) {
      input.checked = state.showTestCustomers;
      return;
    }
    const includeTest = input.checked;
    const status = root.querySelector('[data-admin-customers-status]');
    status.hidden = true;
    state.loadingCustomers = input.disabled = true;
    try {
      const { res, data } = await fetchCustomers(includeTest);
      if (res.status === 401) return renderGate();
      if (!res.ok) throw new Error('Customer list could not be loaded.');
      state.showTestCustomers = includeTest;
      try {
        sessionStorage.setItem(showTestCustomersKey, includeTest ? '1' : '0');
      } catch {
        // The choice still applies if browser storage is unavailable.
      }
      updateCustomers(data);
      showCustomer(null);
      root.querySelector('[data-admin-show-test]').focus();
    } catch {
      input.checked = state.showTestCustomers;
      status.textContent = 'Customer list could not be loaded.';
      status.hidden = false;
    } finally {
      state.loadingCustomers = input.disabled = false;
    }
  }

  async function refresh() {
    const { res, data } = await fetchCustomers(state.showTestCustomers);
    if (res.status === 401) return renderGate();
    if (res.status === 503) return renderGate('Admin sign-in is not configured here.');
    if (!res.ok) return renderGate('Admin review is not available.');
    updateCustomers(data);
    const selection = history.state?.vkAdminSelection;
    const finish = state.opened.includes(selection?.tripId)
      && state.customers.get(selection.key)?.vacations.some((vac) => vac.tripId === selection.tripId);
    if (finish) {
      const { res, data } = await api(`customers/${encodeURIComponent(selection.tripId)}`);
      if (res.ok && data.vacation) {
        state.details.set(selection.tripId, data.vacation);
        state.recent.add(selection.key);
        return showCustomer(selection);
      }
    }
    showCustomer(null);
  }

  async function openVacation(key, tripId = state.customers.get(key).vacations[0].tripId) {
    if (state.opening || state.loadingCustomers) return;
    state.opening = true;
    try {
      const { id } = state.customers.get(key);
      const { res, data } = await api(`customers/${encodeURIComponent(tripId)}/open${customerParam(id)}`, { method: 'POST' });
      if (res.status === 401) return renderGate();
      if (!res.ok || !data.vacation) throw new Error('Vacation could not be opened.');
      state.details.set(tripId, data.vacation);
      state.opened = data.opened || state.opened;
      state.recent.add(key);
      showCustomer({ key, tripId });
    } catch {
      document.getElementById('sitePane')?.insertAdjacentHTML('afterbegin', '<p class="admin-empty" role="status">Vacation could not be opened.</p>');
    } finally {
      state.opening = false;
    }
  }

  function showCustomer(selection) {
    const sameCustomer = selection && selection.key === state.selection?.key;
    if (!sameCustomer) {
      state.attachments = [];
      state.voiceArmed = false;
    }
    state.selection = selection;
    state.view = selection ? 'chat' : 'all';
    state.travelSummaryTurn = null;
    history.replaceState({ ...history.state, vkAdminSelection: selection }, '');
    if (sameCustomer) renderViewPane();
    else render();
    if (selection) void loadArtifacts(selection.tripId);
  }

  async function loadArtifacts(id) {
    const result = await api(artifactsPath(id)).catch(() => null);
    const artifacts = result?.res.ok ? result.data : { failed: true };
    state.artifacts.set(id, artifacts);
    if (viewTrip() === id && ['chat', 'captures', 'keepsake', 'onboarding'].includes(state.view)) {
      const vac = state.details.get(id);
      document.querySelector('.admin-view-panel').innerHTML = viewContent(vac);
      lockReplay(document.getElementById('customerChatReplay'));
      document.getElementById('vacationDropdown').outerHTML = switcher();
    }
  }

  async function loadTravelSummary(id) {
    const result = await api(`${artifactsPath(id)}/travel-summary`).catch(() => null);
    state.travelSummaries.set(id, result?.res.ok ? result.data : { failed: true });
    if (viewTrip() === id && state.view === 'travel-summary') {
      document.querySelector('.admin-view-panel').innerHTML = travelSummary(state.details.get(id));
    }
  }

  async function clearAll() {
    if (state.opening || state.loadingCustomers) return;
    const { res, data } = await api('clear-all', { method: 'POST' });
    if (res.status === 401) return renderGate();
    if (!res.ok) return;
    state.opened = data.opened || [];
    state.recent.clear();
    state.details.clear();
    state.artifacts.clear();
    state.travelSummaries.clear();
    showCustomer(null);
  }

  function closeMenu() {
    document.getElementById('vacationDropdown')?.classList.remove('open');
    document.getElementById('tripButton')?.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !document.querySelector('#vacationDropdown.open')) return;
    closeMenu();
    document.getElementById('tripButton').focus();
  });

  return (mount) => {
    root = mount;
    try {
      state.showTestCustomers = sessionStorage.getItem(showTestCustomersKey) === '1';
    } catch {
      state.showTestCustomers = false;
    }
    root.addEventListener('click', handleClick);
    root.addEventListener('input', scrubTravelSummary);
    root.addEventListener('change', (event) => {
      if (event.target.matches('[data-admin-show-test]')) void setTestCustomers(event.target);
    });
    return refresh().catch((error) => {
      console.error(error);
      renderGate('Admin review could not load.');
    });
  };
})();

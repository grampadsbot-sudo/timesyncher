window.startVkAdminReview = (() => {
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chatText = (value) => safe(String(value || '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, '$1$2'));
  const chevron = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const check = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m20 6-11 11-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const brandLockup = '<div class="brand vk-app-brand" data-vk-wordmark="1"><img class="mark" src="/brand/vk-book-logo.svg" alt="Vacay Keepsake" width="28" height="30" /><span class="vk-print-wordmark">vacay <i>keepsake</i></span></div>';
  const views = [
    ['chat', 'Dialog'], ['trip', 'Vacation site'], ['keepsake', 'Keepsake'],
    ['onboarding', 'Onboarding'], ['captures', 'First 5 turns'],
  ];
  const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const state = { groups: [], opened: [], details: new Map(), artifacts: new Map(), view: 'all', attachments: [], voiceMode: false, voiceArmed: false, sending: false };
  let notesRequest = 0;
  let root;

  const getState = () => state;
  const viewTrip = () => (state.view === 'all' ? '' : state.view.slice(0, state.view.lastIndexOf(':')));
  const customer = () => viewTrip() || null;
  const customerQuery = (id) => id == null ? '' : `?customer=${encodeURIComponent(id)}`;
  const artifactsPath = (id) => `customers/${encodeURIComponent(id)}/artifacts`;
  const viewKind = () => (state.view === 'all' ? 'all' : state.view.slice(state.view.lastIndexOf(':') + 1));

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

  function switcher() {
    const current = state.view === 'all' ? 'All Customers' : `${state.details.get(viewTrip())?.label || 'Vacation'}`;
    const option = (id, title, sub = '') => {
      const on = id === state.view || (id !== 'all' && id === `${viewTrip()}:chat`);
      return `<button class="trip-option ${on ? 'active' : ''}" type="button" data-trip-id="${safe(id)}" role="option" aria-selected="${on ? 'true' : 'false'}"><span>${on ? check : ''}</span><span class="trip-option-text"><b>${safe(title)}</b>${sub ? `<small>${safe(sub)}</small>` : ''}</span></button>`;
    };
    const runs = state.opened.map((tripId) => {
      const vac = state.details.get(tripId);
      if (!vac) return '';
      return `<div class="admin-run" data-run-group="${safe(tripId)}">${option(`${tripId}:chat`, vac.label, vac.destination)}</div>`;
    }).join('');
    const clear = state.opened.length ? '<button class="trip-option admin-clear-all" type="button" data-clear-all="1"><span></span><span class="trip-option-text"><b>Clear all</b></span></button>' : '';
    return `<div class="vacation-dropdown" id="vacationDropdown" data-trip-switcher-root="1"><button class="trip-button" id="tripButton" data-trip-switcher="1" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Switch customer"><span class="trip-trigger-text"><span class="trip-trigger-title">${safe(current)}</span></span>${chevron}</button><div class="trip-list" role="listbox">${option('all', 'All Customers', `${state.groups.length} vacations`)}${runs}${clear}</div></div>`;
  }

  function customerList() {
    return `<div class="admin-customers" data-admin-customers="1">${state.groups.map((group) => {
      const names = group.customers.map((c) => `<li><span>${safe(c.customer_label)}</span>${c.test_coupon ? `<small class="admin-coupon">${safe(c.test_coupon)}</small>` : ''}</li>`).join('');
      const open = state.opened.includes(group.tripId);
      return `<section class="admin-group" data-trip-group="${safe(group.tripId)}" data-sort-at="${safe(group.sortAt)}"><header><b>${safe(group.label)}</b><small>${safe(group.destination)} · <time datetime="${safe(group.sortAt)}">${safe(group.sortAt.slice(0, 10))}</time></small></header>${names ? `<ul>${names}</ul>` : ''}<button class="admin-open" type="button" data-vk-open="1" data-customer-id="${safe(group.tripId)}">${open ? 'Opened' : 'Open'}</button></section>`;
    }).join('')}</div>`;
  }

  function viewControls() {
    return `<div class="admin-view-controls"><label for="adminView">View</label><select id="adminView">${views.map(([kind, label]) =>
      `<option value="${kind}"${kind === viewKind() ? ' selected' : ''}>${label}</option>`).join('')}</select></div>`;
  }

  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 8 });
  const money = (value) => usd.format(value);

  function costLines(costs) {
    return `<span data-cost="actual">Actual ${money(costs.actual)}</span> <span data-cost="estimated">Estimated ${money(costs.estimated)}</span>${costs.unpriced ? ` <span data-cost="unpriced">${costs.unpriced} unpriced</span>` : ''}`;
  }

  function dialogResults(vac) {
    return [['QA', vac.qa], ['Survey', vac.survey]].filter(([, data]) => data != null).map(([label, data]) =>
      `<section class="admin-result" data-review-result="${label.toLowerCase()}"><h3>${label}</h3><pre>${safe(typeof data === 'string' ? data : JSON.stringify(data, null, 2))}</pre></section>`).join('');
  }

  function dialog(vac, artifacts) {
    const turns = (vac.turns || []).map((turn, index) => {
      if (turn.speaker === 'system' || turn.direction === 'system') return '';
      const detail = vac.replyDetails?.[index];
      const meta = detail ? `<p class="admin-reply-detail"><strong>${safe(detail.model || 'Model unavailable')}</strong> · ${detail.priced ? costLines(detail.costs) : '<span data-cost="unpriced">unpriced</span>'}</p>` : '';
      return `${turnMarkup(turn)}${meta}`;
    }).join('');
    const pdf = artifacts?.dialogPdf
      ? `<a class="admin-action" data-dialog-pdf href="/api/admin/${artifactsPath(vac.tripId)}/dialog-pdf" download>Dialog PDF</a>`
      : (artifacts?.failed ? '<span class="admin-status">Dialog PDF could not be loaded.</span>' :
        artifacts ? '<span class="admin-status">No Dialog PDF yet</span>' : '');
    return `<div class="admin-dialog-head"><div class="admin-costs" data-vacation-total aria-label="Vacation total"><strong>Vacation total</strong> ${costLines(vac.costs)}</div>${pdf}</div><div class="messages" id="customerChatReplay" data-readonly="true" aria-readonly="true" aria-label="${safe(vac.label)} chat (read only)">${turns || '<p class="admin-empty">No chat turns are stored for this vacation yet.</p>'}</div>${dialogResults({ qa: artifacts?.review?.qa ?? vac.qa, survey: artifacts?.review?.survey ?? vac.survey })}`;
  }

  function vacationSite(vac) {
    if (!vac.shareSlug) return '<p class="admin-empty">No trip is stored for this vacation yet.</p>';
    const src = `/shared/${encodeURIComponent(vac.shareSlug)}/?embed=1`;
    return `<iframe title="${safe(vac.label)} trip (view only)" src="${src}" credentialless sandbox="allow-scripts allow-same-origin" data-trip-frame="1"></iframe>`;
  }

  function keepsake(vac) {
    if (!vac.shareSlug) return '<p class="admin-empty">No keepsake is available for this vacation yet.</p>';
    const share = encodeURIComponent(vac.shareSlug);
    const generate = `/api/pdf/shared/${share}/report/keepsake-style-2.pdf`;
    const preview = `/shared/${share}/journey?style=2&printMode=report&pdfReport=keepsake-style-2`;
    return `<div class="admin-keepsake-actions"><a class="admin-action" href="${generate}" target="_blank" rel="noopener" data-keepsake-generate>Generate</a></div><iframe title="${safe(vac.label)} keepsake" src="${preview}" credentialless data-keepsake-frame></iframe>`;
  }

  function onboarding(vac) {
    const sessions = vac.onboarding || [];
    if (!sessions.length) return '<p class="admin-empty">No onboarding is stored for this vacation yet.</p>';
    return `<div class="admin-replay" data-onboarding-replay aria-label="Onboarding replay">${sessions.map((session) => `<section>
      <h3>${safe(session.currentStep?.replaceAll('_', ' ') || 'Onboarding')}</h3><p>${safe(session.status?.replaceAll('_', ' '))}</p>
      <ol>${session.events.map((event) => `<li><span>${safe(event.label)}</span> <time datetime="${safe(event.at)}">${safe(new Date(event.at).toLocaleString())}</time></li>`).join('')}</ol>
    </section>`).join('')}</div>`;
  }

  function captures(vac, artifacts) {
    if (!artifacts) return '<p class="admin-empty">Loading captures…</p>';
    if (artifacts.failed) return '<p class="admin-empty" role="status">Captures could not be loaded.</p>';
    if (!artifacts.turns.length) return '<p class="admin-empty">No captures</p>';
    return `<div class="admin-captures">${artifacts.turns.map((turn) =>
      `<figure><figcaption>Turn ${turn}</figcaption><img src="/api/admin/${artifactsPath(vac.tripId)}/turn-${turn}" alt="Chat after customer turn ${turn}" data-capture-turn="${turn}" width="390" height="844" loading="lazy"></figure>`).join('')}</div>`;
  }

  function sitePane() {
    const kind = viewKind();
    if (kind === 'all') return `<div class="site-pane" id="sitePane" data-kind="customers">${customerList()}</div>`;
    const vac = state.details.get(viewTrip());
    if (!vac) return '<div class="site-pane" id="sitePane" data-kind="loading"></div>';
    return `<div class="site-pane admin-vacation" id="sitePane" data-kind="${kind}" data-run="${safe(vac.tripId)}">${viewControls()}<div class="admin-view-panel">${viewContent(vac)}</div></div>`;
  }

  function viewContent(vac) {
    const renderView = { chat: dialog, trip: vacationSite, keepsake, onboarding, captures }[viewKind()];
    return renderView(vac, state.artifacts.get(vac.tripId));
  }

  function renderGate(message = '') {
    root.innerHTML = `<main class="session-gate"><section class="gate-card">${brandLockup}<h1>Admin review</h1>${message ? `<p class="error" role="alert">${safe(message)}</p>` : '<p>Sign in to review customer vacations.</p>'}<form class="session-form" id="adminLogin"><input id="adminLoginInput" name="login" type="password" placeholder="Admin sign-in" autocomplete="current-password" required><button type="submit">Sign in</button></form></section></main>`;
    document.getElementById('adminLogin').addEventListener('submit', signIn);
  }

  function render() {
    root.innerHTML = `<main class="app" data-admin="1"><header class="topbar" id="appHeader">${brandLockup}${switcher()}</header><section class="workspace" id="workspace">${sitePane()}<div class="splitter-row" id="splitterRow"><span class="splitter-track" id="splitterTrack" aria-hidden="true"></span><button class="splitter" id="splitter" type="button" aria-label="Resize review and chat panels"></button></div><section class="chat-pane" aria-label="Admin notes"><div class="messages" id="messages" data-screen="admin" aria-label="${customer() ? 'Vacation notes' : 'General notes'}"></div>${window.tsChatComposer.markup({ messageLabel: 'Admin message' })}</section></section></main>`;
    document.title = 'Vacay Keepsake admin';
    lockReplay(document.getElementById('customerChatReplay'));
    bind();
    void refreshNotes();
  }

  function bind() {
    const menu = document.getElementById('vacationDropdown');
    const button = document.getElementById('tripButton');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
    });
    menu.querySelectorAll('[data-trip-id]').forEach((option) => option.addEventListener('click', () => {
      if (option.dataset.tripId === 'all') showCustomer(null);
      else showCustomer(option.dataset.tripId.slice(0, -5));
    }));
    bindView();
    menu.querySelector('[data-clear-all]')?.addEventListener('click', clearAll);
    root.querySelectorAll('[data-vk-open]').forEach((el) => el.addEventListener('click', () => openVacation(el.dataset.customerId)));
    window.tsVacationAppChrome.bindSplitter();
    window.tsChatComposer.bind({ getState, onSubmit: adminSubmit });
    window.tsChatComposer.renderAttachments(state.attachments);
  }

  function bindView() {
    document.getElementById('adminView')?.addEventListener('change', (event) => {
      state.view = `${viewTrip()}:${event.target.value}`;
      renderViewPane();
      document.getElementById('adminView').focus();
    });
  }

  function renderViewPane() {
    const pane = document.getElementById('sitePane');
    const vac = state.details.get(viewTrip());
    pane.dataset.kind = viewKind();
    pane.querySelector('.admin-view-panel').innerHTML = viewContent(vac);
    lockReplay(document.getElementById('customerChatReplay'));
  }

  function renderNote(note, id) {
    const query = customerQuery(id);
    const links = note.attachments.map((file, index) =>
      `<a href="/api/admin/notes/${safe(note.id)}/${index}${safe(query)}" download="${safe(file.name)}">${safe(file.name)}</a>`).join(' ');
    return `<article class="bubble user admin-note" data-admin-note><small>Admin · <time datetime="${safe(note.at)}">${safe(new Date(note.at).toLocaleString())}</time></small>${safe(note.text)}${links ? `<div class="admin-note-files">${links}</div>` : ''}</article>`;
  }

  async function refreshNotes() {
    const id = customer();
    const request = ++notesRequest;
    const result = await api(`notes${customerQuery(id)}`).catch(() => null);
    if (request !== notesRequest || id !== customer()) return;
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
    if (state.sending || (!text && !state.attachments.length)) return;
    const id = customer();
    const files = state.attachments;
    const send = document.getElementById('sendButton');
    state.sending = true;
    send.disabled = true;
    try {
      if (files.reduce((sum, file) => sum + file.size, 0) > 3 * 1024 * 1024) throw new Error('The combined upload limit is 3 MB.');
      const attachments = await Promise.all(files.map(encodeFile));
      const { res, data } = await api('notes', json('POST', { customer: id, text, attachments }));
      if (!res.ok) throw new Error(data.error || 'Note could not be saved.');
      if (customer() === id && textarea.isConnected) {
        if (textarea.value.trim() === text) textarea.value = '';
        if (state.attachments === files) state.attachments = [];
        window.tsChatComposer.renderAttachments(state.attachments);
        window.tsChatComposer.resizeComposer(textarea);
        textarea.focus();
      }
      if (customer() === id) await refreshNotes();
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

  async function loadDetail(tripId) {
    if (state.details.has(tripId)) return;
    const { res, data } = await api(`customers/${encodeURIComponent(tripId)}`);
    if (res.ok && data.vacation) state.details.set(tripId, data.vacation);
  }

  async function refresh() {
    const { res, data } = await api('customers');
    if (res.status === 401) return renderGate();
    if (res.status === 503) return renderGate('Admin sign-in is not configured here.');
    if (!res.ok) return renderGate('Admin review is not available.');
    state.groups = data.groups || [];
    state.opened = data.opened || [];
    await Promise.all(state.opened.map(loadDetail));
    state.opened = state.opened.filter((id) => state.details.has(id));
    if (state.view !== 'all' && !state.opened.includes(viewTrip())) state.view = 'all';
    render();
  }

  async function openVacation(tripId) {
    const { res, data } = await api(`customers/${encodeURIComponent(tripId)}/open`, { method: 'POST' });
    if (res.status === 401) return renderGate();
    if (!res.ok || !data.vacation) return;
    state.details.set(tripId, data.vacation);
    state.opened = data.opened || state.opened;
    showCustomer(tripId);
  }

  function showCustomer(id) {
    if (id !== customer()) {
      state.attachments = [];
      state.voiceArmed = false;
    }
    state.view = id ? `${id}:chat` : 'all';
    render();
    if (id) void loadArtifacts(id);
  }

  async function loadArtifacts(id) {
    const result = await api(artifactsPath(id)).catch(() => null);
    const artifacts = result?.res.ok ? result.data : { failed: true };
    state.artifacts.set(id, artifacts);
    if (customer() === id && ['chat', 'captures'].includes(viewKind())) {
      const vac = state.details.get(id);
      document.querySelector('.admin-view-panel').innerHTML = (viewKind() === 'chat' ? dialog : captures)(vac, artifacts);
      lockReplay(document.getElementById('customerChatReplay'));
    }
  }

  async function clearAll() {
    const { res, data } = await api('clear-all', { method: 'POST' });
    if (res.status === 401) return renderGate();
    if (!res.ok) return;
    state.opened = data.opened || [];
    state.details.clear();
    state.artifacts.clear();
    showCustomer(null);
  }

  document.addEventListener('click', () => {
    document.getElementById('vacationDropdown')?.classList.remove('open');
    document.getElementById('tripButton')?.setAttribute('aria-expanded', 'false');
  });

  return (mount) => {
    root = mount;
    return refresh().catch((error) => {
      console.error(error);
      renderGate('Admin review could not load.');
    });
  };
})();

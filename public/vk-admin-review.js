// VK admin review, part A: customer list, Chat (read-only) and Trip (view-only) on the owner vacation-app shell.
window.startVkAdminReview = (() => {
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chatText = (value) => safe(String(value || '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, '$1$2'));
  const chevron = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const check = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m20 6-11 11-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const brandLockup = '<div class="brand vk-app-brand" data-vk-wordmark="1"><img class="mark" src="/brand/vk-book-logo.svg" alt="Vacay Keepsake" width="28" height="30" /><span class="vk-print-wordmark">vacay <i>keepsake</i></span></div>';
  const state = { groups: [], opened: [], details: new Map(), view: 'all', attachments: [], voiceMode: false, voiceArmed: false, sending: false, notes: [] };
  let root;

  const getState = () => state;
  const viewTrip = () => (state.view === 'all' ? '' : state.view.slice(0, state.view.lastIndexOf(':')));
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
    const current = state.view === 'all' ? 'All Customers' : `${state.details.get(viewTrip())?.label || 'Vacation'} · ${viewKind() === 'trip' ? 'Trip' : 'Chat'}`;
    const option = (id, title, sub = '') => {
      const on = id === state.view;
      return `<button class="trip-option ${on ? 'active' : ''}" type="button" data-trip-id="${safe(id)}" role="option" aria-selected="${on ? 'true' : 'false'}"><span>${on ? check : ''}</span><span class="trip-option-text"><b>${safe(title)}</b>${sub ? `<small>${safe(sub)}</small>` : ''}</span></button>`;
    };
    const runs = state.opened.map((tripId) => {
      const vac = state.details.get(tripId);
      if (!vac) return '';
      return `<div class="admin-run" data-run-group="${safe(tripId)}">${option(`${tripId}:chat`, `${vac.label} · Chat`, vac.destination)}${option(`${tripId}:trip`, `${vac.label} · Trip`, vac.destination)}</div>`;
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

  function sitePane() {
    const kind = viewKind();
    if (kind === 'all') return `<div class="site-pane" id="sitePane" data-kind="customers">${customerList()}</div>`;
    const vac = state.details.get(viewTrip());
    if (!vac) return '<div class="site-pane" id="sitePane" data-kind="loading"></div>';
    if (kind === 'trip') {
      if (!vac.shareSlug) return `<div class="site-pane" id="sitePane" data-kind="trip" data-run="${safe(vac.tripId)}"><p class="admin-empty">No trip is stored for this vacation yet.</p></div>`;
      const src = `/shared/${encodeURIComponent(vac.shareSlug)}/?embed=1`;
      return `<div class="site-pane" id="sitePane" data-kind="trip" data-run="${safe(vac.tripId)}"><iframe title="${safe(vac.label)} trip (view only)" src="${safe(src)}" data-trip-frame="1"></iframe></div>`;
    }
    const turns = (vac.turns || []).filter((turn) => turn.speaker !== 'system' && turn.direction !== 'system');
    return `<div class="site-pane" id="sitePane" data-kind="chat" data-run="${safe(vac.tripId)}"><div class="messages" id="customerChatReplay" data-readonly="true" aria-readonly="true" aria-label="${safe(vac.label)} chat (read only)">${turns.map(turnMarkup).join('') || '<p class="admin-empty">No chat turns are stored for this vacation yet.</p>'}</div></div>`;
  }

  function renderGate(message = '') {
    root.innerHTML = `<main class="session-gate"><section class="gate-card">${brandLockup}<h1>Admin review</h1>${message ? `<p class="error" role="alert">${safe(message)}</p>` : '<p>Sign in to review customer vacations.</p>'}<form class="session-form" id="adminLogin"><input id="adminLoginInput" name="login" type="password" placeholder="Admin sign-in" autocomplete="current-password" required><button type="submit">Sign in</button></form></section></main>`;
    document.getElementById('adminLogin').addEventListener('submit', signIn);
  }

  function render() {
    const notes = state.notes.map((note) => `<article class="bubble user" data-admin-local="1"><small>Admin (not saved)</small>${safe(note)}</article>`).join('');
    root.innerHTML = `<main class="app" data-admin="1"><header class="topbar" id="appHeader">${brandLockup}${switcher()}</header><section class="workspace" id="workspace">${sitePane()}<div class="splitter-row" id="splitterRow"><span class="splitter-track" id="splitterTrack" aria-hidden="true"></span><button class="splitter" id="splitter" type="button" aria-label="Resize review and chat panels"></button></div><section class="chat-pane" aria-label="Admin chat"><div class="messages" id="messages" data-screen="admin">${notes}</div>${window.tsChatComposer.markup({ messageLabel: 'Admin message' })}</section></section></main>`;
    document.title = 'Vacay Keepsake admin';
    lockReplay(document.getElementById('customerChatReplay'));
    bind();
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
      state.view = option.dataset.tripId;
      render();
    }));
    menu.querySelector('[data-clear-all]')?.addEventListener('click', clearAll);
    root.querySelectorAll('[data-vk-open]').forEach((el) => el.addEventListener('click', () => openVacation(el.dataset.customerId)));
    window.tsVacationAppChrome.bindSplitter();
    window.tsChatComposer.bind({ getState, onSubmit: adminSubmit });
    window.tsChatComposer.renderAttachments(state.attachments);
  }

  function adminSubmit(event) {
    event.preventDefault();
    const textarea = document.getElementById('messageText');
    const text = textarea.value.trim();
    if (!text && !state.attachments.length) return;
    state.notes.push(text || `${state.attachments.length} file(s) attached`);
    state.attachments = [];
    state.voiceArmed = false;
    textarea.value = '';
    render();
    document.getElementById('messageText')?.focus();
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
    state.view = `${tripId}:chat`;
    render();
  }

  async function clearAll() {
    const { res, data } = await api('clear-all', { method: 'POST' });
    if (res.status === 401) return renderGate();
    if (!res.ok) return;
    state.opened = data.opened || [];
    state.details.clear();
    state.view = 'all';
    render();
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

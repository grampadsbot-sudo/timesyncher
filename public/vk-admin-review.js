// VK admin review (part A): Chat + Trip, fixture catalog, read-only customer views.

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chatText = (value) => esc(String(value || '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, '$1$2'));

const icon = {
  clip: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21.4 11.6-8.7 8.7a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.6-8.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mic: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" stroke="currentColor" stroke-width="2"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  send: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const ui = {
  mode: 'loading',
  groups: [],
  opened: [],
  details: new Map(),
  tripId: 'all',
  loginError: '',
  attachments: [],
  draft: '',
  voiceMode: false,
  voiceArmed: false,
};

let root;

function tripRoot(tripId) {
  const mark = String(tripId || '').indexOf(':');
  return mark === -1 ? '' : tripId.slice(0, mark);
}

function kindFromTrip(tripId) {
  const mark = String(tripId || '').indexOf(':');
  return mark === -1 ? 'all' : tripId.slice(mark + 1);
}

function findGroup(tripId) {
  return ui.groups.find((g) => g.tripId === tripId) || null;
}

function openedVacations() {
  return ui.opened.map((id) => ui.details.get(id) || findGroup(id)).filter(Boolean);
}

async function readJson(res) {
  return res.json().catch(() => ({}));
}

function renderTurns(turns) {
  return (turns || []).map((turn, index) => {
    const user = String(turn.speaker || '').toUpperCase() === 'OWNER';
    const label = user ? 'You' : 'Vacay Keepsake';
    const body = user ? esc(turn.text || '') : chatText(turn.text || '');
    const tag = turn.t || `${user ? 'owner' : 'app'}-${index + 1}`;
    return `<article class="bubble${user ? ' user' : ''}" data-turn="${esc(tag)}"><small>${esc(label)}</small>${body}</article>`;
  }).join('');
}

async function loadDetail(tripId) {
  if (ui.details.has(tripId)) return ui.details.get(tripId);
  const res = await fetch(`/api/admin/customers/${encodeURIComponent(tripId)}`);
  const data = await readJson(res);
  if (!res.ok || !data.vacation) throw new Error(data.error || 'Could not open that vacation.');
  ui.details.set(tripId, data.vacation);
  return data.vacation;
}

function brand() {
  return `<div class="brand"><img class="mark" src="/brand/vk-book-logo.svg" alt="Vacay Keepsake" /><span>Vacay Keepsake<small>Admin review</small></span></div>`;
}

function switcher() {
  const tripId = ui.tripId;
  const current = tripId === 'all'
    ? 'All Customers'
  : (() => {
      const vac = ui.details.get(tripRoot(tripId)) || findGroup(tripRoot(tripId));
      const kind = kindFromTrip(tripId);
      const labels = { chat: 'Chat', trip: 'Trip' };
      return `${vac?.label || vac?.destination || 'Vacation'} — ${labels[kind] || 'Chat'}`;
    })();
  const groups = openedVacations().map((vac) => {
    const item = (kind, label) => {
      const id = `${vac.tripId}:${kind}`;
      const on = id === tripId;
      return `<button class="trip-option ${on ? 'active' : ''}" type="button" data-trip-id="${esc(id)}" role="option" aria-selected="${on ? 'true' : 'false'}"><span></span><span class="trip-option-text"><b>${esc(vac.label || vac.destination || vac.tripId)} — ${label}</b><small>${esc(vac.destination || '')}</small></span></button>`;
    };
    return `<div class="admin-switch-group" data-run-group="${esc(vac.tripId)}"><p class="admin-switch-group-bar">${esc(vac.label || vac.tripId)}</p>${item('chat', 'Chat')}${item('trip', 'Trip')}</div>`;
  }).join('');
  const clearAll = ui.opened.length
    ? `<button class="admin-clear admin-clear-all" type="button" data-clear-all>Clear all</button>`
    : '';
  const allOn = tripId === 'all';
  return `<div class="vacation-dropdown" id="vacationDropdown" data-trip-switcher-root="1" data-admin-switcher="1"><button class="trip-button" id="tripButton" data-trip-switcher="1" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Switch customer"><span class="trip-trigger-text"><span class="trip-trigger-title">${esc(current)}</span></span>${icon.chevron}</button><div class="trip-list"><div role="listbox" aria-label="Customers"><button class="trip-option ${allOn ? 'active' : ''}" type="button" data-trip-id="all" role="option" aria-selected="${allOn ? 'true' : 'false'}"><span></span><span class="trip-option-text"><b>All Customers</b></span></button>${groups}</div>${clearAll}</div></div>`;
}

function customerList() {
  const rows = ui.groups.map((group) => {
    const members = (group.customers || []).map((customer) => (
      `<li class="admin-customer-row"><div class="admin-customer"><strong>${esc(customer.customer_label)}</strong><small>${esc(group.destination || '')}</small><span class="coupon">${esc(customer.test_coupon || '')}</span></div></li>`
    )).join('');
    return `<section class="admin-group" data-trip-group="${esc(group.tripId)}"><div class="admin-group-head"><span>${esc(group.label || group.destination)}</span><time datetime="${esc(group.sortAt)}">${esc(group.sortAt)}</time></div><ul class="admin-customer-list">${members}</ul><button class="admin-customer admin-open" type="button" data-customer-id="${esc(group.tripId)}" data-vk-open="1">Open vacation</button></section>`;
  }).join('');
  return `<div class="admin-customers" data-admin-customers="1">${rows}</div>`;
}

function chatHtml(vac) {
  const replay = renderTurns(vac.chat?.turns || []);
  return `<div class="admin-chat" data-chat-replay="1" data-readonly="true" aria-readonly="true"><h2>${esc(vac.label || vac.tripId)} — Chat</h2><div class="messages" id="customerChatReplay">${replay || '<p>No chat turns are stored for this vacation yet.</p>'}</div></div>`;
}

function tripHtml(vac) {
  const slug = vac.shareSlug || vac.trip?.shareSlug || '';
  if (!slug) return `<div class="admin-trip-shell"><p>Trip UI is not available for this vacation yet.</p></div>`;
  const src = `/shared/${encodeURIComponent(slug)}/?embed=1&adminViewOnly=1`;
  return `<div class="admin-trip-shell" data-admin-trip="1" data-readonly="true"><h2 class="sr-only">${esc(vac.label || vac.tripId)} — Trip</h2><iframe title="${esc(vac.label || 'Trip')}" src="${esc(src)}" data-trip-frame="1"></iframe></div>`;
}

function sitePane() {
  const kind = kindFromTrip(ui.tripId);
  if (kind === 'all') {
    return `<div class="site-pane" id="sitePane" data-kind="customers">${customerList()}</div>`;
  }
  const id = tripRoot(ui.tripId);
  const vac = ui.details.get(id);
  if (!vac) return `<div class="site-pane" id="sitePane" data-kind="loading"><p>Loading…</p></div>`;
  const inner = kind === 'trip' ? tripHtml(vac) : chatHtml(vac);
  return `<div class="site-pane" id="sitePane" data-kind="${esc(kind)}" data-run="${esc(id)}">${inner}</div>`;
}

function composer() {
  const chips = ui.attachments.map((file) => `<span class="chip">${esc(file.name)} · ${Math.max(1, Math.ceil(file.size / 1024))} KB</span>`).join('');
  return `<form class="composer" id="composer" data-admin-composer="1">
    <p id="composerStatus" role="status" aria-live="polite" hidden style="margin:0 0 8px;color:var(--danger);font-weight:750;font-size:14px"></p>
    <div class="attachment-row" id="attachmentRow">${chips}</div>
    <div class="compose-grid">
      <button class="icon-button" id="attachButton" type="button" aria-label="Add file" title="Add file">${icon.clip}</button>
      <textarea id="messageText" name="message" rows="1" aria-label="Admin message" placeholder="Admin notes (saved in a later release)"></textarea>
      <span class="voice-mic-wrap"><button class="icon-button voice-button-labeled" id="voiceButton" type="button" aria-label="Speak" title="Speak">${icon.mic}</button></span>
      <button class="icon-button" id="sendButton" type="submit" aria-label="Send" title="Send">${icon.send}</button>
    </div>
    <input id="fileInput" type="file" multiple hidden>
  </form>`;
}

function shell(body, { chatOnly = false } = {}) {
  const header = `<header class="topbar" id="appHeader">${brand()}${ui.mode === 'ready' ? switcher() : ''}</header>`;
  const splitter = chatOnly ? '' : '<div class="splitter-row" id="splitterRow"><span class="splitter-track" id="splitterTrack" aria-hidden="true"></span><button class="splitter" id="splitter" type="button" aria-label="Resize trip and chat panels"></button></div>';
  root.innerHTML = `<main class="app" data-admin="1">${header}<section class="workspace${chatOnly ? ' chat-only' : ''}" id="workspace">${chatOnly ? '' : sitePane()}${splitter}<section class="chat-pane" aria-label="Admin composer"><h1 class="sr-only">Admin composer</h1><div class="messages" id="messages" role="log"></div>${body}</section></section></main>`;
  document.title = 'Vacay Keepsake admin';
}

function bindComposer() {
  const composerForm = document.getElementById('composer');
  const messageText = document.getElementById('messageText');
  if (!composerForm || !messageText || composerForm.dataset.adminBound) return;
  composerForm.dataset.adminBound = '1';
  window.tsVacationAppChrome?.bindVoice(() => ui);
  window.tsChatComposer?.bindComposerAutosize?.();
  document.getElementById('attachButton')?.addEventListener('click', () => document.getElementById('fileInput')?.click());
  document.getElementById('fileInput')?.addEventListener('change', (event) => {
    ui.attachments.push(...event.target.files);
    event.target.value = '';
    const row = document.getElementById('attachmentRow');
    if (row) row.innerHTML = ui.attachments.map((file) => `<span class="chip">${esc(file.name)} · ${Math.max(1, Math.ceil(file.size / 1024))} KB</span>`).join('');
  });
  messageText.addEventListener('input', () => { ui.draft = messageText.value; });
  messageText.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    composerForm.requestSubmit();
  });
  composerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    ui.draft = '';
    ui.attachments = [];
    if (messageText) {
      messageText.value = '';
      window.tsChatComposer?.resizeComposer?.(messageText);
    }
    const row = document.getElementById('attachmentRow');
    if (row) row.innerHTML = '';
  });
}

function placeAdminMenu(menu) {
  if (!menu) return;
  const button = document.getElementById('tripButton');
  if (!button) return;
  const list = menu.querySelector('.trip-list');
  if (!list) return;
  const rect = button.getBoundingClientRect();
  list.style.position = 'fixed';
  list.style.left = `${Math.max(8, rect.left)}px`;
  list.style.top = `${rect.bottom + 4}px`;
  list.style.right = 'auto';
  list.style.width = `${Math.min(320, Math.max(rect.width, 240))}px`;
}

function bindChrome() {
  if (document.getElementById('splitter')) window.tsVacationAppChrome?.bindSplitter();
  bindComposer();
  const menu = document.getElementById('vacationDropdown');
  const button = document.getElementById('tripButton');
  button?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) placeAdminMenu(menu);
  });
  menu?.querySelectorAll('[data-trip-id]').forEach((option) => {
    option.addEventListener('click', () => {
      ui.tripId = option.dataset.tripId;
      menu.classList.remove('open');
      render();
    });
  });
  if (!root.dataset.vkAdminClickBound) {
    root.dataset.vkAdminClickBound = '1';
    root.addEventListener('click', (event) => {
      const openBtn = event.target.closest('[data-vk-open][data-customer-id]');
      if (openBtn) {
        event.preventDefault();
        openVacation(openBtn.dataset.customerId);
        return;
      }
      const clearBtn = event.target.closest('[data-clear-all]');
      if (clearBtn) {
        event.preventDefault();
        event.stopPropagation();
        clearAll();
        return;
      }
      if (!event.target.closest('#vacationDropdown')) {
        document.getElementById('vacationDropdown')?.classList.remove('open');
        document.getElementById('tripButton')?.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

function render() {
  shell(composer(), { chatOnly: ui.mode !== 'ready' });
  bindChrome();
}

function renderLogin() {
  ui.mode = 'login';
  shell(`<form class="admin-login" id="adminLogin"><label for="adminLoginInput">Admin password</label><input id="adminLoginInput" name="login" type="password" autocomplete="current-password" required><button type="submit">Sign in</button><p id="adminLoginError" role="alert"${ui.loginError ? '' : ' hidden'}>${esc(ui.loginError)}</p></form>`, { chatOnly: true });
  document.getElementById('adminLogin')?.addEventListener('submit', submitLogin);
  document.getElementById('adminLoginInput')?.focus();
}

function renderUnavailable() {
  ui.mode = 'unavailable';
  shell('<p class="admin-unavailable">Admin review is not available in production.</p>', { chatOnly: true });
}

function renderLoading() {
  ui.mode = 'loading';
  shell('<p>Loading admin review…</p>', { chatOnly: true });
}

async function submitLogin(event) {
  event.preventDefault();
  const input = document.getElementById('adminLoginInput');
  const login = input?.value || '';
  ui.loginError = '';
  const res = await fetch('/api/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login }),
  });
  if (input) input.value = '';
  if (res.status === 404) return renderUnavailable();
  if (!res.ok) {
    ui.loginError = 'Sign-in failed.';
    return renderLogin();
  }
  const data = await readJson(res);
  ui.opened = data.opened || [];
  return refresh();
}

async function refresh() {
  const res = await fetch('/api/admin/customers');
  if (res.status === 401) return renderLogin();
  if (res.status === 404) return renderUnavailable();
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || 'Customer list failed.');
  ui.groups = data.groups || [];
  ui.opened = data.opened || ui.opened;
  ui.mode = 'ready';
  if (!ui.opened.includes(tripRoot(ui.tripId)) && ui.tripId !== 'all') ui.tripId = 'all';
  await Promise.all(ui.opened.map((id) => loadDetail(id).catch(() => null)));
  render();
}

async function openVacation(tripId) {
  const res = await fetch(`/api/admin/customers/${encodeURIComponent(tripId)}/open`, { method: 'POST' });
  const data = await readJson(res);
  if (res.status === 401) return renderLogin();
  if (!res.ok || !data.vacation) return;
  ui.opened = data.opened || ui.opened;
  ui.details.set(tripId, data.vacation);
  ui.tripId = `${tripId}:chat`;
  ui.mode = 'ready';
  render();
}

async function clearAll() {
  const res = await fetch('/api/admin/clear-all', { method: 'POST' });
  const data = await readJson(res);
  if (res.status === 401) return renderLogin();
  if (!res.ok) return;
  ui.opened = data.opened || [];
  ui.details.clear();
  ui.tripId = 'all';
  render();
}

function startVkAdminReview(mount) {
  root = mount;
  renderLoading();
  return fetch('/api/admin/session')
    .then(async (res) => {
      if (res.status === 404) return renderUnavailable();
      if (!res.ok) return renderLogin();
      const data = await readJson(res);
      ui.opened = data.opened || [];
      return refresh();
    })
    .catch((error) => {
      console.error(error);
      ui.loginError = 'Sign-in failed.';
      renderLogin();
    });
}

window.startVkAdminReview = startVkAdminReview;
window.__vkAdminOpenVacation = (...args) => openVacation(...args);
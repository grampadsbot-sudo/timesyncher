window.startVkAdminReview = (() => {
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chatText = (value) => safe(String(value || '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, '$1$2'));
  const chevron = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const check = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m20 6-11 11-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const brandLockup = '<div class="brand vk-app-brand" data-vk-wordmark="1"><img class="mark" src="/brand/vk-book-logo.svg" alt="Vacay Keepsake" width="28" height="30" /><span class="vk-print-wordmark">vacay <i>keepsake</i></span></div>';
  const views = [
    ['chat', 'Dialog'], ['travel-summary', 'Travel Summary'], ['feedback', 'Feedback & QA'],
    ['trip', 'Vacation site'], ['keepsake', 'Keepsake'],
    ['onboarding', 'Onboarding'], ['captures', 'Chat screenshots'], ['vacations', 'All vacations'],
  ];
  const allCustomersIntro = 'Choose a customer to drill down into their trips, chat and QA.';
  const showTestCustomersKey = 'vkAdminShowTestCustomers';
  const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const state = { customers: new Map(), opened: [], recent: new Set(), details: new Map(), artifacts: new Map(),
    selection: null, view: 'all', feedbackRollup: null, feedbackRollupFailed: false, attachments: [],
    voiceMode: false, voiceArmed: false, sending: false, opening: false,
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
    const vac = account ? state.details.get(viewTrip()) : null;
    const artifacts = vac ? state.artifacts.get(vac.tripId) : null;
    const viewLabel = views.find(([id]) => id === state.view)?.[1];
    const current = account ? (state.view === 'travel-summary' ? viewLabel : `${viewLabel} · ${account.name}`) : 'All Customers';
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
    const rollup = '<div class="admin-feedback-rollup-link"><button class="admin-open" type="button" data-view="feedback-all">All customers Feedback & QA</button></div>';
    const intro = `<p class="admin-view-note" data-admin-customers-intro="1">${safe(allCustomersIntro)}</p>`;
    const count = state.hiddenTestCount ? ` (${safe(state.hiddenTestCount)})` : '';
    const toggle = `<label class="admin-view-note admin-test-toggle"><input type="checkbox" data-admin-show-test${state.showTestCustomers ? ' checked' : ''} /> Show test customers${count}</label><p class="admin-view-note" role="status" data-admin-customers-status hidden></p>`;
    return `${rollup}<div class="admin-customers" data-admin-customers="1">${intro}${toggle}${[...state.customers].map(([key, account]) => {
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

  function storedJevRollup(vac, feedback) {
    const rollup = feedback?.jev_rollup ?? feedback?.jev ?? vac?.jev ?? vac?.jevRollup;
    if (rollup != null && (typeof rollup !== 'object' || Object.keys(rollup).length)) return rollup;
    const summary = feedback?.ssr?.summary_by_construct;
    if (summary && typeof summary === 'object' && Object.keys(summary).length) return feedback.ssr;
    return null;
  }

  function tripLevelQaSummary(vac, artifacts) {
    const feedback = artifacts?.failed ? null : artifacts?.feedback;
    const qa = artifacts?.review?.qa ?? vac?.qa ?? null;
    const jev = storedJevRollup(vac, feedback);
    const survey = artifacts?.review?.survey ?? vac?.survey ?? null;
    const body = (label, data, attr) => `<section class="admin-result" data-review-result="${attr}"><h4>${label}</h4><pre>${safe(typeof data === 'string' ? data : JSON.stringify(data, null, 2))}</pre></section>`;
    const surveyLabel = survey?.label ? String(survey.label) : 'end of chat (legacy)';
    const parts = [];
    if (qa != null) parts.push(body('QA Czar', qa, 'qa-czar'));
    if (jev != null) parts.push(body('Jev rollup', jev, 'jev-rollup'));
    if (survey != null) parts.push(body(`Survey (${surveyLabel})`, survey, 'survey'));
    const inner = parts.length
      ? parts.join('')
      : '<p class="admin-empty" data-qa-not-graded="1">not graded</p>';
    return `<section class="admin-result" data-feedback-qa-summary="1"><h3>Trip-level QA</h3>${inner}</section>`;
  }

  const ratingFmt = (value) => (value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(2));

  function feedbackTableRows(rows) {
    if (!rows?.length) return '<p class="admin-empty">No role-play checkpoint feedback is stored yet.</p>';
    const head = '<tr><th>Customer</th><th>Vacation</th><th>Checkpoint</th><th>Question</th><th>Rating</th><th>Comment</th></tr>';
    const body = rows.map((row) => `<tr>
      <td>${safe(row.customer)}</td>
      <td>${safe(row.destination || row.vacation)}</td>
      <td>${safe(row.checkpoint)}</td>
      <td>${safe(row.question)}</td>
      <td>${safe(ratingFmt(row.rating))}</td>
      <td>${safe(row.comment)}</td>
    </tr>`).join('');
    return `<div class="admin-feedback-table-wrap"><table class="admin-feedback-table">${head}${body}</table></div>`;
  }

  function feedbackView(vac, artifacts) {
    const qaSummary = tripLevelQaSummary(vac, artifacts);
    if (!artifacts) {
      return `<div class="admin-feedback" data-feedback-view="customer">${qaSummary}<p class="admin-empty">Loading feedback…</p></div>`;
    }
    if (artifacts.failed) {
      return `<div class="admin-feedback" data-feedback-view="customer">${qaSummary}<p class="admin-empty" role="status">Feedback could not be loaded.</p></div>`;
    }
    const payload = artifacts.feedback;
    const checkpointRows = (payload?.checkpoints || []).flatMap((checkpoint) => {
      const scores = checkpoint.scores?.length ? checkpoint.scores : [{ expected_score: null, construct: '' }];
      return scores.map((score) => ({
        customer: payload.customer?.name || vac.label,
        vacation: vac.destination || vac.title,
        checkpoint: checkpoint.label || checkpoint.id,
        question: checkpoint.prompt,
        rating: score.expected_score,
        comment: checkpoint.reply,
      }));
    });
    const legacy = payload?.legacy_trip_survey;
    const legacyRows = legacy?.questions?.map((question, index) => ({
      customer: payload.customer?.name || vac.label,
      vacation: vac.destination || vac.title,
      checkpoint: legacy.label || 'end of chat (legacy)',
      question,
      rating: null,
      comment: legacy.answers?.[index] || '',
    })) || [];
    const rows = [...checkpointRows, ...legacyRows];
    const table = rows.length
      ? feedbackTableRows(rows)
      : '<p class="admin-empty">No checkpoint feedback is stored for this vacation yet.</p>';
    return `<div class="admin-feedback" data-feedback-view="customer">${qaSummary}${table}</div>`;
  }

  function feedbackRollupView() {
    if (state.feedbackRollupFailed) return '<p class="admin-empty" role="status">All-customers feedback could not be loaded.</p>';
    if (state.feedbackRollup == null) return '<p class="admin-empty">Loading all-customers feedback…</p>';
    return `<div class="admin-feedback" data-feedback-view="rollup">${feedbackTableRows(state.feedbackRollup)}</div>`;
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
    return `<div class="admin-dialog-head"><div class="admin-costs" data-vacation-total aria-label="Vacation total"><strong>Vacation total</strong> ${costLines(vac.costs)}</div></div><div class="messages" id="customerChatReplay" data-readonly="true" aria-readonly="true" aria-label="${safe(vac.label)} chat (read only)">${turns || '<p class="admin-empty">No chat turns are stored for this vacation yet.</p>'}</div>`;
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

  function travelSummaryRevision(tripState) {
    if (!tripState || typeof tripState !== 'object') {
      return '<p class="admin-empty" role="status" data-travel-no-trip-state="1">No vacation state was stored for this turn.</p>';
    }
    const trip = tripState.trip || {};
    const headerFacts = [
      trip.destination ? `<div><dt>Destination</dt><dd data-revision-trip-destination>${safe(trip.destination)}</dd></div>` : '',
      trip.start || trip.end
        ? `<div><dt>Dates</dt><dd>${trip.start ? `<span data-revision-trip-start>${safe(trip.start)}</span>` : ''}${trip.start && trip.end ? ' – ' : ''}${trip.end ? `<span data-revision-trip-end>${safe(trip.end)}</span>` : ''}</dd></div>`
        : '',
    ].filter(Boolean).join('');
    const meta = `<div class="admin-travel-meta"><span class="admin-travel-pill">r<span data-revision-number>${safe(tripState.revision)}</span></span><span class="admin-travel-pill" data-revision-phase>${safe(tripState.phase)}</span><span class="admin-travel-pill" data-revision-read>${safe(tripState.read)}</span>${tripState.siteRevision ? `<code class="admin-travel-site-rev" data-revision-site-revision>${safe(tripState.siteRevision)}</code>` : ''}</div>`;
    const days = Array.isArray(tripState.days) ? tripState.days : [];
    const daysMarkup = days.length
      ? days.map((day) => {
        const assigned = Array.isArray(day.assigned) ? day.assigned : [];
        const rows = assigned.length
          ? `<ul class="admin-travel-assignments">${assigned.map((row) => `<li class="admin-travel-assignment" data-revision-assignment="${safe(row.id)}" data-revision-item="${safe(row.item)}" data-revision-proposed-by="${safe(row.proposedBy)}" data-revision-time-precision="${safe(row.time ? row.time.precision : '')}"><span class="admin-travel-assignment-title" data-revision-assignment-title>${safe(row.title)}</span><span class="admin-travel-assignment-meta">${row.time ? `<span class="admin-travel-time" data-revision-time-value>${safe(row.time.value)}</span><span class="admin-travel-pill admin-travel-time-precision" data-revision-time-precision-label>${safe(row.time.precision)}</span>` : ''}<span class="admin-travel-pill admin-travel-origin" data-revision-proposed-by-label>${safe(row.proposedBy)}</span><span class="admin-travel-role" data-revision-assignment-role>${safe(row.role)}</span></span></li>`).join('')}</ul>`
          : '<p class="admin-travel-day-empty">No items assigned.</p>';
        return `<div class="admin-travel-day" data-revision-day="${safe(day.id)}" data-revision-day-date="${safe(day.date)}"><h3 data-revision-day-heading>${safe(day.date)}</h3>${rows}</div>`;
      }).join('')
      : '<p class="admin-empty">No saved days.</p>';
    const unassigned = Array.isArray(tripState.unassigned) ? tripState.unassigned : [];
    const unassignedMarkup = unassigned.length
      ? `<div class="admin-travel-sub" data-revision-unassigned><h3>Unassigned</h3><ul class="admin-travel-list">${unassigned.map((item) => `<li class="admin-travel-row" data-revision-unassigned-item="${safe(item.id)}"><span class="admin-travel-row-primary" data-revision-unassigned-title>${safe(item.title)}</span>${item.type ? `<span class="admin-travel-pill" data-revision-unassigned-type>${safe(item.type)}</span>` : ''}</li>`).join('')}</ul></div>`
      : '';
    const travelers = Array.isArray(tripState.travelers) ? tripState.travelers : [];
    const disclosed = Array.isArray(tripState.disclosed) ? tripState.disclosed : [];
    const partyDisclosures = disclosed.filter((fact) => fact.kind === 'party');
    const otherDisclosures = disclosed.filter((fact) => fact.kind !== 'party');
    const travelersMarkup = travelers.length
      ? `<ul class="admin-travel-list" data-revision-travelers>${travelers.map((t) => `<li class="admin-travel-row" data-revision-traveler="${safe(t.id)}">${t.name ? `<span class="admin-travel-row-primary" data-revision-traveler-name>${safe(t.name)}</span>` : ''}${t.relation ? `<span class="admin-travel-pill" data-revision-traveler-relation>${safe(t.relation)}</span>` : ''}${t.age ? `<span class="admin-travel-pill" data-revision-traveler-age>${safe(t.age)}</span>` : ''}</li>`).join('')}</ul>`
      : '';
    const partyDisclosuresMarkup = partyDisclosures.length
      ? `<ul class="admin-travel-list" data-revision-party-disclosures>${partyDisclosures.map((fact) => `<li class="admin-travel-row" data-revision-disclosed="${safe(fact.id)}" data-revision-disclosed-kind="${safe(fact.kind)}"><span class="admin-travel-row-primary" data-revision-disclosed-value>${safe(fact.value)}</span></li>`).join('')}</ul>`
      : '';
    const otherDisclosuresMarkup = otherDisclosures.length
      ? `<div class="admin-travel-sub" data-revision-other-disclosures><h3>Other disclosures</h3><dl class="admin-travel-facts">${otherDisclosures.map((fact) => `<div><dt data-revision-disclosed-kind>${safe(fact.kind)}</dt><dd data-revision-disclosed="${safe(fact.id)}" data-revision-disclosed-value>${safe(fact.value)}</dd></div>`).join('')}</dl></div>`
      : '';
    const collaborators = Array.isArray(tripState.collaborators) ? tripState.collaborators : [];
    const invites = Array.isArray(tripState.invites) ? tripState.invites : [];
    const accessMarkup = collaborators.length || invites.length
      ? `<div class="admin-travel-sub" data-revision-access><h3>Access grants &amp; invites</h3><ul class="admin-travel-list">${collaborators.map((m) => `<li class="admin-travel-row" data-revision-collaborator="${safe(m.id)}">${m.name ? `<span class="admin-travel-row-primary" data-revision-collaborator-name>${safe(m.name)}</span>` : ''}<span class="admin-travel-pill" data-revision-collaborator-access>${safe(m.access)}</span><span class="admin-travel-pill" data-revision-collaborator-status>${safe(m.status)}</span></li>`).join('')}${invites.map((inv) => `<li class="admin-travel-row" data-revision-invite="${safe(inv.id)}">${inv.name ? `<span class="admin-travel-row-primary" data-revision-invite-name>${safe(inv.name)}</span>` : ''}<span class="admin-travel-pill" data-revision-invite-access>${safe(inv.access)}</span><span class="admin-travel-pill" data-revision-invite-status>${safe(inv.status)}</span></li>`).join('')}</ul></div>`
      : '';
    const openAsks = Array.isArray(tripState.openAsks) ? tripState.openAsks : [];
    const openAsksMarkup = openAsks.length
      ? `<ul class="admin-travel-list" data-revision-open-asks>${openAsks.map((ask) => `<li class="admin-travel-row" data-revision-open-ask="${safe(ask.id)}" data-revision-ask-status="${safe(ask.status)}"><span class="admin-travel-row-primary" data-revision-ask-text>${safe(ask.text)}</span><span class="admin-travel-pill" data-revision-ask-status-label>${safe(ask.status)}</span></li>`).join('')}</ul>`
      : '<p class="admin-empty" data-revision-open-asks-empty="1">No open asks.</p>';
    const nextSteps = Array.isArray(tripState.nextSteps) ? tripState.nextSteps : [];
    const nextStepsMarkup = nextSteps.length
      ? `<ul class="admin-travel-list" data-revision-next-steps>${nextSteps.map((step, i) => `<li class="admin-travel-row" data-revision-next-step="${i}" data-revision-step-kind="${safe(step.kind)}"><span class="admin-travel-pill" data-revision-step-kind-label>${safe(step.kind)}</span><span class="admin-travel-row-primary" data-revision-step-task>${safe(step.task)}</span></li>`).join('')}</ul>`
      : '<p class="admin-empty" data-revision-next-steps-empty="1">No next steps.</p>';
    return `<article class="admin-travel-revision" data-travel-revision="${safe(tripState.revision)}" data-travel-phase="${safe(tripState.phase)}" data-travel-read="${safe(tripState.read)}"><header class="admin-travel-revision-head"><img src="/brand/vk-book-logo.svg" alt="" width="30" height="32"><div class="admin-travel-revision-title-wrap">${trip.title ? `<h1 data-revision-trip-title>${safe(trip.title)}</h1>` : ''}${meta}</div></header>${headerFacts ? `<dl class="admin-travel-facts">${headerFacts}</dl>` : ''}<section class="admin-travel-section" aria-label="Saved days" data-revision-section="days"><h2>Saved days</h2>${daysMarkup}${unassignedMarkup}</section><section class="admin-travel-section" aria-label="Disclosed party" data-revision-section="party"><h2>Disclosed party</h2>${travelersMarkup || partyDisclosuresMarkup ? travelersMarkup + partyDisclosuresMarkup : '<p class="admin-empty">No party disclosed.</p>'}${otherDisclosuresMarkup}${accessMarkup}</section><section class="admin-travel-section" aria-label="Open asks" data-revision-section="open-asks"><h2>Open asks</h2>${openAsksMarkup}</section><section class="admin-travel-section" aria-label="Next steps" data-revision-section="next-steps"><h2>Next steps</h2>${nextStepsMarkup}</section></article>`;
  }

  function travelSummaryCapabilities(capabilities) {
    if (!capabilities || typeof capabilities !== 'object') {
      return '<section class="admin-travel-capabilities" aria-label="What the assistant can do" data-travel-capabilities><h2>What the assistant can do</h2><p class="admin-empty">No capabilities were reported for this vacation.</p></section>';
    }
    const entries = Object.entries(capabilities.actions && typeof capabilities.actions === 'object' ? capabilities.actions : {});
    const enabled = entries.filter(([, entry]) => entry?.enabled === true);
    const disabled = entries.filter(([, entry]) => entry?.enabled !== true);
    const renderAction = ([name, entry]) => {
      const isEnabled = entry?.enabled === true;
      const reason = String(entry?.reason ?? '');
      return `<li class="admin-travel-cap-item" data-capability-action="${safe(name)}" data-capability-enabled="${isEnabled}" data-capability-reason="${safe(reason)}"><code class="admin-travel-cap-name" data-capability-name>${safe(name)}</code><span class="admin-travel-cap-meta"><span class="admin-travel-cap-state" data-capability-state>${isEnabled ? 'enabled' : 'disabled'}</span><code class="admin-travel-cap-reason" data-capability-reason-text>${safe(reason)}</code></span></li>`;
    };
    const flags = ['booking', 'payment', 'email']
      .filter((key) => Object.hasOwn(capabilities, key))
      .map((key) => `<li class="admin-travel-cap-flag" data-capability-flag="${safe(key)}"><span class="admin-travel-cap-flag-key">${safe(key)}</span><code class="admin-travel-cap-flag-val" data-capability-flag-value>${safe(String(capabilities[key]))}</code></li>`)
      .join('');
    const enabledGroup = `<div class="admin-travel-cap-group" data-capability-group="enabled"><h3>Enabled (${enabled.length})</h3>${enabled.length ? `<ul class="admin-travel-cap-list">${enabled.map(renderAction).join('')}</ul>` : '<div class="admin-travel-cap-empty">None</div>'}</div>`;
    const disabledGroup = `<div class="admin-travel-cap-group" data-capability-group="disabled"><h3>Off (${disabled.length})</h3>${disabled.length ? `<ul class="admin-travel-cap-list">${disabled.map(renderAction).join('')}</ul>` : '<div class="admin-travel-cap-empty">None</div>'}</div>`;
    return `<section class="admin-travel-capabilities" aria-label="What the assistant can do" data-travel-capabilities><h2>What the assistant can do</h2><details><summary>${enabled.length} of ${entries.length} actions enabled</summary><div class="admin-travel-capabilities-body">${flags ? `<ul class="admin-travel-cap-flags" data-capability-flags>${flags}</ul>` : ''}${enabledGroup}${disabledGroup}</div></details></section>`;
  }

  function travelSummaryRules(snapshot) {
    const prompts = snapshot.modelRules || [];
    const rules = prompts.length ? prompts.map(({ purpose, sections }) => {
      const label = { reply_draft: 'Draft', reply_rewrite: 'Rewrite', reply_interim: 'Interim reply' }[purpose];
      return sections.map(({ title, text }) => `<details><summary>${safe(prompts.length > 1 ? `${label} · ${title}` : title)}</summary><div class="admin-travel-rule-text">${safe(text).replaceAll('\r', '&#13;')}</div></details>`).join('');
    }).join('') : '<p class="admin-empty">No model rules were stored for this turn.</p>';
    return `<section class="admin-travel-rules" aria-label="Model rules"><h2>Model rules</h2>${rules}</section>`;
  }

  function travelSummaryContent(snapshot, capabilities) {
    const conversation = snapshot.conversationState;
    return travelSummaryRevision(snapshot.tripState)
      + travelSummaryCapabilities(snapshot.tripState?.capabilities || capabilities)
      + (conversation ? `<section class="admin-travel-conversation" aria-label="Conversation management"><h2>Conversation management</h2><details><summary>Stored JSON for turn ${safe(snapshot.turnNumber)}</summary><pre class="admin-travel-json" data-conversation-json>${safe(JSON.stringify(conversation, null, 2))}</pre></details></section>` : '')
      + travelSummaryRules(snapshot);
  }

  function travelTiming(timing) {
    if (!timing) return '';
    const ms = (value) => Number.isFinite(value) ? `${value.toLocaleString()} ms` : 'Unavailable';
    const items = Object.entries(timing.itemsByType || {});
    const counts = items.length ? items.map(([type, count]) => `${safe(type.replaceAll('_', ' '))} ${safe(count)}`).join(', ')
      : timing.itemsByType ? '0' : 'Unavailable';
    const turns = timing.turns.map(({ turnNumber, customerMs, appMs }) =>
      `<tr><th scope="row">${safe(turnNumber)}</th><td>${ms(customerMs)}</td><td>${ms(appMs)}</td></tr>`).join('');
    return `<section class="admin-travel-section admin-travel-timing" aria-label="Timing summary"><h2>Timing summary</h2>
      <dl class="admin-travel-facts"><div><dt>Time to build</dt><dd>${ms(timing.timeToBuildMs)}${timing.buildTurn ? ` (turn ${safe(timing.buildTurn)})` : ''}</dd></div>
      <div><dt>Build duration</dt><dd>${ms(timing.buildDurationMs)}</dd></div>
      <div><dt>Total wall time</dt><dd>${ms(timing.totalWallMs)}</dd></div>
      <div><dt>Build items by type</dt><dd>${counts}</dd></div></dl>
      ${turns ? `<details><summary>Per-turn latency</summary><table aria-label="Per-turn latency"><thead><tr><th scope="col">Turn</th><th scope="col">Customer</th><th scope="col">App</th></tr></thead><tbody>${turns}</tbody></table></details>` : ''}</section>`;
  }

  function travelSummary(vac) {
    const result = state.travelSummaries.get(vac.tripId);
    if (!result) return '<p class="admin-empty" role="status">Loading Travel Summary…</p>';
    if (result.failed) return '<p class="admin-empty" role="status">Travel Summary could not be loaded.</p>';
    const { snapshots, capabilities, timing } = result;
    if (!snapshots.length) {
      return `<section class="admin-travel" aria-label="Travel Summary"><p class="admin-empty" role="status">No customer turns recorded for this vacation.</p>${travelSummaryCapabilities(capabilities)}${travelTiming(timing)}</section>`;
    }
    const chosen = snapshots.findIndex(({ turnId }) => turnId === state.travelSummaryTurn);
    const index = chosen < 0 ? snapshots.length - 1 : chosen;
    const snapshot = snapshots[index];
    return `<section class="admin-travel" aria-label="Travel Summary">
      <div class="admin-travel-scrubber">
        <label for="adminTravelTurn">Turn</label>
        <button type="button" data-travel-step="-1" aria-label="Previous turn"${index === 0 ? ' disabled' : ''}>${chevron}</button>
        <input id="adminTravelTurn" type="range" min="1" max="${snapshots.length}" value="${index + 1}" aria-valuetext="${snapshot.turnNumber} of ${snapshots.length}"${snapshots.length === 1 ? ' disabled' : ''}>
        <button type="button" data-travel-step="1" aria-label="Next turn"${index === snapshots.length - 1 ? ' disabled' : ''}>${chevron}</button>
        <output for="adminTravelTurn">${snapshot.turnNumber} / ${snapshots.length}</output>
      </div>
      <div data-travel-snapshot="${safe(snapshot.turnId)}">${travelSummaryContent(snapshot, capabilities)}</div>
      ${travelTiming(timing)}
    </section>`;
  }

  function selectTravelSummaryTurn(control, position) {
    const { snapshots, capabilities } = state.travelSummaries.get(viewTrip());
    const snapshot = snapshots[position - 1];
    if (!snapshot) return;
    state.travelSummaryTurn = snapshot.turnId;
    control.value = position;
    control.setAttribute('aria-valuetext', `${snapshot.turnNumber} of ${snapshots.length}`);
    const view = control.closest('.admin-travel');
    view.querySelector('[data-travel-step="-1"]').disabled = position === 1;
    view.querySelector('[data-travel-step="1"]').disabled = position === snapshots.length;
    view.querySelector('output').textContent = `${snapshot.turnNumber} / ${snapshots.length}`;
    const content = view.querySelector('[data-travel-snapshot]');
    content.dataset.travelSnapshot = snapshot.turnId;
    content.innerHTML = travelSummaryContent(snapshot, capabilities);
  }

  function scrubTravelSummary({ target: control }) {
    if (control.id === 'adminTravelTurn') selectTravelSummaryTurn(control, control.valueAsNumber);
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
    if (state.view === 'feedback-all') {
      return `<div class="site-pane" id="sitePane" data-kind="feedback-all">${feedbackRollupView()}</div>`;
    }
    if (state.view === 'all') return `<div class="site-pane" id="sitePane" data-kind="customers">${customerList()}</div>`;
    const vac = state.details.get(viewTrip());
    return `<div class="site-pane admin-vacation" id="sitePane" data-kind="${state.view}" data-run="${safe(vac.tripId)}"><div class="admin-view-panel">${viewContent(vac)}</div></div>`;
  }

  function viewContent(vac) {
    const renderView = {
      chat: dialog, 'travel-summary': travelSummary, feedback: feedbackView, trip: vacationSite, keepsake,
      onboarding, captures, vacations: vacationList,
    }[state.view];
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
    if (button.dataset.travelStep) {
      if (button.disabled) return;
      const slider = button.parentElement.querySelector('#adminTravelTurn');
      selectTravelSummaryTurn(slider, slider.valueAsNumber + Number(button.dataset.travelStep));
    } else if (button.id === 'tripButton') {
      event.stopPropagation();
      const open = document.getElementById('vacationDropdown').classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    } else if (button.dataset.view) {
      state.view = button.dataset.view;
      if (state.view === 'feedback-all') void loadFeedbackRollup();
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
    if (state.view === 'feedback-all' || state.view === 'all') {
      pane.dataset.kind = state.view;
      pane.dataset.run = '';
      pane.innerHTML = state.view === 'feedback-all' ? feedbackRollupView() : customerList();
      replaceSwitcher();
      return;
    }
    const vac = state.details.get(viewTrip());
    pane.dataset.kind = state.view;
    pane.dataset.run = vac.tripId;
    pane.querySelector('.admin-view-panel').innerHTML = viewContent(vac);
    lockReplay(document.getElementById('customerChatReplay'));
    replaceSwitcher();
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
    if (viewTrip() === id && ['chat', 'captures', 'keepsake', 'onboarding', 'feedback'].includes(state.view)) {
      const vac = state.details.get(id);
      document.querySelector('.admin-view-panel').innerHTML = viewContent(vac);
      lockReplay(document.getElementById('customerChatReplay'));
      replaceSwitcher();
    }
  }

  async function loadTravelSummary(id) {
    const result = await api(`${artifactsPath(id)}/travel-summary`).catch(() => null);
    state.travelSummaries.set(id, result?.res.ok ? result.data : { failed: true });
    if (viewTrip() === id && state.view === 'travel-summary') {
      document.querySelector('.admin-view-panel').innerHTML = travelSummary(state.details.get(id));
    }
  }

  async function loadFeedbackRollup() {
    state.feedbackRollup = null;
    state.feedbackRollupFailed = false;
    const { res, data } = await api('feedback').catch(() => ({ res: { ok: false }, data: {} }));
    state.feedbackRollupFailed = !res.ok;
    state.feedbackRollup = res.ok ? (data.rows || []) : [];
    if (state.view === 'feedback-all') {
      const pane = document.getElementById('sitePane');
      if (pane?.dataset.kind === 'feedback-all') pane.innerHTML = feedbackRollupView();
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

  function replaceSwitcher() {
    const menu = document.getElementById('vacationDropdown');
    if (!menu) return;
    const open = menu.classList.contains('open');
    menu.outerHTML = switcher();
    if (!open) return;
    document.getElementById('vacationDropdown')?.classList.add('open');
    document.getElementById('tripButton')?.setAttribute('aria-expanded', 'true');
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

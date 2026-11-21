(function () {
  if (typeof window === 'undefined' || window.__tsOpenMcpPanel) return;

  const STYLE_ID = 'ts-mcp-ai-access-style';
  const ROOT_ID = 'ts-mcp-ai-access-root';

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function currentShareToken() {
    if (window.__TS_SHARED_BOOT_SLUG__) return String(window.__TS_SHARED_BOOT_SLUG__).trim();
    const match = String(location.pathname || '').match(/^\/shared\/([^/]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]).trim();
      } catch (error) {
        void error;
        return match[1].trim();
      }
    }
    const params = new URLSearchParams(location.search || '');
    return String(params.get('token') || params.get('slug') || '').trim();
  }

  function notifyParent(message) {
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(message, '*');
    } catch (error) {
      void error;
    }
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${Math.round(value / 1024)} KB`;
    return `${Math.round(value)} B`;
  }

  function formatClock(value) {
    const raw = String(value || '').trim().replace(/(\d{1,2}:\d{2}):\d{2}/g, '$1');
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return raw;
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
  }

  function kindLabel(kind) {
    return kind === 'draft_import' ? 'Draft vacation import' : 'Targeted vacation edit';
  }

  function statusLabel(status) {
    if (status === 'pending_approval') return 'Waiting for approval';
    if (status === 'approved') return 'Approved';
    if (status === 'declined') return 'Declined';
    return 'Draft';
  }

  function sortChanges(changes) {
    const rank = { pending_approval: 0, draft: 1, approved: 2, declined: 3 };
    return [...(Array.isArray(changes) ? changes : [])].sort((a, b) => {
      const diff = (rank[a?.status] ?? 9) - (rank[b?.status] ?? 9);
      return diff || String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''));
    });
  }

  function mediaMatchLabel(media) {
    const attached = media?.attached_thing_title || media?.target_thing_ref || '';
    const dayNum = media?.attached_day_number || media?.assigned_day_number || null;
    const bucket = media?.assignment_bucket || '';
    const exif = media?.exif_match || {};
    const parts = [];
    if (attached) {
      const scope = media?.attached_thing_scheduled === false ? 'unscheduled' : (dayNum ? `Day ${dayNum}` : 'scheduled');
      parts.push(`Attached to ${attached} (${scope})`);
    } else if (dayNum) {
      parts.push(`Day ${dayNum}`);
    } else if (bucket === 'day_unmatched' || bucket === 'unassigned') {
      parts.push('Unassigned');
    } else {
      parts.push('Vacation photo');
    }
    if (exif.time_matched && exif.gps_matched) parts.push('EXIF time + GPS matched');
    else if (exif.time_matched) parts.push(`EXIF time matched${exif.local_date ? ` (${exif.local_date})` : ''}`);
    else if (exif.gps_matched) parts.push('EXIF GPS matched');
    return parts.join(' · ');
  }

  function previewBullets(changeSet) {
    const preview = changeSet?.preview || {};
    const out = [];
    if (changeSet?.kind === 'draft_import') {
      const vac = preview.will_create?.vacation || {};
      if (vac.title) out.push(`Vacation: ${vac.title}${vac.destination ? ` (${vac.destination})` : ''}`);
      const c = preview.counts || {};
      const counts = [
        c.days && `${c.days} days`,
        c.flights && `${c.flights} flights`,
        c.hotels && `${c.hotels} hotels`,
        c.cars && `${c.cars} cars`,
        c.restaurants && `${c.restaurants} restaurants`,
        c.stores && `${c.stores} stores`,
        c.things_to_do && `${c.things_to_do} things to do`,
        c.unscheduled && `${c.unscheduled} unscheduled items`,
        c.media && `${c.media} media files`,
      ].filter(Boolean);
      if (counts.length) out.push(`Will create: ${counts.join(', ')}`);
      return out;
    }
    if (Array.isArray(preview.will_add) && preview.will_add.length) out.push(`Add ${preview.will_add.length}: ${preview.will_add.map((i) => i.title).filter(Boolean).join(', ')}`);
    if (Array.isArray(preview.will_update) && preview.will_update.length) out.push(`Update ${preview.will_update.length}: ${preview.will_update.map((i) => i.current_title).filter(Boolean).join(', ')}`);
    if (Array.isArray(preview.will_remove) && preview.will_remove.length) out.push(`Remove ${preview.will_remove.length}: ${preview.will_remove.map((i) => i.title).filter(Boolean).join(', ')}`);
    if (Array.isArray(preview.day_updates) && preview.day_updates.length) out.push(`Day notes/titles updated: ${preview.day_updates.map((d) => d.day_date).filter(Boolean).join(', ')}`);
    if (Array.isArray(preview.will_attach_media) && preview.will_attach_media.length) out.push(`Attach ${preview.will_attach_media.length} media file(s)`);
    return out;
  }

  function extractPreview(changeSet) {
    const preview = changeSet?.preview || {};
    const wc = preview.will_create || {};
    const days = Array.isArray(preview.days) ? preview.days : (Array.isArray(wc.days) ? wc.days : []);
    const unscheduled = Array.isArray(preview.unscheduled_things) ? preview.unscheduled_things : (Array.isArray(wc.unscheduled_things) ? wc.unscheduled_things : []);
    const media = Array.isArray(preview.media) ? preview.media : (Array.isArray(wc.media) ? wc.media : (Array.isArray(preview.will_attach_media) ? preview.will_attach_media : []));
    const totalBytes = Number.isFinite(Number(preview.total_bytes)) ? Number(preview.total_bytes) : media.reduce((sum, row) => sum + Number(row?.bytes || 0), 0);
    const previewHash = String(preview.preview_hash || changeSet?.previewHash || '').trim();
    return { days, unscheduled, media, totalBytes, previewHash };
  }

  async function apiJson(url, options) {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...(options || {}) });
    let body = {};
    try {
      body = await response.json();
    } catch (error) {
      void error;
    }
    if (!response.ok) throw new Error(String(body?.error || body?.code || `Request failed (${response.status})`));
    return body;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.ts-mcp-backdrop{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.58);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}.ts-mcp-sheet{width:100%;max-width:780px;background:#fff;color:#111827;border-radius:16px;box-shadow:0 24px 64px rgba(15,23,42,.32);overflow:hidden;border:1px solid #e5e7eb}.ts-mcp-head{padding:16px 18px 12px;border-bottom:1px solid #e5e7eb;background:#f8fafc}.ts-mcp-kicker{font-size:10px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:#0f766e;margin:0 0 4px}.ts-mcp-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.ts-mcp-title{margin:0;font-size:19px;font-weight:800;color:#111827}.ts-mcp-close{width:34px;height:34px;border-radius:999px;border:1px solid #d1d5db;background:#fff;color:#111827;font-size:18px;font-weight:800;cursor:pointer;line-height:1}.ts-mcp-tabs{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.ts-mcp-tab{border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer}.ts-mcp-tab.is-active{background:#0f172a;border-color:#0f172a;color:#fff}.ts-mcp-body{padding:16px 18px 20px;font-size:13px;line-height:1.45}.ts-mcp-alert{padding:10px 12px;border-radius:10px;margin:0 0 12px;font-weight:600}.ts-mcp-alert-err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}.ts-mcp-alert-ok{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}.ts-mcp-split{display:grid;grid-template-columns:minmax(180px,230px) minmax(0,1fr);gap:14px}@media(max-width:640px){.ts-mcp-split{grid-template-columns:1fr}}.ts-mcp-list{list-style:none;margin:0;padding:0;display:grid;gap:8px;align-content:start}.ts-mcp-list-btn{width:100%;text-align:left;border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:10px;cursor:pointer;display:grid;gap:3px;color:#111827}.ts-mcp-list-btn.is-selected{border-color:#0f766e;background:#f0fdfa}.ts-mcp-meta{font-size:11px;color:#6b7280}.ts-mcp-preview{border:1px solid #e5e7eb;border-radius:12px;padding:14px;background:#fff}.ts-mcp-block{margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9}.ts-mcp-block h4{margin:0 0 6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#475569}.ts-mcp-block ul{margin:0;padding-left:18px;display:grid;gap:4px}.ts-mcp-block-warn{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px}.ts-mcp-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}.ts-mcp-btn{border-radius:10px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid #d1d5db;background:#fff;color:#111827}.ts-mcp-btn-primary{background:#0f766e;border-color:#0f766e;color:#fff}.ts-mcp-btn-danger{background:#fff;border-color:#fca5a5;color:#b91c1c}.ts-mcp-btn[disabled]{opacity:.55;cursor:not-allowed}.ts-mcp-form{display:grid;grid-template-columns:minmax(0,1fr) 130px 110px auto;gap:8px;align-items:end;margin:12px 0}@media(max-width:640px){.ts-mcp-form{grid-template-columns:1fr}}.ts-mcp-field{display:grid;gap:4px;font-size:11px;font-weight:700;color:#475569}.ts-mcp-field input,.ts-mcp-field select{border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;color:#111827;background:#fff}.ts-mcp-reveal{background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px;margin:12px 0;word-break:break-all}.ts-mcp-reveal code{display:block;margin-top:6px;padding:8px;border-radius:6px;background:#fff;border:1px solid #bbf7d0;font-size:12px}.ts-mcp-token-list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}.ts-mcp-token-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px}';
    document.head.appendChild(style);
  }

  const state = {
    open: false, mode: 'approvals', loading: false, busy: '', error: '', notice: '',
    changes: [], selectedId: '', tokens: [], mcpEndpoint: '', createdToken: '',
    label: 'Family AI', role: 'collaborator', expiresInDays: 30,
  };

  function closeModal() {
    state.open = false;
    notifyParent({ type: 'tsv-site-fullscreen', on: false });
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
  }

  async function refresh() {
    const shareToken = currentShareToken();
    if (!shareToken) {
      state.error = 'No vacation token found on this page.';
      state.loading = false;
      render();
      return;
    }
    state.loading = true;
    state.error = '';
    render();
    try {
      const [changesRes, tokensRes] = await Promise.all([
        apiJson(`/api/mcp/changes?shareToken=${encodeURIComponent(shareToken)}`),
        apiJson(`/api/mcp/tokens?shareToken=${encodeURIComponent(shareToken)}`),
      ]);
      state.changes = sortChanges(changesRes.changes || []);
      if (!state.selectedId || !state.changes.some((c) => c.id === state.selectedId)) state.selectedId = state.changes[0]?.id || '';
      state.tokens = Array.isArray(tokensRes.tokens) ? tokensRes.tokens : [];
      state.mcpEndpoint = String(tokensRes.mcpEndpoint || `${location.origin}/api/mcp`);
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Unable to load AI settings for this vacation.';
    } finally {
      state.loading = false;
      render();
    }
  }

  async function approveSelected(changeSetId, previewHash) {
    const shareToken = currentShareToken();
    if (!shareToken) return;
    state.busy = changeSetId;
    state.error = '';
    state.notice = '';
    render();
    try {
      const res = await apiJson(`/api/mcp/changes/${encodeURIComponent(changeSetId)}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ shareToken, ...(previewHash ? { preview_hash: previewHash } : {}) }),
      });
      state.notice = 'Approved and applied to this vacation. Refreshing…';
      render();
      const nextSlug = String(res?.shareSlug || '').trim();
      notifyParent({ type: 'tsv-vacation-approved', shareSlug: nextSlug || shareToken });
      if (nextSlug && nextSlug !== shareToken) location.assign(`/shared/${encodeURIComponent(nextSlug)}/${location.search || ''}`);
      else location.reload();
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Unable to approve this change set.';
      state.busy = '';
      render();
    }
  }

  async function runAction(busyKey, fn, okNotice, fallbackError) {
    state.busy = busyKey;
    state.error = '';
    state.notice = '';
    render();
    try {
      await fn();
      state.notice = okNotice;
      state.busy = '';
      await refresh();
    } catch (error) {
      state.error = error instanceof Error ? error.message : fallbackError;
      state.busy = '';
      render();
    }
  }

  function renderApprovals() {
    if (!state.changes.length) {
      return '<p class="ts-mcp-meta">No pending AI imports or edits for this vacation yet. Nothing goes live until approved here.</p>';
    }
    const selected = state.changes.find((c) => c.id === state.selectedId) || state.changes[0];
    const pv = extractPreview(selected);
    const bullets = previewBullets(selected);
    const missing = Array.isArray(selected?.preview?.missing) ? selected.preview.missing : [];
    const conflicts = Array.isArray(selected?.preview?.conflicts) ? selected.preview.conflicts : [];
    const listHtml = state.changes.map((item) => `<li><button type="button" class="ts-mcp-list-btn${item.id === selected.id ? ' is-selected' : ''}" data-mcp-select="${esc(item.id)}"><strong>${esc(kindLabel(item.kind))}</strong><span class="ts-mcp-meta">${esc(statusLabel(item.status))}</span><span>${esc(item.summary || '')}</span></button></li>`).join('');
    const daysHtml = pv.days.length
      ? `<div class="ts-mcp-block" data-ts-mcp-preview-days="1"><h4>Itinerary by day</h4><ul>${pv.days.map((day, idx) => `<li><strong>Day ${esc(day.day_number ?? idx + 1)}${day.date ? ` (${esc(day.date)})` : ''}${day.title ? ` — ${esc(day.title)}` : ''}</strong>${Array.isArray(day.items) && day.items.length ? `<ul>${day.items.map((item) => `<li>${item.category ? `${esc(item.category)}: ` : ''}${esc(item.title || '')}${item.start_time ? ` · ${esc(formatClock(item.start_time))}` : ''}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul></div>`
      : '';
    const unscheduledHtml = pv.unscheduled.length
      ? `<div class="ts-mcp-block" data-ts-mcp-preview-unscheduled="1"><h4>Unscheduled long-list items (${pv.unscheduled.length})</h4><ul>${pv.unscheduled.map((item) => `<li>${item.category ? `${esc(item.category)}: ` : ''}${esc(item.title || '')} — Unscheduled</li>`).join('')}</ul></div>`
      : '';
    const mediaHtml = pv.media.length
      ? `<div class="ts-mcp-block" data-ts-mcp-preview-media="1"><h4>Media attachments (${pv.media.length} · ${esc(formatBytes(pv.totalBytes))})</h4><ul>${pv.media.map((m) => `<li>${esc(m.filename || 'photo')} (${esc(formatBytes(m.bytes || 0))}) — ${esc(mediaMatchLabel(m))}</li>`).join('')}</ul></div>`
      : '';
    const bulletsHtml = bullets.length ? `<div class="ts-mcp-block"><h4>What will change</h4><ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>` : '';
    const missingHtml = missing.length ? `<div class="ts-mcp-block"><h4>Missing details</h4><ul>${missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : '';
    const conflictsHtml = conflicts.length ? `<div class="ts-mcp-block ts-mcp-block-warn"><h4>Conflicts to review</h4><ul>${conflicts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '';
    const actionsHtml = selected.status === 'pending_approval'
      ? `<div class="ts-mcp-actions"><button type="button" class="ts-mcp-btn ts-mcp-btn-primary" data-mcp-approve="${esc(selected.id)}" data-mcp-hash="${esc(pv.previewHash)}"${state.busy === selected.id ? ' disabled' : ''}>Approve</button><button type="button" class="ts-mcp-btn ts-mcp-btn-danger" data-mcp-decline="${esc(selected.id)}"${state.busy === selected.id ? ' disabled' : ''}>Decline</button></div>`
      : '';
    return `<div class="ts-mcp-split"><ul class="ts-mcp-list">${listHtml}</ul><div class="ts-mcp-preview" data-ts-mcp-preview="1"><h3 style="margin:0 0 6px;font-size:16px">${esc(kindLabel(selected.kind))}</h3><p style="margin:0 0 6px">Status: <strong>${esc(statusLabel(selected.status))}</strong></p>${pv.previewHash ? `<p style="margin:0 0 6px" data-ts-mcp-preview-hash="${esc(pv.previewHash)}">Preview hash: <code>${esc(pv.previewHash)}</code></p>` : ''}<p style="margin:0">${esc(selected.preview?.summary_text || selected.summary || '')}</p>${bulletsHtml}${daysHtml}${unscheduledHtml}${mediaHtml}${missingHtml}${conflictsHtml}${actionsHtml}</div></div>`;
  }

  function renderTokens() {
    const endpointHtml = state.mcpEndpoint ? `<p style="margin:6px 0 10px">MCP endpoint: <code>${esc(state.mcpEndpoint)}</code></p>` : '';
    const revealHtml = state.createdToken ? `<div class="ts-mcp-reveal" role="status"><strong>Copy this AI token now. It is stored hashed and will not be shown again:</strong><code>${esc(state.createdToken)}</code><div style="margin-top:8px"><button type="button" class="ts-mcp-btn" data-mcp-copy-token="1">Copy token</button></div></div>` : '';
    const rowsHtml = state.tokens.length
      ? `<ul class="ts-mcp-token-list">${state.tokens.map((t) => `<li class="ts-mcp-token-row"><div><strong>${esc(t.label)}</strong> (${esc(t.role)}) · <code>${esc(t.tokenPrefix)}…</code><div class="ts-mcp-meta">${t.status === 'active' ? 'Active' : 'Revoked'}${t.expiresAt ? ` · Expires ${esc(String(t.expiresAt).slice(0, 10))}` : ''}</div></div>${t.status === 'active' ? `<button type="button" class="ts-mcp-btn ts-mcp-btn-danger" data-mcp-revoke="${esc(t.id)}"${state.busy === t.id ? ' disabled' : ''}>Revoke</button>` : ''}</li>`).join('')}</ul>`
      : '<p class="ts-mcp-meta">No AI access tokens created for this vacation yet.</p>';
    return `<p class="ts-mcp-meta" style="margin:0 0 8px">Create an AI token scoped to this vacation only. Any AI using this token can read this vacation, stage draft imports, or propose edits for your approval.</p>${endpointHtml}<form class="ts-mcp-form" data-mcp-token-form="1"><label class="ts-mcp-field"><span>Token label</span><input type="text" name="label" value="${esc(state.label)}" maxlength="120" placeholder="Family AI" /></label><label class="ts-mcp-field"><span>Role</span><select name="role"><option value="collaborator"${state.role === 'collaborator' ? ' selected' : ''}>Collaborator</option><option value="owner"${state.role === 'owner' ? ' selected' : ''}>Owner</option></select></label><label class="ts-mcp-field"><span>Expires (days)</span><input type="number" name="expiresInDays" min="1" max="90" value="${esc(state.expiresInDays)}" /></label><button type="submit" class="ts-mcp-btn ts-mcp-btn-primary"${state.busy === 'create-token' ? ' disabled' : ''}>Create AI token</button></form>${revealHtml}${rowsHtml}`;
  }

  function render() {
    if (!state.open) return;
    ensureStyles();
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    const pendingCount = state.changes.filter((c) => c.status === 'pending_approval').length;
    const activeTokenCount = state.tokens.filter((t) => t.status === 'active').length;
    root.innerHTML = `<div class="ts-mcp-backdrop" data-ts-mcp-backdrop="1" role="presentation"><aside class="ts-mcp-sheet" data-ts-mcp-panel="1" role="dialog" aria-modal="true" aria-label="AI Access and Approvals"><header class="ts-mcp-head"><p class="ts-mcp-kicker">Vacation AI</p><div class="ts-mcp-title-row"><h2 class="ts-mcp-title">AI Access &amp; Approvals</h2><button type="button" class="ts-mcp-close" data-mcp-close="1" aria-label="Close">×</button></div><div class="ts-mcp-tabs" role="tablist"><button type="button" role="tab" aria-selected="${state.mode === 'approvals' ? 'true' : 'false'}" class="ts-mcp-tab${state.mode === 'approvals' ? ' is-active' : ''}" data-mcp-tab="approvals">Pending approvals (${pendingCount})</button><button type="button" role="tab" aria-selected="${state.mode === 'tokens' ? 'true' : 'false'}" class="ts-mcp-tab${state.mode === 'tokens' ? ' is-active' : ''}" data-mcp-tab="tokens">AI access tokens (${activeTokenCount})</button></div></header><div class="ts-mcp-body">${state.error ? `<p class="ts-mcp-alert ts-mcp-alert-err" role="alert">${esc(state.error)}</p>` : ''}${state.notice ? `<p class="ts-mcp-alert ts-mcp-alert-ok" role="status">${esc(state.notice)}</p>` : ''}${state.loading ? '<p class="ts-mcp-meta">Loading vacation AI activity…</p>' : (state.mode === 'approvals' ? renderApprovals() : renderTokens())}</div></aside></div>`;

    const shareToken = currentShareToken();
    const backdrop = root.querySelector('[data-ts-mcp-backdrop="1"]');
    if (backdrop) backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
    const closeBtn = root.querySelector('[data-mcp-close="1"]');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    root.querySelectorAll('[data-mcp-tab]').forEach((btn) => btn.addEventListener('click', () => { state.mode = btn.getAttribute('data-mcp-tab') === 'tokens' ? 'tokens' : 'approvals'; render(); }));
    root.querySelectorAll('[data-mcp-select]').forEach((btn) => btn.addEventListener('click', () => { state.selectedId = btn.getAttribute('data-mcp-select') || ''; render(); }));
    const approveBtn = root.querySelector('[data-mcp-approve]');
    if (approveBtn) approveBtn.addEventListener('click', () => { void approveSelected(approveBtn.getAttribute('data-mcp-approve') || '', approveBtn.getAttribute('data-mcp-hash') || ''); });
    const declineBtn = root.querySelector('[data-mcp-decline]');
    if (declineBtn) {
      declineBtn.addEventListener('click', () => {
        const id = declineBtn.getAttribute('data-mcp-decline') || '';
        void runAction(id, () => apiJson(`/api/mcp/changes/${encodeURIComponent(id)}/decline`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ shareToken }) }), 'Change set declined. Live vacation data was not changed.', 'Unable to decline this change set.');
      });
    }
    const form = root.querySelector('[data-mcp-token-form="1"]');
    if (form) {
      const labelInput = form.querySelector('input[name="label"]');
      const roleSelect = form.querySelector('select[name="role"]');
      const expInput = form.querySelector('input[name="expiresInDays"]');
      if (labelInput) labelInput.addEventListener('input', () => { state.label = labelInput.value; });
      if (roleSelect) roleSelect.addEventListener('change', () => { state.role = roleSelect.value; });
      if (expInput) expInput.addEventListener('input', () => { state.expiresInDays = Number(expInput.value) || 30; });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        state.createdToken = '';
        void runAction('create-token', async () => {
          const created = await apiJson('/api/mcp/tokens', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ shareToken, label: String(state.label || '').trim() || 'Family AI', role: state.role === 'owner' ? 'owner' : 'collaborator', expires_in_days: Number(state.expiresInDays) || 30 }) });
          state.createdToken = String(created.token || '');
          if (created.mcpEndpoint) state.mcpEndpoint = String(created.mcpEndpoint);
        }, 'AI access token created for this vacation. Copy it now; it is only shown once.', 'Unable to create AI access token.');
      });
    }
    const copyBtn = root.querySelector('[data-mcp-copy-token="1"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (navigator.clipboard && state.createdToken) {
          void navigator.clipboard.writeText(state.createdToken).then(() => { state.notice = 'AI token copied to clipboard.'; render(); }).catch((error) => { void error; });
        }
      });
    }
    root.querySelectorAll('[data-mcp-revoke]').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-mcp-revoke') || '';
      void runAction(id, () => apiJson(`/api/mcp/tokens/${encodeURIComponent(id)}/revoke`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ shareToken }) }), 'AI access token revoked.', 'Unable to revoke AI access token.');
    }));
  }

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.open) closeModal(); });

  window.__tsOpenMcpPanel = function (mode) {
    state.mode = mode === 'tokens' ? 'tokens' : 'approvals';
    state.open = true;
    state.error = '';
    state.notice = '';
    notifyParent({ type: 'tsv-site-fullscreen', on: true });
    void refresh();
  };

  function checkInitialPanelParam() {
    const params = new URLSearchParams(location.search || '');
    const panel = String(params.get('panel') || params.get('mcp') || '').trim().toLowerCase();
    if (panel === 'ai-approvals' || panel === 'approvals') window.__tsOpenMcpPanel('approvals');
    else if (panel === 'ai-access' || panel === 'tokens') window.__tsOpenMcpPanel('tokens');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checkInitialPanelParam);
  else checkInitialPanelParam();
})();

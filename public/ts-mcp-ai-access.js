(function () {
  if (typeof window === 'undefined' || window.__tsOpenMcpPanel) return;

  const STYLE_ID = 'ts-mcp-ai-access-style';
  const ROOT_ID = 'ts-mcp-ai-access-root';
  const galleryGroups = new Map();

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

  const CATEGORY_ICONS = {
    flight: '✈️',
    hotel: '🏨',
    car: '🚗',
    restaurant: '🍽️',
    bar: '🍸',
    store: '🛍️',
    sightseeing: '🏞️',
    tour: '🧭',
    attraction: '🎟️',
    music: '🎵',
    theatre: '🎭',
    workout: '🏃',
    tickets: '🎫',
    family_event: '👨‍👩‍👧‍👦',
    artist: '🎨',
    transport: '🚆',
    event: '🎉',
    note: '📝',
    activity: '📍',
  };

  function categoryIcon(category) {
    const key = String(category || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return CATEGORY_ICONS[key] || '📍';
  }

  function formatFriendlyDate(iso) {
    const trimmed = String(iso || '').trim();
    if (!trimmed) return '';
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const parsed = m
      ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
      : Date.parse(trimmed);
    if (!Number.isFinite(parsed)) return trimmed;
    return new Date(parsed).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
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

  function normalizeMedia(row) {
    if (!row || typeof row !== 'object') return null;
    const mediaId = String(row.media_id || row.id || '').trim();
    const mime = String(row.mime_type || row.mimeType || '').trim();
    const url = String(row.url || row.preview_url || row.public_url || '').trim()
      || (mediaId ? `/api/mcp/media/${encodeURIComponent(mediaId)}` : '');
    if (!url) return null;
    const isVideo = String(row.media_kind || row.kind || '').toLowerCase() === 'video'
      || mime.toLowerCase().startsWith('video/')
      || /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url);
    const posterUrl = String(row.poster_url || row.posterUrl || row.thumbnail_url || '').trim();
    return {
      ...row,
      media_id: mediaId || url,
      media_kind: isVideo ? 'video' : 'photo',
      mime_type: mime || (isVideo ? 'video/mp4' : 'image/jpeg'),
      url,
      poster_url: posterUrl && posterUrl !== url ? posterUrl : '',
      caption: String(row.caption || '').trim(),
    };
  }

  function isDayOnlyMedia(row) {
    if (!row || typeof row !== 'object') return false;
    if (row.attached_thing_ref || row.target_thing_ref || row.attached_thing_title) return false;
    if (row.assignment_bucket === 'thing') return false;
    return Boolean(row.attached_day_date || row.assigned_day_date || row.attached_day_number || row.assigned_day_number || row.assignment_bucket === 'day');
  }

  function isSkippedMedia(row) {
    if (!row || typeof row !== 'object') return false;
    if (row.assignment_bucket === 'unassigned') return true;
    return !row.attached_thing_ref && !row.target_thing_ref && !row.attached_thing_title && !row.attached_day_date && !row.assigned_day_date;
  }

  function formatSkippedMediaNote(items) {
    const count = items.length;
    if (!count) return '';
    const hasPhoto = items.some((m) => String(m.media_kind || 'photo').toLowerCase() !== 'video');
    const hasVideo = items.some((m) => String(m.media_kind || 'photo').toLowerCase() === 'video');
    if (count === 1) {
      return hasVideo
        ? "This video doesn't have a date during this vacation, so it won't be imported."
        : "This photo doesn't have a date during this vacation, so it won't be imported.";
    }
    const noun = hasPhoto && hasVideo ? 'photos and videos' : (hasVideo ? 'videos' : 'photos');
    return `These ${count} ${noun} don't have a date during this vacation, so they won't be imported.`;
  }

  function videoThumbSrc(url, posterUrl) {
    if (posterUrl || !url || url.startsWith('data:') || url.includes('#')) return url;
    return `${url}#t=0.1`;
  }

  function renderThumbStrip(rawMedia, { galleryKey, ownerLabel, scope }) {
    const items = (Array.isArray(rawMedia) ? rawMedia : []).map(normalizeMedia).filter(Boolean);
    if (!items.length) return '';
    galleryGroups.set(galleryKey, { items, title: ownerLabel });
    const buttons = items.map((item, idx) => {
      const isVideo = item.media_kind === 'video';
      const inner = isVideo
        ? `<video class="ts-mcp-thumb-media" src="${esc(videoThumbSrc(item.url, item.poster_url))}"${item.poster_url ? ` poster="${esc(item.poster_url)}"` : ''} muted playsinline preload="metadata" aria-hidden="true"></video><span class="ts-mcp-thumb-play" data-ts-media-play-badge="1" aria-hidden="true">▶</span>`
        : `<img class="ts-mcp-thumb-media" src="${esc(item.url)}" alt="${esc(item.caption || ownerLabel)}" loading="lazy" />`;
      return `<button type="button" class="ts-mcp-thumb${isVideo ? ' is-video' : ''}" data-ts-preview-thumb="1" data-ts-gallery-key="${esc(galleryKey)}" data-ts-gallery-index="${idx}" data-media-id="${esc(item.media_id)}" data-media-kind="${esc(item.media_kind)}" aria-label="${esc(isVideo ? `Play video for ${ownerLabel}` : `View photo for ${ownerLabel}`)}">${inner}</button>`;
    }).join('');
    return `<div class="ts-mcp-thumb-strip" data-ts-media-strip="${esc(scope)}" data-ts-media-owner="${esc(ownerLabel)}">${buttons}</div>`;
  }

  function previewChips(changeSet) {
    const preview = changeSet?.preview || {};
    const out = [];
    if (changeSet?.kind === 'draft_import') {
      const c = preview.counts || {};
      return [
        c.days && `${c.days} ${c.days === 1 ? 'day' : 'days'}`,
        c.flights && `${c.flights} ${c.flights === 1 ? 'flight' : 'flights'}`,
        c.hotels && `${c.hotels} ${c.hotels === 1 ? 'hotel' : 'hotels'}`,
        c.cars && `${c.cars} ${c.cars === 1 ? 'car' : 'cars'}`,
        c.restaurants && `${c.restaurants} ${c.restaurants === 1 ? 'restaurant' : 'restaurants'}`,
        c.stores && `${c.stores} ${c.stores === 1 ? 'store' : 'stores'}`,
        c.things_to_do && `${c.things_to_do} ${c.things_to_do === 1 ? 'activity' : 'activities'}`,
        c.unscheduled_things && `${c.unscheduled_things} saved for later`,
        c.media && `${c.media} ${c.media === 1 ? 'photo or video' : 'photos & videos'}`,
      ].filter(Boolean);
    }
    if (Array.isArray(preview.will_add) && preview.will_add.length) out.push(`Add ${preview.will_add.map((i) => i.title).filter(Boolean).join(', ')}`);
    if (Array.isArray(preview.will_update) && preview.will_update.length) out.push(`Update ${preview.will_update.map((i) => i.current_title).filter(Boolean).join(', ')}`);
    if (Array.isArray(preview.will_remove) && preview.will_remove.length) out.push(`Remove ${preview.will_remove.map((i) => i.title).filter(Boolean).join(', ')}`);
    if (Array.isArray(preview.day_updates) && preview.day_updates.length) out.push(`Update ${preview.day_updates.map((d) => formatFriendlyDate(d.day_date)).filter(Boolean).join(', ')}`);
    if (Array.isArray(preview.will_attach_media) && preview.will_attach_media.length) out.push(`${preview.will_attach_media.length} ${preview.will_attach_media.length === 1 ? 'photo or video' : 'photos & videos'}`);
    return out;
  }

  function extractPreview(changeSet) {
    const preview = changeSet?.preview || {};
    const wc = preview.will_create || {};
    const rawDays = Array.isArray(preview.days) ? preview.days : (Array.isArray(wc.days) ? wc.days : []);
    const rawUnscheduled = Array.isArray(preview.unscheduled_things) ? preview.unscheduled_things : (Array.isArray(wc.unscheduled_things) ? wc.unscheduled_things : []);
    const rawMedia = Array.isArray(preview.media) ? preview.media : (Array.isArray(wc.media) ? wc.media : (Array.isArray(preview.will_attach_media) ? preview.will_attach_media : []));
    const media = rawMedia.map(normalizeMedia).filter(Boolean);
    const days = rawDays.map((day) => {
      const items = Array.isArray(day?.items)
        ? day.items.map((item) => ({ ...item, media: (Array.isArray(item?.media) ? item.media : []).map(normalizeMedia).filter(Boolean) }))
        : [];
      const dayOnly = Array.isArray(day?.day_media)
        ? day.day_media
        : (Array.isArray(day?.media) ? day.media.filter(isDayOnlyMedia) : []);
      return { ...day, items, day_media: dayOnly.map(normalizeMedia).filter(Boolean) };
    });
    const unscheduled = rawUnscheduled.map((item) => ({ ...item, media: (Array.isArray(item?.media) ? item.media : []).map(normalizeMedia).filter(Boolean) }));
    const rawSkipped = Array.isArray(preview.skipped_media) ? preview.skipped_media : media.filter(isSkippedMedia);
    const skippedMedia = rawSkipped.map(normalizeMedia).filter(Boolean);
    const skippedMediaNote = String(preview.skipped_media_note || '').trim() || formatSkippedMediaNote(skippedMedia);
    const previewHash = String(preview.preview_hash || changeSet?.previewHash || '').trim();
    const previewVersion = Math.max(1, Number(preview.preview_version || changeSet?.previewVersion || 1));
    const lastChanges = Array.isArray(preview.last_changes) ? preview.last_changes.filter(Boolean) : [];
    const rawRequests = Array.isArray(preview.change_requests) ? preview.change_requests : (Array.isArray(changeSet?.changeRequests) ? changeSet.changeRequests : []);
    const changeRequests = rawRequests.filter((entry) => entry && typeof entry === 'object' && String(entry.note || '').trim());
    return { days, unscheduled, media, skippedMedia, skippedMediaNote, previewHash, previewVersion, lastChanges, changeRequests };
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
    style.textContent = '.ts-mcp-backdrop{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.58);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}.ts-mcp-sheet{width:100%;max-width:780px;background:#fff;color:#111827;border-radius:16px;box-shadow:0 24px 64px rgba(15,23,42,.32);overflow:hidden;border:1px solid #e5e7eb}.ts-mcp-head{padding:16px 18px 12px;border-bottom:1px solid #e5e7eb;background:#f8fafc}.ts-mcp-kicker{font-size:10px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:#0f766e;margin:0 0 4px}.ts-mcp-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.ts-mcp-title{margin:0;font-size:19px;font-weight:800;color:#111827}.ts-mcp-close{width:34px;height:34px;border-radius:999px;border:1px solid #d1d5db;background:#fff;color:#111827;font-size:18px;font-weight:800;cursor:pointer;line-height:1}.ts-mcp-tabs{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.ts-mcp-tab{border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer}.ts-mcp-tab.is-active{background:#0f172a;border-color:#0f172a;color:#fff}.ts-mcp-body{padding:16px 18px 20px;font-size:13px;line-height:1.45}.ts-mcp-alert{padding:10px 12px;border-radius:10px;margin:0 0 12px;font-weight:600}.ts-mcp-alert-err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}.ts-mcp-alert-ok{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}.ts-mcp-split{display:grid;grid-template-columns:minmax(180px,230px) minmax(0,1fr);gap:14px;min-width:0}@media(max-width:640px){.ts-mcp-split{grid-template-columns:minmax(0,1fr)}}.ts-mcp-list{list-style:none;margin:0;padding:0;display:grid;gap:8px;align-content:start;min-width:0}.ts-mcp-list-btn{width:100%;text-align:left;border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:10px;cursor:pointer;display:grid;gap:3px;color:#111827}.ts-mcp-list-btn.is-selected{border-color:#0f766e;background:#f0fdfa}.ts-mcp-meta{font-size:11px;color:#6b7280}.ts-mcp-preview{border:1px solid #e5e7eb;border-radius:12px;padding:14px;background:#fff;color:#111827;min-width:0;overflow-wrap:anywhere}.ts-mcp-preview code{word-break:break-all;overflow-wrap:anywhere}.ts-mcp-preview-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;margin-bottom:6px}.ts-mcp-status-pill{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1}.ts-mcp-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}.ts-mcp-chip{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#f8fafc;color:#334155;border:1px solid #e2e8f0}.ts-mcp-block{margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9}.ts-mcp-block h4{margin:0 0 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#64748b}.ts-mcp-days{display:grid;gap:8px}.ts-mcp-day-card{border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#f8fafc;display:grid;gap:8px}.ts-mcp-day-head{font-size:13px;font-weight:800;color:#0f172a;line-height:1.3}.ts-mcp-thing-list{display:grid;gap:6px}.ts-mcp-thing-row{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;background:#fff;display:grid;gap:4px}.ts-mcp-thing-main{display:flex;align-items:center;gap:8px;min-width:0}.ts-mcp-thing-icon{width:24px;height:24px;flex:0 0 24px;display:inline-grid;place-items:center;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;font-size:13px;line-height:1}.ts-mcp-thing-label{min-width:0;font-size:13px;line-height:1.35;color:#0f172a;overflow-wrap:anywhere}.ts-mcp-thing-name{font-weight:700}.ts-mcp-thing-time{color:#64748b;font-weight:600}.ts-mcp-day-media-label{margin:2px 0 0;font-size:11px;font-weight:700;color:#64748b}.ts-mcp-notes{display:grid;gap:6px}.ts-mcp-note{margin:0;font-size:12px;line-height:1.45;color:#475569;padding:8px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0}.ts-mcp-thumb-strip{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.ts-mcp-thumb{position:relative;width:58px;height:58px;padding:0;border-radius:8px;overflow:hidden;border:1px solid #cbd5e1;background:#0f172a;cursor:pointer;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center}.ts-mcp-thumb-media{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}.ts-mcp-thumb-play{position:absolute;inset:0;margin:auto;width:24px;height:24px;border-radius:999px;background:rgba(15,23,42,.78);color:#fff;font-size:11px;display:inline-flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.35)}.ts-mcp-block-warn .ts-mcp-note{background:#fffbeb;border-color:#fde68a;color:#92400e}.ts-mcp-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}.ts-mcp-btn{border-radius:10px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid #d1d5db;background:#fff;color:#111827}.ts-mcp-btn-primary{background:#0f766e;border-color:#0f766e;color:#fff}.ts-mcp-btn-secondary{background:#f8fafc;border-color:#94a3b8;color:#0f172a}.ts-mcp-btn-danger{background:#fff;border-color:#fca5a5;color:#b91c1c}.ts-mcp-btn[disabled]{opacity:.55;cursor:not-allowed}.ts-mcp-change-box{display:grid;gap:8px;margin-top:10px;padding:10px;border-radius:10px;background:#f8fafc;border:1px solid #cbd5e1}.ts-mcp-change-label{font-size:12px;font-weight:700;color:#0f172a}.ts-mcp-change-input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;line-height:1.4;color:#0f172a;background:#fff;resize:vertical}.ts-mcp-form{display:grid;grid-template-columns:minmax(0,1fr) 130px 110px auto;gap:8px;align-items:end;margin:12px 0}@media(max-width:640px){.ts-mcp-form{grid-template-columns:1fr}}.ts-mcp-field{display:grid;gap:4px;font-size:11px;font-weight:700;color:#475569}.ts-mcp-field input,.ts-mcp-field select{border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;color:#111827;background:#fff}.ts-mcp-reveal{background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px;margin:12px 0;word-break:break-all}.ts-mcp-reveal code{display:block;margin-top:6px;padding:8px;border-radius:6px;background:#fff;border:1px solid #bbf7d0;font-size:12px}.ts-mcp-token-list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}.ts-mcp-token-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px}';
    document.head.appendChild(style);
  }

  const state = {
    open: false, mode: 'approvals', loading: false, busy: '', error: '', notice: '',
    isAdmin: true,
    changes: [], selectedId: '', tokens: [], reservationConnections: [], mcpEndpoint: '', createdToken: '',
    label: 'Family AI', role: 'collaborator', expiresInDays: 30,
    requestBoxFor: '', requestNote: '',
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
      state.isAdmin = tokensRes.isAdmin !== false && tokensRes.role !== 'collaborator';
      state.changes = sortChanges(changesRes.changes || []);
      if (!state.selectedId || !state.changes.some((c) => c.id === state.selectedId)) state.selectedId = state.changes[0]?.id || '';
      state.tokens = Array.isArray(tokensRes.tokens) ? tokensRes.tokens : [];
      state.mcpEndpoint = String(tokensRes.mcpEndpoint || `${location.origin}/api/mcp`);
      if (state.isAdmin) {
        try {
          const resConn = await apiJson(`/api/mcp/reservations/connections?shareToken=${encodeURIComponent(shareToken)}&admin=1`);
          state.reservationConnections = Array.isArray(resConn.connections) ? resConn.connections : [];
        } catch (connErr) {
          void connErr;
          state.reservationConnections = [];
        }
      } else {
        state.reservationConnections = [];
      }
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
    const chips = previewChips(selected);
    const missing = Array.isArray(selected?.preview?.missing) ? selected.preview.missing : [];
    const conflicts = Array.isArray(selected?.preview?.conflicts) ? selected.preview.conflicts : [];
    galleryGroups.clear();
    const listHtml = state.changes.map((item) => `<li><button type="button" class="ts-mcp-list-btn${item.id === selected.id ? ' is-selected' : ''}" data-mcp-select="${esc(item.id)}"><strong>${esc(kindLabel(item.kind))}</strong><span class="ts-mcp-meta">${esc(statusLabel(item.status))}</span><span>${esc(item.summary || '')}</span></button></li>`).join('');
    const daysHtml = pv.days.length
      ? `<div class="ts-mcp-block" data-ts-mcp-preview-days="1"><h4>Itinerary by day</h4><div class="ts-mcp-days">${pv.days.map((day, idx) => {
        const dayNum = day.day_number ?? idx + 1;
        const friendlyDate = formatFriendlyDate(day.date);
        const dayLabel = `Day ${dayNum}${friendlyDate ? ` · ${friendlyDate}` : ''}`;
        const itemsHtml = Array.isArray(day.items) && day.items.length
          ? `<div class="ts-mcp-thing-list">${day.items.map((item, itemIdx) => {
            const thingTitle = String(item.title || '').trim() || 'Item';
            const timeLabel = item.start_time ? formatClock(item.start_time) : '';
            const thumbs = renderThumbStrip(item.media, {
              galleryKey: `${selected.id}:day:${idx}:thing:${item.ref || item.id || itemIdx}`,
              ownerLabel: thingTitle,
              scope: 'thing',
            });
            return `<div class="ts-mcp-thing-row" data-ts-preview-thing="${esc(item.ref || item.id || thingTitle)}"><div class="ts-mcp-thing-main"><span class="ts-mcp-thing-icon" data-ts-preview-type-icon="1" aria-hidden="true">${categoryIcon(item.category)}</span><span class="ts-mcp-thing-label"><span class="ts-mcp-thing-name">${esc(thingTitle)}</span>${timeLabel ? `<span class="ts-mcp-thing-time"> · ${esc(timeLabel)}</span>` : ''}</span></div>${thumbs}</div>`;
          }).join('')}</div>`
          : '';
        const dayThumbs = renderThumbStrip(day.day_media, {
          galleryKey: `${selected.id}:day:${idx}:direct`,
          ownerLabel: dayLabel,
          scope: 'day',
        });
        const dayMediaBlock = dayThumbs ? `<div><div class="ts-mcp-day-media-label">Day ${esc(dayNum)} photos &amp; videos</div>${dayThumbs}</div>` : '';
        return `<section class="ts-mcp-day-card" data-ts-preview-day="${esc(day.date || String(dayNum))}"><div class="ts-mcp-day-head" data-ts-preview-day-header="1">${esc(dayLabel)}${day.title ? ` — ${esc(day.title)}` : ''}</div>${itemsHtml}${dayMediaBlock}</section>`;
      }).join('')}</div></div>`
      : '';
    const unscheduledHtml = pv.unscheduled.length
      ? `<div class="ts-mcp-block" data-ts-mcp-preview-unscheduled="1"><h4>Saved for later</h4><div class="ts-mcp-thing-list">${pv.unscheduled.map((item, idx) => {
        const thingTitle = String(item.title || '').trim() || 'Saved item';
        const thumbs = renderThumbStrip(item.media, {
          galleryKey: `${selected.id}:unscheduled:${item.ref || item.id || idx}`,
          ownerLabel: thingTitle,
          scope: 'thing',
        });
        return `<div class="ts-mcp-thing-row" data-ts-preview-thing="${esc(item.ref || item.id || thingTitle)}"><div class="ts-mcp-thing-main"><span class="ts-mcp-thing-icon" data-ts-preview-type-icon="1" aria-hidden="true">${categoryIcon(item.category)}</span><span class="ts-mcp-thing-label"><span class="ts-mcp-thing-name">${esc(thingTitle)}</span></span></div>${thumbs}</div>`;
      }).join('')}</div></div>`
      : '';
    const skippedHtml = pv.skippedMedia.length
      ? `<div class="ts-mcp-block" data-ts-mcp-preview-wont-import="1"><h4>Won&#39;t be imported</h4>${pv.skippedMediaNote ? `<p class="ts-mcp-note" data-ts-wont-import-note="1">${esc(pv.skippedMediaNote)}</p>` : ''}${renderThumbStrip(pv.skippedMedia, {
        galleryKey: `${selected.id}:skipped`,
        ownerLabel: "Won't be imported",
        scope: 'skipped',
      })}</div>`
      : '';
    const chipsHtml = chips.length ? `<div class="ts-mcp-chips">${chips.map((b) => `<span class="ts-mcp-chip">${esc(b)}</span>`).join('')}</div>` : '';
    const changesHtml = pv.lastChanges.length ? `<div class="ts-mcp-block" data-ts-preview-changes="1"><h4>Updated in this preview</h4><div class="ts-mcp-notes">${pv.lastChanges.map((c) => `<p class="ts-mcp-note">${esc(c)}</p>`).join('')}</div></div>` : '';
    const requestedHtml = pv.changeRequests.length ? `<div class="ts-mcp-block" data-ts-requested-changes="1"><h4>Requested changes</h4><div class="ts-mcp-notes">${pv.changeRequests.map((entry) => `<p class="ts-mcp-note">${esc(entry.note)}</p>`).join('')}</div></div>` : '';
    const missingHtml = missing.length ? `<div class="ts-mcp-block" data-ts-mcp-preview-notes="1"><h4>Good to know</h4><div class="ts-mcp-notes">${missing.map((m) => `<p class="ts-mcp-note">${esc(m)}</p>`).join('')}</div></div>` : '';
    const conflictsHtml = conflicts.length ? `<div class="ts-mcp-block ts-mcp-block-warn"><h4>Conflicts to review</h4><div class="ts-mcp-notes">${conflicts.map((c) => `<p class="ts-mcp-note">${esc(c)}</p>`).join('')}</div></div>` : '';
    const requestBoxHtml = selected.status === 'pending_approval' && state.requestBoxFor === selected.id
      ? `<div class="ts-mcp-change-box" data-ts-request-changes-box="1"><label class="ts-mcp-change-label">What should your AI change?</label><textarea class="ts-mcp-change-input" data-ts-request-changes-input="1" rows="3" maxlength="1000" placeholder="Move a stop, drop a photo, or adjust a time…">${esc(state.requestNote)}</textarea><div class="ts-mcp-actions" style="margin-top:0"><button type="button" class="ts-mcp-btn ts-mcp-btn-primary" data-mcp-request-submit="${esc(selected.id)}" data-mcp-hash="${esc(pv.previewHash)}" data-ts-request-changes-submit="1"${state.busy === selected.id ? ' disabled' : ''}>Send note</button><button type="button" class="ts-mcp-btn" data-mcp-request-cancel="1" data-ts-request-changes-cancel="1">Cancel</button></div></div>`
      : '';
    const actionsHtml = selected.status === 'pending_approval'
      ? `<div class="ts-mcp-actions"><button type="button" class="ts-mcp-btn ts-mcp-btn-primary" data-mcp-approve="${esc(selected.id)}" data-mcp-hash="${esc(pv.previewHash)}"${state.busy === selected.id ? ' disabled' : ''}>Approve</button><button type="button" class="ts-mcp-btn ts-mcp-btn-secondary" data-mcp-request-toggle="${esc(selected.id)}" data-ts-request-changes-btn="1"${state.busy === selected.id ? ' disabled' : ''}>Request changes</button><button type="button" class="ts-mcp-btn ts-mcp-btn-danger" data-mcp-decline="${esc(selected.id)}"${state.busy === selected.id ? ' disabled' : ''}>Decline</button></div>${requestBoxHtml}`
      : '';
    const hashAttr = pv.previewHash ? ` data-ts-mcp-preview-hash="${esc(pv.previewHash)}"` : '';
    const versionAttr = ` data-ts-mcp-preview-version="${esc(String(pv.previewVersion))}"`;
    const versionSuffix = pv.previewVersion > 1 ? ` · v${pv.previewVersion}` : '';
    return `<div class="ts-mcp-split"><ul class="ts-mcp-list">${listHtml}</ul><div class="ts-mcp-preview" data-ts-mcp-preview="1"${versionAttr}${hashAttr}><div class="ts-mcp-preview-head"><h3 style="margin:0;font-size:16px">${esc(kindLabel(selected.kind))}</h3><span class="ts-mcp-status-pill">${esc(statusLabel(selected.status))}${esc(versionSuffix)}</span></div><p style="margin:0">${esc(selected.preview?.summary_text || selected.summary || '')}</p>${chipsHtml}${changesHtml}${daysHtml}${unscheduledHtml}${skippedHtml}${requestedHtml}${missingHtml}${conflictsHtml}${actionsHtml}</div></div>`;
  }

  function renderTokens() {
    const endpointHtml = state.mcpEndpoint ? `<p style="margin:6px 0 10px">MCP endpoint: <code>${esc(state.mcpEndpoint)}</code></p>` : '';
    const revealHtml = state.createdToken ? `<div class="ts-mcp-reveal" role="status"><strong>Copy this AI token now. It is stored hashed and will not be shown again:</strong><code>${esc(state.createdToken)}</code><div style="margin-top:8px"><button type="button" class="ts-mcp-btn" data-mcp-copy-token="1">Copy token</button></div></div>` : '';
    const rowsHtml = state.tokens.length
      ? `<ul class="ts-mcp-token-list">${state.tokens.map((t) => `<li class="ts-mcp-token-row"><div><strong>${esc(t.label)}</strong> (${esc(t.role)}) · <code>${esc(t.tokenPrefix)}…</code><div class="ts-mcp-meta">${t.status === 'active' ? 'Active' : 'Revoked'}${t.expiresAt ? ` · Expires ${esc(String(t.expiresAt).slice(0, 10))}` : ''}</div></div>${t.status === 'active' ? `<button type="button" class="ts-mcp-btn ts-mcp-btn-danger" data-mcp-revoke="${esc(t.id)}"${state.busy === t.id ? ' disabled' : ''}>Revoke</button>` : ''}</li>`).join('')}</ul>`
      : '<p class="ts-mcp-meta">No AI access tokens created for this vacation yet.</p>';
    return `<p class="ts-mcp-meta" style="margin:0 0 8px">Create an AI token scoped to this vacation only. Any AI using this token can read this vacation, stage draft imports, or propose edits for your approval.</p>${endpointHtml}<form class="ts-mcp-form" data-mcp-token-form="1"><label class="ts-mcp-field"><span>Token label</span><input type="text" name="label" value="${esc(state.label)}" maxlength="120" placeholder="Family AI" /></label><label class="ts-mcp-field"><span>Role</span><select name="role"><option value="collaborator"${state.role === 'collaborator' ? ' selected' : ''}>Collaborator</option><option value="owner"${state.role === 'owner' ? ' selected' : ''}>Owner</option></select></label><label class="ts-mcp-field"><span>Expires (days)</span><input type="number" name="expiresInDays" min="1" max="90" value="${esc(state.expiresInDays)}" /></label><button type="submit" class="ts-mcp-btn ts-mcp-btn-primary"${state.busy === 'create-token' ? ' disabled' : ''}>Create AI token</button></form>${revealHtml}${rowsHtml}`;
  }

  function renderReservations() {
    const rowsHtml = state.reservationConnections.length
      ? `<ul class="ts-mcp-token-list" data-ts-reservation-connections-list="1">${state.reservationConnections.map((c) => {
        const created = c.createdAt ? String(c.createdAt).slice(0, 10) : '';
        const modeLabel = c.modeLabel || (c.mode === 'webhook' ? 'Webhook (automatic ping)' : (c.mode === 'polling' ? `Scheduled polling (every ${c.pollIntervalMinutes || 5} min)` : (c.mode === 'manual' ? 'Manual check' : 'Waiting for handshake')));
        const statusText = c.status === 'active' ? 'Active' : (c.status === 'revoked' ? 'Revoked' : 'Pending setup');
        return `<li class="ts-mcp-token-row" data-ts-reservation-connection-row="${esc(c.id)}"><div><strong>${esc(c.label || 'Reservations AI')}</strong> · <code>${esc(c.tokenPrefix || 'vkr_')}…</code><div class="ts-mcp-meta" data-ts-reservation-mode="1">Mode: ${esc(modeLabel)}</div><div class="ts-mcp-meta" data-ts-reservation-created="1">${esc(statusText)}${created ? ` · Created ${esc(created)}` : ''}</div></div>${c.status !== 'revoked' ? `<button type="button" class="ts-mcp-btn ts-mcp-btn-danger" data-mcp-revoke-reservation="${esc(c.id)}"${state.busy === c.id ? ' disabled' : ''}>Revoke</button>` : ''}</li>`;
      }).join('')}</ul>`
      : '<p class="ts-mcp-meta">No reservations AI connections yet. Ask for a reservation in chat to connect your own AI.</p>';
    return `<p class="ts-mcp-meta" style="margin:0 0 8px">Account-level reservations permission. Separate from vacation import tokens: revoking a reservations connection does not affect import access.</p>${rowsHtml}`;
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
    const activeResCount = state.reservationConnections.filter((c) => c.status !== 'revoked').length;
    const tabsHtml = state.isAdmin
      ? `<div class="ts-mcp-tabs" role="tablist"><button type="button" role="tab" aria-selected="${state.mode === 'approvals' ? 'true' : 'false'}" class="ts-mcp-tab${state.mode === 'approvals' ? ' is-active' : ''}" data-mcp-tab="approvals">Pending approvals (${pendingCount})</button><button type="button" role="tab" aria-selected="${state.mode === 'tokens' ? 'true' : 'false'}" class="ts-mcp-tab${state.mode === 'tokens' ? ' is-active' : ''}" data-mcp-tab="tokens">AI access tokens (${activeTokenCount})</button><button type="button" role="tab" aria-selected="${state.mode === 'reservations' ? 'true' : 'false'}" class="ts-mcp-tab${state.mode === 'reservations' ? ' is-active' : ''}" data-mcp-tab="reservations">Reservations AI (${activeResCount})</button></div>`
      : '';
    const bodyHtml = !state.isAdmin
      ? '<p class="ts-mcp-alert ts-mcp-alert-err" data-ts-mcp-admin-only="1" role="alert">AI Access &amp; Approvals is only available to the vacation owner.</p>'
      : (state.mode === 'approvals' ? renderApprovals() : (state.mode === 'reservations' ? renderReservations() : renderTokens()));
    root.innerHTML = `<div class="ts-mcp-backdrop" data-ts-mcp-backdrop="1" role="presentation"><aside class="ts-mcp-sheet" data-ts-mcp-panel="1" role="dialog" aria-modal="true" aria-label="AI Access and Approvals"><header class="ts-mcp-head"><p class="ts-mcp-kicker">Vacation AI</p><div class="ts-mcp-title-row"><h2 class="ts-mcp-title">AI Access &amp; Approvals</h2><button type="button" class="ts-mcp-close" data-mcp-close="1" aria-label="Close">×</button></div>${tabsHtml}</header><div class="ts-mcp-body">${state.error ? `<p class="ts-mcp-alert ts-mcp-alert-err" role="alert">${esc(state.error)}</p>` : ''}${state.notice ? `<p class="ts-mcp-alert ts-mcp-alert-ok" role="status">${esc(state.notice)}</p>` : ''}${state.loading ? '<p class="ts-mcp-meta">Loading vacation AI activity…</p>' : bodyHtml}</div></aside></div>`;

    const shareToken = currentShareToken();
    const backdrop = root.querySelector('[data-ts-mcp-backdrop="1"]');
    if (backdrop) backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
    const closeBtn = root.querySelector('[data-mcp-close="1"]');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    root.querySelectorAll('[data-mcp-tab]').forEach((btn) => btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-mcp-tab');
      state.mode = next === 'tokens' || next === 'reservations' ? next : 'approvals';
      render();
    }));
    root.querySelectorAll('[data-mcp-select]').forEach((btn) => btn.addEventListener('click', () => { state.selectedId = btn.getAttribute('data-mcp-select') || ''; render(); }));
    const approveBtn = root.querySelector('[data-mcp-approve]');
    if (approveBtn) approveBtn.addEventListener('click', () => { void approveSelected(approveBtn.getAttribute('data-mcp-approve') || '', approveBtn.getAttribute('data-mcp-hash') || ''); });
    const reqToggleBtn = root.querySelector('[data-mcp-request-toggle]');
    if (reqToggleBtn) {
      reqToggleBtn.addEventListener('click', () => {
        const id = reqToggleBtn.getAttribute('data-mcp-request-toggle') || '';
        state.requestBoxFor = state.requestBoxFor === id ? '' : id;
        render();
        if (state.requestBoxFor) root.querySelector('[data-ts-request-changes-input="1"]')?.focus?.();
      });
    }
    const reqInput = root.querySelector('[data-ts-request-changes-input="1"]');
    if (reqInput) reqInput.addEventListener('input', () => { state.requestNote = reqInput.value; });
    const reqCancelBtn = root.querySelector('[data-mcp-request-cancel="1"]');
    if (reqCancelBtn) reqCancelBtn.addEventListener('click', () => { state.requestBoxFor = ''; render(); });
    const reqSubmitBtn = root.querySelector('[data-mcp-request-submit]');
    if (reqSubmitBtn) {
      reqSubmitBtn.addEventListener('click', () => {
        const id = reqSubmitBtn.getAttribute('data-mcp-request-submit') || '';
        const hash = reqSubmitBtn.getAttribute('data-mcp-hash') || '';
        const note = String(state.requestNote || '').trim();
        if (!note) {
          state.error = 'Please enter a short note describing what to change.';
          render();
          return;
        }
        void runAction(id, async () => {
          await apiJson(`/api/mcp/changes/${encodeURIComponent(id)}/request-changes`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ shareToken, note, ...(hash ? { preview_hash: hash } : {}) }),
          });
          state.requestNote = '';
          state.requestBoxFor = '';
        }, 'Change request saved for your AI.', 'Unable to save change request.');
      });
    }
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
    root.querySelectorAll('[data-ts-preview-thumb="1"]').forEach((btn) => btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-ts-gallery-key') || '';
      const idx = Number(btn.getAttribute('data-ts-gallery-index') || 0);
      const group = galleryGroups.get(key);
      if (group && typeof window.__tsOpenMediaViewer === 'function') {
        window.__tsOpenMediaViewer({ items: group.items, startIndex: idx, title: group.title });
      }
    }));
    root.querySelectorAll('[data-mcp-revoke]').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-mcp-revoke') || '';
      void runAction(id, () => apiJson(`/api/mcp/tokens/${encodeURIComponent(id)}/revoke`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ shareToken }) }), 'AI access token revoked.', 'Unable to revoke AI access token.');
    }));
    root.querySelectorAll('[data-mcp-revoke-reservation]').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-mcp-revoke-reservation') || '';
      void runAction(id, () => apiJson(`/api/mcp/reservations/connections/${encodeURIComponent(id)}/revoke`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ shareToken }) }), 'Reservations AI connection revoked.', 'Unable to revoke reservations connection.');
    }));
  }

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.open && !window.__tsPicFsActive) closeModal(); });

  window.__tsOpenMcpPanel = function (mode) {
    state.mode = mode === 'tokens' || mode === 'reservations' ? mode : 'approvals';
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
    else if (panel === 'reservations' || panel === 'ai-reservations') window.__tsOpenMcpPanel('reservations');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checkInitialPanelParam);
  else checkInitialPanelParam();
})();

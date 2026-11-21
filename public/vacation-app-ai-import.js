(function () {
  if (typeof window === 'undefined' || window.tsVacationAppAiImport) return;

  const STYLE_ID = 'ts-vacation-app-ai-import-style';
  const copyPayloads = new Map();
  const galleryGroups = new Map();
  let pollTimer = null;
  let visibilityBound = false;
  let lastTurnCount = 0;

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

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
      media_id: mediaId || url,
      media_kind: isVideo ? 'video' : 'photo',
      mime_type: mime || (isVideo ? 'video/mp4' : 'image/jpeg'),
      url,
      poster_url: posterUrl && posterUrl !== url ? posterUrl : '',
      caption: String(row.caption || '').trim(),
    };
  }

  function videoThumbSrc(url, posterUrl) {
    if (posterUrl || !url || url.startsWith('data:') || url.includes('#')) return url;
    return `${url}#t=0.1`;
  }

  function renderThumbStripHtml(rawMedia, { galleryKey, ownerLabel, scope }) {
    const items = (Array.isArray(rawMedia) ? rawMedia : []).map(normalizeMedia).filter(Boolean);
    if (!items.length) return '';
    galleryGroups.set(galleryKey, { items, title: ownerLabel });
    const buttons = items.map((item, idx) => {
      const isVideo = item.media_kind === 'video';
      const inner = isVideo
        ? `<video class="ts-ai-thumb-media" src="${esc(videoThumbSrc(item.url, item.poster_url))}"${item.poster_url ? ` poster="${esc(item.poster_url)}"` : ''} muted playsinline preload="metadata" aria-hidden="true"></video><span class="ts-ai-thumb-play" data-ts-media-play-badge="1" aria-hidden="true">▶</span>`
        : `<img class="ts-ai-thumb-media" src="${esc(item.url)}" alt="${esc(item.caption || ownerLabel)}" loading="lazy" />`;
      return `<button type="button" class="ts-ai-thumb${isVideo ? ' is-video' : ''}" data-ts-preview-thumb="1" data-ts-gallery-key="${esc(galleryKey)}" data-ts-gallery-index="${idx}" data-media-id="${esc(item.media_id)}" data-media-kind="${esc(item.media_kind)}" aria-label="${esc(isVideo ? `Play video for ${ownerLabel}` : `View photo for ${ownerLabel}`)}">${inner}</button>`;
    }).join('');
    return `<div class="ts-ai-thumb-strip" data-ts-media-strip="${esc(scope)}" data-ts-media-owner="${esc(ownerLabel)}">${buttons}</div>`;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.ts-ai-card{margin-top:8px;border:1px solid #d5dfe8;border-radius:10px;background:#ffffff;padding:12px 14px;display:grid;gap:8px;color:#15191f;box-shadow:0 4px 16px rgba(21,25,31,.06);max-width:100%;box-sizing:border-box}',
      '.ts-ai-kicker{font-size:10px;font-weight:800;letter-spacing:.9px;text-transform:uppercase;color:#0f766e}',
      '.ts-ai-title{margin:0;font-size:15px;font-weight:800;color:#15191f;line-height:1.3}',
      '.ts-ai-desc{margin:0;font-size:13px;line-height:1.45;color:#475569}',
      '.ts-ai-token-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;padding:8px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px}',
      '.ts-ai-token-row code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:700;color:#0f172a;word-break:break-all}',
      '.ts-ai-meta{font-size:11px;color:#64748b}',
      '.ts-ai-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.ts-ai-chip{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#f8fafc;color:#334155;border:1px solid #e2e8f0}',
      '.ts-ai-block{border-top:1px solid #e2e8f0;padding-top:10px;display:grid;gap:8px}',
      '.ts-ai-block h4{margin:0;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#64748b}',
      '.ts-ai-days{display:grid;gap:8px}',
      '.ts-ai-day-card{border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#f8fafc;display:grid;gap:8px}',
      '.ts-ai-day-head{font-size:13px;font-weight:800;color:#0f172a;line-height:1.3}',
      '.ts-ai-thing-list{display:grid;gap:6px}',
      '.ts-ai-thing-row{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;background:#ffffff;display:grid;gap:4px}',
      '.ts-ai-thing-main{display:flex;align-items:center;gap:8px;min-width:0}',
      '.ts-ai-thing-icon{width:24px;height:24px;flex:0 0 24px;display:inline-grid;place-items:center;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;font-size:13px;line-height:1}',
      '.ts-ai-thing-label{min-width:0;font-size:13px;line-height:1.35;color:#0f172a;overflow-wrap:anywhere}',
      '.ts-ai-thing-name{font-weight:700}',
      '.ts-ai-thing-time{color:#64748b;font-weight:600}',
      '.ts-ai-day-media-label{margin:2px 0 0;font-size:11px;font-weight:700;color:#64748b}',
      '.ts-ai-notes{display:grid;gap:6px}',
      '.ts-ai-note{margin:0;font-size:12px;line-height:1.45;color:#475569;padding:8px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0}',
      '.ts-ai-change-row{display:flex;align-items:center;gap:10px}',
      '.ts-ai-change-row .ts-ai-thumb-strip{margin-top:0;flex:0 0 auto}',
      '.ts-ai-change-row .ts-ai-thumb{width:44px;height:44px}',
      '.ts-ai-change-text{min-width:0;flex:1 1 auto}',
      '.ts-ai-thumb-strip{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}',
      '.ts-ai-thumb{position:relative;width:58px;height:58px;padding:0;border-radius:8px;overflow:hidden;border:1px solid #cbd5e1;background:#0f172a;cursor:pointer;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center}',
      '.ts-ai-thumb-media{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}',
      '.ts-ai-thumb-play{position:absolute;inset:0;margin:auto;width:24px;height:24px;border-radius:999px;background:rgba(15,23,42,.78);color:#ffffff;font-size:11px;display:inline-flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.35)}',
      '.ts-ai-warn{padding:8px 10px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:600}',
      '.ts-ai-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:2px}',
      '.ts-ai-btn{min-height:38px;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:750;cursor:pointer;border:1px solid #cbd5e1;background:#ffffff;color:#0f172a}',
      '.ts-ai-btn-primary{background:#0f766e;border-color:#0f766e;color:#ffffff}',
      '.ts-ai-btn-secondary{background:#f8fafc;border-color:#94a3b8;color:#0f172a}',
      '.ts-ai-btn-danger{background:#ffffff;border-color:#fca5a5;color:#b91c1c}',
      '.ts-ai-btn[disabled]{opacity:.55;cursor:not-allowed}',
      '.ts-ai-change-box{display:grid;gap:8px;padding:10px;border-radius:10px;background:#f8fafc;border:1px solid #cbd5e1;margin-top:4px}',
      '.ts-ai-change-box[hidden]{display:none}',
      '.ts-ai-change-label{font-size:12px;font-weight:700;color:#0f172a}',
      '.ts-ai-change-input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;line-height:1.4;color:#0f172a;background:#ffffff;resize:vertical}',
      '.ts-ai-pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:750}',
      '.ts-ai-pill-ok{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}',
      '.ts-ai-pill-warn{background:#fffbeb;color:#92400e;border:1px solid #fde68a}',
      '.ts-ai-pill-err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}',
      '.ts-ai-pill-muted{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1}',
      '.ts-ai-options{margin:0;padding-left:18px;display:grid;gap:4px;font-size:12px;color:#334155}',
      '.ts-ai-status{margin:0;font-size:12px;font-weight:650;color:#0f766e}',
      '.ts-ai-status-err{color:#b91c1c}',
      '@media(max-width:480px){.ts-ai-card{padding:11px 12px}.ts-ai-actions .ts-ai-btn{flex:1 1 auto;text-align:center}}',
    ].join('');
    document.head.appendChild(style);
  }

  function rememberCopyText(tokenId, copyText) {
    if (!tokenId || !copyText) return;
    copyPayloads.set(String(tokenId), String(copyText));
    try {
      sessionStorage.setItem(`tsAiImportCopy:${tokenId}`, String(copyText));
    } catch (error) {
      void error;
    }
  }

  function lookupCopyText(tokenId) {
    const id = String(tokenId || '');
    if (!id) return '';
    if (copyPayloads.has(id)) return copyPayloads.get(id) || '';
    try {
      const saved = sessionStorage.getItem(`tsAiImportCopy:${id}`) || '';
      if (saved) copyPayloads.set(id, saved);
      return saved;
    } catch (error) {
      void error;
      return '';
    }
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        void error;
      }
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'readonly');
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return Boolean(copied);
    } catch (error) {
      void error;
      return false;
    }
  }

  function formatExpiry(iso) {
    const value = String(iso || '').slice(0, 10);
    return value ? `Expires ${value}` : 'Expires in 30 days';
  }

  function renderImportCardHtml(card) {
    if (!card || card.kind !== 'ai_import_handoff') return '';
    if (card.tokenId && card.copyText) rememberCopyText(card.tokenId, card.copyText);
    const title = `Import into ${card.vacationName || 'this vacation'}`;
    const masked = card.maskedToken || `${card.tokenPrefix || 'vkm_'}••••••••••••`;
    return `<section class="ts-ai-card" data-ts-ai-import-card="1" data-token-id="${esc(card.tokenId || '')}" aria-label="AI import instructions">`
      + '<span class="ts-ai-kicker">AI Import</span>'
      + `<h3 class="ts-ai-title">${esc(title)}</h3>`
      + '<p class="ts-ai-desc">Click Copy and paste into your AI (ChatGPT, Claude, or any assistant). Nothing goes live until you approve it here.</p>'
      + `<div class="ts-ai-token-row"><span><strong>AI token:</strong> <code data-ts-ai-masked-token="1">${esc(masked)}</code></span><span class="ts-ai-meta">${esc(formatExpiry(card.expiresAt))}</span></div>`
      + `<div class="ts-ai-actions"><button type="button" class="ts-ai-btn ts-ai-btn-primary" data-ai-import-copy="${esc(card.tokenId || '')}">Copy</button></div>`
      + '<p class="ts-ai-status" data-ai-import-status="1" hidden></p>'
      + '</section>';
  }

  function sanitizeChangeText(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    const replaced = value.replace(/\S+\.(?:jpe?g|png|webp|heic|mov|mp4|webm|m4v)\b/gi, (m) => (/\.(?:mov|mp4|webm|m4v)$/i.test(m) ? 'a video' : 'a photo'));
    const rescuePlace = replaced.match(/^Rescued from Won't be imported and placed (a (?:photo|video)) on (.+)$/i);
    if (rescuePlace) return `Moved ${rescuePlace[1]} from Won't be imported to ${rescuePlace[2]}`;
    const rescueAttach = replaced.match(/^Rescued from Won't be imported and attached (a (?:photo|video)) to (.+)$/i);
    if (rescueAttach) return `Moved ${rescueAttach[1]} from Won't be imported to ${rescueAttach[2]}`;
    return replaced;
  }

  function normalizeChangeEntry(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') {
      const text = sanitizeChangeText(entry);
      return text ? { text, media: null } : null;
    }
    if (typeof entry === 'object') {
      const text = sanitizeChangeText(entry.text || '');
      if (!text) return null;
      const media = entry.media ? normalizeMedia(entry.media) : null;
      return { text, media };
    }
    return null;
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

  function renderApprovalCardHtml(card) {
    if (!card || card.kind !== 'ai_staged_approval') return '';
    const heading = card.changeKind === 'targeted_edit' ? 'Targeted vacation edit' : 'Vacation draft import';
    const bullets = Array.isArray(card.bullets) ? card.bullets.filter(Boolean) : [];
    const missing = Array.isArray(card.missing) ? card.missing.filter(Boolean) : [];
    const conflicts = Array.isArray(card.conflicts) ? card.conflicts.filter(Boolean) : [];
    const days = Array.isArray(card.days) ? card.days : [];
    const unscheduled = Array.isArray(card.unscheduledThings) ? card.unscheduledThings : [];
    const skipped = Array.isArray(card.skippedMedia) ? card.skippedMedia : [];
    const skippedNote = String(card.skippedMediaNote || '').trim() || formatSkippedMediaNote(skipped);
    const recentChanges = Array.isArray(card.recentChanges) ? card.recentChanges.map(normalizeChangeEntry).filter(Boolean) : [];
    const changeRequests = Array.isArray(card.changeRequests) ? card.changeRequests.filter((r) => r && r.note) : [];
    const previewVersion = Math.max(1, Number(card.previewVersion) || 1);
    const status = String(card.status || 'pending_approval');
    const cardKey = `${String(card.changeSetId || 'staged')}:v${previewVersion}`;
    const chipsHtml = bullets.length
      ? `<div class="ts-ai-chips">${bullets.map((line) => `<span class="ts-ai-chip">${esc(line)}</span>`).join('')}</div>`
      : '';
    const daysHtml = days.length
      ? `<div class="ts-ai-block" data-ts-mcp-preview-days="1"><h4>Itinerary by day</h4><div class="ts-ai-days">${days.map((day, idx) => {
        const dayNum = day.day_number ?? idx + 1;
        const friendlyDate = formatFriendlyDate(day.date);
        const dayLabel = `Day ${dayNum}${friendlyDate ? ` · ${friendlyDate}` : ''}`;
        const itemsHtml = Array.isArray(day.items) && day.items.length
          ? `<div class="ts-ai-thing-list">${day.items.map((item, itemIdx) => {
            const thingTitle = String(item.title || '').trim() || 'Item';
            const timeLabel = item.start_time ? formatClock(item.start_time) : '';
            const thumbs = renderThumbStripHtml(item.media, {
              galleryKey: `${cardKey}:day:${idx}:thing:${item.ref || item.id || itemIdx}`,
              ownerLabel: thingTitle,
              scope: 'thing',
            });
            return `<div class="ts-ai-thing-row" data-ts-preview-thing="${esc(item.ref || item.id || thingTitle)}"><div class="ts-ai-thing-main"><span class="ts-ai-thing-icon" data-ts-preview-type-icon="1" aria-hidden="true">${categoryIcon(item.category)}</span><span class="ts-ai-thing-label"><span class="ts-ai-thing-name">${esc(thingTitle)}</span>${timeLabel ? `<span class="ts-ai-thing-time"> · ${esc(timeLabel)}</span>` : ''}</span></div>${thumbs}</div>`;
          }).join('')}</div>`
          : '';
        const dayOnly = Array.isArray(day.day_media)
          ? day.day_media
          : (Array.isArray(day.media) ? day.media.filter((m) => !m?.attached_thing_ref && !m?.attached_thing_title && m?.assignment_bucket !== 'thing') : []);
        const dayThumbs = renderThumbStripHtml(dayOnly, {
          galleryKey: `${cardKey}:day:${idx}:direct`,
          ownerLabel: dayLabel,
          scope: 'day',
        });
        const dayMediaBlock = dayThumbs ? `<div><div class="ts-ai-day-media-label">Day ${esc(dayNum)} photos &amp; videos</div>${dayThumbs}</div>` : '';
        return `<section class="ts-ai-day-card" data-ts-preview-day="${esc(day.date || String(dayNum))}"><div class="ts-ai-day-head" data-ts-preview-day-header="1">${esc(dayLabel)}${day.title ? ` — ${esc(day.title)}` : ''}</div>${itemsHtml}${dayMediaBlock}</section>`;
      }).join('')}</div></div>`
      : '';
    const unscheduledHtml = unscheduled.length
      ? `<div class="ts-ai-block" data-ts-mcp-preview-unscheduled="1"><h4>Saved for later</h4><div class="ts-ai-thing-list">${unscheduled.map((item, idx) => {
        const thingTitle = String(item.title || '').trim() || 'Saved item';
        const thumbs = renderThumbStripHtml(item.media, {
          galleryKey: `${cardKey}:unscheduled:${item.ref || item.id || idx}`,
          ownerLabel: thingTitle,
          scope: 'thing',
        });
        return `<div class="ts-ai-thing-row" data-ts-preview-thing="${esc(item.ref || item.id || thingTitle)}"><div class="ts-ai-thing-main"><span class="ts-ai-thing-icon" data-ts-preview-type-icon="1" aria-hidden="true">${categoryIcon(item.category)}</span><span class="ts-ai-thing-label"><span class="ts-ai-thing-name">${esc(thingTitle)}</span></span></div>${thumbs}</div>`;
      }).join('')}</div></div>`
      : '';
    const skippedHtml = skipped.length
      ? `<div class="ts-ai-block" data-ts-mcp-preview-wont-import="1"><h4>Won&#39;t be imported</h4>${skippedNote ? `<p class="ts-ai-note" data-ts-wont-import-note="1">${esc(skippedNote)}</p>` : ''}${renderThumbStripHtml(skipped, {
        galleryKey: `${cardKey}:skipped`,
        ownerLabel: "Won't be imported",
        scope: 'skipped',
      })}</div>`
      : '';
    const recentChangesHtml = recentChanges.length
      ? `<div class="ts-ai-block" data-ts-preview-changes="1"><h4>Updated in this preview</h4><div class="ts-ai-notes">${recentChanges.map((entry, idx) => {
        if (entry.media) {
          const thumb = renderThumbStripHtml([entry.media], {
            galleryKey: `${cardKey}:change:${idx}`,
            ownerLabel: entry.text,
            scope: 'change',
          });
          return `<div class="ts-ai-note ts-ai-change-row" data-ts-preview-change-row="1">${thumb}<span class="ts-ai-change-text">${esc(entry.text)}</span></div>`;
        }
        return `<p class="ts-ai-note" data-ts-preview-change-row="1">${esc(entry.text)}</p>`;
      }).join('')}</div></div>`
      : '';
    const requestedHtml = changeRequests.length
      ? `<div class="ts-ai-block" data-ts-requested-changes="1"><h4>Requested changes</h4><div class="ts-ai-notes">${changeRequests.map((entry) => `<p class="ts-ai-note">${esc(entry.note)}</p>`).join('')}</div></div>`
      : '';
    const missingHtml = missing.length
      ? `<div class="ts-ai-block" data-ts-mcp-preview-notes="1"><h4>Good to know</h4><div class="ts-ai-notes">${missing.map((line) => `<p class="ts-ai-note">${esc(line)}</p>`).join('')}</div></div>`
      : '';
    const conflictsHtml = conflicts.length
      ? `<div class="ts-ai-warn">${conflicts.map((line) => `<div>${esc(line)}</div>`).join('')}</div>`
      : '';
    let footerHtml = '';
    if (status === 'pending_approval') {
      footerHtml = '<div class="ts-ai-actions">'
        + `<button type="button" class="ts-ai-btn ts-ai-btn-primary" data-ai-chat-approve="${esc(card.changeSetId)}" data-ai-preview-hash="${esc(card.previewHash || '')}" data-ai-share-slug="${esc(card.shareSlug || '')}" data-ai-vacation-id="${esc(card.vacationId || '')}">Approve</button>`
        + `<button type="button" class="ts-ai-btn ts-ai-btn-secondary" data-ai-chat-request-changes="${esc(card.changeSetId)}" data-ts-request-changes-btn="1">Request changes</button>`
        + `<button type="button" class="ts-ai-btn ts-ai-btn-danger" data-ai-chat-decline="${esc(card.changeSetId)}" data-ai-share-slug="${esc(card.shareSlug || '')}" data-ai-vacation-id="${esc(card.vacationId || '')}">Decline</button>`
        + '</div>'
        + '<div class="ts-ai-change-box" data-ts-request-changes-box="1" hidden>'
        + '<label class="ts-ai-change-label">What should your AI change?</label>'
        + '<textarea class="ts-ai-change-input" data-ts-request-changes-input="1" rows="3" maxlength="1000" placeholder="Move a stop, drop a photo, or adjust a time…"></textarea>'
        + '<div class="ts-ai-actions">'
        + `<button type="button" class="ts-ai-btn ts-ai-btn-primary" data-ai-chat-request-submit="${esc(card.changeSetId)}" data-ai-preview-hash="${esc(card.previewHash || '')}" data-ai-share-slug="${esc(card.shareSlug || '')}" data-ai-vacation-id="${esc(card.vacationId || '')}" data-ts-request-changes-submit="1">Send note</button>`
        + '<button type="button" class="ts-ai-btn" data-ai-chat-request-cancel="1" data-ts-request-changes-cancel="1">Cancel</button>'
        + '</div></div>';
    } else if (status === 'replaced') {
      footerHtml = '<div class="ts-ai-actions">'
        + `<button type="button" class="ts-ai-btn ts-ai-btn-primary" data-ai-chat-approve="${esc(card.changeSetId)}" data-ai-preview-hash="${esc(card.previewHash || '')}" disabled>Approve</button>`
        + '<span class="ts-ai-pill ts-ai-pill-muted" data-ai-approval-state="replaced">Replaced by updated preview</span>'
        + '</div>';
    } else if (status === 'approved') {
      footerHtml = '<div class="ts-ai-actions"><span class="ts-ai-pill ts-ai-pill-ok" data-ai-approval-state="approved">Approved and live on your vacation</span></div>';
    } else if (status === 'declined') {
      footerHtml = '<div class="ts-ai-actions"><span class="ts-ai-pill ts-ai-pill-muted" data-ai-approval-state="declined">Declined — live vacation unchanged</span></div>';
    }
    const kickerText = status === 'replaced'
      ? `Replaced Preview · v${previewVersion}`
      : (previewVersion > 1 ? `Updated AI Preview · v${previewVersion}` : 'AI Preview Ready');
    return `<section class="ts-ai-card" data-ts-ai-approval-card="1" data-change-set-id="${esc(card.changeSetId || '')}" data-preview-version="${esc(String(previewVersion))}" data-preview-hash="${esc(card.previewHash || '')}" data-card-status="${esc(status)}" aria-label="AI vacation preview">`
      + `<span class="ts-ai-kicker">${esc(kickerText)}</span>`
      + `<h3 class="ts-ai-title">${esc(heading)}</h3>`
      + `<p class="ts-ai-desc">${esc(card.summary || '')}</p>`
      + chipsHtml
      + recentChangesHtml
      + daysHtml
      + unscheduledHtml
      + skippedHtml
      + requestedHtml
      + missingHtml
      + conflictsHtml
      + footerHtml
      + '<p class="ts-ai-status" data-ai-approval-status="1" hidden></p>'
      + '</section>';
  }

  function renderReservationCardHtml(card) {
    if (!card || typeof card !== 'object') return '';
    if (card.kind === 'ai_reservation_offer') {
      return '<section class="ts-ai-card" data-ts-ai-reservation-offer="1" aria-label="AI reservations setup offer">'
        + '<span class="ts-ai-kicker">AI Reservations</span>'
        + '<h3 class="ts-ai-title">Let your own AI book for you</h3>'
        + '<p class="ts-ai-desc">Vacay Keepsake never books directly. Connect your AI once at the account level and it can book across every vacation you own or collaborate on.</p>'
        + '<div class="ts-ai-actions"><button type="button" class="ts-ai-btn ts-ai-btn-primary" data-ai-reservation-offer-yes="1">Set up my AI</button></div>'
        + '</section>';
    }
    if (card.kind === 'ai_reservation_setup') {
      const key = card.connectionId ? `res:${card.connectionId}` : '';
      if (key && card.copyText) rememberCopyText(key, card.copyText);
      const masked = card.maskedToken || `${card.tokenPrefix || 'vkr_'}••••••••••••`;
      const options = Array.isArray(card.options) && card.options.length
        ? card.options
        : [
          '(a) Webhook or inbox URL Vacay Keepsake can ping',
          '(b) Scheduled polling of the Vacay Keepsake MCP',
          '(c) Manual — paste "check my VK reservations" into your AI each time',
        ];
      return `<section class="ts-ai-card" data-ts-ai-reservation-setup="1" data-connection-id="${esc(card.connectionId || '')}" aria-label="AI reservations setup card">`
        + '<span class="ts-ai-kicker">AI Reservations Setup</span>'
        + '<h3 class="ts-ai-title">Connect your AI for reservations</h3>'
        + '<p class="ts-ai-desc">Copy this setup card and paste it into your AI (ChatGPT, Claude, Gemini, or any MCP client). Your AI picks the best handshake option it supports:</p>'
        + `<div class="ts-ai-token-row"><span><strong>MCP address:</strong> <code data-ts-ai-mcp-endpoint="1">${esc(card.mcpEndpoint || '')}</code></span></div>`
        + `<div class="ts-ai-token-row"><span><strong>Reservations token:</strong> <code data-ts-ai-masked-token="1">${esc(masked)}</code></span><span class="ts-ai-meta">${esc(formatExpiry(card.expiresAt))}</span></div>`
        + `<ul class="ts-ai-options">${options.map((opt) => `<li>${esc(opt)}</li>`).join('')}</ul>`
        + `<div class="ts-ai-actions"><button type="button" class="ts-ai-btn ts-ai-btn-primary" data-ai-reservation-copy="${esc(key)}">Copy setup instructions</button></div>`
        + '<p class="ts-ai-status" data-ai-reservation-copy-status="1" hidden></p>'
        + '</section>';
    }
    if (card.kind === 'ai_reservation_connected') {
      return `<section class="ts-ai-card" data-ts-ai-reservation-connected="1" data-reservation-mode="${esc(card.mode || '')}" aria-label="AI reservations connected">`
        + '<span class="ts-ai-kicker">AI Reservations Connected</span>'
        + `<h3 class="ts-ai-title">${esc(card.headline || "You're set up for reservations")}</h3>`
        + `<div class="ts-ai-chips"><span class="ts-ai-pill ts-ai-pill-ok">${esc(card.modeLabel || card.mode || 'Connected')}</span></div>`
        + `<p class="ts-ai-desc">${esc(card.nextStep || '')}</p>`
        + '</section>';
    }
    if (card.kind === 'ai_reservation_handshake_error') {
      return '<section class="ts-ai-card" data-ts-ai-reservation-error="1" aria-label="AI handshake help">'
        + '<span class="ts-ai-kicker">AI Reservations</span>'
        + `<div class="ts-ai-warn">${esc(card.message || 'Could not read that handshake reply.')}</div>`
        + '</section>';
    }
    if (card.kind === 'ai_reservation_status') {
      const status = String(card.status || 'waiting');
      const pillClass = status === 'booked' ? 'ts-ai-pill-ok' : (status === 'failed' ? 'ts-ai-pill-err' : 'ts-ai-pill-warn');
      const statusLabel = status === 'booked' ? 'booked' : (status === 'failed' ? 'failed' : 'waiting');
      const chips = [
        card.bookedByLabel && status === 'booked' ? card.bookedByLabel : '',
        card.date ? formatFriendlyDate(card.date) : (card.requestedDate ? formatFriendlyDate(card.requestedDate) : ''),
        card.time || card.requestedTime || '',
        card.partySize ? `Party of ${card.partySize}` : '',
        card.confirmationNumber ? `Confirmation #${card.confirmationNumber}` : '',
      ].filter(Boolean);
      const chipsHtml = chips.length
        ? `<div class="ts-ai-chips">${chips.map((c) => `<span class="ts-ai-chip">${esc(c)}</span>`).join('')}</div>`
        : '';
      const manualPrompt = card.mode === 'manual' && status === 'waiting'
        ? `<div class="ts-ai-actions"><button type="button" class="ts-ai-btn ts-ai-btn-primary" data-ai-manual-check-copy="${esc(card.manualPrompt || 'check my VK reservations')}">Copy "check my VK reservations"</button></div><p class="ts-ai-status" data-ai-manual-copy-status="1" hidden></p>`
        : '';
      const failedHtml = status === 'failed'
        ? `<p class="ts-ai-desc">${esc(card.reason || '')}</p>${Array.isArray(card.alternatives) && card.alternatives.length ? `<div class="ts-ai-chips">${card.alternatives.map((alt) => `<span class="ts-ai-chip">${esc(alt)}</span>`).join('')}</div>` : ''}`
        : '';
      const notesHtml = status === 'booked' && card.notes ? `<p class="ts-ai-note">${esc(card.notes)}</p>` : '';
      return `<section class="ts-ai-card" data-ts-ai-reservation-status-card="1" data-ai-reservation-status="${esc(status)}" data-request-id="${esc(card.requestId || '')}" aria-label="Reservation status">`
        + `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="ts-ai-kicker">Reservation</span><span class="ts-ai-pill ${pillClass}" data-ai-reservation-badge="${esc(status)}">${esc(statusLabel)}</span></div>`
        + `<h3 class="ts-ai-title">${esc(card.venueName || 'Reservation')}</h3>`
        + chipsHtml
        + notesHtml
        + failedHtml
        + manualPrompt
        + '</section>';
    }
    return '';
  }

  function renderTurnCardHtml(turn) {
    ensureStyles();
    const payload = turn?.payload && typeof turn.payload === 'object' ? turn.payload : {};
    if (payload.aiImportCard) return renderImportCardHtml(payload.aiImportCard);
    if (payload.aiApprovalCard) return renderApprovalCardHtml(payload.aiApprovalCard);
    if (payload.reservationCard) return renderReservationCardHtml(payload.reservationCard);
    return '';
  }

  function renderReplyCardHtml(data) {
    ensureStyles();
    if (data?.aiImportCard) return renderImportCardHtml(data.aiImportCard);
    if (data?.aiApprovalCard) return renderApprovalCardHtml(data.aiApprovalCard);
    if (data?.reservationCard) return renderReservationCardHtml(data.reservationCard);
    return '';
  }

  async function handleCopyClick(btn) {
    const tokenId = btn.getAttribute('data-ai-import-copy') || '';
    const card = btn.closest('[data-ts-ai-import-card="1"]');
    const status = card?.querySelector('[data-ai-import-status="1"]');
    const payload = lookupCopyText(tokenId);
    if (!payload) {
      if (status) {
        status.textContent = 'Ask in chat for a fresh AI import card to copy a new token.';
        status.className = 'ts-ai-status ts-ai-status-err';
        status.hidden = false;
      }
      return;
    }
    const ok = await writeClipboard(payload);
    if (ok) {
      btn.textContent = 'Copied';
      if (status) {
        status.textContent = 'Copied to clipboard. Paste into your AI to start importing.';
        status.className = 'ts-ai-status';
        status.hidden = false;
      }
      setTimeout(() => {
        if (btn.isConnected) btn.textContent = 'Copy';
      }, 2500);
    } else if (status) {
      status.textContent = 'Could not access clipboard. Please allow clipboard access and try again.';
      status.className = 'ts-ai-status ts-ai-status-err';
      status.hidden = false;
    }
  }

  async function handleApprovalClick(btn, action, ctx) {
    const card = btn.closest('[data-ts-ai-approval-card="1"]');
    const changeSetId = btn.getAttribute(action === 'approve' ? 'data-ai-chat-approve' : 'data-ai-chat-decline') || '';
    const previewHash = btn.getAttribute('data-ai-preview-hash') || '';
    const shareToken = btn.getAttribute('data-ai-share-slug') || ctx.currentTrip?.()?.shareToken || '';
    const tripId = btn.getAttribute('data-ai-vacation-id') || ctx.currentTrip?.()?.id || '';
    if (!changeSetId || !card) return;
    const buttons = [...card.querySelectorAll('button')];
    const status = card.querySelector('[data-ai-approval-status="1"]');
    buttons.forEach((b) => { b.disabled = true; });
    if (status) {
      status.textContent = action === 'approve' ? 'Approving and updating your vacation…' : 'Declining staged changes…';
      status.className = 'ts-ai-status';
      status.hidden = false;
    }
    try {
      const response = await fetch(`/api/mcp/changes/${encodeURIComponent(changeSetId)}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          ...(shareToken ? { shareToken } : {}),
          ...(tripId ? { tripId } : {}),
          ...(action === 'approve' && previewHash ? { preview_hash: previewHash } : {}),
        }),
      });
      let body = {};
      try {
        body = await response.json();
      } catch (error) {
        void error;
      }
      if (!response.ok || body.ok === false) {
        const err = new Error(String(body.error || `Unable to ${action} AI changes.`));
        err.code = body.code || '';
        err.status = response.status;
        throw err;
      }
      const actionsRow = card.querySelector('.ts-ai-actions');
      if (actionsRow) {
        actionsRow.innerHTML = action === 'approve'
          ? '<span class="ts-ai-pill ts-ai-pill-ok" data-ai-approval-state="approved">Approved and live on your vacation</span>'
          : '<span class="ts-ai-pill ts-ai-pill-muted" data-ai-approval-state="declined">Declined — live vacation unchanged</span>';
      }
      const changeBox = card.querySelector('[data-ts-request-changes-box="1"]');
      if (changeBox) changeBox.hidden = true;
      if (status) {
        status.textContent = action === 'approve' ? 'Approved and applied to your vacation.' : 'Declined. Live vacation data was not changed.';
        status.className = 'ts-ai-status';
        status.hidden = false;
      }
      if (action === 'approve' && typeof ctx.loadApp === 'function') {
        const nextId = String(body.publishedVacationId || tripId || '');
        setTimeout(() => { void ctx.loadApp(nextId); }, 250);
      }
    } catch (error) {
      if (action === 'approve' && (error?.code === 'preview_hash_mismatch' || error?.status === 409)) {
        const actionsRow = card.querySelector('.ts-ai-actions');
        if (actionsRow) {
          actionsRow.innerHTML = `<button type="button" class="ts-ai-btn ts-ai-btn-primary" data-ai-chat-approve="${esc(changeSetId)}" data-ai-preview-hash="${esc(previewHash)}" disabled>Approve</button><span class="ts-ai-pill ts-ai-pill-muted" data-ai-approval-state="replaced">Replaced by updated preview</span>`;
        }
      } else {
        buttons.forEach((b) => { b.disabled = false; });
      }
      if (status) {
        status.textContent = error instanceof Error ? error.message : `Unable to ${action} AI changes.`;
        status.className = 'ts-ai-status ts-ai-status-err';
        status.hidden = false;
      }
    }
  }

  async function handleRequestChangesSubmit(btn, ctx) {
    const card = btn.closest('[data-ts-ai-approval-card="1"]');
    const changeSetId = btn.getAttribute('data-ai-chat-request-submit') || '';
    const previewHash = btn.getAttribute('data-ai-preview-hash') || '';
    const shareToken = btn.getAttribute('data-ai-share-slug') || ctx.currentTrip?.()?.shareToken || '';
    const tripId = btn.getAttribute('data-ai-vacation-id') || ctx.currentTrip?.()?.id || '';
    const box = card?.querySelector('[data-ts-request-changes-box="1"]');
    const input = box?.querySelector('[data-ts-request-changes-input="1"]');
    const status = card?.querySelector('[data-ai-approval-status="1"]');
    const note = String(input?.value || '').trim();
    if (!changeSetId || !card) return;
    if (!note) {
      if (status) {
        status.textContent = 'Please enter a short note describing what to change.';
        status.className = 'ts-ai-status ts-ai-status-err';
        status.hidden = false;
      }
      input?.focus?.();
      return;
    }
    btn.disabled = true;
    try {
      const response = await fetch(`/api/mcp/changes/${encodeURIComponent(changeSetId)}/request-changes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          ...(shareToken ? { shareToken } : {}),
          ...(tripId ? { tripId } : {}),
          ...(previewHash ? { preview_hash: previewHash } : {}),
          note,
        }),
      });
      let body = {};
      try {
        body = await response.json();
      } catch (error) {
        void error;
      }
      if (!response.ok || body.ok === false) {
        throw new Error(String(body.error || 'Unable to save change request.'));
      }
      const list = Array.isArray(body.changeRequests) ? body.changeRequests : [{ note }];
      let block = card.querySelector('[data-ts-requested-changes="1"]');
      if (!block) {
        block = document.createElement('div');
        block.className = 'ts-ai-block';
        block.setAttribute('data-ts-requested-changes', '1');
        const actionsRow = card.querySelector('.ts-ai-actions');
        if (actionsRow) card.insertBefore(block, actionsRow);
        else card.appendChild(block);
      }
      block.innerHTML = `<h4>Requested changes</h4><div class="ts-ai-notes">${list.map((entry) => `<p class="ts-ai-note">${esc(entry.note || '')}</p>`).join('')}</div>`;
      if (input) input.value = '';
      if (box) box.hidden = true;
      if (status) {
        status.textContent = 'Change request saved for your AI.';
        status.className = 'ts-ai-status';
        status.hidden = false;
      }
    } catch (error) {
      if (status) {
        status.textContent = error instanceof Error ? error.message : 'Unable to save change request.';
        status.className = 'ts-ai-status ts-ai-status-err';
        status.hidden = false;
      }
    } finally {
      btn.disabled = false;
    }
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function bindMessages(ctx) {
    ensureStyles();
    const messages = document.getElementById('messages');
    if (messages && !messages.dataset.tsAiImportBound) {
      messages.dataset.tsAiImportBound = '1';
      messages.addEventListener('click', (event) => {
        const thumbBtn = event.target?.closest?.('[data-ts-preview-thumb="1"]');
        if (thumbBtn) {
          const key = thumbBtn.getAttribute('data-ts-gallery-key') || '';
          const idx = Number(thumbBtn.getAttribute('data-ts-gallery-index') || 0);
          const group = galleryGroups.get(key);
          if (group && typeof window.__tsOpenMediaViewer === 'function') {
            window.__tsOpenMediaViewer({ items: group.items, startIndex: idx, title: group.title });
          }
          return;
        }
        const copyBtn = event.target?.closest?.('[data-ai-import-copy]');
        if (copyBtn) {
          void handleCopyClick(copyBtn);
          return;
        }
        const resCopyBtn = event.target?.closest?.('[data-ai-reservation-copy]');
        if (resCopyBtn) {
          const key = resCopyBtn.getAttribute('data-ai-reservation-copy') || '';
          const card = resCopyBtn.closest('[data-ts-ai-reservation-setup="1"]');
          const status = card?.querySelector('[data-ai-reservation-copy-status="1"]');
          const payload = lookupCopyText(key);
          if (!payload) {
            if (status) {
              status.textContent = 'Ask in chat to create a fresh AI reservations setup card.';
              status.className = 'ts-ai-status ts-ai-status-err';
              status.hidden = false;
            }
            return;
          }
          void writeClipboard(payload).then((ok) => {
            if (ok) {
              resCopyBtn.textContent = 'Copied';
              if (status) {
                status.textContent = 'Copied to clipboard. Paste into your AI to finish setup.';
                status.className = 'ts-ai-status';
                status.hidden = false;
              }
              setTimeout(() => { if (resCopyBtn.isConnected) resCopyBtn.textContent = 'Copy setup instructions'; }, 2500);
            } else if (status) {
              status.textContent = 'Could not access clipboard. Please allow clipboard access and try again.';
              status.className = 'ts-ai-status ts-ai-status-err';
              status.hidden = false;
            }
          });
          return;
        }
        const manualCopyBtn = event.target?.closest?.('[data-ai-manual-check-copy]');
        if (manualCopyBtn) {
          const promptText = manualCopyBtn.getAttribute('data-ai-manual-check-copy') || 'check my VK reservations';
          const card = manualCopyBtn.closest('[data-ts-ai-reservation-status-card="1"]');
          const status = card?.querySelector('[data-ai-manual-copy-status="1"]');
          void writeClipboard(promptText).then((ok) => {
            if (ok) {
              manualCopyBtn.textContent = 'Copied';
              if (status) {
                status.textContent = 'Copied "check my VK reservations" — paste into your AI.';
                status.className = 'ts-ai-status';
                status.hidden = false;
              }
              setTimeout(() => { if (manualCopyBtn.isConnected) manualCopyBtn.textContent = 'Copy "check my VK reservations"'; }, 2500);
            }
          });
          return;
        }
        const offerYesBtn = event.target?.closest?.('[data-ai-reservation-offer-yes="1"]');
        if (offerYesBtn) {
          const textarea = document.getElementById('messageText');
          const composer = document.getElementById('composer');
          if (textarea && composer) {
            textarea.value = 'Yes, set up my AI for reservations';
            composer.requestSubmit();
          }
          return;
        }
        const approveBtn = event.target?.closest?.('[data-ai-chat-approve]');
        if (approveBtn) {
          void handleApprovalClick(approveBtn, 'approve', ctx);
          return;
        }
        const requestBtn = event.target?.closest?.('[data-ai-chat-request-changes]');
        if (requestBtn) {
          const card = requestBtn.closest('[data-ts-ai-approval-card="1"]');
          const box = card?.querySelector('[data-ts-request-changes-box="1"]');
          if (box) {
            box.hidden = !box.hidden;
            if (!box.hidden) box.querySelector('[data-ts-request-changes-input="1"]')?.focus?.();
          }
          return;
        }
        const cancelReqBtn = event.target?.closest?.('[data-ai-chat-request-cancel]');
        if (cancelReqBtn) {
          const card = cancelReqBtn.closest('[data-ts-ai-approval-card="1"]');
          const box = card?.querySelector('[data-ts-request-changes-box="1"]');
          if (box) box.hidden = true;
          return;
        }
        const submitReqBtn = event.target?.closest?.('[data-ai-chat-request-submit]');
        if (submitReqBtn) {
          void handleRequestChangesSubmit(submitReqBtn, ctx);
          return;
        }
        const declineBtn = event.target?.closest?.('[data-ai-chat-decline]');
        if (declineBtn) {
          void handleApprovalClick(declineBtn, 'decline', ctx);
        }
      });
    }

    const turns = ctx.getState?.()?.turns || [];
    lastTurnCount = turns.length;
    const hasAiCard = turns.some((t) => Boolean(t?.payload?.aiImportCard || t?.payload?.reservationCard)) || copyPayloads.size > 0;
    const checkForUpdates = async () => {
      if (document.hidden || ctx.getState?.()?.sending) return;
      const token = ctx.getSessionToken?.() || '';
      const tripId = ctx.currentTrip?.()?.id || '';
      if (!token || !tripId) return;
      try {
        const query = new URLSearchParams({ app: '1', session: token, tripId });
        const res = await fetch(`/api/vacation-itinerary?${query.toString()}`, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const nextTurns = Array.isArray(data?.turns) ? data.turns : [];
        if (nextTurns.length !== lastTurnCount) {
          lastTurnCount = nextTurns.length;
          void ctx.loadApp?.(tripId);
        }
      } catch (error) {
        void error;
      }
    };

    stopPoll();
    if (hasAiCard) {
      pollTimer = setInterval(() => { void checkForUpdates(); }, 6000);
    }
    if (!visibilityBound) {
      visibilityBound = true;
      window.addEventListener('focus', () => { void checkForUpdates(); });
      window.addEventListener('message', (event) => {
        if (event?.data?.type === 'tsv-vacation-approved' && typeof ctx.loadApp === 'function') {
          void ctx.loadApp(ctx.currentTrip?.()?.id || '');
        }
      });
    }
  }

  window.tsVacationAppAiImport = {
    renderTurnCardHtml,
    renderReplyCardHtml,
    bindMessages,
    rememberCopyText,
    lookupCopyText,
  };
})();

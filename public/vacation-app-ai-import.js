(function () {
  if (typeof window === 'undefined' || window.tsVacationAppAiImport) return;

  const STYLE_ID = 'ts-vacation-app-ai-import-style';
  const copyPayloads = new Map();
  let pollTimer = null;
  let visibilityBound = false;
  let lastTurnCount = 0;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
      '.ts-ai-bullets{margin:0;padding-left:18px;display:grid;gap:4px;font-size:13px;color:#1e293b}',
      '.ts-ai-warn{padding:8px 10px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:600}',
      '.ts-ai-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:2px}',
      '.ts-ai-btn{min-height:38px;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:750;cursor:pointer;border:1px solid #cbd5e1;background:#ffffff;color:#0f172a}',
      '.ts-ai-btn-primary{background:#0f766e;border-color:#0f766e;color:#ffffff}',
      '.ts-ai-btn-danger{background:#ffffff;border-color:#fca5a5;color:#b91c1c}',
      '.ts-ai-btn[disabled]{opacity:.55;cursor:not-allowed}',
      '.ts-ai-pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:750}',
      '.ts-ai-pill-ok{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}',
      '.ts-ai-pill-muted{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1}',
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

  function renderApprovalCardHtml(card) {
    if (!card || card.kind !== 'ai_staged_approval') return '';
    const heading = card.changeKind === 'targeted_edit' ? 'Targeted vacation edit' : 'Vacation draft import';
    const bullets = Array.isArray(card.bullets) ? card.bullets.filter(Boolean) : [];
    const conflicts = Array.isArray(card.conflicts) ? card.conflicts.filter(Boolean) : [];
    const status = String(card.status || 'pending_approval');
    const bulletsHtml = bullets.length
      ? `<ul class="ts-ai-bullets">${bullets.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`
      : '';
    const conflictsHtml = conflicts.length
      ? `<div class="ts-ai-warn">${esc(conflicts.join(' '))}</div>`
      : '';
    let footerHtml = '';
    if (status === 'pending_approval') {
      footerHtml = '<div class="ts-ai-actions">'
        + `<button type="button" class="ts-ai-btn ts-ai-btn-primary" data-ai-chat-approve="${esc(card.changeSetId)}" data-ai-preview-hash="${esc(card.previewHash || '')}" data-ai-share-slug="${esc(card.shareSlug || '')}" data-ai-vacation-id="${esc(card.vacationId || '')}">Approve</button>`
        + `<button type="button" class="ts-ai-btn ts-ai-btn-danger" data-ai-chat-decline="${esc(card.changeSetId)}" data-ai-share-slug="${esc(card.shareSlug || '')}" data-ai-vacation-id="${esc(card.vacationId || '')}">Decline</button>`
        + '</div>';
    } else if (status === 'approved') {
      footerHtml = '<div class="ts-ai-actions"><span class="ts-ai-pill ts-ai-pill-ok" data-ai-approval-state="approved">Approved and live on your vacation</span></div>';
    } else if (status === 'declined') {
      footerHtml = '<div class="ts-ai-actions"><span class="ts-ai-pill ts-ai-pill-muted" data-ai-approval-state="declined">Declined — live vacation unchanged</span></div>';
    }
    return `<section class="ts-ai-card" data-ts-ai-approval-card="1" data-change-set-id="${esc(card.changeSetId || '')}" aria-label="AI vacation preview">`
      + '<span class="ts-ai-kicker">AI Preview Ready</span>'
      + `<h3 class="ts-ai-title">${esc(heading)}</h3>`
      + `<p class="ts-ai-desc">${esc(card.summary || '')}</p>`
      + bulletsHtml
      + conflictsHtml
      + footerHtml
      + '<p class="ts-ai-status" data-ai-approval-status="1" hidden></p>'
      + '</section>';
  }

  function renderTurnCardHtml(turn) {
    ensureStyles();
    const payload = turn?.payload && typeof turn.payload === 'object' ? turn.payload : {};
    if (payload.aiImportCard) return renderImportCardHtml(payload.aiImportCard);
    if (payload.aiApprovalCard) return renderApprovalCardHtml(payload.aiApprovalCard);
    return '';
  }

  function renderReplyCardHtml(data) {
    ensureStyles();
    if (data?.aiImportCard) return renderImportCardHtml(data.aiImportCard);
    if (data?.aiApprovalCard) return renderApprovalCardHtml(data.aiApprovalCard);
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
        throw new Error(String(body.error || `Unable to ${action} AI changes.`));
      }
      const actionsRow = card.querySelector('.ts-ai-actions');
      if (actionsRow) {
        actionsRow.innerHTML = action === 'approve'
          ? '<span class="ts-ai-pill ts-ai-pill-ok" data-ai-approval-state="approved">Approved and live on your vacation</span>'
          : '<span class="ts-ai-pill ts-ai-pill-muted" data-ai-approval-state="declined">Declined — live vacation unchanged</span>';
      }
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
      buttons.forEach((b) => { b.disabled = false; });
      if (status) {
        status.textContent = error instanceof Error ? error.message : `Unable to ${action} AI changes.`;
        status.className = 'ts-ai-status ts-ai-status-err';
        status.hidden = false;
      }
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
        const copyBtn = event.target?.closest?.('[data-ai-import-copy]');
        if (copyBtn) {
          void handleCopyClick(copyBtn);
          return;
        }
        const approveBtn = event.target?.closest?.('[data-ai-chat-approve]');
        if (approveBtn) {
          void handleApprovalClick(approveBtn, 'approve', ctx);
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
    const hasAiCard = turns.some((t) => Boolean(t?.payload?.aiImportCard)) || copyPayloads.size > 0;
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

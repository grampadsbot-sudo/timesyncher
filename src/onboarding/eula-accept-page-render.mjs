function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function acceptanceNameDefault(session) {
  const label = String(session?.clientLabel || '').trim();
  if (!String(session?.clientKey || '').startsWith('vacation-collaborator:')) return label;
  if (/\b(send|link|telegram|checkout|setup|set\s+up|add-?on|vacation)\b/i.test(label)) return '';
  return label;
}

function isCollaboratorSession(session) {
  return String(session?.clientKey || '').startsWith('vacation-collaborator:');
}

function clientDisplayLabel(session) {
  const fallback = isCollaboratorSession(session)
    ? 'TimeSyncher Vacation collaborator'
    : 'TimeSyncher client';
  return acceptanceNameDefault(session) || fallback;
}

export function acceptanceNameForReceipt(session) {
  return clientDisplayLabel(session);
}

export function renderAcceptPage(session) {
  const collaborator = isCollaboratorSession(session);
  const nameField = collaborator
    ? ''
    : `<label>Your name<input id="name" required value="${escapeHtml(acceptanceNameDefault(session))}"></label>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TimeSyncher Terms & Privacy</title><style>body{font-family:system-ui,sans-serif;line-height:1.55;margin:0;background:#0b1020;color:#eef3ff}.shell{max-width:960px;margin:auto;padding:28px 18px}.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:20px;margin:16px 0}.terms{white-space:pre-wrap;max-height:45vh;overflow:auto;background:#07101f;border:1px solid #2b3758;border-radius:8px;padding:16px}input[type=text]{width:100%;padding:12px;border-radius:8px;border:1px solid #2b3758;background:#07101f;color:#eef3ff}.btn{display:inline-block;border:0;border-radius:8px;padding:13px 18px;font-weight:800;background:#7dd3fc;color:#07101f;text-decoration:none}.muted{color:#bfd0f3}.notice{border-color:rgba(125,211,252,.42);background:rgba(125,211,252,.1)}pre{white-space:pre-wrap;overflow:auto}</style></head><body><main class="shell"><h1>Review & continue</h1><p class="muted">Please review TimeSyncher's terms, privacy, and advisory-only service limits before opening your onboarding conversation.</p><section class="card notice"><h2>Advisory-only service</h2><p>TimeSyncher can research, compare, summarize, draft, and organize travel planning. It cannot book, buy, send messages, modify calendars or email, accept third-party terms, cancel, reschedule, or change accounts for you.</p></section><section class="card"><h2>Client</h2><p>${escapeHtml(clientDisplayLabel(session))} (${escapeHtml(session.clientKey)})</p><p class="muted">${escapeHtml(session.contact?.email)} · ${escapeHtml(session.contact?.phone)}</p><p>Terms version: <strong>${escapeHtml(session.eula.version)}</strong></p></section><section class="card"><h2>Included assistance</h2><ul>${(session.selectedFunctionality || []).map((f) => `<li>${escapeHtml(String(f).replaceAll('_', ' '))}</li>`).join('')}</ul></section><section class="card"><h2>Access policy</h2><pre>${escapeHtml(JSON.stringify(session.google || {}, null, 2))}</pre></section><section class="card"><h2>Full terms</h2><div class="terms">${escapeHtml(session.eula.text)}</div></section><form id="form" class="card"><h2>Continue</h2>${nameField}<p><label><input id="agree" type="checkbox" required> I agree to TimeSyncher's Terms and Privacy Policy and understand the service is advisory-only.</label></p><button class="btn">Agree and continue</button></form><section id="result" class="card" hidden><h2>Saved</h2><p>Your acceptance receipt was saved. TimeSyncher has recorded your terms acceptance.</p><p id="telegramNotice" class="muted">If you opened this from Telegram, the bot will finish setup there.</p><p><a id="continueTelegram" class="btn" hidden>Continue to Telegram</a></p></section></main><script>const isCollaborator=${JSON.stringify(collaborator)}; const fallbackName=${JSON.stringify(acceptanceNameForReceipt(session))}; function openTelegram(url){ if(!url)return; const tg=window.Telegram&&window.Telegram.WebApp; if(tg&&typeof tg.openTelegramLink==='function'){tg.openTelegramLink(url); return;} window.location.href=url;} function closeTelegramWebView(){const tg=window.Telegram&&window.Telegram.WebApp; if(tg&&typeof tg.close==='function'){setTimeout(()=>tg.close(),500); return true;} return false;} document.getElementById('form').addEventListener('submit', async (e)=>{e.preventDefault(); const nameInput=document.getElementById('name'); const acceptedByName=nameInput?nameInput.value:fallbackName; const r=await fetch('/api/eula?action=accept&sessionId=${encodeURIComponent(session.sessionId)}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({acceptedByName,checkboxConfirmed:document.getElementById('agree').checked})}); const j=await r.json(); if(!j.ok){alert(j.error||'Acceptance failed'); return;} const notified=Array.isArray(j.collaboratorActivations)&&j.collaboratorActivations.some((a)=>a&&a.notifiedTelegram); const link=document.getElementById('continueTelegram'); if(j.continueUrl){link.href=j.continueUrl; link.hidden=false; link.addEventListener('click',(event)=>{event.preventDefault(); openTelegram(j.continueUrl);}); document.getElementById('telegramNotice').textContent=notified?'Your Telegram setup is complete. I sent a welcome message in Telegram. You can close this page and return to the chat.':'Your Telegram setup is ready. Tap Continue to Telegram to return to the chat.';} document.getElementById('result').hidden=false; document.getElementById('form').hidden=true; if(isCollaborator&&notified) closeTelegramWebView(); else if(j.continueUrl&&!isCollaborator){setTimeout(()=>{window.location.replace(j.continueUrl)},900);} });</script></body></html>`;
}

export function renderUnavailableAcceptPage(reason = 'unavailable') {
  const expired = reason === 'expired';
  const title = expired ? 'This review link expired' : 'This review link is unavailable';
  const detail = expired
    ? 'For security, TimeSyncher review links expire. Please use the latest purchase email or ask support@timesyncher.com for a fresh link.'
    : 'Please check the link from your latest TimeSyncher email or contact support@timesyncher.com.';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;line-height:1.55;margin:0;background:#0b1020;color:#eef3ff}.shell{max-width:720px;margin:auto;padding:42px 18px}.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:24px}.muted{color:#bfd0f3}</style></head><body><main class="shell"><section class="card"><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(detail)}</p></section></main></body></html>`;
}

import { renderEulaMarkdown } from '../src/onboarding/eula-markdown.mjs';

export function isPurchaseEntry(pathname, search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  if (params.get('app') === '1') return false;
  if (params.get('purchase') === '1') return true;
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  return path === '/shared';
}

export function appSessionToken(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const direct = String(params.get('session') || params.get('token') || '').trim();
  if (direct) return direct;
  const eula = String(params.get('eulaSession') || '');
  if (eula.startsWith('vacation-') && !eula.startsWith('vacation-collaborator-')) return eula.slice('vacation-'.length);
  return '';
}

export function openAppHref(_pathname, search = '') {
  const token = appSessionToken(search);
  if (!token) {
    const error = new Error('Vacation app session is missing. Open the link in your purchase email.');
    error.code = 'vacation_app_session_missing';
    throw error;
  }
  return `/vacation-app.html?session=${encodeURIComponent(token)}`;
}

export function successHref(pathname, search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const next = new URLSearchParams();
  const href = openAppHref(pathname, search);
  const token = appSessionToken(search);
  next.set('eula', 'accepted');
  next.set('session', token);
  next.set('open', href);
  if (params.get('test') === '1') next.set('test', '1');
  for (const key of ['accessPlanCheckout', 'checkout']) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return `/order-success.html?${next.toString()}`;
}

function gateStyle() {
  return `
    #postPurchaseGate {
      position: fixed;
      inset: 0;
      z-index: 100000;
      overflow: auto;
      background: #f6f7f9;
      color: #15191f;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    }
    #postPurchaseGate .eula-screen { padding: 22px clamp(14px, 3vw, 28px) 32px; }
    #postPurchaseGate h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.1; }
    #postPurchaseGate p { color: #677280; margin: 0 0 14px; line-height: 1.45; }
    #postPurchaseGate .eula-text {
      white-space: normal;
      max-height: min(46vh, 420px);
      overflow: auto;
      border: 1px solid #d9e0e8;
      border-radius: 8px;
      background: #fff;
      padding: 14px;
      line-height: 1.45;
    }
    #postPurchaseGate .eula-text h1,
    #postPurchaseGate .eula-text h2,
    #postPurchaseGate .eula-text h3 { color: #15191f; line-height: 1.25; }
    #postPurchaseGate .eula-text h1 { font-size: 20px; margin: 0 0 10px; }
    #postPurchaseGate .eula-text h2 { font-size: 16px; margin: 16px 0 6px; }
    #postPurchaseGate .eula-text h3 { font-size: 15px; margin: 14px 0 6px; }
    #postPurchaseGate .eula-text p { margin: 0 0 10px; }
    #postPurchaseGate .eula-text ul,
    #postPurchaseGate .eula-text ol { margin: 0 0 10px; padding-left: 1.25em; }
    #postPurchaseGate .eula-text li { margin: 0 0 4px; }
    #postPurchaseGate .eula-form { display: grid; gap: 12px; margin-top: 16px; max-width: 560px; }
    #postPurchaseGate input[type="text"] {
      width: 100%;
      min-height: 42px;
      border: 1px solid #d9e0e8;
      border-radius: 8px;
      padding: 0 11px;
    }
    #postPurchaseGate label { font-weight: 650; }
    #postPurchaseGate .agree-button {
      min-height: 44px;
      border: 0;
      border-radius: 8px;
      color: #120d02;
      background: linear-gradient(135deg, #f2d989, #b4872d);
      font-weight: 850;
      padding: 0 16px;
      justify-self: start;
    }
    #postPurchaseGate .error { color: #a23a2a; font-weight: 750; }
  `;
}

export function mountPostPurchaseGate(doc, loc) {
  if (!isPurchaseEntry(loc.pathname, loc.search)) return null;
  const style = doc.createElement('style');
  style.textContent = gateStyle();
  doc.head.appendChild(style);

  const gate = doc.createElement('div');
  gate.id = 'postPurchaseGate';
  const screen = doc.createElement('section');
  screen.className = 'eula-screen';
  screen.id = 'eulaScreen';
  screen.setAttribute('aria-label', 'Terms and privacy');

  const title = doc.createElement('h1');
  title.textContent = 'Review Terms & Privacy';
  const lead = doc.createElement('p');
  lead.textContent = 'These terms are the first step in TimeSyncher Vacation. Agree to continue.';
  const terms = doc.createElement('div');
  terms.className = 'eula-text';
  terms.id = 'eulaText';
  const form = doc.createElement('form');
  form.className = 'eula-form';
  form.id = 'eulaForm';

  const nameLabel = doc.createElement('label');
  nameLabel.append('Your name');
  const name = doc.createElement('input');
  name.id = 'eulaName';
  name.name = 'name';
  name.type = 'text';
  name.required = true;
  name.autocomplete = 'name';
  nameLabel.append(name);

  const agreeLabel = doc.createElement('label');
  const agree = doc.createElement('input');
  agree.id = 'eulaAgree';
  agree.type = 'checkbox';
  agree.required = true;
  agreeLabel.append(agree, ' I agree to TimeSyncher\'s Terms and Privacy Policy and understand the service is advisory-only.');

  const button = doc.createElement('button');
  button.className = 'agree-button';
  button.id = 'eulaAgreeButton';
  button.type = 'submit';
  button.textContent = 'Agree';

  const error = doc.createElement('div');
  error.className = 'error';
  error.id = 'eulaError';
  error.hidden = true;

  form.append(nameLabel, agreeLabel, button, error);
  screen.append(title, lead, terms, form);
  gate.append(screen);
  doc.body.appendChild(gate);

  const params = new URLSearchParams(String(loc.search || '').replace(/^\?/, ''));
  const testMode = params.get('test') === '1';
  const eulaSession = params.get('eulaSession') || '';

  fetch('/legal/terms-2026-06-advisory-only.md')
    .then((response) => (response.ok ? response.text() : ''))
    .then((text) => {
      if (text) terms.innerHTML = renderEulaMarkdown(text);
    })
    .catch(() => {});

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    button.disabled = true;
    try {
      if (!testMode && eulaSession) {
        const response = await fetch(`/api/eula?action=accept&sessionId=${encodeURIComponent(eulaSession)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            acceptedByName: name.value,
            checkboxConfirmed: agree.checked,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.error || 'Unable to save terms acceptance.');
      }
      loc.assign(successHref(loc.pathname, loc.search));
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message || 'Unable to save terms acceptance.';
      button.disabled = false;
    }
  });
  return gate;
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  const start = () => mountPostPurchaseGate(document, location);
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}

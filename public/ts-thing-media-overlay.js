(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)(?:\/(.*))?/);
  if (!sharedMatch) return;

  const token = decodeURIComponent(sharedMatch[1]);
  const rest = (sharedMatch[2] || '').replace(/\/+$/, '');
  const params = new URLSearchParams(location.search);
  const wantsStyle2 = rest === 'journey'
    || params.get('style') === '2'
    || /^(keepsake|style-?2)$/i.test(params.get('pdfReport') || '')
    || params.get('printMode') === 'keepsake'
    || window.__TS_JOURNEY_BOOK__;

  function absUrl(value) {
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
    return new URL(value, location.origin).toString();
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadBindings() {
    try {
      const response = await fetch(`/api/bind-thing-media?shareToken=${encodeURIComponent(token)}`, { credentials: 'omit' });
      if (response.ok) {
        const json = await response.json();
        if (Array.isArray(json.bindings)) return json.bindings;
      }
    } catch {}
    try {
      const response = await fetch('/ts-thing-media/bindings.json', { credentials: 'omit' });
      const json = await response.json();
      return (Array.isArray(json) ? json : []).filter((row) => row.shareToken === token);
    } catch {
      return [];
    }
  }

  async function renderStyle2() {
    const dest = `/api/pdf/shared/${encodeURIComponent(token)}/report/style-2`;
    const response = await fetch(dest, { credentials: 'omit' });
    if (!response.ok) throw new Error('style-2 fetch failed');
    const html = await response.text();
    document.open();
    document.write(html);
    document.close();
  }

  function detailHost() {
    const nodes = [...document.querySelectorAll('div,section,aside')];
    return nodes.find((el) => {
      const text = (el.textContent || '').slice(0, 80);
      if (!/DETAIL PAGE/i.test(text)) return false;
      const style = window.getComputedStyle(el);
      return style.position === 'fixed' || style.position === 'absolute' || Number(style.zIndex) > 10;
    }) || [...document.querySelectorAll('[role="dialog"],dialog')].at(-1) || null;
  }

  function injectThingPhotos(bindings) {
    const chip = () => {
      if (document.getElementById('ts-journey-chip')) return;
      const el = document.createElement('a');
      el.id = 'ts-journey-chip';
      el.href = `/shared/${encodeURIComponent(token)}/journey?style=2`;
      el.textContent = 'Journey Book';
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;background:#f5d37b;color:#1a1408;padding:10px 14px;border-radius:999px;font:600 13px/1 Inter,system-ui,sans-serif;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.35)';
      document.body.appendChild(el);
    };
    const decorate = () => {
      chip();
      const host = detailHost();
      if (!host) return;
      for (const row of bindings) {
        const name = String(row.thingName || '').trim();
        if (!name || document.getElementById(`ts-bound-${row.id}`)) continue;
        if (!host.textContent || !host.textContent.includes(name)) continue;
        const wrap = document.createElement('div');
        wrap.id = `ts-bound-${row.id}`;
        wrap.style.cssText = 'margin:12px 0 16px';
        const url = absUrl(row.publicUrl);
        const isVideo = String(row.mimeType || '').startsWith('video/') || row.mediaKind === 'video';
        wrap.innerHTML = isVideo
          ? `<video src="${esc(url)}" controls style="max-width:100%;border-radius:12px"></video>`
          : `<img src="${esc(url)}" alt="${esc(row.caption || row.thingName || '')}" style="max-width:100%;border-radius:12px">`;
        const title = [...host.querySelectorAll('input,h1,h2,h3,div')].find((node) => (node.value || node.textContent || '').includes(name));
        (title?.parentElement || host).insertBefore(wrap, title ? title.nextSibling : host.firstChild);
      }
    };
    decorate();
    new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
  }

  async function boot() {
    if (wantsStyle2) {
      await renderStyle2();
      return;
    }
    const bindings = await loadBindings();
    injectThingPhotos(bindings);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot().catch(() => {}), { once: true });
  } else {
    boot().catch(() => {});
  }
})();

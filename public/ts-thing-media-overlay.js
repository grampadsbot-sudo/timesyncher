(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)(?:\/(.*))?/);
  if (!sharedMatch) return;

  const token = decodeURIComponent(sharedMatch[1]);
  const rest = (sharedMatch[2] || '').replace(/\/+$/, '');
  const isJourney = rest === 'journey' || new URLSearchParams(location.search).get('view') === 'journey' || window.__TS_JOURNEY_BOOK__;

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

  function renderJourney(bindings) {
    const grouped = new Map();
    for (const row of bindings) {
      const key = `${row.thingId || 'trip'}:${row.thingName || 'Trip'}`;
      const list = grouped.get(key) || { thingName: row.thingName || 'Trip', dayNumber: row.dayNumber, items: [] };
      list.items.push(row);
      grouped.set(key, list);
    }
    const sections = [...grouped.values()].map((group) => {
      const cards = group.items.map((item) => {
        const url = absUrl(item.publicUrl);
        const isVideo = String(item.mimeType || '').startsWith('video/') || item.mediaKind === 'video';
        const media = isVideo
          ? `<video src="${esc(url)}" controls style="width:100%;max-width:640px;border-radius:12px;background:#111"></video>`
          : `<img src="${esc(url)}" alt="${esc(item.caption || item.thingName || '')}" style="width:100%;max-width:640px;border-radius:12px;object-fit:cover;aspect-ratio:16/10;background:#111">`;
        return `<figure style="margin:0 0 16px">${media}<figcaption style="margin-top:8px;color:#cfc2a9;font-size:14px">${esc(item.caption || item.originalName || '')}</figcaption></figure>`;
      }).join('');
      return `<section style="margin:0 0 32px"><h2 style="font-family:Georgia,serif;color:#f5d37b;font-size:28px;margin:0 0 12px">${esc(group.thingName)}${group.dayNumber ? ` · Day ${group.dayNumber}` : ''}</h2>${cards}</section>`;
    }).join('') || '<p style="color:#cfc2a9">No bound photos yet. Use POST /api/bind-thing-media or the bind-thing-media CLI.</p>';

    const html = `
      <main id="ts-journey-book" style="min-height:100vh;background:#070706;color:#fffaf0;font-family:Inter,system-ui,sans-serif;padding:28px">
        <p style="margin:0 0 8px"><a href="/shared/${encodeURIComponent(token)}/" style="color:#f5d37b">← Shared itinerary</a></p>
        <h1 style="font-family:Georgia,serif;color:#f5d37b;font-size:40px;margin:0 0 8px">Journey Book</h1>
        <p style="color:#cfc2a9;margin:0 0 24px">Photos bound to Things on <code>${esc(token)}</code> (non-Telegram bind).</p>
        ${sections}
      </main>`;
    document.documentElement.style.background = '#070706';
    const paint = () => {
      if (document.getElementById('ts-journey-book') && !document.getElementById('root')?.childElementCount) return;
      document.body.innerHTML = html;
      const spa = document.getElementById('root');
      if (spa) spa.remove();
    };
    paint();
    new MutationObserver(paint).observe(document.documentElement, { childList: true, subtree: true });
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
      el.href = `/shared/${encodeURIComponent(token)}/journey`;
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
    const bindings = await loadBindings();
    if (isJourney) {
      renderJourney(bindings);
      return;
    }
    injectThingPhotos(bindings);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot().catch(() => {}), { once: true });
  } else {
    boot().catch(() => {});
  }
})();

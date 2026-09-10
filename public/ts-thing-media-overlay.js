(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)(?:\/(.*))?/);
  if (!sharedMatch) return;

  const token = decodeURIComponent(sharedMatch[1]);
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
    const decorate = () => {
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
    injectThingPhotos(bindings);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot().catch(() => {}), { once: true });
  } else {
    boot().catch(() => {});
  }
})();

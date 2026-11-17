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

  function detailPhotosSection() {
    return document.querySelector('[data-ts-detail-photos="1"]');
  }

  function openThingName() {
    const el = document.querySelector('[data-ts-detail-name]');
    const raw = el && (el.value != null ? el.value : el.textContent);
    return String(raw || '').replace(/\s+/g, ' ').trim();
  }

  function nameMatches(thingName, openName) {
    const a = String(thingName || '').replace(/\s+/g, ' ').trim();
    const b = String(openName || '').replace(/\s+/g, ' ').trim();
    if (!a || !b) return false;
    return b.includes(a) || a.includes(b);
  }

  function mediaAlreadyInSection(section, url) {
    if (!section || !url) return false;
    const want = absUrl(url);
    const wantPath = (() => {
      try {
        return new URL(want).pathname + new URL(want).search;
      } catch {
        return want;
      }
    })();
    return [...section.querySelectorAll('video,img')].some((el) => {
      const src = el.currentSrc || el.getAttribute('src') || '';
      if (!src) return false;
      if (src === want) return true;
      try {
        const p = new URL(src, location.origin).pathname + new URL(src, location.origin).search;
        return p === wantPath;
      } catch {
        return src.includes(wantPath);
      }
    });
  }

  function injectThingPhotos(bindings) {
    const decorate = () => {
      const section = detailPhotosSection();
      const openName = openThingName();
      if (!section || !openName) return;
      const grid =
        section.querySelector('[style*="grid"]') ||
        section.querySelector('div') ||
        section;
      for (const row of bindings) {
        const name = String(row.thingName || '').trim();
        if (!name || !nameMatches(name, openName)) continue;
        if (document.getElementById(`ts-bound-${row.id}`)) continue;
        const url = absUrl(row.publicUrl);
        if (mediaAlreadyInSection(section, url)) continue;
        const wrap = document.createElement('div');
        wrap.id = `ts-bound-${row.id}`;
        wrap.style.cssText = 'min-width:0';
        const isVideo = String(row.mimeType || '').startsWith('video/') || row.mediaKind === 'video';
        wrap.innerHTML = isVideo
          ? `<video src="${esc(url)}" controls playsinline style="display:block;width:100%;max-height:190px;border-radius:8px;background:#20252c"></video>`
          : `<img src="${esc(url)}" alt="${esc(row.caption || row.thingName || '')}" style="display:block;width:100%;border-radius:12px">`;
        grid.appendChild(wrap);
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
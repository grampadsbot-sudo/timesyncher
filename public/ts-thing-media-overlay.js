(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)(?:\/(.*))?/);
  if (!sharedMatch) return;

  const token = decodeURIComponent(sharedMatch[1]);
  const rest = (sharedMatch[2] || '').replace(/\/+$/, '');
  const isJourney = rest === 'journey' || new URLSearchParams(location.search).get('view') === 'journey';

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
          ? `<video src="${esc(url)}" controls style="width:100%;border-radius:12px;background:#111"></video>`
          : `<img src="${esc(url)}" alt="${esc(item.caption || item.thingName || '')}" style="width:100%;border-radius:12px;object-fit:cover;aspect-ratio:16/10;background:#111">`;
        return `<figure style="margin:0">${media}<figcaption style="margin-top:8px;color:#cfc2a9;font-size:13px">${esc(item.caption || item.originalName || '')}</figcaption></figure>`;
      }).join('');
      return `<section style="margin:0 0 28px"><h2 style="font-family:Georgia,serif;color:#f5d37b;font-size:22px;margin:0 0 12px">${esc(group.thingName)}${group.dayNumber ? ` · Day ${group.dayNumber}` : ''}</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px">${cards}</div></section>`;
    }).join('') || '<p style="color:#cfc2a9">No bound photos yet. Use POST /api/bind-thing-media or the bind-thing-media CLI.</p>';

    document.documentElement.style.background = '#070706';
    document.body.innerHTML = `
      <main style="min-height:100vh;background:#070706;color:#fffaf0;font-family:Inter,system-ui,sans-serif;padding:28px">
        <p style="margin:0 0 8px"><a href="/shared/${encodeURIComponent(token)}/" style="color:#f5d37b">← Shared itinerary</a></p>
        <h1 style="font-family:Georgia,serif;color:#f5d37b;margin:0 0 8px">Journey Book</h1>
        <p style="color:#cfc2a9;margin:0 0 24px">Photos bound to Things on <code>${token}</code> (non-Telegram bind).</p>
        ${sections}
      </main>`;
  }

  function injectThingPhotos(bindings) {
    const byName = bindings.map((row) => ({
      ...row,
      hay: String(row.thingName || '').toLowerCase(),
    }));
    const apply = () => {
      if (document.getElementById('ts-journey-chip')) return;
      const chip = document.createElement('a');
      chip.id = 'ts-journey-chip';
      chip.href = `/shared/${encodeURIComponent(token)}/journey`;
      chip.textContent = 'Journey Book';
      chip.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;background:#f5d37b;color:#1a1408;padding:10px 14px;border-radius:999px;font:600 13px/1 Inter,system-ui,sans-serif;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.35)';
      document.body.appendChild(chip);
    };
    const decorate = () => {
      apply();
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,div,span')];
      for (const row of byName) {
        if (!row.hay || document.getElementById(`ts-bound-${row.id}`)) continue;
        const heading = headings.find((el) => {
          const label = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
          return label === row.hay || label.startsWith(row.hay) || row.hay.startsWith(label);
        });
        if (!heading) continue;
        const host = heading.parentElement || heading;
        const wrap = document.createElement('div');
        wrap.id = `ts-bound-${row.id}`;
        wrap.style.cssText = 'margin:12px 0';
        const url = absUrl(row.publicUrl);
        const isVideo = String(row.mimeType || '').startsWith('video/') || row.mediaKind === 'video';
        wrap.innerHTML = isVideo
          ? `<video src="${esc(url)}" controls style="max-width:100%;border-radius:12px"></video>`
          : `<img src="${esc(url)}" alt="${esc(row.caption || row.thingName || '')}" style="max-width:100%;border-radius:12px">`;
        host.insertBefore(wrap, heading.nextSibling);
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

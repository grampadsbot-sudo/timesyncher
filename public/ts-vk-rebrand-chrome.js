(() => {
  const embedded = (() => {
    try {
      if (new URLSearchParams(location.search).get('embed') === '1') return true;
    } catch {}
    try {
      if (document.documentElement.getAttribute('data-ts-embed') === '1') return true;
    } catch {}
    try {
      if (window.top !== window.self) return true;
    } catch {
      return true;
    }
    return false;
  })();
  if (embedded) return;

  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;
  const slug = decodeURIComponent(sharedMatch[1]);
  const HISTORY_KEY = 'vk-trip-switcher-map';
  const VISITED_SLUGS_KEY = 'vk-trip-switcher-visited-slugs';

  const readVisitedSlugs = () => {
    try {
      const raw = localStorage.getItem(VISITED_SLUGS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(list) ? list.filter(Boolean) : []);
    } catch {
      return new Set();
    }
  };

  const rememberVisitedSlug = (shareSlug) => {
    const s = String(shareSlug || '').trim();
    if (!s) return;
    try {
      const set = readVisitedSlugs();
      if (set.has(s)) return;
      set.add(s);
      localStorage.setItem(VISITED_SLUGS_KEY, JSON.stringify([...set]));
    } catch {}
  };

  const rememberTrip = (title, shareSlug) => {
    const t = String(title || '').trim();
    const s = String(shareSlug || '').trim();
    if (!t || !s) return;
    rememberVisitedSlug(s);
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const map = raw ? JSON.parse(raw) : {};
      if (map[t] === s) return;
      map[t] = s;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(map));
    } catch {}
  };

  let observer;
  const hydrateSwitcher = () => {
    const sel = document.querySelector('[data-trip-switcher]');
    if (!sel) return;
    const title =
      document.querySelector('[data-ts-shared-header] h1')?.textContent
      || document.querySelector('h1')?.textContent
      || sel.value
      || 'Vacation';
    rememberTrip(title, slug);
    let map = {};
    try {
      map = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    } catch {}
    const allowed = readVisitedSlugs();
    const titles = Object.keys(map).filter((name) => {
      const shareSlug = map[name];
      return name && shareSlug && allowed.has(shareSlug);
    });
    if (titles.length <= 1) return;
    const current = String(title || '').replace(/\s+/g, ' ').trim();
    const have = [...sel.options].map((o) => o.value);
    if (
      have.length === titles.length
      && have.every((v, i) => v === titles[i])
      && sel.value === current
    ) {
      return;
    }
    observer?.disconnect();
    sel.replaceChildren();
    for (const name of titles) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === current) opt.selected = true;
      sel.appendChild(opt);
    }
    observer?.takeRecords();
    observer?.observe(document.documentElement, { childList: true, subtree: true });
  };

  observer = new MutationObserver(() => hydrateSwitcher());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateSwitcher, { once: true });
  } else {
    hydrateSwitcher();
  }
})();
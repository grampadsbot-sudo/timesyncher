(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;
  const slug = decodeURIComponent(sharedMatch[1]);
  const HISTORY_KEY = 'vk-trip-switcher-map';
  const rememberTrip = (title, shareSlug) => {
    const t = String(title || '').trim();
    const s = String(shareSlug || '').trim();
    if (!t || !s) return;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[t] = s;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(map));
    } catch {}
  };
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
    const titles = Object.keys(map).filter(Boolean);
    if (titles.length <= 1) return;
    const current = String(title || '').replace(/\s+/g, ' ').trim();
    sel.replaceChildren();
    for (const name of titles) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === current) opt.selected = true;
      sel.appendChild(opt);
    }
  };
  const observer = new MutationObserver(() => hydrateSwitcher());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateSwitcher, { once: true });
  } else {
    hydrateSwitcher();
  }
})();

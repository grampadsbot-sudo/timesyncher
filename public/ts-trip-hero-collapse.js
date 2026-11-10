(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;
  const slug = decodeURIComponent(sharedMatch[1]);
  const storageKey = `vk-trip-hero-collapsed:${slug}`;
  const styleId = 'ts-trip-hero-collapse-css';
  const mobileQuery = '(max-width: 844px)';
  const isMobile = () => {
    try {
      return window.matchMedia(mobileQuery).matches;
    } catch {
      return window.innerWidth <= 844;
    }
  };

  const injectCss = () => {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      '[data-ts-trip-site-hero]{display:grid;grid-template-columns:44px minmax(0,1fr);grid-template-areas:"toggle title";column-gap:8px;align-items:start;transition:padding 200ms ease,padding-left 200ms ease,padding-right 200ms ease}',
      '[data-ts-trip-site-hero] h1{grid-area:title;margin:0;min-width:0;font-size:21px!important;font-weight:700;letter-spacing:-.5px;line-height:1.15;overflow-wrap:anywhere}',
      '[data-ts-trip-hero-detail]{grid-column:1/-1;justify-self:center}',
      '[data-ts-trip-hero-actions]{grid-column:1/-1;margin-top:8px;display:flex;justify-content:center;gap:6px;flex-wrap:wrap}',
      '[data-ts-trip-hero-collapse]{grid-area:toggle;position:relative;left:auto;top:auto;z-index:30;flex-shrink:0;width:44px;height:44px;min-width:44px;min-height:44px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:20px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '[data-ts-trip-site-hero][data-collapsed="1"]{grid-template-areas:"toggle title";grid-template-columns:36px minmax(0,1fr);column-gap:6px;align-items:center;padding-top:8px!important;padding-bottom:8px!important;padding-left:10px!important;padding-right:10px!important;max-height:57px;overflow:hidden}',
      '[data-ts-trip-site-hero][data-collapsed="1"] [data-ts-trip-hero-detail],[data-ts-trip-site-hero][data-collapsed="1"] [data-ts-trip-hero-actions]{display:none!important}',
      '[data-ts-trip-site-hero][data-collapsed="1"] h1{font-size:15px!important;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '[data-ts-trip-site-hero][data-collapsed="1"] [data-ts-trip-hero-collapse]{width:36px;height:36px;min-width:36px;min-height:36px;font-size:17px;transform:rotate(180deg)}',
    ].join('');
    document.head.appendChild(style);
  };

  const heroGradientRe = /linear-gradient\(\s*135deg/i;
  const heroBlackStopRe = /(?:#000(?:000)?\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/i;

  const nodeHasBlackTripHeroBg = (node) => {
    const styleText = String(node.getAttribute('style') || '');
    if (heroGradientRe.test(styleText) && heroBlackStopRe.test(styleText)) return true;
    try {
      const bg = getComputedStyle(node).backgroundImage || '';
      if (heroGradientRe.test(bg) && heroBlackStopRe.test(bg)) return true;
    } catch {}
    return false;
  };

  const findHero = () => {
    const tripView = document.querySelector('[data-trip-view-root]');
    if (!tripView) return null;
    let node = tripView.parentElement;
    while (node && node !== document.body) {
      if (nodeHasBlackTripHeroBg(node) && node.querySelector('h1')) return node;
      node = node.parentElement;
    }
    return null;
  };

  const markDetails = (hero) => {
    const h1 = hero.querySelector('h1');
    if (!h1) return;
    for (const child of [...hero.children]) {
      if (child === h1) continue;
      if (child.matches('[data-ts-trip-hero-collapse]')) continue;
      if (getComputedStyle(child).position === 'absolute') continue;
      if (child.querySelector('[data-trip-view-root]')) {
        child.setAttribute('data-ts-trip-hero-actions', '1');
        continue;
      }
      if (!child.hasAttribute('data-ts-trip-hero-detail')) child.setAttribute('data-ts-trip-hero-detail', '1');
    }
  };

  const attachToggle = (hero) => {
    if (hero.querySelector('[data-ts-trip-hero-collapse]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-ts-hero-collapse', '1');
    btn.setAttribute('data-ts-trip-hero-collapse', '1');
    btn.setAttribute('aria-label', 'Collapse trip header');
    btn.textContent = '▾';
    btn.addEventListener('click', () => {
      const collapsed = hero.getAttribute('data-collapsed') === '1';
      const next = !collapsed;
      hero.setAttribute('data-collapsed', next ? '1' : '0');
      btn.setAttribute('aria-expanded', next ? 'false' : 'true');
      btn.setAttribute('aria-label', next ? 'Expand trip header' : 'Collapse trip header');
      try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch {}
    });
    hero.appendChild(btn);
  };

  const unmount = () => {
    const hero = document.querySelector('[data-ts-trip-site-hero="1"]');
    if (!hero) return;
    hero.querySelector('[data-ts-trip-hero-collapse]')?.remove();
    hero.removeAttribute('data-ts-trip-site-hero');
    hero.removeAttribute('data-collapsed');
    for (const node of hero.querySelectorAll('[data-ts-trip-hero-detail], [data-ts-trip-hero-actions]')) {
      node.removeAttribute('data-ts-trip-hero-detail');
      node.removeAttribute('data-ts-trip-hero-actions');
    }
  };

  const mount = () => {
    if (!isMobile()) {
      unmount();
      return false;
    }
    injectCss();
    const hero = findHero();
    if (!hero) return false;
    if (hero.getAttribute('data-ts-trip-site-hero') !== '1') {
      hero.setAttribute('data-ts-trip-site-hero', '1');
      if (!hero.style.position) hero.style.position = 'relative';
      markDetails(hero);
      attachToggle(hero);
      let collapsed = false;
      try { collapsed = localStorage.getItem(storageKey) === '1'; } catch {}
      hero.setAttribute('data-collapsed', collapsed ? '1' : '0');
      const btn = hero.querySelector('[data-ts-trip-hero-collapse]');
      if (btn) {
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        btn.setAttribute('aria-label', collapsed ? 'Expand trip header' : 'Collapse trip header');
      }
    }
    return true;
  };

  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  try {
    window.matchMedia(mobileQuery).addEventListener('change', () => mount());
  } catch {
    window.addEventListener('resize', () => mount());
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }
})();

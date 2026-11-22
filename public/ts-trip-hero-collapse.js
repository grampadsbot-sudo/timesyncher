(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;
  if (/^\/shared\/[^/]+\/journey\/?$/i.test(location.pathname)) return;
  const slug = decodeURIComponent(sharedMatch[1]);
  const storageKey = `vk-trip-hero-collapsed:${slug}`;
  const styleId = 'ts-trip-hero-collapse-css';
  const svgNs = 'http://www.w3.org/2000/svg';

  const injectCss = () => {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      '[data-ts-trip-site-hero]{box-sizing:border-box;padding:13px 20px!important}',
      '[data-ts-trip-site-hero] h1{display:block!important;width:fit-content!important;max-width:calc(100% - 64px)!important;margin:0 auto 4px!important;padding:0!important;min-width:0;box-sizing:border-box;text-align:center;font-weight:700;letter-spacing:-.5px;line-height:1.15;overflow-wrap:anywhere;white-space:normal}',
      '[data-ts-trip-site-hero][data-has-details="0"] h1{margin:0 auto!important}',
      '[data-ts-trip-hero-detail]{margin-left:auto;margin-right:auto}',
      '[data-ts-trip-hero-decor]{pointer-events:none!important}',
      '[data-ts-trip-hero-actions]{margin-top:8px;display:flex;justify-content:center;gap:6px;flex-wrap:wrap}',
      '[data-ts-trip-hero-collapse]{position:absolute;right:4px;top:var(--ts-hero-title-mid,25px);transform:translateY(-50%);transition:none!important;z-index:30;width:44px;height:44px;min-width:44px;min-height:44px;border:0;border-radius:0;background:transparent;box-shadow:none;color:rgba(255,255,255,.55);font:inherit;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0;appearance:none;-webkit-appearance:none;-webkit-tap-highlight-color:transparent}',
      '[data-ts-trip-hero-collapse]:hover,[data-ts-trip-hero-collapse]:focus-visible{color:rgba(255,255,255,.85)}',
      '[data-ts-trip-hero-collapse]:focus-visible{outline:2px solid rgba(255,255,255,.5);outline-offset:-4px}',
      '[data-ts-trip-hero-collapse] svg{display:block;width:20px;height:20px;flex:0 0 auto;pointer-events:none}',
      '[data-ts-trip-site-hero][data-collapsed="1"]{padding-top:13px!important;padding-bottom:13px!important}',
      '[data-ts-trip-site-hero][data-collapsed="1"] [data-ts-trip-hero-detail],[data-ts-trip-site-hero][data-collapsed="1"] [data-ts-trip-hero-actions]{display:none!important}',
      '[data-ts-trip-site-hero][data-collapsed="1"] [data-ts-trip-hero-decor]{display:none!important}',
      '[data-ts-trip-site-hero][data-collapsed="1"] h1{font-size:18px!important;line-height:1.2;max-width:calc(100% - 64px)!important;margin:0 auto!important}',
      '[data-ts-trip-site-hero][data-collapsed="1"] [data-ts-trip-hero-collapse]{top:50%;transform:translateY(-50%) rotate(180deg)}',
      '@media (max-width: 844px){[data-ts-trip-site-hero] h1{font-size:21px!important}[data-ts-trip-site-hero][data-collapsed="1"] h1{font-size:16px!important}}',
      '@media print{[data-ts-trip-hero-collapse]{display:none!important}}',
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
    } catch (err) {
      void err;
    }
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

  const syncTitleMid = (hero) => {
    if (!hero) return;
    const h1 = hero.querySelector('h1');
    if (!h1) return;
    const mid = h1.offsetTop + h1.offsetHeight / 2;
    if (mid > 0) {
      const next = `${mid}px`;
      if (hero.style.getPropertyValue('--ts-hero-title-mid') !== next) {
        hero.style.setProperty('--ts-hero-title-mid', next);
      }
    }
  };

  const markDetails = (hero) => {
    const h1 = hero.querySelector('h1');
    if (!h1) return;
    let hasDetails = false;
    for (const child of [...hero.children]) {
      if (child === h1) continue;
      if (child.matches('[data-ts-trip-hero-collapse]')) continue;
      if (getComputedStyle(child).position === 'absolute') {
        if (child.children.length === 0 && !String(child.textContent || '').trim()) {
          if (!child.hasAttribute('data-ts-trip-hero-decor')) child.setAttribute('data-ts-trip-hero-decor', '1');
        }
        continue;
      }
      hasDetails = true;
      if (child.querySelector('[data-trip-view-root]')) {
        child.setAttribute('data-ts-trip-hero-actions', '1');
        continue;
      }
      if (!child.hasAttribute('data-ts-trip-hero-detail')) child.setAttribute('data-ts-trip-hero-detail', '1');
    }
    hero.setAttribute('data-has-details', hasDetails ? '1' : '0');
  };

  const createChevronSvg = () => {
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', 'M6 15l6-6 6 6');
    svg.appendChild(path);
    return svg;
  };

  const applyButtonState = (btn, collapsed) => {
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.setAttribute('aria-label', collapsed ? 'Expand vacation header' : 'Collapse vacation header');
    btn.setAttribute('data-chevron-direction', collapsed ? 'down' : 'up');
  };

  const attachToggle = (hero) => {
    if (hero.querySelector('[data-ts-trip-hero-collapse]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-no-press', '1');
    btn.setAttribute('data-ts-hero-collapse', '1');
    btn.setAttribute('data-ts-trip-hero-collapse', '1');
    applyButtonState(btn, false);
    btn.appendChild(createChevronSvg());
    btn.addEventListener('click', () => {
      const collapsed = hero.getAttribute('data-collapsed') === '1';
      const next = !collapsed;
      hero.setAttribute('data-collapsed', next ? '1' : '0');
      applyButtonState(btn, next);
      syncTitleMid(hero);
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch (err) {
        void err;
      }
    });
    hero.appendChild(btn);
  };

  let resizeObserver = null;
  const watchHeroSize = (hero) => {
    if (typeof ResizeObserver === 'undefined') return;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => syncTitleMid(hero));
    resizeObserver.observe(hero);
    const h1 = hero.querySelector('h1');
    if (h1) resizeObserver.observe(h1);
  };

  const mount = () => {
    injectCss();
    const hero = findHero();
    if (!hero) return false;
    if (hero.getAttribute('data-ts-trip-site-hero') !== '1') {
      hero.setAttribute('data-ts-trip-site-hero', '1');
      if (!hero.style.position) hero.style.position = 'relative';
      markDetails(hero);
      attachToggle(hero);
      let collapsed = false;
      try {
        collapsed = localStorage.getItem(storageKey) === '1';
      } catch (err) {
        void err;
      }
      hero.setAttribute('data-collapsed', collapsed ? '1' : '0');
      const btn = hero.querySelector('[data-ts-trip-hero-collapse]');
      if (btn) applyButtonState(btn, collapsed);
      watchHeroSize(hero);
      syncTitleMid(hero);
      requestAnimationFrame(() => syncTitleMid(hero));
    } else {
      markDetails(hero);
      syncTitleMid(hero);
    }
    return true;
  };

  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', () => syncTitleMid(findHero()));
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => syncTitleMid(findHero()), (err) => { void err; });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }
})();

export function measureSource() {
  return (state) => {
    const out = [];
    const check = (id, ok, detail) => out.push({ id, ok: Boolean(ok), detail });
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const id = (name) => `APP-${vw === 390 ? '390' : '1280'}-${state}-${name}`;
    const header = document.querySelector('#appHeader, header.topbar');
    const composer = document.querySelector('#composer');
    const textarea = document.querySelector('#messageText');
    const pane = document.querySelector('.chat-pane');
    const visible = (el, view) => {
      if (!el) return false;
      const win = view || window;
      let node = el;
      while (node && node.nodeType === 1) {
        const style = win.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        node = node.parentElement;
      }
      return !el.hidden && el.getClientRects().length > 0;
    };
    const safeAreaBottom = () => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px);';
      document.body.appendChild(probe);
      const inset = Number.parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      return inset;
    };

    const dropdown = document.querySelector('#vacationDropdown');
    const headerKids = header ? [...header.children] : [];
    if (state === 'MANY') {
      const onlyDropdown = Boolean(header) && headerKids.length === 1 && headerKids[0] === dropdown;
      const extra = header?.querySelector('img, .brand, .path-nav, .trip-menu, #tripMenu');
      const height = header ? header.getBoundingClientRect().height : 0;
      check(id('HEADER'), onlyDropdown && !extra && height > 0, {
        children: headerKids.map((node) => node.id || node.className),
        extra: extra ? (extra.id || extra.className) : '',
        height,
      });
    } else {
      const box = header?.getBoundingClientRect();
      check(id('HEADER'), !header || box.height === 0, {
        absent: !header,
        height: box ? box.height : null,
      });
    }
    if (state === 'NONE') {
      const chromeFooters = [...document.querySelectorAll('footer,[role="contentinfo"]')];
      const visibleFooters = chromeFooters.filter((el) => visible(el));
      check(id('FOOTER'), visibleFooters.length === 0, {
        count: chromeFooters.length,
        visible: visibleFooters.map((el) => el.id || el.getAttribute('role') || el.className || el.tagName),
      });
    }
    const visibleButtons = [...document.querySelectorAll('.app button')].filter((el) => visible(el)).map((el) => el.id || el.className || el.tagName);
    const allowed = state === 'SITE'
      ? ['attachButton', 'fullScreenButton', 'sendButton', 'splitter', 'voiceButton']
      : state === 'MANY'
        ? ['attachButton', 'sendButton', 'tripButton', 'voiceButton']
        : ['attachButton', 'sendButton', 'voiceButton'];
    const sameButtons = visibleButtons.length === allowed.length && allowed.every((name) => visibleButtons.includes(name));
    check(id('BUTTONS'), sameButtons, { visibleButtons, allowed });

    if (!composer) {
      check(id('COMPOSER'), false, { missing: true });
      check(id('HIT'), false, { missing: true });
      check(id('CONTROLS'), false, { missing: true });
    } else {
      const box = composer.getBoundingClientRect();
      const inset = safeAreaBottom();
      const targetBottom = vh - inset;
      const gap = targetBottom - box.bottom;
      const pinOk = state === 'NONE' ? gap <= 2 && gap >= -2 : gap <= 100 && gap >= -1;
      check(id('COMPOSER'), box.top >= -1 && box.bottom <= vh + 1 && box.height > 20 && pinOk, {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        height: Math.round(box.height),
        gap: Math.round(gap),
        inset: Math.round(inset * 100) / 100,
        vh,
      });
      if (state === 'NONE') {
        check(id('PIN'), pinOk, {
          bottom: Math.round(box.bottom),
          targetBottom: Math.round(targetBottom),
          gap: Math.round(gap * 100) / 100,
          inset: Math.round(inset * 100) / 100,
        });
      }
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const hitText = hit === textarea || (textarea && textarea.contains(hit));
      check(id('HIT'), Boolean(hitText) && cx >= 0 && cx <= vw && cy >= 0 && cy <= vh, {
        hit: hit ? (hit.id || hit.className || hit.tagName) : null,
        cx: Math.round(cx),
        cy: Math.round(cy),
      });
      const controls = [...composer.querySelectorAll('button, textarea, input, select')].filter((el) => visible(el));
      const controlIds = controls.map((el) => el.id || el.className || el.tagName).sort();
      const expected = ['attachButton', 'messageText', 'sendButton', 'voiceButton'];
      const same = controlIds.length === expected.length && expected.every((name) => controlIds.includes(name));
      check(id('CONTROLS'), same, { controlIds });
    }

    const docRight = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    const overflow = [];
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) continue;
      let clipped = false;
      let node = el.parentElement;
      while (node && node !== document.documentElement) {
        const parentStyle = getComputedStyle(node);
        const parentRect = node.getBoundingClientRect();
        const clips = ['hidden', 'clip', 'scroll', 'auto'].includes(parentStyle.overflowX) || parentStyle.overflowX === 'hidden';
        if (clips && rect.right > parentRect.right + 1 && parentRect.right <= vw + 1) {
          clipped = true;
          break;
        }
        node = node.parentElement;
      }
      if (!clipped && rect.right > vw + 1) {
        overflow.push(el.id || el.className || el.tagName);
        if (overflow.length >= 6) break;
      }
    }
    check(id('OVERFLOW'), docRight <= vw + 1 && overflow.length === 0, {
      docRight,
      vw,
      overflow,
    });

    const hiddenBad = [];
    const collectHidden = (doc) => {
      if (!doc) return;
      for (const el of doc.querySelectorAll('[hidden]')) {
        const win = doc.defaultView || window;
        if (win.getComputedStyle(el).display !== 'none') hiddenBad.push(el.id || el.className || el.tagName);
      }
    };
    collectHidden(document);
    const frame = document.querySelector('.site-pane iframe');
    if (frame) {
      try { collectHidden(frame.contentDocument); } catch { hiddenBad.push('iframe-unreachable'); }
    }
    check(id('HIDDEN'), hiddenBad.length === 0, { hiddenBad });

    const chrome = document.querySelector('.app img.mark, .app .brand, .path-nav, [aria-label="Vacation path"], .trip-menu, #tripMenu');
    check(id('CHROME'), !chrome, { found: chrome ? (chrome.id || chrome.className || chrome.tagName) : '' });

    if (!pane) {
      check(id('ROWS'), false, { missing: true });
    } else {
      const rows = getComputedStyle(pane).gridTemplateRows.split(/\s+/).filter(Boolean);
      check(id('ROWS'), rows.length === pane.children.length, {
        rows,
        children: pane.children.length,
      });
    }

    if (state === 'SITE') {
      const site = document.querySelector('.site-pane');
      const splitter = document.querySelector('#splitter');
      const siteBox = site?.getBoundingClientRect();
      const splitBox = splitter?.getBoundingClientRect();
      const chatBox = pane?.getBoundingClientRect();
      const stacked = Boolean(site && splitter && pane)
        && siteBox.bottom <= splitBox.top + 2
        && splitBox.bottom <= chatBox.top + 2
        && siteBox.height > 20
        && splitBox.height > 0
        && chatBox.height > 20;
      check(id('STACK'), stacked, {
        site: siteBox ? Math.round(siteBox.bottom) : null,
        split: splitBox ? [Math.round(splitBox.top), Math.round(splitBox.bottom)] : null,
        chat: chatBox ? Math.round(chatBox.top) : null,
      });
      let embed = { ready: false };
      try {
        const doc = frame?.contentDocument;
        const win = doc?.defaultView;
        if (doc && win && doc.body) {
          const guest = doc.querySelector('[data-ts-guest-nav], [aria-label="Open navigation"]');
          const guestVisible = Boolean(guest && visible(guest, win));
          const footers = [...doc.querySelectorAll('footer')].filter((el) => visible(el, win));
          const stamp = doc.querySelector('footer[data-build-stamp]');
          const stampVisible = Boolean(stamp && visible(stamp, win));
          embed = {
            ready: true,
            guestVisible,
            stampVisible,
            footers: footers.map((el) => el.getAttribute('data-build-stamp') || el.className || el.id || 'footer'),
            embed: doc.documentElement.getAttribute('data-ts-embed') || '',
          };
        }
      } catch (error) {
        embed = { ready: false, error: String(error) };
      }
      check(id('EMBED'), embed.ready && !embed.guestVisible && !embed.stampVisible && embed.footers.length === 0, embed);
    }
    return out;
  };
}

export function fullScreenSource() {
  return () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const site = document.querySelector('.site-pane')?.getBoundingClientRect();
    const chat = document.querySelector('.chat-pane');
    const composer = document.querySelector('#composer');
    const splitter = document.querySelector('#splitter');
    const header = document.querySelector('header.topbar');
    const button = document.querySelector('#fullScreenButton');
    const stamp = document.querySelector('footer[data-build-stamp]');
    const stampStyle = stamp ? getComputedStyle(stamp) : null;
    const shown = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const visibleButtons = [...document.querySelectorAll('.app button')].filter(shown).map((el) => el.id || el.getAttribute('aria-label'));
    return {
      fills: Boolean(site) && site.top <= 2 && site.left <= 2 && site.right >= vw - 2 && site.bottom >= vh - 2,
      chatHidden: !shown(chat),
      composerHidden: !shown(composer),
      splitterHidden: !shown(splitter),
      headerGone: !header || header.getBoundingClientRect().height === 0,
      stampHidden: !stamp || stampStyle.visibility === 'hidden' || stamp.getClientRects().length === 0,
      label: button?.getAttribute('aria-label') || '',
      visibleButtons,
      site: site ? {
        top: Math.round(site.top),
        right: Math.round(site.right),
        bottom: Math.round(site.bottom),
        left: Math.round(site.left),
        vw,
        vh,
      } : null,
    };
  };
}

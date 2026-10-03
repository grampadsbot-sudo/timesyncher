/** In-browser layout assertions for chat + shared staging pages (harness-only). */

export const LAYOUT_VIEWPORTS = [
  { width: 390, height: 844, label: '390' },
  { width: 1280, height: 800, label: '1280' },
];

/** Which rules run on chat vs shared (documented in checkLAYOUT.applicability). */
export const LAYOUT_RULE_APPLICABILITY = {
  composer_in_viewport: ['chat'],
  horizontal_overflow: ['chat', 'shared'],
  header_grok_spec: ['chat'],
  composer_controls_only: ['chat'],
  site_splitter_when_site: ['chat'],
  site_fullscreen_control: ['chat'],
  messages_visible: ['chat'],
  hidden_attr_display_none: ['chat', 'shared'],
  guest_nav_disjoint: ['shared'],
  chat_pane_row_parity: ['chat'],
};

export function evaluateLayoutRules(pageKind) {
  const failures = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const viewport = { innerWidth: vw, innerHeight: vh, scrollWidth: document.documentElement.scrollWidth };

  function rectObj(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
  }

  function push(selector, rule, detail, rects) {
    failures.push({ selector, rule, detail, viewport, rects });
  }

  const applies = (rule) => {
    const list = {
      composer_in_viewport: ['chat'],
      horizontal_overflow: ['chat', 'shared'],
      header_grok_spec: ['chat'],
      composer_controls_only: ['chat'],
      site_splitter_when_site: ['chat'],
      messages_visible: ['chat'],
      hidden_attr_display_none: ['chat', 'shared'],
      guest_nav_disjoint: ['shared'],
      chat_pane_row_parity: ['chat'],
      site_fullscreen_control: ['chat'],
    }[rule] || [];
    return list.includes(pageKind);
  };

  if (applies('horizontal_overflow')) {
    if (document.documentElement.scrollWidth > vw + 1) {
      push('documentElement', 'horizontal_overflow', `scrollWidth ${document.documentElement.scrollWidth} > innerWidth ${vw}`, {
        documentElement: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      });
    }
    const overflowEls = [];
    for (const el of document.querySelectorAll('body *')) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.right > vw + 1) overflowEls.push({ tag: el.tagName, id: el.id || '', cls: String(el.className || '').slice(0, 40), rect: rectObj(el) });
      if (overflowEls.length >= 8) break;
    }
    if (overflowEls.length) {
      push('body *', 'horizontal_overflow', `visible elements exceed viewport width (${overflowEls.length} sampled)`, { samples: overflowEls });
    }
  }

  if (applies('hidden_attr_display_none')) {
    for (const el of document.querySelectorAll('[hidden]')) {
      const st = getComputedStyle(el);
      if (st.display !== 'none') {
        push('[hidden]', 'hidden_attr_display_none', `display=${st.display}`, { el: rectObj(el) });
        break;
      }
    }
  }

  const textarea = document.querySelector('#messageText, textarea[name="message"], #composer textarea');
  if (applies('composer_in_viewport') && textarea) {
    const tr = textarea.getBoundingClientRect();
    const ta = rectObj(textarea);
    const fullyInside = tr.top >= 0 && tr.left >= 0 && tr.bottom <= vh && tr.right <= vw;
    const bottomGap = vh - tr.bottom;
    const withinBottomBand = bottomGap >= 0 && bottomGap <= 100;
    const cx = tr.left + tr.width / 2;
    const cy = tr.top + tr.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const hitOk = hit && (hit === textarea || textarea.contains(hit));
    if (!fullyInside) {
      push('#messageText', 'composer_in_viewport', 'textarea bounding rect not fully inside viewport', { textarea: ta, viewport });
    } else if (!withinBottomBand) {
      push('#messageText', 'composer_in_viewport', `textarea bottom gap ${bottomGap.toFixed(1)}px (want 0–100px from viewport bottom)`, { textarea: ta, viewport });
    } else if (!hitOk) {
      push('#messageText', 'composer_in_viewport', 'elementFromPoint at textarea center is not textarea/descendant', { textarea: ta, hitTag: hit?.tagName, viewport });
    }
  } else if (applies('composer_in_viewport') && !textarea) {
    push('#messageText', 'composer_in_viewport', 'composer textarea missing on chat page', { viewport });
  }

  if (applies('header_grok_spec')) {
    const header = document.querySelector('header.topbar');
    const tripOptions = document.querySelectorAll('#tripMenu .trip-option, .trip-list .trip-option');
    const vacationCount = tripOptions.length;
    if (vacationCount < 2) {
      if (header) {
        const st = getComputedStyle(header);
        const hr = header.getBoundingClientRect();
        const hidden = st.display === 'none' || st.visibility === 'hidden' || hr.height <= 1 || hr.width <= 1;
        if (!hidden) {
          push('header.topbar', 'header_grok_spec', 'header must be fully hidden (not rendered or 0 height) when fewer than 2 vacations', {
            vacationCount,
            height: hr.height,
            display: st.display,
          });
        }
      }
    } else if (header) {
      const hr = header.getBoundingClientRect();
      if (hr.height > 1 && hr.width > 1) {
        const logos = header.querySelectorAll('img, svg, .mark, .brand');
        for (const logo of logos) {
          const r = logo.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && getComputedStyle(logo).display !== 'none') {
            push('header.topbar', 'header_grok_spec', 'header must not show logo/brand chrome', { header: rectObj(header), logo: rectObj(logo) });
            break;
          }
        }
        const menu = header.querySelector('#tripMenu');
        const menuVisible = menu && getComputedStyle(menu).display !== 'none' && menu.getBoundingClientRect().height > 0;
        if (!menuVisible) {
          push('#tripMenu', 'header_grok_spec', '2+ vacations require vacation dropdown in header', { vacationCount });
        }
        for (const el of header.querySelectorAll('button, a, input, select')) {
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          if (menu && menu.contains(el)) continue;
          if (el.id === 'tripButton' || el.closest('#tripMenu')) continue;
          push('header.topbar', 'header_grok_spec', 'header may only contain vacation dropdown when 2+ vacations', { tag: el.tagName, id: el.id });
          break;
        }
      }
    }
    const guestNav = document.querySelector('[data-ts-guest-nav]');
    if (guestNav && getComputedStyle(guestNav).display !== 'none') {
      push('[data-ts-guest-nav]', 'header_grok_spec', 'Open navigation/Settings guest nav forbidden on chat app', { guestNav: rectObj(guestNav) });
    }
  }

  if (applies('composer_controls_only')) {
    const grid = document.querySelector('.compose-grid, #composer');
    if (grid) {
      const attach = document.querySelector('#attachButton');
      const voice = document.querySelector('#voiceButton');
      const send = document.querySelector('.send-button, button[type="submit"]');
      if (send && getComputedStyle(send).display !== 'none' && send.getBoundingClientRect().width > 0) {
        push('.send-button', 'composer_controls_only', 'composer must only expose file-add and speak (no send button)', { send: rectObj(send) });
      }
      const controls = grid.querySelectorAll('button, input, textarea, select');
      for (const el of controls) {
        const st = getComputedStyle(el);
        if (st.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const id = el.id || '';
        const ok = id === 'attachButton' || id === 'voiceButton' || el === textarea || el.id === 'messageText';
        if (!ok) {
          push('#composer', 'composer_controls_only', `unexpected composer control ${id || el.tagName}`, { el: rectObj(el) });
          break;
        }
      }
      if (!attach || !voice) {
        push('#composer', 'composer_controls_only', 'composer missing file-add or speak button', { attach: Boolean(attach), voice: Boolean(voice) });
      }
    }
  }

  if (applies('site_splitter_when_site')) {
    const sitePane = document.querySelector('.site-pane');
    const splitter = document.querySelector('#splitter, .splitter');
    const siteVisible = sitePane && getComputedStyle(sitePane).display !== 'none' && sitePane.getBoundingClientRect().height > 8;
    const iframe = sitePane?.querySelector('iframe');
    const hasSiteContent = siteVisible && iframe && String(iframe.getAttribute('src') || '').trim().length > 0;
    if (hasSiteContent) {
      if (!splitter || getComputedStyle(splitter).display === 'none' || splitter.getBoundingClientRect().height < 1) {
        push('#splitter', 'site_splitter_when_site', 'site content visible but resizable divider missing', { sitePane: rectObj(sitePane) });
      } else {
        const chatPane = document.querySelector('.chat-pane');
        const siteTop = sitePane.getBoundingClientRect().top;
        const chatTop = chatPane?.getBoundingClientRect().top ?? 0;
        const splitTop = splitter.getBoundingClientRect().top;
        if (!(siteTop <= splitTop && splitTop <= chatTop + 2)) {
          push('#workspace', 'site_splitter_when_site', 'site pane must be above splitter above chat', { siteTop, splitTop, chatTop });
        }
      }
    }
  }

  if (applies('site_fullscreen_control')) {
    const sitePane = document.querySelector('.site-pane');
    const iframe = sitePane?.querySelector('iframe');
    const siteVisible = sitePane && getComputedStyle(sitePane).display !== 'none' && sitePane.getBoundingClientRect().height > 8;
    const hasSiteContent = siteVisible && iframe && String(iframe.getAttribute('src') || '').trim().length > 0;
    if (hasSiteContent) {
      const btn = sitePane.querySelector('[data-ts-site-fullscreen], [data-site-fullscreen], button[aria-label*="full" i], button[title*="full" i]')
        || document.querySelector('[data-ts-site-fullscreen], button[aria-label*="full screen" i]');
      if (!btn || getComputedStyle(btn).display === 'none' || btn.getBoundingClientRect().height < 1) {
        push('.site-pane', 'site_fullscreen_control', 'site content requires a full-screen control in the site area', { sitePane: rectObj(sitePane) });
      }
    }
  }

  if (applies('messages_visible')) {
    const messages = document.querySelector('#messages');
    if (!messages) {
      push('#messages', 'messages_visible', '#messages missing', { viewport });
    } else {
      const st = getComputedStyle(messages);
      const mr = messages.getBoundingClientRect();
      const visible = mr.width > 0 && mr.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
      if (!visible) push('#messages', 'messages_visible', 'messages not visible', { messages: rectObj(messages), display: st.display, visibility: st.visibility });
      if (messages.children.length < 1) push('#messages', 'messages_visible', 'messages has no children', { childCount: messages.children.length });
    }
  }

  if (applies('guest_nav_disjoint')) {
    const guestNav = document.querySelector('[data-ts-guest-nav], [data-guest-nav], .guest-nav')
      || Array.from(document.querySelectorAll('div, nav')).find((el) => {
        const t = String(el.textContent || '');
        return /open navigation|settings/i.test(t) && getComputedStyle(el).position === 'fixed';
      });
    if (guestNav) {
      const nr = guestNav.getBoundingClientRect();
      const main = document.querySelector('main, [role="main"], .shared-trip, #root > div');
      const composer = document.querySelector('#composer, form.composer');
      const targets = [main, composer, textarea].filter(Boolean);
      for (const t of targets) {
        const tr = t.getBoundingClientRect();
        const overlap = !(nr.right < tr.left || nr.left > tr.right || nr.bottom < tr.top || nr.top > tr.bottom);
        if (overlap) {
          push(String(t.id || t.tagName), 'guest_nav_disjoint', 'guest nav intersects main/composer', { guestNav: rectObj(guestNav), target: rectObj(t) });
          break;
        }
      }
    }
  }

  if (applies('chat_pane_row_parity')) {
    const pane = document.querySelector('section.chat-pane, .chat-pane');
    if (pane) {
      const visibleKids = Array.from(pane.children).filter((el) => {
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      });
      const rowTops = visibleKids.map((el) => Math.round(el.getBoundingClientRect().top));
      const rowCount = new Set(rowTops).size;
      if (visibleKids.length > 0 && rowCount !== visibleKids.length) {
        push('.chat-pane', 'chat_pane_row_parity', `visible child count ${visibleKids.length} != layout row count ${rowCount}`, {
          childCount: visibleKids.length,
          rowCount,
          rowTops,
        });
      }
    }
  }

  return { pageKind, viewport, failures, pass: failures.length === 0 };
}

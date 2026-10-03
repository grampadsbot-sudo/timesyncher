/** In-browser layout assertions for chat + shared staging pages (harness-only). */

export const LAYOUT_VIEWPORTS = [
  { width: 390, height: 844, label: '390' },
  { width: 1280, height: 800, label: '1280' },
];

/** Which rules run on chat vs shared (documented in checkLAYOUT.applicability). */
export const LAYOUT_RULE_APPLICABILITY = {
  composer_in_viewport: ['chat'],
  horizontal_overflow: ['chat', 'shared'],
  topbar_logo_menu: ['chat'],
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
      topbar_logo_menu: ['chat'],
      messages_visible: ['chat'],
      hidden_attr_display_none: ['chat', 'shared'],
      guest_nav_disjoint: ['shared'],
      chat_pane_row_parity: ['chat'],
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

  if (applies('topbar_logo_menu')) {
    const header = document.querySelector('header.topbar');
    if (!header) {
      push('header.topbar', 'topbar_logo_menu', 'header.topbar missing', { viewport });
    } else {
      const hr = header.getBoundingClientRect();
      const logo = header.querySelector('img.mark, img[alt*="TimeSyncher" i], .brand img');
      const menuEl = header.querySelector('#tripMenu, .trip-menu');
      if (!logo) push('header.topbar', 'topbar_logo_menu', 'logo not found under header.topbar', { header: rectObj(header) });
      if (!menuEl) push('header.topbar', 'topbar_logo_menu', '#tripMenu not found under header.topbar', { header: rectObj(header) });
      if (logo && !header.contains(logo)) push('header.topbar', 'topbar_logo_menu', 'logo not descendant of header.topbar', {});
      if (menuEl && !header.contains(menuEl)) push('header.topbar', 'topbar_logo_menu', 'trip menu not descendant of header.topbar', {});
      if (logo) {
        const lr = logo.getBoundingClientRect();
        if (lr.top < hr.top - 1 || lr.bottom > hr.bottom + 1 || lr.left < hr.left - 1 || lr.right > hr.right + 1) {
          push('header.topbar', 'topbar_logo_menu', 'logo rect not inside header.topbar rect', { header: rectObj(header), logo: rectObj(logo) });
        }
      }
      if (menuEl) {
        const mr = menuEl.getBoundingClientRect();
        if (mr.top < hr.top - 1 || mr.bottom > hr.bottom + 1 || mr.left < hr.left - 1 || mr.right > hr.right + 1) {
          push('header.topbar', 'topbar_logo_menu', 'trip menu rect not inside header.topbar rect', { header: rectObj(header), menu: rectObj(menuEl) });
        }
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
    const guestNav = document.querySelector('[data-guest-nav], .guest-nav, nav.guest, div.guest-nav')
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
        push('.chat-pane', 'chat_pane_row_parity', `visible child count ${visibleKids.length} != layout row count ${rowCount} (stacked/overlapping rows)`, {
          childCount: visibleKids.length,
          rowCount,
          rowTops,
        });
      }
    }
  }

  return { pageKind, viewport, failures, pass: failures.length === 0 };
}

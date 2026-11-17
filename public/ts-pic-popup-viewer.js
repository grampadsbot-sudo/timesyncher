(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;

  const FS_CSS = [
    '[data-ts-pic-fs-overlay="1"]{touch-action:none}',
    '[data-ts-pic-fs-overlay="1"] [data-ts-pic-fs-stage="1"]{flex:1 1 auto;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;box-sizing:border-box}',
    '[data-ts-pic-fs-overlay="1"] [data-ts-pic-fs-img="1"]{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;transform-origin:center center;will-change:transform;touch-action:none}',
    '[data-ts-pic-fs-caption="1"]{pointer-events:none}',
    '[data-ts-pic-popup="1"]:not([data-ts-pic-fs-active="1"]) [data-ts-pic-stage="1"] img,[data-ts-pic-popup="1"]:not([data-ts-pic-fs-active="1"]) img:not([data-ts-pic-fs-img]){object-fit:contain!important;max-width:100%;width:auto!important;height:auto!important;max-height:min(220px,calc(100vh - 200px));display:block}',
    '[data-ts-pic-popup="1"]:not([data-ts-pic-fs-active="1"]) [data-ts-pic-stage="1"]{overflow:visible!important;height:auto!important;max-height:none!important}',
  ].join('');

  const BTN_BASE =
    'display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border-radius:10px;border:1px solid #d1d5db;background:#fff;color:#111827;font-size:16px;font-weight:600;line-height:1;cursor:pointer;padding:0 10px;box-shadow:0 1px 2px rgba(15,23,42,0.08);touch-action:manipulation;-webkit-tap-highlight-color:transparent';

  function wireTapButton(btn, handler) {
    let lastTouchAt = 0;
    btn.addEventListener(
      'touchend',
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        lastTouchAt = Date.now();
        handler(e);
      },
      { passive: false },
    );
    btn.addEventListener('click', (e) => {
      if (Date.now() - lastTouchAt < 500) return;
      e.stopPropagation();
      e.preventDefault();
      handler(e);
    });
  }

  const FS_EXPAND_SVG =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5"/></svg>';
  const FS_CLOSE_SVG =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  let fsEscapeHandler = null;
  const VIEW_MARGIN = 8;

  function parseStylePx(value, fallback = 0) {
    const n = parseFloat(String(value || '').replace(/px$/, ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function clampPopupToViewport(popup) {
    if (!popup || popup.getAttribute('data-ts-pic-fs-active') === '1') return;
    const vw = window.innerWidth;
    const maxW = Math.max(200, vw - VIEW_MARGIN * 2);
    const measured = popup.getBoundingClientRect().width;
    if (measured > maxW + 0.5) {
      popup.style.width = `${Math.round(maxW)}px`;
    }
    const rect = popup.getBoundingClientRect();
    let shiftX = 0;
    if (rect.right > vw - VIEW_MARGIN) shiftX -= rect.right - (vw - VIEW_MARGIN);
    if (rect.left + shiftX < VIEW_MARGIN) shiftX += VIEW_MARGIN - (rect.left + shiftX);
    if (shiftX !== 0) {
      const curLeft = parseStylePx(popup.style.left, 0);
      popup.style.left = `${Math.round(curLeft + shiftX)}px`;
    }
  }

  function clampAllPopups() {
    document.querySelectorAll('[data-ts-pic-popup="1"][data-ts-pic-viewer-ready="1"]').forEach(clampPopupToViewport);
  }

  function scheduleClamp(popup) {
    requestAnimationFrame(() => {
      clampPopupToViewport(popup);
      requestAnimationFrame(() => clampPopupToViewport(popup));
    });
  }

  if (!window.__tsPicPopupClampBound) {
    window.__tsPicPopupClampBound = true;
    window.addEventListener('resize', () => clampAllPopups(), { passive: true });
    window.addEventListener('scroll', () => clampAllPopups(), { passive: true, capture: true });
  }

  function injectCss() {
    if (document.querySelector('style[data-ts-pic-viewer="1"]')) return;
    const style = document.createElement('style');
    style.dataset.tsPicViewer = '1';
    style.textContent = FS_CSS;
    document.head.appendChild(style);
  }

  function setFsActive(active) {
    window.__tsPicFsActive = !!active;
  }

  function mediaStage(popup) {
    const kids = [...popup.children].filter(
      (node) =>
        node.nodeType === 1 &&
        node.getAttribute('data-ts-pic-popup-tip') !== '1' &&
        node.dataset.tsPicViewerBar !== '1',
    );
    return kids.find((node) => node.querySelector('img,video')) || null;
  }

  function captionFromStage(stage, img) {
    const alt = String(img?.getAttribute('alt') || '').trim();
    if (alt) return alt;
    if (!stage) return '';
    const parts = [...stage.querySelectorAll('span,p,div')]
      .map((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t && t.length < 240);
    return parts[0] || '';
  }

  function removeOverlay() {
    if (fsEscapeHandler) {
      document.removeEventListener('keydown', fsEscapeHandler, true);
      fsEscapeHandler = null;
    }
    document.querySelectorAll('[data-ts-pic-fs-overlay="1"]').forEach((el) => el.remove());
  }

  function exitFullscreen(popup) {
    removeOverlay();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (popup) {
      popup.removeAttribute('data-ts-pic-fs-active');
      popup.style.width = popup.dataset.tsPicBaseWidth || '';
    }
    setFsActive(false);
  }

  function wirePinch(target) {
    if (!target || target.dataset.tsPicPinch === '1') return;
    target.dataset.tsPicPinch = '1';
    let scale = 1;
    let lastDist = 0;
    target.style.transformOrigin = 'center center';
    target.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          lastDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
        }
      },
      { passive: true },
    );
    target.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 2 || !lastDist) return;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const delta = dist / lastDist;
        lastDist = dist;
        scale = Math.min(4, Math.max(1, scale * delta));
        target.style.transform = `scale(${scale})`;
      },
      { passive: true },
    );
    target.addEventListener(
      'touchend',
      () => {
        if (scale <= 1.02) {
          scale = 1;
          target.style.transform = '';
        }
      },
      { passive: true },
    );
  }

  function mountFsOverlay(popup, stage, mediaEl) {
    removeOverlay();
    const img = mediaEl?.tagName === 'VIDEO' ? stage?.querySelector('video') || mediaEl : mediaEl;
    const caption = captionFromStage(stage, img);
    const overlay = document.createElement('div');
    overlay.dataset.tsPicFsOverlay = '1';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Full screen photo');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;flex-direction:column;align-items:stretch;justify-content:stretch;touch-action:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box';

    const stageWrap = document.createElement('div');
    stageWrap.dataset.tsPicFsStage = '1';
    stageWrap.style.cssText =
      'flex:1 1 auto;min-height:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:52px 8px 8px;box-sizing:border-box';

    const capReserve = caption ? 72 : 16;
    const boxW = Math.max(1, Math.round(window.innerWidth * 0.96));
    const boxH = Math.max(1, Math.round(window.innerHeight * 0.88 - capReserve));
    const isVideo = img?.tagName === 'VIDEO';
    const big = isVideo ? document.createElement('video') : document.createElement('img');
    big.dataset.tsPicFsImg = '1';
    if (isVideo) {
      big.src = img.currentSrc || img.getAttribute('src') || '';
      big.controls = true;
      big.playsInline = true;
      big.style.cssText = `display:block;width:${boxW}px;height:${boxH}px;max-width:96vw;max-height:calc(100vh - ${capReserve + 60}px);object-fit:contain;object-position:center center;touch-action:none;background:#000`;
    } else {
      big.src = img.currentSrc || img.getAttribute('src') || '';
      big.alt = img.getAttribute('alt') || '';
      big.style.cssText = `display:block;width:${boxW}px;height:${boxH}px;max-width:96vw;max-height:calc(100vh - ${capReserve + 60}px);object-fit:contain;object-position:center center;touch-action:none`;
      wirePinch(big);
    }
    stageWrap.appendChild(big);

    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.dataset.tsPicFsExit = '1';
    exitBtn.setAttribute('aria-label', 'Close full screen');
    exitBtn.innerHTML = FS_CLOSE_SVG;
    exitBtn.style.cssText =
      'position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:3;min-width:48px;min-height:48px;border-radius:999px;border:1px solid rgba(255,255,255,.4);background:rgba(15,23,42,.75);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0';
    exitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      exitFullscreen(popup);
    });

    overlay.appendChild(stageWrap);
    if (caption) {
      const cap = document.createElement('div');
      cap.dataset.tsPicFsCaption = '1';
      cap.textContent = caption;
      cap.style.cssText =
        'flex:0 0 auto;width:100%;box-sizing:border-box;padding:14px 16px max(18px,env(safe-area-inset-bottom));color:#f8fafc;font-size:14px;line-height:1.35;text-align:center;background:linear-gradient(180deg,transparent,rgba(0,0,0,.55) 24%,rgba(0,0,0,.72))';
      overlay.appendChild(cap);
    }
    overlay.appendChild(exitBtn);

    overlay.addEventListener(
      'click',
      (e) => {
        if (e.target === overlay || e.target === stageWrap) {
          e.preventDefault();
          exitFullscreen(popup);
        }
      },
      true,
    );

    fsEscapeHandler = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      exitFullscreen(popup);
    };
    document.addEventListener('keydown', fsEscapeHandler, true);

    document.body.appendChild(overlay);
    popup.dataset.tsPicFsActive = '1';
    setFsActive(true);
  }

  function enterFullscreen(popup, stage) {
    const img = stage?.querySelector('img,video');
    if (!img) return;
    mountFsOverlay(popup, stage, img);
  }

  function enhance(popup) {
    if (popup.dataset.tsPicViewerReady === '1') return;
    if (!popup.dataset.tsPicBaseWidth) {
      const measured = popup.getBoundingClientRect().width;
      const declared = parseStylePx(popup.style.width, 248);
      const basePx = measured > 0 && measured < 300 ? Math.round(measured) : declared > 0 && declared < 300 ? Math.round(declared) : 248;
      popup.dataset.tsPicBaseWidth = `${basePx}px`;
    }
    const stage = mediaStage(popup);
    if (!stage) return;
    popup.dataset.tsPicViewerReady = '1';
    scheduleClamp(popup);
    stage.dataset.tsPicStage = '1';
    stage.style.touchAction = 'pan-x pan-y pinch-zoom';
    const img = stage.querySelector('img');
    if (img) {
      img.style.objectFit = 'contain';
      img.style.width = 'auto';
      img.style.height = 'auto';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '220px';
      img.style.display = 'block';
      wirePinch(img);
    }

    const bar = document.createElement('div');
    bar.dataset.tsPicViewerBar = '1';
    bar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;justify-content:flex-end;align-items:center';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.dataset.tsPicPopupClose = '1';
    closeBtn.setAttribute('aria-label', 'Close photo viewer');
    closeBtn.innerHTML = FS_CLOSE_SVG;
    closeBtn.style.cssText = BTN_BASE;
    wireTapButton(closeBtn, () => {
      exitFullscreen(popup);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.dataset.tsPicFsBtn = '1';
    fsBtn.setAttribute('aria-label', 'Full screen');
    fsBtn.innerHTML = FS_EXPAND_SVG;
    fsBtn.style.cssText = BTN_BASE;
    wireTapButton(fsBtn, () => {
      if (window.__tsPicFsActive) exitFullscreen(popup);
      else enterFullscreen(popup, stage);
    });

    bar.appendChild(closeBtn);
    bar.appendChild(fsBtn);
    popup.insertBefore(bar, popup.firstChild);

    if (!popup.querySelector('[data-ts-pic-resize-handle="1"]')) {
      const handle = document.createElement('span');
      handle.dataset.tsPicResizeHandle = '1';
      handle.setAttribute('aria-hidden', 'true');
      handle.title = 'Resize';
      handle.style.cssText =
        'position:absolute;right:6px;bottom:6px;width:16px;height:16px;cursor:nwse-resize;z-index:2;border-right:2px solid #94a3b8;border-bottom:2px solid #94a3b8;box-sizing:border-box';
      popup.style.position = popup.style.position || 'absolute';
      popup.appendChild(handle);

      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const startX = e.clientX;
        const startW = popup.getBoundingClientRect().width;
        const onMove = (ev) => {
          const cap = window.innerWidth - VIEW_MARGIN * 2;
          const w = Math.min(cap, Math.max(200, startW + (ev.clientX - startX)));
          popup.style.width = `${Math.round(w)}px`;
          clampPopupToViewport(popup);
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }
  }

  function scan() {
    document.querySelectorAll('[data-ts-pic-popup="1"]:not([data-ts-pic-viewer-ready="1"])').forEach(enhance);
  }

  injectCss();
  scan();
  const root = document.body || document.documentElement;
  new MutationObserver(scan).observe(root, { childList: true, subtree: true });
  if (!document.body) {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        scan();
        new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
      },
      { once: true },
    );
  }
})();

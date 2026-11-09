(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;

  const FS_CSS = [
    '[data-ts-pic-fs-overlay="1"]{touch-action:none}',
    '[data-ts-pic-fs-overlay="1"] [data-ts-pic-fs-stage="1"]{flex:1 1 auto;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;box-sizing:border-box}',
    '[data-ts-pic-fs-overlay="1"] [data-ts-pic-fs-img="1"]{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;transform-origin:center center;will-change:transform;touch-action:none}',
    '[data-ts-pic-fs-caption="1"]{pointer-events:none}',
  ].join('');

  const BTN_BASE =
    'display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border-radius:10px;border:1px solid #d1d5db;background:#fff;color:#111827;font-size:16px;font-weight:600;line-height:1;cursor:pointer;padding:0 10px;box-shadow:0 1px 2px rgba(15,23,42,0.08)';

  const FS_EXPAND_SVG =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5"/></svg>';
  const FS_CLOSE_SVG =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  let fsEscapeHandler = null;

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

  function mountFsOverlay(popup, stage, img) {
    removeOverlay();
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

    const big = document.createElement('img');
    big.dataset.tsPicFsImg = '1';
    big.src = img.currentSrc || img.getAttribute('src') || '';
    big.alt = img.getAttribute('alt') || '';
    const capReserve = caption ? 72 : 16;
    const boxW = Math.max(1, Math.round(window.innerWidth * 0.96));
    const boxH = Math.max(1, Math.round(window.innerHeight * 0.88 - capReserve));
    big.style.cssText = `display:block;width:${boxW}px;height:${boxH}px;max-width:96vw;max-height:calc(100vh - ${capReserve + 60}px);object-fit:contain;object-position:center center;touch-action:none`;
    wirePinch(big);
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
    if (!img || img.tagName === 'VIDEO') {
      if (img?.tagName === 'VIDEO') mountFsOverlay(popup, stage, img);
      return;
    }
    mountFsOverlay(popup, stage, img);
  }

  function enhance(popup) {
    if (popup.dataset.tsPicViewerReady === '1') return;
    if (!popup.dataset.tsPicBaseWidth) {
      popup.dataset.tsPicBaseWidth = popup.style.width || '248px';
    }
    const stage = mediaStage(popup);
    if (!stage) return;
    popup.dataset.tsPicViewerReady = '1';
    stage.dataset.tsPicStage = '1';
    stage.style.touchAction = 'pan-x pan-y pinch-zoom';
    const img = stage.querySelector('img');
    if (img) wirePinch(img);

    const bar = document.createElement('div');
    bar.dataset.tsPicViewerBar = '1';
    bar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;justify-content:flex-end;align-items:center';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.dataset.tsPicPopupClose = '1';
    closeBtn.setAttribute('aria-label', 'Close photo viewer');
    closeBtn.innerHTML = FS_CLOSE_SVG;
    closeBtn.style.cssText = BTN_BASE;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      exitFullscreen(popup);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.dataset.tsPicFsBtn = '1';
    fsBtn.setAttribute('aria-label', 'Full screen');
    fsBtn.innerHTML = FS_EXPAND_SVG;
    fsBtn.style.cssText = BTN_BASE;
    fsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (window.__tsPicFsActive) exitFullscreen(popup);
      else enterFullscreen(popup, stage);
    });

    const sizeBtn = document.createElement('button');
    sizeBtn.type = 'button';
    sizeBtn.dataset.tsPicSizeToggle = '1';
    sizeBtn.setAttribute('aria-label', 'Toggle viewer size');
    sizeBtn.textContent = '⇲';
    sizeBtn.style.cssText = BTN_BASE;
    let enlarged = false;
    sizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      enlarged = !enlarged;
      popup.style.width = enlarged ? 'min(420px, 92vw)' : popup.dataset.tsPicBaseWidth || '248px';
    });

    bar.appendChild(closeBtn);
    bar.appendChild(sizeBtn);
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
          const w = Math.min(window.innerWidth * 0.92, Math.max(200, startW + (ev.clientX - startX)));
          popup.style.width = `${Math.round(w)}px`;
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

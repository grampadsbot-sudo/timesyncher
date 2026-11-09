(() => {
  const sharedMatch = location.pathname.match(/^\/shared\/([^/]+)/);
  if (!sharedMatch) return;

  const FS_CSS = [
    '[data-ts-pic-popup][data-ts-pic-fs-active="1"]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;left:0!important;bottom:0!important;border-radius:0!important;z-index:99998!important;display:flex!important;flex-direction:column!important;padding:12px!important;box-sizing:border-box!important}',
    '[data-ts-pic-popup]:fullscreen{width:100vw!important;height:100vh!important;max-width:none!important;border-radius:0!important}',
    '[data-ts-pic-fs-overlay="1"] img{transform-origin:center center;will-change:transform}',
  ].join('');

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
      (node) => node.nodeType === 1 && node.getAttribute('data-ts-pic-popup-tip') !== '1' && node.dataset.tsPicViewerBar !== '1',
    );
    return kids.find((node) => node.querySelector('img,video')) || null;
  }

  function removeOverlay() {
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

  function iosNoElementFs() {
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua);
  }

  function enterFullscreen(popup, stage) {
    const img = stage?.querySelector('img,video');
    if (!img) return;

    if (iosNoElementFs() || !popup.requestFullscreen) {
      removeOverlay();
      const overlay = document.createElement('div');
      overlay.dataset.tsPicFsOverlay = '1';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;align-items:center;justify-content:center;touch-action:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box';
      const big = document.createElement('img');
      big.src = img.currentSrc || img.getAttribute('src') || '';
      big.alt = img.getAttribute('alt') || '';
      big.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;touch-action:none';
      wirePinch(big);
      const exitBtn = document.createElement('button');
      exitBtn.type = 'button';
      exitBtn.dataset.tsPicFsExit = '1';
      exitBtn.setAttribute('aria-label', 'Exit full screen');
      exitBtn.textContent = '✕';
      exitBtn.style.cssText =
        'position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:2;width:44px;height:44px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(15,23,42,.72);color:#fff;font-size:18px;line-height:1;cursor:pointer';
      exitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        exitFullscreen(popup);
      });
      overlay.appendChild(big);
      overlay.appendChild(exitBtn);
      document.body.appendChild(overlay);
      popup.dataset.tsPicFsActive = '1';
      setFsActive(true);
      return;
    }

    popup.dataset.tsPicFsActive = '1';
    setFsActive(true);
    popup.requestFullscreen().catch(() => {
      popup.removeAttribute('data-ts-pic-fs-active');
      setFsActive(false);
      removeOverlay();
      const overlay = document.createElement('div');
      overlay.dataset.tsPicFsOverlay = '1';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;align-items:center;justify-content:center;touch-action:none';
      const big = document.createElement('img');
      big.src = img.currentSrc || img.getAttribute('src') || '';
      big.alt = img.getAttribute('alt') || '';
      big.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;touch-action:none';
      wirePinch(big);
      const exitBtn = document.createElement('button');
      exitBtn.type = 'button';
      exitBtn.dataset.tsPicFsExit = '1';
      exitBtn.setAttribute('aria-label', 'Exit full screen');
      exitBtn.textContent = '✕';
      exitBtn.style.cssText =
        'position:absolute;top:12px;right:12px;z-index:2;width:44px;height:44px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(15,23,42,.72);color:#fff;font-size:18px;line-height:1;cursor:pointer';
      exitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        exitFullscreen(popup);
      });
      overlay.appendChild(big);
      overlay.appendChild(exitBtn);
      document.body.appendChild(overlay);
      popup.dataset.tsPicFsActive = '1';
      setFsActive(true);
    });
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
    bar.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;justify-content:flex-end;align-items:center';

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.dataset.tsPicFsBtn = '1';
    fsBtn.setAttribute('aria-label', 'Full screen');
    fsBtn.textContent = '⛶';
    fsBtn.style.cssText =
      'width:32px;height:32px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;color:#111827;font-size:15px;line-height:1;cursor:pointer;padding:0';
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
    sizeBtn.style.cssText = fsBtn.style.cssText;
    let enlarged = false;
    sizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      enlarged = !enlarged;
      popup.style.width = enlarged ? 'min(420px, 92vw)' : popup.dataset.tsPicBaseWidth || '248px';
    });

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

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && popup.dataset.tsPicFsActive === '1' && !document.querySelector('[data-ts-pic-fs-overlay="1"]')) {
        popup.removeAttribute('data-ts-pic-fs-active');
        setFsActive(false);
      }
    });
  }

  function scan() {
    document.querySelectorAll('[data-ts-pic-popup="1"]:not([data-ts-pic-viewer-ready="1"])').forEach(enhance);
  }

  injectCss();
  scan();
  const root = document.body || document.documentElement;
  new MutationObserver(scan).observe(root, { childList: true, subtree: true });
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", () => {
      scan();
      new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  }
})();

/**
 * Synthetic pages and the 10/3 staging probe boxes.
 * Probe source: chat at 390 had header width 479 and textarea bottom 881
 * on a 844px viewport. Shared at 390 painted Open navigation and Settings.
 */

export function box(x, y, w, h, extra = {}) {
  return {
    x,
    y,
    w,
    h,
    right: x + w,
    bottom: y + h,
    paints: true,
    ...extra,
  };
}

function base(viewport, extra) {
  return {
    viewport,
    scrollWidth: viewport.width,
    scrollHeight: viewport.height,
    specMissing: false,
    hasSite: false,
    wider: [],
    extra: [],
    hiddenPainting: [],
    emptyWhite: [],
    textboxes: [],
    tabs: [],
    regions: {},
    ...extra,
  };
}

export function correctApp0() {
  const viewport = { width: 390, height: 844 };
  const composer = box(58, 787, 230, 42);
  const measurement = base(viewport, {
    kind: 'app',
    state: 'app-0-vacations',
    regions: {
      messages: box(0, 0, 390, 772),
      composer,
      fileAdd: box(8, 787, 42, 42),
      speak: box(340, 787, 42, 42),
    },
    textboxes: [composer],
  });
  return measurement;
}

export function correctApp0Html() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; }
    button, textarea { padding: 0; border: 0; }
    #messages { position: absolute; left: 0; top: 0; width: 390px; height: 772px; }
    #composer { position: absolute; left: 0; top: 772px; width: 390px; height: 72px; margin: 0; background: #fff; }
    #attachButton, #voiceButton, #messageText { position: absolute; top: 15px; height: 42px; margin: 0; }
    #attachButton { left: 8px; width: 42px; }
    #messageText { left: 58px; width: 230px; }
    #voiceButton { left: 340px; width: 42px; }
  </style>
</head>
<body>
  <main>
    <section id="messages">Hello</section>
    <form id="composer">
      <button id="attachButton" type="button" aria-label="Add vacation files">+</button>
      <textarea id="messageText" aria-label="Message TimeSyncher Vacation"></textarea>
      <button id="voiceButton" type="button" aria-label="Speak a message">mic</button>
    </form>
  </main>
</body>
</html>`;
}

export function p0Offscreen() {
  const viewport = { width: 390, height: 844 };
  const composer = box(60, 839, 303, 42);
  return base(viewport, {
    kind: 'app',
    state: 'app-1-with-site',
    hasSite: true,
    scrollWidth: 479,
    scrollHeight: 881,
    regions: {
      header: box(0, 0, 479, 109),
      logo: box(12, 12, 34, 34),
      messages: box(0, 455, 479, 365),
      composer,
      fileAdd: box(8, 828, 42, 42),
      speak: box(370, 828, 42, 42),
      site: box(0, 109, 479, 336),
      slider: box(0, 445, 479, 10),
    },
    textboxes: [composer],
    wider: [{ id: 'header', right: 479, w: 479 }],
    extra: [{ tag: 'HEADER', id: 'header' }],
    hiddenPainting: [{ id: 'hiddenNav' }],
    emptyWhite: [{ id: 'whiteBox' }],
  });
}

export function p0OffscreenHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; background: #fff; }
    button, textarea { padding: 0; border: 0; font: inherit; }
    .app { height: 100vh; overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
    header.topbar { width: 479px; height: 109px; background: #fff; }
    header.topbar img { width: 34px; height: 34px; }
    #messages { min-height: 0; overflow: auto; }
    #composer { position: relative; height: 0; }
    #attachButton, #voiceButton, #messageText { position: absolute; }
    #attachButton { left: 8px; top: 8px; width: 42px; height: 42px; }
    #messageText { left: 60px; top: 19px; width: 303px; height: 42px; }
    #voiceButton { left: 370px; top: 8px; width: 42px; height: 42px; }
    #hiddenNav { display: block !important; position: fixed; left: 12px; top: 200px; width: 240px; height: 120px; background: #fff; }
    #whiteBox { position: fixed; left: 20px; top: 360px; width: 200px; height: 80px; background: #fff; }
    #footerLogo { position: absolute; left: 100px; top: 400px; width: 80px; height: 40px; }
  </style>
</head>
<body>
  <main class="app">
    <header class="topbar" id="header"><img alt="TimeSyncher" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></header>
    <div id="messages">conversation</div>
    <form id="composer">
      <button id="attachButton" type="button" aria-label="Add vacation files">+</button>
      <textarea id="messageText" aria-label="Message TimeSyncher Vacation"></textarea>
      <button id="voiceButton" type="button" aria-label="Speak a message">mic</button>
    </form>
    <div id="hiddenNav" hidden></div>
    <div id="whiteBox"></div>
    <img id="footerLogo" alt="TimeSyncher" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
  </main>
</body>
</html>`;
}

/** Boxes copied from the 10/3 chat-390 probe. Textarea bottom is 839+42. */
export function probeChat390() {
  const viewport = { width: 390, height: 844 };
  const composer = box(60, 839, 303, 42);
  return base(viewport, {
    kind: 'app',
    state: 'app-1-with-site',
    hasSite: true,
    scrollWidth: 479,
    scrollHeight: 881,
    regions: {
      header: box(0, 0, 479, 109),
      messages: box(0, 455, 479, 365),
      composer,
      site: box(0, 109, 390, 336),
      slider: box(0, 445, 390, 10),
    },
    textboxes: [composer],
    wider: [{ id: 'header', right: 479, w: 479 }],
  });
}

/** Boxes copied from the 10/3 shared-390 probe. */
export function probeShared390() {
  const viewport = { width: 390, height: 844 };
  return base(viewport, {
    kind: 'trip',
    state: 'trip',
    scrollHeight: 844,
    regions: {
      openNav: box(153, 794, 135, 38),
      settings: box(296, 794, 82, 38),
    },
    tabRequired: false,
  });
}

export function correctTrip() {
  const viewport = { width: 390, height: 844 };
  const tab = box(8, 64, 120, 36);
  const icon = box(16, 72, 20, 20);
  return base(viewport, {
    kind: 'trip',
    state: 'day-by-day',
    scrollHeight: 844,
    regions: {
      header: box(0, 0, 390, 56),
      logo: box(12, 12, 32, 32),
      footer: box(0, 812, 390, 32, { docBottom: 844 }),
    },
    tabs: [{ name: 'Day-by-Day', box: tab, iconBox: icon }],
    tabRequired: true,
  });
}

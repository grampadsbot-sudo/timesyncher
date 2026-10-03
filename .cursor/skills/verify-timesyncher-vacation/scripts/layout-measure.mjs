import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

export const VIEWPORTS = [
  { id: '390', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { id: '1280', width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

export function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

export async function launchBrowser() {
  const executablePath = chromePath();
  if (!executablePath) throw new Error('Chromium is not installed');
  const puppeteer = loadPuppeteer();
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

export async function applyViewport(page, viewport) {
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
}

export async function measurePage(page, request) {
  return page.evaluate(measureInPage, request);
}

export async function measureHtml(browser, html, viewport, request) {
  const page = await browser.newPage();
  try {
    await applyViewport(page, viewport);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await applyViewport(page, viewport);
    return await measurePage(page, request);
  } finally {
    await page.close();
  }
}

function measureInPage(request) {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const scrolling = document.scrollingElement || document.documentElement;
  const eps = 0.5;

  function readBox(el) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const opacity = Number(style.opacity);
    const paints = style.display !== 'none'
      && style.visibility !== 'hidden'
      && opacity > 0
      && rect.width >= 0.5
      && rect.height >= 0.5;
    return {
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      docTop: rect.top + window.scrollY,
      docBottom: rect.bottom + window.scrollY,
      paints,
      display: style.display,
      visibility: style.visibility,
      opacity,
    };
  }

  function intersects(box) {
    return box.bottom > 0 && box.right > 0 && box.y < viewport.height && box.x < viewport.width;
  }

  function visible(el) {
    const box = readBox(el);
    return box && box.paints ? box : null;
  }

  function accName(el) {
    return (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
  }

  function flatText(el) {
    return (el.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function matchesLabel(el, label) {
    const aria = accName(el);
    const text = flatText(el);
    if (aria === label || text === label) return true;
    return text.endsWith(label) && text.length <= label.length + 3;
  }

  function namedButton(names) {
    return [...document.querySelectorAll('button, [role="button"]')].find((el) => names.includes(accName(el) || flatText(el))) || null;
  }

  const banner = document.querySelector('h1')?.parentElement || null;
  const header = document.querySelector('header.topbar') || document.querySelector('header') || banner;
  const composer = document.querySelector('textarea#messageText');
  const fileAdd = document.querySelector('#attachButton');
  const speak = document.querySelector('#voiceButton');
  const messages = document.querySelector('#messages');
  const site = document.querySelector('.site-pane iframe, iframe#siteFrame, iframe[title$="website"]');
  const slider = document.querySelector('#splitter');
  const dropdown = document.querySelector('#tripButton, [aria-haspopup="listbox"]');
  const footer = document.querySelector('footer[data-build-stamp="1"], footer');
  const logo = header ? header.querySelector('img, svg') : null;
  const openNav = [...document.querySelectorAll('button')].find((el) => {
    const name = accName(el) || flatText(el);
    return name === 'Open navigation' || name === 'Close navigation';
  }) || null;
  const settings = [...document.querySelectorAll('button')].find((el) => (accName(el) || flatText(el)) === 'Settings') || null;
  const signupForm = document.querySelector('input[name="firstName"]')?.closest('form') || null;
  const fullscreen = document.querySelector('#fullscreenButton') || namedButton(['Full screen', 'Enter full screen']);
  const fullscreenExit = document.querySelector('#exitFullscreenButton') || namedButton(['Exit full screen', 'Close full screen']);

  const textboxes = [...document.querySelectorAll('textarea')].filter((el) => {
    const box = readBox(el);
    return box && box.paints;
  });
  const form = document.querySelector('#composer');
  const allowedControls = new Set([composer, fileAdd, speak].filter(Boolean));

  function shell(el) {
    if (el === document.documentElement || el === document.body || el.tagName === 'MAIN') return true;
    return el.id === 'workspace' || el.classList.contains('chat-pane') || el.classList.contains('site-pane') || el.classList.contains('workspace');
  }

  function allowed(el) {
    if (shell(el)) return true;
    if (request.kind !== 'app') return true;
    if (messages && request.showMessages && (el === messages || messages.contains(el))) return true;
    if (site && request.hasSite && (el === site || site.contains(el))) return true;
    if (site && request.hasSite && site.parentElement && el === site.parentElement) return true;
    if (slider && request.hasSite && request.state !== 'website-full-screen' && (el === slider || slider.contains(el))) return true;
    if (fullscreen && request.state !== 'website-full-screen' && (el === fullscreen || fullscreen.contains(el))) return true;
    if (fullscreenExit && request.state === 'website-full-screen' && (el === fullscreenExit || fullscreenExit.contains(el))) return true;
    if (form && (el === form || form.contains(el))) {
      if (allowedControls.has(el) || [...allowedControls].some((control) => control.contains(el))) return true;
      if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'IMG') return false;
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      const paintedBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const border = ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(style[`border${side}Width`]) > 0);
      return !paintedBg && !border;
    }
    if (request.state === 'app-2-plus' && header && el === header) return true;
    if (request.state === 'app-2-plus' && dropdown) {
      const menu = dropdown.closest('#tripMenu') || dropdown;
      if (el === menu || menu.contains(el)) return true;
    }
    return false;
  }

  const extra = [];
  const hiddenPainting = [];
  const emptyWhite = [];
  const wider = [];
  if (request.kind === 'app') {
    for (const el of document.querySelectorAll('body *')) {
      const box = readBox(el);
      if (!box) continue;
      if (box.paints && intersects(box) && box.right > viewport.width + eps) {
        wider.push({ tag: el.tagName, id: el.id || '', right: box.right, w: box.w });
      }
      if (el.hasAttribute('hidden') && box.paints && intersects(box)) hiddenPainting.push({ tag: el.tagName, id: el.id || '' });
      if (!box.paints || !intersects(box) || allowed(el)) continue;
      const style = window.getComputedStyle(el);
      const directText = [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
      const notable = ['HEADER', 'FOOTER', 'IMG', 'BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'NAV'].includes(el.tagName) || directText;
      if (notable) extra.push({ tag: el.tagName, id: el.id || '', name: (accName(el) || el.getAttribute('alt') || '').slice(0, 80) });
      const white = style.backgroundColor === 'rgb(255, 255, 255)';
      const empty = !(el.innerText || '').trim() && !el.querySelector('img, svg, canvas, iframe');
      if ((style.position === 'fixed' || style.position === 'absolute') && white && empty && box.w >= 80 && box.h >= 40) {
        emptyWhite.push({ tag: el.tagName, id: el.id || '' });
      }
    }
  }

  const tabs = [];
  if (request.kind === 'trip' && request.tabLabel) {
    const button = [...document.querySelectorAll('button, [role="tab"]')].find((el) => matchesLabel(el, request.tabLabel));
    let iconBox = null;
    if (button) {
      const icon = button.querySelector('[data-ts-logo-chip], svg, img');
      if (icon) iconBox = readBox(icon);
    }
    tabs.push({ name: request.tabLabel, box: button ? readBox(button) : null, iconBox });
  }

  const logoBox = visible(logo);
  return {
    viewport,
    scrollWidth: scrolling.scrollWidth,
    scrollHeight: scrolling.scrollHeight,
    kind: request.kind,
    state: request.state,
    hasSite: Boolean(request.hasSite),
    specMissing: Boolean(request.specMissing),
    tabRequired: Boolean(request.tabLabel),
    regions: {
      header: header ? readBox(header) : null,
      logo: logoBox,
      fullscreen: visible(fullscreen),
      fullscreenExit: visible(fullscreenExit),
      dropdown: visible(dropdown),
      messages: visible(messages),
      composer: visible(composer),
      fileAdd: visible(fileAdd),
      speak: visible(speak),
      site: visible(site),
      slider: visible(slider),
      footer: footer ? readBox(footer) : null,
      openNav: visible(openNav),
      settings: visible(settings),
      signupForm: visible(signupForm),
    },
    textboxes: textboxes.map((el) => readBox(el)),
    wider,
    extra: extra.slice(0, 40),
    hiddenPainting,
    emptyWhite,
    tabs,
    strayLogos: [...document.querySelectorAll('img, svg')].flatMap((img) => {
      const box = readBox(img);
      if (!box || !box.paints || !intersects(box)) return [];
      if (header && header.contains(img)) return [];
      if (footer && footer.contains(img)) return [];
      if (img.closest('[data-ts-logo-chip], button, [role="tab"]')) return [];
      const style = window.getComputedStyle(img);
      const floated = style.position === 'absolute' || style.position === 'fixed';
      if (!floated) return [];
      if (box.w >= 200 && box.h >= 200) return [];
      let node = img;
      while (node && node !== document.body) {
        const cls = typeof node.className === 'string' ? node.className : (node.className && node.className.baseVal) || '';
        if (String(cls).includes('leaflet')) return [];
        node = node.parentElement;
      }
      return [{ id: img.id || '', tag: img.tagName, x: box.x, y: box.y, w: box.w, h: box.h }];
    }),
  };
}

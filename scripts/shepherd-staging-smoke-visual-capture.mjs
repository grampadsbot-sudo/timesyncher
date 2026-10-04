import { LAYOUT_VIEWPORTS } from './shepherd-staging-smoke-layout-eval.mjs';
import {
  layoutFactsForPrompt,
  probeSiteFullscreenControl,
  runLayoutDomEval,
} from './shepherd-staging-smoke-layout-dom.mjs';
import {
  formatComposerSendDomContextForJudge,
  readComposerSendButtonDomContext,
} from './shepherd-staging-smoke-composer-send-dom.mjs';
import {
  clickSharedTabByKeyword,
  gotoAndHydrateSharedIntakePage,
} from './shepherd-staging-smoke-shared-ui.mjs';

const VISUAL_TAB_SETTLE_MS = 400;

const SHARED_VISUAL_TAB_LABELS = [
  'Day-by-Day',
  'Flights',
  'Hotels',
  'Cars',
  'Restaurants',
  'Stores',
  'The Rest',
  'Budget',
];

async function captureLayoutDomForShot(page, pageKind) {
  const layoutDom = await runLayoutDomEval(page, pageKind);
  if (pageKind === 'chat') {
    const fs = await probeSiteFullscreenControl(page);
    if (fs && !fs.skipped && fs.pass === false) {
      layoutDom.pass = false;
      layoutDom.failures = layoutDom.failures || [];
      layoutDom.failures.push({
        selector: '.site-pane',
        rule: 'site_fullscreen_control',
        detail: fs.detail,
        rects: {},
      });
    }
  }
  layoutDom.layoutDomFacts = layoutFactsForPrompt(layoutDom);
  return layoutDom;
}

async function waitForChatAppReady(page) {
  await page.waitForFunction(() => {
    const ta = document.querySelector('#messageText, textarea[name="message"]');
    const msg = document.querySelector('#messages');
    return Boolean(ta && msg);
  }, { timeout: 90000 });
}

async function listSharedTripTabs(page) {
  return page.evaluate((labels) => {
    function normalize(text) {
      return String(text || '')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }
    function hasTab(label) {
      const want = normalize(label);
      return Array.from(document.querySelectorAll('button, [role="tab"]')).some((node) => {
        const combined = normalize(node.textContent);
        return combined === want || combined.includes(want);
      });
    }
    return labels.filter(hasTab).map((label) => ({
      label,
      keyword: normalize(label).split(/[\s-]+/)[0] || normalize(label),
    }));
  }, SHARED_VISUAL_TAB_LABELS);
}

async function clickSharedTabByLabel(page, label) {
  return page.evaluate((lbl) => {
    function normalize(text) {
      return String(text || '')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }
    const want = normalize(lbl);
    const button = Array.from(document.querySelectorAll('button, [role="tab"]')).find((node) => {
      const combined = normalize(node.textContent);
      return combined === want || combined.includes(want);
    });
    if (!button) return false;
    button.click();
    return true;
  }, label);
}

function slug(s) {
  return String(s || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48).toLowerCase() || 'tab';
}

function shotPath(artifactDir, stateId, pageKey, widthLabel) {
  return `${artifactDir}/${stateId}-${pageKey}-${widthLabel}.png`;
}

async function captureComposerClip(page, outPath) {
  const handle = await page.$('form#composer, form.composer#composer, #composer');
  if (!handle) return false;
  try {
    await handle.screenshot({ path: outPath });
    return true;
  } finally {
    await handle.dispose();
  }
}

export async function captureVisualStateScreenshots({
  page,
  states,
  artifactDir,
  setStage,
  stageTimestamps,
}) {
  const shots = [];
  const composerShots = [];
  const stamp = (key) => {
    if (stageTimestamps) stageTimestamps[key] = Date.now();
  };
  const stateList = Object.values(states || {});
  for (const state of stateList) {
    for (const viewport of LAYOUT_VIEWPORTS) {
      stamp(`${state.id}_${viewport.label}_start`);
      setStage?.(`visual ${state.id} viewport ${viewport.label}`);
      await page.setViewport({ width: viewport.width, height: viewport.height });
      setStage?.(`visual ${state.id} chat ${viewport.label}`);
      await page.goto(state.chatUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitForChatAppReady(page);
      const layoutDom = await captureLayoutDomForShot(page, 'chat');
      const chatFile = shotPath(artifactDir, state.id, 'chat', viewport.label);
      await page.screenshot({ path: chatFile });
      const composerFile = shotPath(artifactDir, state.id, 'composer', viewport.label);
      const composerCaptured = await captureComposerClip(page, composerFile);
      const sendDom = composerCaptured ? await readComposerSendButtonDomContext(page) : null;
      const sendButtonDomContext = formatComposerSendDomContextForJudge(sendDom);
      if (composerCaptured) {
        composerShots.push({ stateId: state.id, viewport: viewport.label, path: composerFile });
      }
      const judgeComposer = ['390', '1280'].includes(viewport.label) && composerCaptured;
      shots.push({
        id: `${state.id}-chat-${viewport.label}`,
        stateId: state.id,
        pageKind: 'chat',
        tabLabel: '',
        screenLabel: `${state.id} composer ${viewport.label}`,
        viewport,
        path: chatFile,
        composerPath: composerCaptured ? composerFile : null,
        judgeComposer,
        layoutDom,
        layoutDomFacts: layoutDom.layoutDomFacts,
        sendButtonDomContext,
        sendDom,
      });
      if (state.id === 'v1site' && state.sharedUrl) {
        setStage?.(`visual ${state.id} shared hydrate ${viewport.label}`);
        stamp(`${state.id}_shared_${viewport.label}_start`);
        const hydrated = await gotoAndHydrateSharedIntakePage(page, state.sharedUrl);
        stamp(`${state.id}_shared_${viewport.label}_end`);
        if (hydrated.hydrationError) {
          const failFile = shotPath(artifactDir, state.id, 'shared-hydration-fail', viewport.label);
          await page.screenshot({ path: failFile, fullPage: true });
          shots.push({
            id: `${state.id}-shared-hydration-${viewport.label}`,
            stateId: state.id,
            pageKind: 'shared',
            tabLabel: 'hydration',
            screenLabel: `${state.id} shared hydration ${viewport.label}`,
            viewport,
            path: failFile,
            hydrationError: hydrated.hydrationError,
            layoutDom: { pass: false, failures: [{ rule: 'hydration', selector: 'shared', detail: hydrated.hydrationError }] },
            layoutDomFacts: layoutFactsForPrompt({ pass: false, failures: [{ rule: 'hydration', selector: 'shared', detail: hydrated.hydrationError }] }),
          });
        } else {
          const tabs = await listSharedTripTabs(page);
          for (const tab of tabs) {
            setStage?.(`visual ${state.id} site tab ${tab.label} ${viewport.label}`);
            const clicked = await clickSharedTabByLabel(page, tab.label);
            if (!clicked) await clickSharedTabByKeyword(page, tab.keyword);
            await new Promise((r) => setTimeout(r, VISUAL_TAB_SETTLE_MS));
            const layoutDom = await captureLayoutDomForShot(page, 'shared');
            const tabKey = `site-${slug(tab.label)}`;
            const tabFile = shotPath(artifactDir, state.id, tabKey, viewport.label);
            await page.screenshot({ path: tabFile, fullPage: true });
            shots.push({
              id: `${state.id}-${tabKey}-${viewport.label}`,
              stateId: state.id,
              pageKind: 'shared',
              tabLabel: tab.label,
              screenLabel: `${state.id} site/${tab.label} ${viewport.label}`,
              viewport,
              path: tabFile,
              layoutDom,
              layoutDomFacts: layoutDom.layoutDomFacts,
            });
          }
        }
      }
      stamp(`${state.id}_${viewport.label}_end`);
    }
  }
  return { shots, composerShots };
}

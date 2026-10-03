import { LAYOUT_VIEWPORTS } from './shepherd-staging-smoke-layout-eval.mjs';
import {
  clickSharedTabByKeyword,
  gotoAndHydrateSharedIntakePage,
} from './shepherd-staging-smoke-shared-ui-map.mjs';

export const VISUAL_TAB_SETTLE_MS = 400;

async function waitForChatAppReady(page) {
  await page.waitForFunction(() => {
    const ta = document.querySelector('#messageText, textarea[name="message"]');
    const msg = document.querySelector('#messages');
    return Boolean(ta && msg && msg.children.length >= 1);
  }, { timeout: 90000 });
}

export const SHARED_VISUAL_TAB_LABELS = [
  'Day-by-Day',
  'Flights',
  'Hotels',
  'Cars',
  'Restaurants',
  'Stores',
  'The Rest',
  'Budget',
];

export async function listSharedTripTabs(page) {
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
      norm: normalize(label),
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

export async function captureVisualScreenshots({
  page,
  chatUrl,
  sharedUrl,
  artifactDir,
  expectSha,
  setStage,
  stageTimestamps,
}) {
  const shots = [];
  const stamp = (key) => {
    if (stageTimestamps) stageTimestamps[key] = Date.now();
  };
  for (const viewport of LAYOUT_VIEWPORTS) {
    stamp(`viewport_${viewport.label}_start`);
    setStage?.(`visual capture viewport ${viewport.label}`);
    await page.setViewport({ width: viewport.width, height: viewport.height });
    for (const pageKind of ['chat', 'shared']) {
      const url = pageKind === 'chat' ? chatUrl : sharedUrl;
      if (!url) {
        shots.push({
          id: `${pageKind}-${viewport.label}-missing-url`,
          pageKind,
          tabLabel: '',
          screenLabel: `${pageKind} ${viewport.label}`,
          viewport,
          path: '',
          missing: true,
        });
        continue;
      }
      if (pageKind === 'chat') {
        setStage?.(`visual chat ${viewport.label}`);
        await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await waitForChatAppReady(page);
        const file = `${artifactDir}/${expectSha}-visual-chat-${viewport.label}.png`;
        await page.screenshot({ path: file, fullPage: true });
        shots.push({
          id: `chat-${viewport.label}`,
          pageKind: 'chat',
          tabLabel: '',
          screenLabel: `chat ${viewport.label}`,
          viewport,
          path: file,
        });
      } else {
        setStage?.(`visual shared hydrate ${viewport.label}`);
        stamp(`shared_hydrate_${viewport.label}_start`);
        const hydrated = await gotoAndHydrateSharedIntakePage(page, sharedUrl);
        stamp(`shared_hydrate_${viewport.label}_end`);
        if (hydrated.hydrationError) {
          const file = `${artifactDir}/${expectSha}-visual-shared-hydration-fail-${viewport.label}.png`;
          await page.screenshot({ path: file, fullPage: true });
          shots.push({
            id: `shared-${viewport.label}-hydration`,
            pageKind: 'shared',
            tabLabel: 'hydration',
            screenLabel: `shared hydration ${viewport.label}`,
            viewport,
            path: file,
            hydrationError: hydrated.hydrationError,
          });
          continue;
        }
        const tabs = await listSharedTripTabs(page);
        if (!tabs.length) {
          const file = `${artifactDir}/${expectSha}-visual-shared-notabs-${viewport.label}.png`;
          await page.screenshot({ path: file, fullPage: true });
          shots.push({
            id: `shared-${viewport.label}-notabs`,
            pageKind: 'shared',
            tabLabel: 'none',
            screenLabel: `shared no tabs ${viewport.label}`,
            viewport,
            path: file,
          });
          continue;
        }
        for (const tab of tabs) {
          setStage?.(`visual shared tab ${tab.label} ${viewport.label}`);
          stamp(`tab_${slug(tab.label)}_${viewport.label}_click_start`);
          const clicked = await clickSharedTabByLabel(page, tab.label);
          if (!clicked) {
            await clickSharedTabByKeyword(page, tab.keyword);
          }
          await new Promise((r) => setTimeout(r, VISUAL_TAB_SETTLE_MS));
          stamp(`tab_${slug(tab.label)}_${viewport.label}_click_end`);
          const file = `${artifactDir}/${expectSha}-visual-shared-${slug(tab.label)}-${viewport.label}.png`;
          await page.screenshot({ path: file, fullPage: true });
          shots.push({
            id: `shared-${slug(tab.label)}-${viewport.label}`,
            pageKind: 'shared',
            tabLabel: tab.label,
            screenLabel: `shared/${tab.label} ${viewport.label}`,
            viewport,
            path: file,
          });
        }
      }
    }
    stamp(`viewport_${viewport.label}_end`);
  }
  return shots;
}

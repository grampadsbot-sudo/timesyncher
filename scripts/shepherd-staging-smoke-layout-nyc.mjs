/** LAYOUT-NYC: staging shared tabs vs NYC reference screenshots (harness-only). */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPENROUTER_CHAT_COMPLETIONS_URL } from './vacation-app-reply-rules.mjs';
import { parseVisualJudgeResponseText, VISUAL_JUDGE_MODEL } from './shepherd-staging-smoke-visual-judge.mjs';
import { clickSharedTabByKeyword } from './shepherd-staging-smoke-shared-ui.mjs';
import { LOGO_TAB_SETTLE_MS, stitchLogoChipCropsPng } from './shepherd-staging-smoke-logo-metrics.mjs';
import { LAYOUT_VIEWPORTS } from './shepherd-staging-smoke-layout-eval.mjs';
import { EVALUATE_THING_CARD_TAB_DOM_SOURCE } from './shepherd-staging-smoke-thing-card-dom.mjs';
import { playwrightEvaluateReturnScript } from './shepherd-staging-smoke-page-eval.mjs';

export const LAYOUT_NYC_TAB_ORDER = [
  'day-by-day', 'flights', 'hotels', 'cars', 'restaurants', 'stores', 'events', 'budget',
];

const EVALUATE_LAYOUT_NYC_DOM_SOURCE = `(() => {
  const __card = ${EVALUATE_THING_CARD_TAB_DOM_SOURCE};
  const slug = (raw) => {
    const n = String(raw || '').replace(/\\p{Extended_Pictographic}/gu, '').replace(/\\s+/g, ' ').trim().toLowerCase().replace(/day by day/, 'day-by-day');
    if (n.includes('day-by-day')) return 'day-by-day';
    if (n.includes('flight')) return 'flights';
    if (n.includes('hotel')) return 'hotels';
    if (n.includes('car')) return 'cars';
    if (n.includes('restaurant')) return 'restaurants';
    if (n.includes('store')) return 'stores';
    if (n.includes('event')) return 'events';
    if (n.includes('budget')) return 'budget';
    return null;
  };
  return {
    summarizeLayoutNyc() {
      const card = __card.evaluateThingCardTabDom();
      const live = document.querySelector('[data-shared-live-tab]');
      const rowEls = live ? [...live.querySelectorAll('li[data-list-row="1"], li[data-has-logo="1"]')] : [];
      const tabOrder = [];
      for (const node of document.querySelectorAll('button,[role="tab"],a,[data-tab],[data-ts-tab]')) {
        const st = getComputedStyle(node);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
        const r = node.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const s = slug([node.textContent, node.getAttribute('title'), node.getAttribute('data-tab')].join(' '));
        if (s && !tabOrder.includes(s)) tabOrder.push(s);
      }
      const headerEl = document.querySelector('[data-ts-shared-header],[data-shared-trip-header],header h1,.shared-trip h1');
      const hr = headerEl?.getBoundingClientRect();
      let rowsNameLeft = true;
      for (const li of rowEls) {
        const strong = li.querySelector('strong');
        if (!strong) { rowsNameLeft = false; break; }
        const sr = strong.getBoundingClientRect();
        const lr = li.getBoundingClientRect();
        if (sr.left > lr.left + lr.width * 0.45) rowsNameLeft = false;
      }
      const vw = window.innerWidth;
      return {
        tabOrder,
        sortPills: card.sortControls || [],
        columnSortLabels: card.columnSortLabels || {},
        filterTags: card.filterTags || [],
        rowCount: card.rows?.length || 0,
        rowsNameLeft,
        header: { present: Boolean(hr && hr.height > 4 && hr.width > 20) },
        horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: vw,
      };
    },
  };
})()`;

const LAYOUT_NYC_DOM_PREFIX = `const __layoutNycDom = ${EVALUATE_LAYOUT_NYC_DOM_SOURCE};`;
const LIST_SORT_TABS = new Set(['flights', 'hotels', 'cars']);

const LAYOUT_NYC_REFERENCE_DEFECTS = {
  hotels: { '390': [{ code: 'horizontal_overflow', detail: 'NYC Hotels rows clipped on the right at 390px' }] },
};

export function defaultLayoutNycReferenceDir() {
  return fileURLToPath(new URL('./fixtures/nyc-final-reference', import.meta.url));
}

export function layoutNycReferenceDir(env = process.env) {
  const raw = String(env.NYC_REFERENCE_DIR || env.TSV_NYC_REFERENCE_DIR || '').trim();
  const candidate = raw || defaultLayoutNycReferenceDir();
  return existsSync(candidate) ? candidate : null;
}

function layoutNycReferenceImagePath(dir, tab, viewportLabel) {
  const base = String(tab || '').toLowerCase();
  const vp = String(viewportLabel || '');
  for (const p of [join(dir, `${base}-${vp}.png`), join(dir, 'nyc-all', `${base}-${vp}.png`)]) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function layoutNycReferenceDefects(tab, viewportLabel) {
  return LAYOUT_NYC_REFERENCE_DEFECTS[tab]?.[viewportLabel] || [];
}

export function gradeLayoutNycReferenceMissing(refDir) {
  if (refDir) return null;
  return {
    pass: false,
    status: 'reference_missing',
    failures: [{ rule: 'LAYOUT-NYC', code: 'reference_missing', detail: 'reference_missing' }],
  };
}

function failLayoutNyc(failures, tab, viewport, detail) {
  failures.push({ rule: 'LAYOUT-NYC', tab, viewport, detail });
}

export function gradeLayoutNycStagingDom(summary = {}, { tab, viewport } = {}) {
  const failures = [];
  const tabKey = String(tab || '').toLowerCase();
  const vp = String(viewport || '');
  if (Array.isArray(summary.tabOrder) && summary.tabOrder.length >= 4
    && summary.tabOrder.join('\0') !== LAYOUT_NYC_TAB_ORDER.join('\0')) {
    failLayoutNyc(failures, tabKey, vp, `tab pill order mismatch: [${summary.tabOrder.join(', ')}]`);
  }
  if (LIST_SORT_TABS.has(tabKey) && (summary.rowCount || 0) >= 1) {
    const pills = summary.sortPills || [];
    const hasName = pills.some((p) => /^name\b/i.test(String(p)));
    const hasPrice = pills.some((p) => /^price\b/i.test(String(p)));
    if (!hasName || !hasPrice) {
      failLayoutNyc(failures, tabKey, vp, 'missing Name/Price sort buttons above list');
    }
    if (summary.columnSortLabels?.name || summary.columnSortLabels?.price) {
      failLayoutNyc(failures, tabKey, vp, 'staging must use sort buttons, not clickable column labels');
    }
  }
  if ((summary.rowCount || 0) > 0 && summary.rowsNameLeft === false) {
    failLayoutNyc(failures, tabKey, vp, 'list rows must place name on the left');
  }
  if (!summary.header?.present) failLayoutNyc(failures, tabKey, vp, 'header block missing or not visible');
  if (vp === '390' && summary.horizontalOverflow) {
    failLayoutNyc(failures, tabKey, vp, `staging horizontal_overflow scrollWidth=${summary.scrollWidth} innerWidth=${summary.innerWidth}`);
  }
  return { pass: failures.length === 0, failures, nycReferenceDefects: layoutNycReferenceDefects(tabKey, vp) };
}

export function reconcileLayoutNycJudgeVerdict(verdict = {}, { tab, viewport, stagingDom } = {}) {
  const kept = [];
  const expectedDiffs = [];
  const nycDefects = layoutNycReferenceDefects(tab, viewport);
  const stagingHasSortButtons = () => {
    const pills = stagingDom?.sortPills || [];
    return pills.some((p) => /^name\b/i.test(String(p))) && pills.some((p) => /^price\b/i.test(String(p)));
  };
  for (const f of verdict.failures || []) {
    const reason = String(f.reason || f.detail || '');
    const lower = reason.toLowerCase();
    if (/nyc.*pill|reference.*pill|left.*pill|sort pill|sort button/.test(lower) && stagingHasSortButtons()) {
      expectedDiffs.push({ kind: 'nyc_sort_buttons_layout', reason });
    } else if (nycDefects.some((d) => d.code === 'horizontal_overflow') && /nyc.*overflow|left.*clip|reference.*horizontal/.test(lower)) {
      expectedDiffs.push({ kind: 'nyc_horizontal_overflow', reason });
    } else if (/column label|label.*sort|header.*sort/.test(lower) && (stagingDom?.columnSortLabels?.name || stagingDom?.columnSortLabels?.price)) {
      kept.push({ rule: 'LAYOUT-NYC', detail: reason });
    } else if (/missing.*sort|sort button|name.*price.*button/.test(lower) && LIST_SORT_TABS.has(String(tab || '').toLowerCase())) {
      const pills = stagingDom?.sortPills || [];
      const hasName = pills.some((p) => /^name\b/i.test(String(p)));
      const hasPrice = pills.some((p) => /^price\b/i.test(String(p)));
      if (!hasName || !hasPrice) kept.push({ rule: 'LAYOUT-NYC', detail: reason });
    } else if (reason) kept.push({ rule: 'LAYOUT-NYC', rubricItem: f.rubricItem, detail: reason });
  }
  if (LIST_SORT_TABS.has(String(tab || '').toLowerCase())) {
    const pills = stagingDom?.sortPills || [];
    const hasName = pills.some((p) => /^name\b/i.test(String(p)));
    const hasPrice = pills.some((p) => /^price\b/i.test(String(p)));
    if (!hasName || !hasPrice) {
      kept.push({ rule: 'LAYOUT-NYC', detail: 'missing Name/Price sort buttons above list' });
    }
    if (stagingDom?.columnSortLabels?.name || stagingDom?.columnSortLabels?.price) {
      kept.push({ rule: 'LAYOUT-NYC', detail: 'staging must use sort buttons, not clickable column labels' });
    }
  }
  return { pass: kept.length === 0, failures: kept, expectedDifferences: expectedDiffs, nycReferenceDefects: nycDefects };
}

async function judgeLayoutNycPair({ comparePath, tab, viewport, stagingDom, apiKey, fetchImpl = fetch }) {
  const key = String(apiKey || '').trim();
  if (!key) return { pass: false, failures: [{ rubricItem: 'harness', reason: 'OPENROUTER_API_KEY missing' }] };
  const nycDefects = layoutNycReferenceDefects(tab, viewport);
  const prompt = `Side-by-side PNG LEFT=NYC reference RIGHT=staging. Judge layout/structure only; ignore text and logos.
EXPECTED: Both NYC and staging use Name/Price sort buttons above list (not clickable column header labels). Sort button placement differences vs NYC are not failures.
NYC known defects (do not match): ${JSON.stringify(nycDefects)}. Staging must not overflow at 390.
FAIL missing sort buttons on Flights/Hotels/Cars, clickable column-label sort on staging, bad tab order, header/row layout mismatch, staging overflow.
Return JSON {pass:boolean,failures:[{rubricItem,reason}]}.
DOM: pills=${JSON.stringify(stagingDom?.sortPills || [])} labels=${JSON.stringify(stagingDom?.columnSortLabels || {})} overflow=${Boolean(stagingDom?.horizontalOverflow)} tab=${tab} vp=${viewport}`;
  const pngB64 = readFileSync(comparePath).toString('base64');
  const res = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://vacation-staging.timesyncher.com',
      'X-Title': 'Shepherd LAYOUT-NYC Judge',
    },
    body: JSON.stringify({
      model: VISUAL_JUDGE_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/png;base64,${pngB64}` } }] }],
    }),
  });
  const raw = await res.text();
  if (!res.ok) return { pass: false, failures: [{ rubricItem: 'harness', reason: `OpenRouter HTTP ${res.status}` }] };
  const outer = JSON.parse(raw);
  const content = outer?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : JSON.stringify(content || '');
  try {
    return reconcileLayoutNycJudgeVerdict(parseVisualJudgeResponseText(text), { tab, viewport, stagingDom });
  } catch (err) {
    return { pass: false, failures: [{ rubricItem: 'harness', reason: `judge parse: ${String(err?.message || err)}` }] };
  }
}

async function runLayoutNycForViewport({ page, viewport, artifactPath, setStage, refDir, apiKey = process.env.OPENROUTER_API_KEY }) {
  const missing = gradeLayoutNycReferenceMissing(refDir);
  if (missing) return { pass: false, viewport: viewport.label, probes: [], ...missing };
  await page.setViewport({ width: viewport.width, height: viewport.height });
  await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
  const probes = [];
  let pass = true;
  for (const tab of LAYOUT_NYC_TAB_ORDER) {
    setStage?.(`layout-nyc ${tab} @ ${viewport.label}`);
    if (!await clickSharedTabByKeyword(page, tab)) {
      probes.push({ tab, viewport: viewport.label, pass: false, failures: [{ rule: 'LAYOUT-NYC', detail: `could not activate tab ${tab}` }] });
      pass = false;
      continue;
    }
    await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
    const stagingDom = await page.evaluate(playwrightEvaluateReturnScript(LAYOUT_NYC_DOM_PREFIX, '__layoutNycDom.summarizeLayoutNyc()'));
    const domGrade = gradeLayoutNycStagingDom(stagingDom, { tab, viewport: viewport.label });
    const refPath = layoutNycReferenceImagePath(refDir, tab, viewport.label);
    if (!refPath) {
      probes.push({ tab, viewport: viewport.label, pass: false, failures: [{ rule: 'LAYOUT-NYC', code: 'reference_missing', detail: `missing reference shot for ${tab}-${viewport.label}` }], stagingDom });
      pass = false;
      continue;
    }
    const stagingShot = artifactPath(`layout-nyc-staging-${tab}-${viewport.label}.png`);
    const comparePath = artifactPath(`layout-nyc-compare-${tab}-${viewport.label}.png`);
    const panel = await page.$('[data-shared-live-tab], .logo-list, [data-trip-directory]');
    if (panel) await panel.screenshot({ path: stagingShot, type: 'png' });
    else await page.screenshot({ path: stagingShot, fullPage: false });
    if (panel) await panel.dispose();
    await stitchLogoChipCropsPng([readFileSync(refPath), readFileSync(stagingShot)], comparePath);
    const judge = await judgeLayoutNycPair({ comparePath, tab, viewport: viewport.label, stagingDom, apiKey });
    const rowPass = domGrade.pass && judge.pass;
    if (!rowPass) pass = false;
    probes.push({
      tab, viewport: viewport.label, pass: rowPass,
      failures: [...domGrade.failures, ...(judge.pass ? [] : judge.failures)],
      stagingDom, comparePath, stagingShot, referencePath: refPath,
      expectedDifferences: judge.expectedDifferences || [], nycReferenceDefects: domGrade.nycReferenceDefects,
    });
  }
  return { pass, viewport: viewport.label, referenceDir: refDir, probes };
}

export async function runLayoutNycHarnessBlock({ page, sharedUrl, artifactPath, setStage }) {
  if (!sharedUrl) return null;
  const refDir = layoutNycReferenceDir();
  const missing = gradeLayoutNycReferenceMissing(refDir);
  if (missing) return { pass: false, referenceDir: null, viewports: [missing] };
  const viewports = [];
  let pass = true;
  for (const viewport of LAYOUT_VIEWPORTS) {
    const row = await runLayoutNycForViewport({ page, viewport, artifactPath, setStage, refDir });
    viewports.push(row);
    if (!row.pass) pass = false;
  }
  return { pass, referenceDir: refDir, viewports };
}

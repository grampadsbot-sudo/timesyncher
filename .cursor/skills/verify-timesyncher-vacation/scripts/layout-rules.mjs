/**
 * Geometry pass/fail for one measured screen. Numbers only.
 * Screen copy is not a pass criterion. The vision judge reads the screen spec.
 */

export function toleranceMap(table) {
  const out = {};
  for (const row of table || []) out[row.id] = row.value;
  return out;
}

export function exitCode(rows) {
  return rows.some((row) => (row.layout !== 'PASS' && row.layout !== 'GAP') || (row.judge !== 'PASS' && row.judge !== 'GAP')) ? 1 : 0;
}

export function judgeColumn(result) {
  if (!result || result.ok !== true) return 'FAIL';
  return result.verdict === 'yes' ? 'PASS' : 'FAIL';
}

export function renderVerify(rows) {
  const lines = [
    '# VERIFY',
    '',
    '| feature | sub-feature | viewport | layout | judge | screenshot |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(`| ${cell(row.feature)} | ${cell(row.sub)} | ${cell(row.viewport)} | ${cell(row.layout)} | ${cell(row.judge)} | ${cell(row.screenshot)} |`);
  }
  lines.push('', '## Notes', '');
  for (const row of rows) {
    const reasons = row.reasons || [];
    if (!reasons.length) continue;
    lines.push(`- ${row.feature} / ${row.sub} / ${row.viewport}: ${reasons.join('; ')}`);
  }
  if (!rows.some((row) => (row.reasons || []).length)) lines.push('- none');
  lines.push('');
  return lines.join('\n');
}

function cell(value) {
  return String(value ?? '').replace(/\|/g, '/');
}

function fail(reasons, code) {
  if (!reasons.includes(code)) reasons.push(code);
}

function measured(box) {
  return Boolean(box && box.paints !== false && Number(box.w) > 0 && Number(box.h) > 0);
}

function rightOf(box) {
  return Number.isFinite(box.right) ? box.right : box.x + box.w;
}

function bottomOf(box) {
  return Number.isFinite(box.bottom) ? box.bottom : box.y + box.h;
}

function insideViewport(box, viewport, eps) {
  if (!box) return false;
  return box.x >= -eps && box.y >= -eps && rightOf(box) <= viewport.width + eps && bottomOf(box) <= viewport.height + eps;
}

function requireBox(reasons, box, code) {
  if (!measured(box)) {
    fail(reasons, code);
    return false;
  }
  return true;
}

function widthChecks(reasons, measurement, eps) {
  const viewport = measurement.viewport;
  if (Number(measurement.scrollWidth) > viewport.width + eps) fail(reasons, 'scroll-wider-than-viewport');
  for (const item of measurement.wider || []) {
    if (Number(item.right ?? item.w) > viewport.width + eps) fail(reasons, 'element-wider-than-viewport');
  }
}

function composerChecks(reasons, measurement, limits) {
  const box = measurement.regions?.composer;
  const viewport = measurement.viewport;
  const eps = limits.edgeEpsilonPx;
  if (!requireBox(reasons, box, 'composer-unmeasured')) return;
  if (bottomOf(box) > viewport.height + eps) fail(reasons, 'composer-below-viewport');
  else if (bottomOf(box) < viewport.height - limits.composerBottomSlackPx - eps) fail(reasons, 'composer-not-pinned');
  if (rightOf(box) > viewport.width + eps || box.x < -eps) fail(reasons, 'composer-outside-viewport');
  if (!insideViewport(measurement.regions.fileAdd, viewport, eps)) {
    if (!measured(measurement.regions.fileAdd)) fail(reasons, 'file-add-unmeasured');
    else fail(reasons, 'file-add-outside-viewport');
  }
  if (!insideViewport(measurement.regions.speak, viewport, eps)) {
    if (!measured(measurement.regions.speak)) fail(reasons, 'speak-unmeasured');
    else fail(reasons, 'speak-outside-viewport');
  }
  const send = measurement.regions?.send;
  if (!insideViewport(send, viewport, eps)) {
    if (!measured(send)) fail(reasons, 'send-unmeasured');
    else fail(reasons, 'send-outside-viewport');
  } else if (send.tappable !== true) fail(reasons, 'send-not-tappable');
  const form = measurement.regions?.composerForm;
  if (requireBox(reasons, form, 'composer-form-unmeasured')) {
    if (measured(measurement.regions.fileAdd) && !insideOuter(measurement.regions.fileAdd, form, eps)) {
      fail(reasons, 'file-add-outside-composer');
    }
    if (measured(measurement.regions.speak) && !insideOuter(measurement.regions.speak, form, eps)) {
      fail(reasons, 'speak-outside-composer');
    }
    if (measured(send) && !insideOuter(send, form, eps)) fail(reasons, 'send-outside-composer');
  }
  if (measurement.composerMoved) fail(reasons, 'composer-moved');
  const boxes = measurement.textboxes || [];
  if (boxes.length !== 1) fail(reasons, 'second-textbox');
}

function headerHidden(reasons, measurement, limits) {
  const header = measurement.regions?.header;
  const eps = limits.edgeEpsilonPx;
  const limit = Number.isFinite(limits.fullscreenFillPx) ? limits.fullscreenFillPx : eps;
  if (header && (header.paints || Number(header.h) > limit)) fail(reasons, 'header-renders');
  if (header && (header.w > measurement.viewport.width + eps || rightOf(header) > measurement.viewport.width + eps)) {
    fail(reasons, 'header-wider-than-viewport');
  }
}

function shellBrand(reasons, measurement) {
  if (measured(measurement.regions?.logo)) fail(reasons, 'logo-paints');
  if ((measurement.strayLogos || []).length) fail(reasons, 'logo-paints');
}

function insideOuter(inner, outer, eps) {
  return measured(inner) && measured(outer)
    && inner.x >= outer.x - eps
    && inner.y >= outer.y - eps
    && rightOf(inner) <= rightOf(outer) + eps
    && bottomOf(inner) <= bottomOf(outer) + eps;
}

function fillsViewport(box, viewport, limit) {
  return box.x <= limit
    && box.y <= limit
    && rightOf(box) >= viewport.width - limit
    && bottomOf(box) >= viewport.height - limit
    && rightOf(box) <= viewport.width + limit
    && bottomOf(box) <= viewport.height + limit;
}

function conversationEndsAbove(reasons, measurement, limits) {
  const messages = measurement.regions?.messages;
  const composer = measurement.regions?.composer;
  if (!requireBox(reasons, messages, 'messages-unmeasured')) return;
  if (!measured(composer)) return;
  if (bottomOf(messages) > composer.y + limits.stackGapPx) fail(reasons, 'messages-below-composer');
}

function conversationAtTop(reasons, measurement, limits) {
  const messages = measurement.regions?.messages;
  if (!measured(messages)) return;
  if (messages.y > limits.edgeEpsilonPx) fail(reasons, 'content-not-at-top');
}

function absentMiddle(reasons, measurement) {
  if (measured(measurement.regions?.site)) fail(reasons, 'site-paints');
  if (measured(measurement.regions?.slider)) fail(reasons, 'slider-paints');
  if (measured(measurement.regions?.fullscreen)) fail(reasons, 'fullscreen-control-paints');
}

function siteAndSlider(reasons, measurement, limits) {
  const site = measurement.regions?.site;
  const slider = measurement.regions?.slider;
  const composer = measurement.regions?.composer;
  const gap = limits.stackGapPx;
  if (!requireBox(reasons, site, 'site-unmeasured')) return;
  if (!requireBox(reasons, slider, 'slider-unmeasured')) return;
  if (site.y > gap) fail(reasons, 'site-not-on-top');
  if (bottomOf(site) > slider.y + gap) fail(reasons, 'slider-not-middle');
  if (measured(composer) && bottomOf(slider) > composer.y + gap) fail(reasons, 'slider-not-middle');
}

function dropdownOnly(reasons, measurement, limits) {
  const dropdown = measurement.regions?.dropdown;
  if (!requireBox(reasons, dropdown, 'dropdown-unmeasured')) return;
  if (measured(measurement.regions?.logo)) fail(reasons, 'dropdown-not-only-header');
  const header = measurement.regions?.header;
  if (measured(header)) {
    const eps = limits.edgeEpsilonPx;
    const inside = dropdown.x >= header.x - eps
      && rightOf(dropdown) <= rightOf(header) + eps
      && dropdown.y >= header.y - eps
      && bottomOf(dropdown) <= bottomOf(header) + eps;
    if (!inside) fail(reasons, 'dropdown-not-only-header');
  }
}

function forbiddenChrome(reasons, measurement) {
  if (measured(measurement.regions?.openNav)) fail(reasons, 'open-nav-paints');
  if (measured(measurement.regions?.settings)) fail(reasons, 'settings-paints');
  if ((measurement.hiddenPainting || []).length) fail(reasons, 'hidden-paints');
  if ((measurement.emptyWhite || []).length) fail(reasons, 'empty-white-box');
  for (const item of measurement.extra || []) {
    fail(reasons, `extra-painted:${item.tag || 'el'}${item.id ? '#' + item.id : ''}`);
  }
}

function fullscreenControl(reasons, measurement, limits) {
  const control = measurement.regions?.fullscreen;
  const site = measurement.regions?.site;
  const eps = limits.edgeEpsilonPx;
  if (!requireBox(reasons, control, 'fullscreen-control-unmeasured')) return;
  if (!measured(site)) return;
  const centerX = control.x + control.w / 2;
  const centerY = control.y + control.h / 2;
  const inside = centerX >= site.x - eps && centerX <= rightOf(site) + eps
    && centerY >= site.y - eps && centerY <= bottomOf(site) + eps;
  if (!inside) fail(reasons, 'fullscreen-control-outside-site');
}

function fullscreenState(reasons, measurement, limits) {
  const limit = Number.isFinite(limits.fullscreenFillPx) ? limits.fullscreenFillPx : limits.edgeEpsilonPx;
  widthChecks(reasons, measurement, limits.edgeEpsilonPx);
  forbiddenChrome(reasons, measurement);
  shellBrand(reasons, measurement);
  headerHidden(reasons, measurement, limits);
  const site = measurement.regions?.site;
  if (!measured(site)) fail(reasons, 'fullscreen-site-unmeasured');
  else if (!fillsViewport(site, measurement.viewport, limit)) fail(reasons, 'fullscreen-not-filled');
  if (!measured(measurement.regions?.fullscreenExit)) fail(reasons, 'fullscreen-exit-unmeasured');
  if (measured(measurement.regions?.composer) || measured(measurement.regions?.slider) || measured(measurement.regions?.messages) || measured(measurement.regions?.dropdown) || measured(measurement.regions?.send) || (measurement.textboxes || []).length) {
    fail(reasons, 'fullscreen-chrome-paints');
  }
}

function appRules(reasons, measurement, limits) {
  const state = measurement.state;
  if (state === 'website-full-screen') {
    fullscreenState(reasons, measurement, limits);
    return;
  }
  composerChecks(reasons, measurement, limits);
  widthChecks(reasons, measurement, limits.edgeEpsilonPx);
  forbiddenChrome(reasons, measurement);
  shellBrand(reasons, measurement);
  if (state === 'app-2-plus') dropdownOnly(reasons, measurement, limits);
  else headerHidden(reasons, measurement, limits);
  if (state === 'app-0-vacations' || state === 'app-1-no-site') {
    conversationAtTop(reasons, measurement, limits);
    conversationEndsAbove(reasons, measurement, limits);
    absentMiddle(reasons, measurement);
  } else if (state === 'app-2-plus' && !measurement.hasSite) {
    conversationEndsAbove(reasons, measurement, limits);
  }
  if (state === 'app-1-with-site' || (state === 'app-2-plus' && measurement.hasSite)) {
    siteAndSlider(reasons, measurement, limits);
    fullscreenControl(reasons, measurement, limits);
  }
}

function tripRules(reasons, measurement, limits) {
  const eps = limits.edgeEpsilonPx;
  widthChecks(reasons, measurement, eps);
  if (measured(measurement.regions?.openNav)) fail(reasons, 'open-nav-paints');
  if (measured(measurement.regions?.settings)) fail(reasons, 'settings-paints');
  if ((measurement.hiddenPainting || []).length) fail(reasons, 'hidden-paints');
  if ((measurement.emptyWhite || []).length) fail(reasons, 'empty-white-box');
  shellBrand(reasons, measurement);
  if (measured(measurement.regions?.footer)) fail(reasons, 'footer-paints');
  for (const tab of measurement.tabs || []) {
    if (!measured(tab.box)) {
      fail(reasons, 'tab-unmeasured');
      continue;
    }
    if (!measured(tab.iconBox)) {
      fail(reasons, 'tab-icon-unmeasured');
      continue;
    }
    const iconCenter = tab.iconBox.y + tab.iconBox.h / 2;
    const tabCenter = tab.box.y + tab.box.h / 2;
    if (Math.abs(iconCenter - tabCenter) > limits.iconCenterPx) fail(reasons, 'tab-icon-off-center');
  }
  if (measurement.tabRequired && !(measurement.tabs || []).some((tab) => measured(tab.box))) {
    fail(reasons, 'tab-unmeasured');
  }
}

function signupRules(reasons, measurement, limits) {
  widthChecks(reasons, measurement, limits.edgeEpsilonPx);
  const header = measurement.regions?.header;
  if (measured(header) && header.y > limits.headerTopPx) fail(reasons, 'header-not-at-top');
  if (measured(header) && rightOf(header) > measurement.viewport.width + limits.edgeEpsilonPx) {
    fail(reasons, 'header-wider-than-viewport');
  }
  if (!measured(measurement.regions?.signupForm)) fail(reasons, 'signup-form-unmeasured');
}

export function evaluateLayout(measurement, tolerances) {
  const limits = toleranceMap(tolerances?.table || tolerances);
  const reasons = [];
  if (measurement.specMissing) fail(reasons, 'spec-missing');
  if (measurement.kind === 'app') appRules(reasons, measurement, limits);
  else if (measurement.kind === 'trip') tripRules(reasons, measurement, limits);
  else if (measurement.kind === 'signup') signupRules(reasons, measurement, limits);
  else fail(reasons, 'screen-unmeasured');
  return { layout: reasons.length ? 'FAIL' : 'PASS', reasons };
}

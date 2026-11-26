import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const PW_PREFIX = '/tmp/pw';
const PW_BROWSERS_PATH = '/tmp/pw-browsers-chromium';
const PW_PLAYWRIGHT_VERSION = '1.65.0';

function tryRequirePlaywright(candidate) {
  if (candidate.includes('node_modules') && !existsSync(path.join(candidate, 'package.json'))) {
    return null;
  }
  try {
    return require(candidate);
  } catch {
    return null;
  }
}

function bootstrapPlaywrightForCi() {
  const bundled = path.join(PW_PREFIX, 'node_modules/playwright');
  const pkgInstall = spawnSync('npm', ['install', '--prefix', PW_PREFIX, `playwright@${PW_PLAYWRIGHT_VERSION}`], {
    stdio: 'inherit',
  });
  if (pkgInstall.status !== 0) {
    throw new Error(`playwright npm install failed (status ${pkgInstall.status ?? 'null'})`);
  }
  if (!existsSync(bundled)) {
    throw new Error(`playwright missing after install at ${bundled}`);
  }
  const browserInstall = spawnSync(
    process.execPath,
    [path.join(bundled, 'cli.js'), 'install', 'chromium'],
    { stdio: 'inherit' },
  );
  if (browserInstall.status !== 0) {
    throw new Error(`playwright chromium install failed (status ${browserInstall.status ?? 'null'})`);
  }
  return require(bundled);
}

function chromiumBinaryReady(mod) {
  try {
    const chromePath = mod.chromium.executablePath();
    if (!existsSync(chromePath)) return false;
    const chromeFolder = path.basename(path.dirname(path.dirname(chromePath)));
    const browsersRoot = path.dirname(path.dirname(path.dirname(chromePath)));
    const shellDir = chromeFolder.replace(/^chromium-/, 'chromium_headless_shell-');
    const shellExe = path.join(browsersRoot, shellDir, 'chrome-headless-shell-linux64/chrome-headless-shell');
    return existsSync(shellExe);
  } catch {
    return false;
  }
}

export function loadVkAdminPlaywright() {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= PW_BROWSERS_PATH;
  for (const candidate of [
    path.join(PW_PREFIX, 'node_modules/playwright'),
    'playwright',
    'playwright-core',
    path.join(ROOT, 'node_modules/playwright'),
    path.join(os.homedir(), 'tsv-dispatch/capture/node_modules/playwright'),
    path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'),
  ]) {
    const mod = tryRequirePlaywright(candidate);
    if (!mod?.chromium) continue;
    if (chromiumBinaryReady(mod)) return mod;
  }
  return bootstrapPlaywrightForCi();
}

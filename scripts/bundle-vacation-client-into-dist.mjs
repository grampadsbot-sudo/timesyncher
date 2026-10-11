import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSha, visibleBuildFooter } from '../routes/version.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const clientRoot = resolve(root, 'apps/vacation-client');

function vacationClientBuildReady() {
  return existsSync(resolve(clientRoot, 'node_modules', '@vitejs', 'plugin-react', 'package.json'));
}

function installVacationClientDeps() {
  execFileSync('npm', ['ci', '--include=dev'], {
    cwd: clientRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });
}

function resolveBuildSha() {
  let sha = buildSha();
  if (/^[0-9a-f]{7,}$/.test(sha)) return sha;
  try {
    sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  } catch {
    sha = '';
  }
  if (/^[0-9a-f]{7,}$/.test(sha)) return sha;
  return '0'.repeat(40);
}

function stampVacationClientHtml(html) {
  const sha = resolveBuildSha();
  const footer = visibleBuildFooter(sha);
  const meta = `<meta name="timesyncher-build" content="${sha}">`;
  const stampStyle =
    '<style id="timesyncher-build-stamp-style">footer[data-build-stamp="1"]{position:fixed;bottom:0;left:0;right:0;z-index:10000;margin:0;padding:3px 8px;font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;background:rgba(12,12,12,.78);color:rgba(255,255,255,.9);pointer-events:none;}body{padding-bottom:24px!important;box-sizing:border-box;}</style>';
  let next = html;
  if (!next.includes('timesyncher-build-stamp-style') && !next.includes('data-build-stamp')) {
    next = next.replace(/<head[^>]*>/i, (open) => `${open}${stampStyle}`);
  }
  if (!next.includes('name="timesyncher-build"')) {
    next = next.replace(/<head[^>]*>/i, (open) => `${open}${meta}`);
  }
  if (!next.includes('<footer data-build-stamp="1">')) {
    next = /<\/body>/i.test(next) ? next.replace(/<\/body>/i, `${footer}</body>`) : `${next}${footer}`;
  }
  return next;
}

export async function bundleVacationClientIntoDist(outDir) {
  if (!vacationClientBuildReady()) {
    installVacationClientDeps();
  }
  execFileSync('npm', ['run', 'build'], {
    cwd: clientRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });

  const clientDist = resolve(clientRoot, 'dist');
  const htmlPath = resolve(clientDist, 'vacation-app-next.html');
  let html = await readFile(htmlPath, 'utf8');
  html = stampVacationClientHtml(html);
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'vacation-app-next.html'), html, 'utf8');

  const assetsDir = resolve(clientDist, 'assets');
  const assetNames = await readdir(assetsDir);
  await mkdir(resolve(outDir, 'assets'), { recursive: true });
  for (const name of assetNames) {
    if (name.startsWith('vacation-app-next-')) {
      await cp(resolve(assetsDir, name), resolve(outDir, 'assets', name));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await bundleVacationClientIntoDist(resolve(root, 'dist'));
}

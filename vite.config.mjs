import { defineConfig } from 'vite';
import { appendFile, copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildSha, visibleBuildFooter } from './routes/version.mjs';
import { writeSharedAssets } from './scripts/write-shared-assets.mjs';

function serveSharedApp(req, _res, next) {
  const url = req.url || '';
  const query = url.indexOf('?');
  const path = query === -1 ? url : url.slice(0, query);
  const search = query === -1 ? '' : url.slice(query);
  if (path === '/shared' || path === '/shared/') req.url = `/vacation-app.html${search}`;
  else if (path === '/edit-access' || path === '/edit-access/') req.url = `/shared-app.html${search}`;
  else if (path.startsWith('/shared/')) req.url = `/shared-app.html${search}`;
  next();
}

function buildStampMeta() {
  const sha = buildSha();
  visibleBuildFooter(sha);
  return `<meta name="timesyncher-build" content="${sha}">`;
}

function stampHtml(html) {
  const sha = buildSha();
  const footer = visibleBuildFooter(sha);
  const meta = `<meta name="timesyncher-build" content="${sha}">`;
  let next = html;
  if (!next.includes('name="timesyncher-build"')) {
    next = next.replace(/<head[^>]*>/i, (open) => `${open}${meta}`);
  }
  if (!next.includes('data-build-stamp="1"')) {
    next = /<\/body>/i.test(next) ? next.replace(/<\/body>/i, `${footer}</body>`) : `${next}${footer}`;
  }
  return next;
}

async function copyEulaMarkdown(outDir) {
  const from = resolve(__dirname, 'src/onboarding/eula-markdown.mjs');
  const to = resolve(outDir, 'src/onboarding/eula-markdown.mjs');
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
}

async function stampServedScript(file) {
  const body = await readFile(file, 'utf8');
  if (body.includes('name="timesyncher-build"')) return;
  await appendFile(file, `\n/* ${buildStampMeta()} */\n`);
}

export default defineConfig({
  plugins: [
    {
      name: 'timesyncher-shared-assets',
      async buildStart() {
        await writeSharedAssets();
      },
      configureServer(server) {
        server.middlewares.use(serveSharedApp);
      },
      configurePreviewServer(server) {
        server.middlewares.use(serveSharedApp);
      },
      transformIndexHtml(html) {
        return stampHtml(html);
      },
      async closeBundle() {
        const outDir = resolve(__dirname, 'dist');
        await copyEulaMarkdown(outDir);
        await stampServedScript(resolve(outDir, 'src/onboarding/eula-markdown.mjs'));
        await stampServedScript(resolve(outDir, 'assets/index-BKun7ofk.js'));
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
        support: resolve(__dirname, 'support.html'),
        login: resolve(__dirname, 'login.html'),
        orderTest: resolve(__dirname, 'order-test.html'),
        addonsCheckout: resolve(__dirname, 'addons-checkout.html'),
        ownerMediaCheckout: resolve(__dirname, 'owner-media-checkout.html'),
        accessCheckout: resolve(__dirname, 'access-checkout.html'),
        orderSuccess: resolve(__dirname, 'order-success.html'),
        adminOnboardings: resolve(__dirname, 'admin-onboardings.html'),
        openclawAdmin: resolve(__dirname, 'openclaw-admin.html'),
        itinerary: resolve(__dirname, 'itinerary.html'),
        vacationApp: resolve(__dirname, 'vacation-app.html'),
        sharedApp: resolve(__dirname, 'shared-app.html'),
        onboardingEula: resolve(__dirname, 'onboarding-eula.html'),
      },
    },
  },
});

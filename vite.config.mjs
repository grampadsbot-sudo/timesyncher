import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { writeSharedAssets } from './scripts/write-shared-assets.mjs';

function serveSharedApp(req, _res, next) {
  const url = req.url || '';
  const query = url.indexOf('?');
  const path = query === -1 ? url : url.slice(0, query);
  const search = query === -1 ? '' : url.slice(query);
  if (path === '/shared' || path.startsWith('/shared/')) req.url = `/shared-app.html${search}`;
  next();
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

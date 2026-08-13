import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
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
        orderSuccess: resolve(__dirname, 'order-success.html'),
        adminOnboardings: resolve(__dirname, 'admin-onboardings.html'),
        openclawAdmin: resolve(__dirname, 'openclaw-admin.html'),
        itinerary: resolve(__dirname, 'itinerary.html'),
        onboardingEula: resolve(__dirname, 'onboarding-eula.html'),
      },
    },
  },
});

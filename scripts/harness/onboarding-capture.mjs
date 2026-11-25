import fs from 'node:fs';
import path from 'node:path';
import { chromeHits } from './chrome.mjs';
import { purchaseEmail } from '../../src/vacation/email.mjs';
import { resolvePlaywright } from './live-outputs.mjs';
import { buildCustomerPdf } from './onboarding-pdf.mjs';
import { assertCouponCode, isNonCouponPayment } from './coupon.mjs';
import {
  ONBOARDING_ENGINE,
  ONBOARDING_SCREENS,
  ONBOARDING_WIDTHS,
  assessOnboardingScreens,
  assertOnboardingCustomer,
  refusedOnboardingTarget,
  shotBlank,
} from './onboarding-screens.mjs';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

export function purchaseEmailSurface(contact, sessionToken, origin = '') {
  if (typeof purchaseEmail !== 'function') return { html: '', launchUrl: '', gap: 'purchase-email: no email surface' };
  try {
    const mail = purchaseEmail({
      contact,
      sessionToken,
      token: sessionToken,
      ...(origin ? { env: { ...process.env, TIMESYNCHER_SITE_BASE_URL: origin } } : {}),
    });
    const html = String(mail?.htmlBody || '');
    const launchUrl = String(mail?.launchUrl || '');
    if (!html || !launchUrl) return { html: '', launchUrl: '', gap: 'purchase-email: no email surface' };
    return { html, launchUrl, gap: '' };
  } catch (error) {
    const code = error?.code || 'no email surface';
    return { html: '', launchUrl: '', gap: `purchase-email: ${code}` };
  }
}

function publicDetail(error) {
  return String(error?.message || error || 'missing').replace(/session=[^&\s]+/gi, 'session=[redacted]').replace(/payment_intent=[^&\s]+/gi, 'payment_intent=[redacted]').slice(0, 240);
}

function shotPath(dir, id, width) {
  return path.join(dir, `${id}-${ONBOARDING_ENGINE}-${width}.png`);
}

async function shoot(page, dir, id, width, readText) {
  const file = shotPath(dir, id, width);
  await page.screenshot({ path: file });
  const text = await readText(page);
  const hits = chromeHits(text);
  if (hits.length) return { id, width, file, gap: `stub-chrome: ${hits[0]}` };
  const bytes = fs.readFileSync(file);
  if (shotBlank(bytes)) return { id, width, file, blank: true, gap: `blank ${id} ${width}` };
  return { id, width, file, blank: false, gap: '' };
}

function fillMissing(shots, width, id, gap) {
  const start = ONBOARDING_SCREENS.findIndex((screen) => screen.id === id);
  for (const screen of ONBOARDING_SCREENS.slice(Math.max(0, start))) {
    if (shots.some((shot) => shot.id === screen.id && shot.width === width)) continue;
    shots.push({
      id: screen.id,
      width,
      missing: true,
      gap: screen.id === id ? gap : `missing ${screen.id} ${width}`,
    });
  }
}

function responseUrl(response) {
  return String(response?.url?.() || '');
}

export function checkoutPaymentIsTestMode({ configOk = false, config = {}, pay = {} } = {}) {
  const key = String(config?.publishableKey || '');
  if (!configOk || config?.ok !== true || !key.startsWith('pk_test_')) return false;
  return pay?.livemode === false;
}

export async function showPaymentStep(page) {
  const waits = typeof page.waitForResponse === 'function';
  const configWait = waits
    ? page.waitForResponse((response) => responseUrl(response).includes('/api/checkout-config'), { timeout: 25000 })
    : null;
  const payWait = waits
    ? page.waitForResponse((response) => responseUrl(response).includes('/api/create-payment-intent'), { timeout: 25000 }).catch(() => null)
    : null;
  await page.click('#continueBtn');
  const configResponse = configWait ? await configWait : null;
  const config = configResponse && typeof configResponse.json === 'function' ? await configResponse.json().catch(() => ({})) : {};
  const configOk = configResponse ? (typeof configResponse.ok === 'function' ? configResponse.ok() : configResponse.status < 400) : false;
  const payResponse = configOk && config.ok === true && String(config.publishableKey || '').startsWith('pk_test_') && payWait
    ? await payWait
    : null;
  const pay = payResponse && typeof payResponse.json === 'function' ? await payResponse.json().catch(() => ({})) : {};
  if (!checkoutPaymentIsTestMode({ configOk, config, pay })) {
    throw new Error('checkout-payment: stripe is not test mode');
  }
  await page.waitForSelector('#paymentElement iframe', { timeout: 25000 });
}

export async function submitTestCard(page) {
  const frames = typeof page.frames === 'function' ? page.frames().filter((frame) => frame !== page.mainFrame?.()) : [];
  let numberFilled = false;
  for (const frame of frames) {
    const number = frame.locator?.('input[name="number"], input[autocomplete="cc-number"], input[placeholder*="1234"]');
    if (number && await number.count()) {
      await number.fill('4242424242424242');
      numberFilled = true;
    }
    const expiry = frame.locator?.('input[name="expiry"], input[autocomplete="cc-exp"], input[placeholder*="MM"]');
    if (expiry && await expiry.count()) await expiry.fill('1234');
    const cvc = frame.locator?.('input[name="cvc"], input[autocomplete="cc-csc"], input[placeholder*="CVC"]');
    if (cvc && await cvc.count()) await cvc.fill('123');
    const postal = frame.locator?.('input[name="postalCode"], input[autocomplete="postal-code"]');
    if (postal && await postal.count()) await postal.fill('96815');
  }
  if (!numberFilled) throw new Error('checkout-payment: stripe test card field was not on the page');
  await page.click('#payBtn');
}

export function couponPaymentSteps({ code, sessionToken, origin, minted = '' }) {
  const coupon = assertCouponCode(code, minted);
  return {
    mode: 'coupon',
    async showPayment(page) {
      if (typeof page.route === 'function') {
        await page.route('**/*', (route) => (isNonCouponPayment(route.request().url()) ? route.abort() : route.continue()));
      }
      await page.click('#continueBtn');
      await page.waitForSelector('#couponCode', { state: 'visible', timeout: 25000 });
      await page.fill('#couponCode', coupon);
      await page.waitForSelector('#couponPayBtn', { state: 'visible', timeout: 25000 });
    },
    async submitPayment(page) {
      if (!sessionToken) throw new Error('coupon-redemption: no redeemed session');
      await page.goto(new URL(`/order-success.html?session=${encodeURIComponent(sessionToken)}`, origin).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    },
  };
}

export async function walkOnboardingWidth({
  page,
  origin,
  customer,
  width,
  outDir,
  showPayment = showPaymentStep,
  submitPayment = submitTestCard,
  emailFor = (session, contact) => purchaseEmailSurface(contact, session, origin),
  readText = async (current) => current.locator('body').innerText(),
}) {
  assertOnboardingCustomer(customer);
  const dir = path.join(outDir, 'onboarding');
  fs.mkdirSync(dir, { recursive: true });
  const shots = [];
  let termsClick = '';
  const contact = {
    firstName: String(customer.name || '').split(/\s+/)[0] || 'Avery',
    lastName: String(customer.name || '').split(/\s+/).slice(1).join(' ') || 'Hale',
    displayName: customer.name,
    email: customer.email,
  };
  const guard = (url) => {
    const reason = refusedOnboardingTarget(url);
    if (reason) throw new Error(`refused: ${reason}`);
  };
  try {
    await page.setViewportSize({ width, height: 844 });
    const home = new URL('/', origin).href;
    guard(home);
    await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#orderForm', { timeout: 20000 });
    shots.push(await shoot(page, dir, 'homepage', width, readText));
    await page.fill('input[name="firstName"]', contact.firstName);
    await page.fill('input[name="lastName"]', contact.lastName);
    await page.fill('input[name="email"]', contact.email);
    shots.push(await shoot(page, dir, 'checkout-contact', width, readText));
    await showPayment(page);
    shots.push(await shoot(page, dir, 'checkout-payment', width, readText));
    await submitPayment(page);
    await page.waitForURL(/order-success\.html/, { timeout: 45000 });
    await page.waitForFunction(() => new URL(location.href).searchParams.get('session'), null, { timeout: 20000 });
    const session = new URL(page.url()).searchParams.get('session') || '';
    guard(page.url());
    if (!session) throw new Error('order-success: no real session');
    shots.push(await shoot(page, dir, 'order-success', width, readText));
    const mail = emailFor(session, contact) || { html: '', launchUrl: '', gap: 'purchase-email: no email surface' };
    if (!mail.html || !mail.launchUrl) {
      fillMissing(shots, width, 'purchase-email', mail.gap || 'purchase-email: no email surface');
      return { shots, termsClick };
    }
    guard(mail.launchUrl);
    await page.setContent(mail.html, { waitUntil: 'domcontentloaded' });
    shots.push(await shoot(page, dir, 'purchase-email', width, readText));
    await page.goto(mail.launchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#eulaScreen', { state: 'visible', timeout: 20000 });
    shots.push(await shoot(page, dir, 'app-entry', width, readText));
    await page.fill('#eulaName', customer.name);
    shots.push(await shoot(page, dir, 'terms-gate', width, readText));
    await page.click('#eulaAgree');
    await page.click('#eulaAgreeButton');
    termsClick = 'ui';
    await page.waitForFunction(() => !document.querySelector('#eulaScreen'), null, { timeout: 20000 });
    await page.waitForFunction(() => /welcome/i.test(document.body.innerText || ''), null, { timeout: 20000 });
    shots.push(await shoot(page, dir, 'welcome', width, readText));
    await page.waitForSelector('#messageText', { timeout: 20000 });
    shots.push(await shoot(page, dir, 'first-talk', width, readText));
    return { shots, termsClick };
  } catch (error) {
    const message = publicDetail(error);
    const next = ONBOARDING_SCREENS.find((screen) => !shots.some((shot) => shot.id === screen.id));
    fillMissing(shots, width, next?.id || 'homepage', message);
    return { shots, termsClick };
  }
}

function resultFrom(shots, termsClick, laterFiles, outPath) {
  const everyClick = ONBOARDING_WIDTHS.every((width) => shots.some((shot) => shot.width === width && shot.id === 'terms-gate' && !shot.gap && !shot.missing));
  const click = everyClick && termsClick === 'ui' ? 'ui' : '';
  const written = buildCustomerPdf({ shots, laterFiles, outPath });
  const assessed = assessOnboardingScreens({ shots, pdfText: written.pdfText, termsClick: click });
  return { ...assessed, shots, termsClick: click, outPath };
}

export async function captureOnboardingPdf({ origin, outDir, customer, runId, pageFactory, payment = null }) {
  const email = customer.email || `harness+${runId}@harness.invalid`;
  const person = { ...customer, email };
  try {
    assertOnboardingCustomer(person);
  } catch (error) {
    return { ok: false, detail: publicDetail(error), shots: [], termsClick: '', outPath: path.join(outDir, 'customer.pdf') };
  }
  const outPath = path.join(outDir, 'customer.pdf');
  const shots = [];
  const clicks = [];
  if (!pageFactory) {
    const playwright = resolvePlaywright();
    if (playwright.missing) {
      return { ok: false, detail: playwright.missing, shots: [], termsClick: '', outPath };
    }
    pageFactory = async (width) => {
      const browser = await playwright.module.webkit.launch();
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE,
        extraHTTPHeaders: { 'x-timesyncher-harness-checkout': '1' },
      });
      const page = await context.newPage();
      return {
        page,
        close: async () => {
          await context.close();
          await browser.close();
        },
      };
    };
  }
  for (const width of ONBOARDING_WIDTHS) {
    const opened = await pageFactory(width, person);
    try {
      const walked = await walkOnboardingWidth({
        page: opened.page,
        origin,
        customer: { ...person, email: person.email.includes('@') ? person.email.replace('@', `+w${width}@`) : `${person.email}+w${width}@harness.invalid` },
        width,
        outDir,
        ...(payment ? { showPayment: payment.showPayment, submitPayment: payment.submitPayment } : {}),
      });
      shots.push(...walked.shots);
      clicks.push(walked.termsClick === 'ui');
    } finally {
      await opened.close?.();
    }
  }
  const combinedClick = clicks.length === ONBOARDING_WIDTHS.length && clicks.every(Boolean) ? 'ui' : '';
  return { ...resultFrom(shots, combinedClick, [], outPath), laterFiles: [] };
}

export async function rebuildCustomerPdf(captured, laterFiles = []) {
  if (!captured?.shots) return captured;
  const outPath = captured.outPath;
  const click = captured.termsClick === 'ui' ? 'ui' : '';
  return { ...resultFrom(captured.shots, click, laterFiles, outPath), laterFiles };
}

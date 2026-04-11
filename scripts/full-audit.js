const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const BASE_URL = 'http://localhost:5173';
const MOBILE_DIR = path.join(__dirname, 'audit-screenshots', 'mobile');
const DESKTOP_DIR = path.join(__dirname, 'audit-screenshots', 'desktop');

// Read Supabase config from frontend .env
const frontendEnv = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', '.env'), 'utf8'
);
const envVars = {};
for (const line of frontendEnv.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) envVars[k.trim()] = v.join('=').trim();
}

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY;

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, dir: MOBILE_DIR, scale: 2 },
  { name: 'desktop', width: 1280, height: 800, dir: DESKTOP_DIR, scale: 1 },
];

const ROUTES = [
  { name: '01-login', path: '/login', auth: false },
  { name: '02-dashboard', path: '/', auth: true },
  { name: '03-upload', path: '/upload', auth: true },
  { name: '04-jobs', path: '/jobs', auth: true },
  { name: '05-results', path: '/results', auth: true },
  { name: '06-tracker', path: '/tracker', auth: true },
  { name: '07-help', path: '/help', auth: true },
];

async function authenticate(page) {
  const email = process.env.HOLT_TEST_EMAIL;
  const password = process.env.HOLT_TEST_PASSWORD;

  if (!email || !password) {
    console.log('No HOLT_TEST_EMAIL / HOLT_TEST_PASSWORD — cannot auth');
    return false;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('No Supabase config — cannot auth');
    return false;
  }

  console.log('Authenticating via Supabase...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (!data?.session) {
    console.log('Auth failed:', error?.message);
    return false;
  }

  // Navigate to app origin first
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });

  // Inject session + onboarding flag into localStorage
  const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('holt_onboarded', 'true');
  }, { key: storageKey, session: data.session });

  // Reload to pick up the session
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Verify we're not on login
  const url = page.url();
  if (url.includes('/login') || url.includes('/signup')) {
    console.log('Auth injection failed — still on login page');
    return false;
  }

  console.log('Auth successful');
  return true;
}

(async () => {
  fs.mkdirSync(MOBILE_DIR, { recursive: true });
  fs.mkdirSync(DESKTOP_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.name.toUpperCase()} (${vp.width}x${vp.height}) ===`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
    });
    const page = await context.newPage();

    // Capture login BEFORE authenticating
    console.log('Capturing 01-login...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(vp.dir, `01-login-${vp.name}.png`),
      fullPage: true,
    });

    // Authenticate
    const loggedIn = await authenticate(page);

    // Capture remaining routes
    for (const route of ROUTES) {
      if (route.name === '01-login') continue; // already captured

      if (route.auth && !loggedIn) {
        console.log(`SKIP ${route.name} (requires auth)`);
        continue;
      }

      console.log(`Capturing ${route.name}...`);
      try {
        await page.goto(`${BASE_URL}${route.path}`, {
          waitUntil: 'networkidle',
          timeout: 15000,
        });
      } catch {
        console.log(`  (networkidle timeout — capturing anyway)`);
      }
      await page.waitForTimeout(2500);

      // Check for redirect to login
      if (route.auth && page.url().includes('/login')) {
        console.log(`  → Redirected to login — skipping`);
        continue;
      }

      // For jobs page, trigger cached search if search button exists
      if (route.name === '04-jobs') {
        try {
          const matchBtn = await page.$('button:has-text("Find jobs that fit me")');
          if (matchBtn) {
            await matchBtn.click();
            console.log('  Triggered profile match search...');
            // Wait up to 15s for results or loading to finish
            await page.waitForTimeout(5000);
          }
        } catch {
          console.log('  (no match button found)');
        }
      }

      const fname = `${route.name}-${vp.name}.png`;
      await page.screenshot({
        path: path.join(vp.dir, fname),
        fullPage: true,
      });
    }

    await context.close();
  }

  await browser.close();

  // Count captured
  const mobileFiles = fs.readdirSync(MOBILE_DIR).filter(f => f.endsWith('.png'));
  const desktopFiles = fs.readdirSync(DESKTOP_DIR).filter(f => f.endsWith('.png'));
  console.log(`\nDone. Mobile: ${mobileFiles.length}, Desktop: ${desktopFiles.length}`);
  console.log(`Mobile:  ${MOBILE_DIR}/`);
  console.log(`Desktop: ${DESKTOP_DIR}/`);
})();

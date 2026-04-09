const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const BASE_URL = 'http://localhost:5173';
const OUT_DIR = path.join(__dirname, 'audit-screenshots');

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

const ROUTES = [
  { name: '01-login', path: '/login', auth: false },
  { name: '02-signup', path: '/signup', auth: false },
  { name: '03-dashboard', path: '/', auth: true },
  { name: '04-upload', path: '/upload', auth: true },
  { name: '05-results', path: '/results', auth: true },
  { name: '06-jobs', path: '/jobs', auth: true },
  { name: '07-tracker', path: '/tracker', auth: true },
  { name: '08-profile', path: '/profile', auth: true },
  { name: '09-help', path: '/help', auth: true },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Attempt login via Supabase client, then inject session into browser
  let loggedIn = false;
  const email = process.env.HOLT_TEST_EMAIL;
  const password = process.env.HOLT_TEST_PASSWORD;

  if (email && password && SUPABASE_URL && SUPABASE_ANON_KEY) {
    console.log('Attempting Supabase auth...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data?.session) {
      // Navigate to the app first so we're on the right origin
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      // Inject the Supabase session into localStorage (same format supabase-js uses)
      const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
      await page.evaluate(({ key, session }) => {
        localStorage.setItem(key, JSON.stringify(session));
      }, { key: storageKey, session: data.session });
      loggedIn = true;
      console.log('Auth successful — session injected');
    } else {
      console.log('Auth failed:', error?.message);
    }
  } else if (!email || !password) {
    // Try to sign in via UI
    console.log('No HOLT_TEST_EMAIL/HOLT_TEST_PASSWORD — trying UI login...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    // Can't proceed without credentials
    console.log('No credentials available — public pages only');
  }

  const results = [];

  for (const route of ROUTES) {
    if (route.auth && !loggedIn) {
      results.push({ ...route, skipped: true });
      console.log(`SKIP ${route.name} (requires auth)`);
      continue;
    }

    console.log(`Capturing ${route.name}...`);
    try {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 15000 });
    } catch {
      // networkidle timeout is OK — page may have long-polling
      console.log(`  (networkidle timeout for ${route.name} — capturing anyway)`);
    }
    // Wait for animations and lazy-loaded images
    await page.waitForTimeout(2000);

    // Check if we got redirected to login (auth failed)
    const currentUrl = page.url();
    if (route.auth && currentUrl.includes('/login')) {
      results.push({ ...route, skipped: true });
      console.log(`  → Redirected to login — skipping`);
      continue;
    }

    const filePath = path.join(OUT_DIR, `${route.name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    results.push({ ...route, skipped: false, file: `${route.name}.png` });
  }

  await browser.close();

  // Generate report
  let report = '# Visual Audit Report\n\n';
  report += `Date: ${new Date().toISOString().split('T')[0]}\n`;
  report += `Viewport: 390x844 (iPhone 14 Pro)\n`;
  report += `Auth: ${loggedIn ? 'Logged in' : 'Public pages only'}\n\n`;

  for (const r of results) {
    report += `## ${r.name.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n`;
    if (r.skipped) {
      report += `- **SKIPPED** — requires auth (no test credentials)\n`;
      report += `- Set HOLT_TEST_EMAIL and HOLT_TEST_PASSWORD env vars to capture\n\n`;
    } else {
      report += `- Screenshot: ${r.file}\n`;
      report += `- Route: ${r.path}\n\n`;
    }
  }

  const reportPath = path.join(__dirname, 'audit-report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport written: ${reportPath}`);
  console.log(`Screenshots in: ${OUT_DIR}/`);
  console.log(`\nCaptured: ${results.filter(r => !r.skipped).length}/${ROUTES.length}`);
})();

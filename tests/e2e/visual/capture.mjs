#!/usr/bin/env node
/**
 * Visual QA capture: renders pages at desktop / tablet / mobile widths and saves PNGs to
 * tests/e2e/visual/screens/<name>-<viewport>.png for manual review.
 *
 *   node tests/e2e/visual/capture.mjs                    # every page in PAGES
 *   node tests/e2e/visual/capture.mjs dashboard sign-in  # only matching names
 *   VIEWPORTS=desktop,mobile BASE_URL=http://localhost:3000 node tests/e2e/visual/capture.mjs
 *
 * Authenticated pages sign in through the real API with the seeded demo accounts.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'screens');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'FixFlow-Demo-2026';
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
};

/** name, path, who (email or null for public), optional wait selector. */
const PAGES = [
  ['landing', '/', null],
  ['sign-in', '/sign-in', null],
  ['sign-up', '/sign-up', null],
  ['forgot-password', '/forgot-password', null],
  ['onboarding', '/onboarding', 'fresh'],
  ['dashboard', '/dashboard', 'manager'],
  ['work-orders', '/work-orders', 'manager'],
  ['work-order-new', '/work-orders/new', 'requester'],
  ['work-order-detail', '/work-orders/1', 'manager'],
  ['my-work', '/my-work', 'technician'],
  ['my-requests', '/my-requests', 'requester'],
  ['assets', '/assets', 'admin'],
  ['locations', '/locations', 'admin'],
  ['team', '/team', 'admin'],
  ['analytics', '/analytics', 'manager'],
  ['notifications', '/notifications', 'manager'],
  ['schedules', '/schedules', 'manager'],
  ['settings-organization', '/settings/organization', 'admin'],
  ['settings-sla', '/settings/sla', 'admin'],
  ['settings-permissions', '/settings/permissions', 'admin'],
  ['settings-audit', '/settings/audit', 'admin'],
];

const ACCOUNTS = {
  admin: process.env.QA_ADMIN ?? 'admin@northbridge.demo',
  manager: process.env.QA_MANAGER ?? 'priya.raman@northbridge.demo',
  technician: process.env.QA_TECH ?? 'arjun.menon@northbridge.demo',
  requester: process.env.QA_REQUESTER ?? 'kavya.iyer@northbridge.demo',
};

async function signIn(context, who) {
  const csrf = await context.request.get(`${BASE}/api/v1/auth/csrf`);
  const { csrfToken } = await csrf.json();
  if (who === 'fresh') {
    const email = `qa-${Date.now()}@example.test`;
    const r = await context.request.post(`${BASE}/api/v1/auth/register`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { name: 'Quinn Avery', email, password: PASSWORD },
    });
    if (!r.ok()) throw new Error(`register failed ${r.status()}`);
    return;
  }
  const r = await context.request.post(`${BASE}/api/v1/auth/login`, {
    headers: { 'x-csrf-token': csrfToken },
    data: { email: ACCOUNTS[who], password: PASSWORD },
  });
  if (!r.ok()) throw new Error(`login failed for ${who}: ${r.status()} ${await r.text()}`);
}

const filter = process.argv.slice(2);
const viewports = (process.env.VIEWPORTS ?? 'desktop,mobile').split(',');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];
// One sign-in per account (respects the API's login rate limit); sessions are reused.
const states = new Map();
async function stateFor(who) {
  if (states.has(who)) return states.get(who);
  const ctx = await browser.newContext();
  await signIn(ctx, who);
  const state = await ctx.storageState();
  await ctx.close();
  states.set(who, state);
  return state;
}
for (const [name, path, who] of PAGES) {
  if (filter.length && !filter.some((f) => name.includes(f))) continue;
  for (const vp of viewports) {
    let storageState;
    try {
      storageState = who ? await stateFor(who) : undefined;
    } catch (e) {
      results.push({ name, vp, error: String(e).slice(0, 200) });
      continue;
    }
    const context = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: vp === 'mobile' ? 2 : 1, reducedMotion: 'reduce', storageState });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForTimeout(600);
      const file = resolve(OUT, `${name}-${vp}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      results.push({ name, vp, file, overflowX: overflow > 1 ? overflow : 0, errors: errors.slice(0, 3) });
    } catch (e) {
      results.push({ name, vp, error: String(e).slice(0, 300) });
    }
    await context.close();
  }
}
await browser.close();
for (const r of results) {
  const flags = [r.overflowX ? `HORIZONTAL OVERFLOW ${r.overflowX}px` : '', r.errors?.length ? `console: ${r.errors.join(' | ').slice(0, 200)}` : '', r.error ?? ''].filter(Boolean);
  console.log(`${r.error ? '✗' : '✓'} ${r.name} [${r.vp}] ${flags.join(' · ')}`);
}

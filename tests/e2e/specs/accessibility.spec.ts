/**
 * Automated accessibility scan (axe-core, WCAG 2.2 A/AA rules) of the main screens.
 * Fails on serious or critical violations. Manual keyboard/screen-reader review is documented
 * separately in docs/TESTING.md — automated checks cannot prove full conformance.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { apiClient, setupOrg } from './api-setup';

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

test('public pages', async ({ page }) => {
  for (const path of ['/', '/sign-in', '/sign-up', '/forgot-password']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await scan(page, path);
  }
});

test('application pages', async ({ browser }) => {
  const ctx = await browser.newContext();
  const org = await setupOrg(ctx, 'A11y');
  const api = await apiClient(ctx.request);
  const wo = await api.call<{ number: number }>('POST', '/work-orders', { title: 'Accessibility check', categoryId: org.categories.HVAC, locationId: org.roomId });
  const page = await ctx.newPage();
  for (const path of ['/dashboard', '/work-orders', `/work-orders/${wo.number}`, '/work-orders/new', '/assets', '/locations', '/team', '/analytics', '/notifications', '/settings/profile', '/settings/permissions']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    await scan(page, path);
  }
});

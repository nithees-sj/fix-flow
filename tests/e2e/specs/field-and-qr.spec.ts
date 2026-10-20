/**
 * Field operations and QR reporting:
 *  - a technician loses connectivity mid-job: checklist + comment are queued, clearly marked
 *    as pending, and synced exactly once when the connection returns;
 *  - a version conflict created while offline is surfaced, not silently applied;
 *  - a guest scans a QR label (PUBLIC mode) and reports an issue without an account.
 */
import { expect, test } from '@playwright/test';
import { apiClient, inviteAndJoin, setupOrg } from './api-setup';

test.describe.configure({ mode: 'serial' });

test('offline updates are queued, indicated, and synced exactly once', async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const org = await setupOrg(adminCtx, 'Field');
  const techCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const techId = await inviteAndJoin(org.api, techCtx, 'field-tech', 'TECHNICIAN', 'Olu Offline');

  const wo = await org.api.call<{ id: string; number: number; version: number }>('POST', '/work-orders', { title: 'Projector flickering in Meeting Room 3', categoryId: org.categories['IT & AV'], locationId: org.roomId });
  const assigned = await org.api.call<{ version: number }>('POST', `/work-orders/${wo.id}/transitions`, { action: 'assign', expectedVersion: wo.version, assigneeId: techId });
  const techApi = await apiClient(techCtx.request);
  await techApi.call('POST', `/work-orders/${wo.id}/transitions`, { action: 'start', expectedVersion: assigned.version });
  await techApi.call('POST', `/work-orders/${wo.id}/checklist`, { label: 'Reseat HDMI cable', required: true });

  const page = await techCtx.newPage();
  await page.goto(`/work-orders/${wo.number}`);
  await expect(page.getByRole('checkbox', { name: 'Reseat HDMI cable' })).toBeVisible();

  await techCtx.setOffline(true);
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Reseat HDMI cable' }).click();
  await page.getByLabel('Add a comment').fill('Cable was loose — reseated, testing now.');
  await page.getByRole('button', { name: 'Comment' }).click();
  await expect(page.getByText('Saved offline — it will be posted when you reconnect.')).toBeVisible();

  // Nothing reached the server yet.
  const before = await org.api.call<{ checklist: { completedAt: string | null }[] }>('GET', `/work-orders/${wo.id}`);
  expect(before.checklist[0]!.completedAt).toBeNull();
  await page.goto('/my-work').catch(() => undefined); // navigation may fail offline in dev (no SW) — queue persists in IndexedDB

  await techCtx.setOffline(false);
  await page.goto('/my-work');
  await expect(page.getByText(/Synced \d offline change/)).toBeVisible({ timeout: 40_000 });

  const after = await org.api.call<{ checklist: { completedAt: string | null }[] }>('GET', `/work-orders/${wo.id}`);
  expect(after.checklist[0]!.completedAt).not.toBeNull();
  const timeline = await org.api.call<{ kind: string; body?: string }[]>('GET', `/work-orders/${wo.id}/timeline`);
  expect(timeline.filter((e) => e.kind === 'comment' && e.body?.includes('Cable was loose'))).toHaveLength(1);
});

test('a conflicting offline action is surfaced instead of overwriting newer changes', async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const org = await setupOrg(adminCtx, 'Conflict');
  const techCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const techId = await inviteAndJoin(org.api, techCtx, 'conflict-tech', 'TECHNICIAN', 'Cara Conflict');
  const wo = await org.api.call<{ id: string; number: number; version: number }>('POST', '/work-orders', { title: 'Door closer broken', categoryId: org.categories.Carpentry, locationId: org.roomId });
  await org.api.call('POST', `/work-orders/${wo.id}/transitions`, { action: 'assign', expectedVersion: wo.version, assigneeId: techId });

  const page = await techCtx.newPage();
  await page.goto(`/work-orders/${wo.number}`);
  await expect(page.getByRole('button', { name: 'Start work' })).toBeVisible();
  await techCtx.setOffline(true);
  await page.getByRole('button', { name: 'Start work' }).click(); // queued with the version the device saw
  await expect(page.getByText('Saved offline')).toBeVisible();

  // Meanwhile a manager cancels the work order on the server.
  const current = await org.api.call<{ version: number }>('GET', `/work-orders/${wo.id}`);
  await org.api.call('POST', `/work-orders/${wo.id}/transitions`, { action: 'cancel', expectedVersion: current.version, reason: 'Duplicate request' });

  await techCtx.setOffline(false);
  await page.goto('/my-work');
  await expect(page.getByText('Pending changes')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/changed by someone else|cannot start/i)).toBeVisible({ timeout: 40_000 });
  const final = await org.api.call<{ status: string }>('GET', `/work-orders/${wo.id}`);
  expect(final.status).toBe('CANCELLED'); // the newer server state won; nothing was overwritten
});

test('a guest reports an issue by scanning a QR label', async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const org = await setupOrg(adminCtx, 'Qr');
  await org.api.call('PATCH', '/organizations/current/policy', { qrReportingMode: 'PUBLIC' });
  const room = await org.api.call<{ reportUrl: string }>('GET', `/locations/${org.roomId}`);
  const path = new URL(room.reportUrl).pathname;

  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await guest.goto(path);
  await expect(guest.getByRole('heading', { name: 'Report an issue' })).toBeVisible();
  await expect(guest.getByText('Meeting Room 3', { exact: true })).toBeVisible();
  await guest.getByLabel('What’s wrong?').fill('Ceiling light flickering');
  await guest.getByRole('radio', { name: 'Electrical' }).click();
  await guest.getByLabel('Your name').fill('Visiting contractor');
  await guest.getByLabel('Email or phone').fill('contractor@example.com');
  await guest.getByRole('button', { name: 'Send report' }).click();
  await expect(guest.getByRole('heading', { name: 'Thanks — it’s reported' })).toBeVisible();
  const ref = await guest.getByText(/WO-\d{4}/).first().textContent();

  const list = await org.api.call<{ data: { number: number; source: string; guestName: string | null }[] }>('GET', '/work-orders?pageSize=5');
  const created = list.data.find((w) => ref?.includes(String(w.number).padStart(4, '0')));
  expect(created).toMatchObject({ source: 'GUEST_QR', guestName: 'Visiting contractor' });
});

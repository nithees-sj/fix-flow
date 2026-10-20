/**
 * Core workflow (Phase 3 gate):
 * register → create organization → invite team (real email via worker + Mailpit) →
 * requester reports → manager sees it live and assigns → technician (mobile) starts,
 * completes checklist, uploads evidence, submits → requester approves → dashboard updates.
 * Plus negative checks: role-restricted actions and cross-request visibility.
 */
import { expect, test, type Page } from '@playwright/test';
import { acceptInvite, email, linkFromEmail, newUserContext, PASSWORD, pngBuffer, run } from './helpers';

test.describe.configure({ mode: 'serial' });

const ORG = `E2E Campus ${run}`;
const TITLE = `Projector not turning on ${run}`;
let admin: Page;
let manager: Page;
let tech: Page;
let requester: Page;
let woUrl = '';

test('an administrator signs up and creates an organization through onboarding', async ({ browser }) => {
  ({ page: admin } = await newUserContext(browser));
  await admin.goto('/sign-up');
  await admin.getByLabel('Full name').fill('Ada Admin');
  await admin.getByLabel('Work email').fill(email('admin'));
  await admin.getByLabel('Password').fill(PASSWORD);
  await admin.getByRole('button', { name: 'Create account' }).click();

  await expect(admin.getByRole('heading', { name: 'Create your organization' })).toBeVisible();
  await admin.getByLabel('Organization name').fill(ORG);
  await admin.getByLabel('Industry').selectOption('EDUCATION');
  await admin.getByRole('button', { name: 'Continue' }).click();

  await expect(admin.getByRole('heading', { name: 'Set your service levels' })).toBeVisible();
  await admin.getByRole('button', { name: 'Save & continue' }).click();

  await expect(admin.getByRole('heading', { name: 'Add your first building' })).toBeVisible();
  await admin.getByLabel('Building name').fill('Main Hall');
  await admin.getByLabel(/Rooms or areas/).fill('Room 101, Library Annex');
  await admin.getByRole('button', { name: 'Add & continue' }).click();

  await expect(admin.getByRole('heading', { name: 'Invite your team' })).toBeVisible();
  await admin.getByLabel('Email 1').fill(email('manager'));
  await admin.getByLabel('Role 1').selectOption('MANAGER');
  await admin.getByLabel('Email 2').fill(email('tech'));
  await admin.getByLabel('Role 2').selectOption('TECHNICIAN');
  await admin.getByRole('button', { name: 'Add another' }).click();
  await admin.getByLabel('Email 3').fill(email('requester'));
  await admin.getByLabel('Role 3').selectOption('REQUESTER');
  await admin.getByRole('button', { name: /Send 3 invites & finish/ }).click();

  await admin.waitForURL('**/dashboard');
  await expect(admin.getByRole('heading', { name: /Good (morning|afternoon|evening), Ada/ })).toBeVisible();
});

test('invited people receive real emails and join with new accounts', async ({ browser }) => {
  const pattern = /http:\/\/[^\s]+\/invite\/[\w-]+/;
  ({ page: manager } = await newUserContext(browser));
  await acceptInvite(manager, await linkFromEmail(email('manager'), pattern), 'Maya Manager');
  ({ page: tech } = await newUserContext(browser, { mobile: true }));
  await acceptInvite(tech, await linkFromEmail(email('tech'), pattern), 'Tariq Tech');
  ({ page: requester } = await newUserContext(browser));
  await acceptInvite(requester, await linkFromEmail(email('requester'), pattern), 'Rosa Requester');
  await expect(requester).toHaveURL(/my-requests/);
  await expect(tech).toHaveURL(/my-work/);
});

test('a requester reports an issue and the manager sees it appear live', async () => {
  await manager.goto('/work-orders');
  await expect(manager.getByRole('heading', { name: 'Work orders' })).toBeVisible();
  await expect(manager.getByText('Live', { exact: true })).toBeVisible();

  await requester.goto('/work-orders/new');
  await requester.getByLabel('What’s the problem?').fill(TITLE);
  await requester.getByLabel(/Details/).fill('The projector in Room 101 shows no power light.');
  await requester.getByRole('radio', { name: 'IT & AV' }).click();
  await requester.locator('#location').click();
  await requester.getByPlaceholder('Search locations…').fill('Room 101');
  await requester.getByRole('option', { name: /Room 101/ }).click();
  await requester.getByRole('radio', { name: /High/ }).click();
  await requester.getByRole('button', { name: 'Submit request' }).click();
  await requester.waitForURL(/\/work-orders\/\d+$/);
  woUrl = new URL(requester.url()).pathname;
  await expect(requester.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(requester.getByText('Open', { exact: true }).first()).toBeVisible();

  // No reload: the realtime event invalidates the list.
  await expect(manager.getByRole('link', { name: new RegExp(TITLE) })).toBeVisible({ timeout: 20_000 });
});

test('the manager assigns the technician using the suggestion list', async () => {
  await manager.goto(woUrl);
  await manager.getByRole('button', { name: 'Assign technician' }).click();
  await manager.getByRole('radio', { name: /Tariq Tech/ }).click();
  await manager.getByRole('dialog').getByRole('button', { name: 'Assign' }).click();
  await expect(manager.getByText('Assigned', { exact: true }).first()).toBeVisible();
});

test('the technician works the job on a phone: start, checklist, photo, submit', async () => {
  await tech.goto('/my-work');
  await expect(tech.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 20_000 });
  await tech.goto(woUrl);
  await expect(tech.getByRole('button', { name: 'Assign technician' })).toHaveCount(0); // not a manager action
  await tech.getByRole('button', { name: 'Start work' }).click();
  await expect(tech.getByText('In progress', { exact: true }).first()).toBeVisible();

  // Add a checklist step and complete it (IT & AV has no default template).
  await tech.getByRole('button', { name: 'Add step' }).click();
  await tech.getByLabel('New checklist step').fill('Check power supply and replace fuse');
  await tech.getByRole('button', { name: 'Add', exact: true }).click();
  await tech.getByRole('checkbox', { name: 'Check power supply and replace fuse' }).click();
  await expect(tech.getByText('1 of 1 completed')).toBeVisible();

  await tech.getByRole('button', { name: 'Submit for verification' }).click();
  const dialog = tech.getByRole('dialog');
  await dialog.getByLabel('Work performed').fill('Replaced the blown 5A fuse in the projector power unit and tested for 10 minutes.');
  await dialog.getByLabel('Labor time (minutes)').fill('25');
  await dialog.locator('#evidence-file').setInputFiles({ name: 'after.png', mimeType: 'image/png', buffer: pngBuffer() });
  await expect(dialog.getByRole('button', { name: /Remove after/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Submit resolution' }).click();
  await expect(tech.getByText('Pending verification', { exact: true }).first()).toBeVisible();
});

test('the requester reviews the evidence and approves', async () => {
  await requester.goto(woUrl);
  await expect(requester.getByText('Your review is needed')).toBeVisible();
  await expect(requester.getByText('Replaced the blown 5A fuse')).toBeVisible();
  await requester.getByRole('button', { name: 'Approve repair' }).click();
  await requester.getByRole('dialog').getByLabel(/Note for the technician/).fill('Working again — thanks!');
  await requester.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(requester.getByText('Resolved', { exact: true }).first()).toBeVisible();
});

test('the dashboard reflects the resolved work order', async () => {
  await manager.goto('/dashboard');
  await expect(manager.getByRole('group', { name: 'Resolved (30d)' })).toContainText('1');
  await expect(manager.getByRole('group', { name: 'Created (30d)' })).toContainText('1');
  await expect(manager.getByText(/reported WO-0001/).or(manager.getByText(/moved WO-0001 to Resolved/)).first()).toBeVisible();
});

test('negative: requesters cannot see other people’s requests or reach manager pages', async ({ browser }) => {
  // The manager reports something themselves; the requester must not be able to open it.
  await manager.goto('/work-orders/new');
  await manager.getByLabel('What’s the problem?').fill(`Manager-only issue ${run}`);
  await manager.getByRole('radio', { name: 'Electrical' }).click();
  await manager.locator('#location').click();
  await manager.getByRole('option', { name: /Library Annex/ }).click();
  await manager.getByRole('button', { name: 'Submit request' }).click();
  await manager.waitForURL(/\/work-orders\/\d+$/);
  const other = new URL(manager.url()).pathname;

  await requester.goto(other);
  await expect(requester.getByText('Work order not found')).toBeVisible();
  await requester.goto('/team');
  // Team data is forbidden server-side; the page must not render member data.
  await expect(requester.getByText('Maya Manager')).toHaveCount(0);

  const res = await requester.request.get(`/api/v1/members`);
  expect(res.status()).toBe(403);
  void browser;
});

import { deflateSync } from 'node:zlib';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const PASSWORD = 'e2e-Secret-Passw0rd';
export const run = Date.now().toString(36);
export const email = (who: string) => `${who}.${run}@e2e.fixflow.test`;

/** Waits for an email to arrive in Mailpit and returns the first link matching `pattern`. */
export async function linkFromEmail(to: string, pattern: RegExp, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const body = (await res.json()) as { messages: { ID: string }[] };
    for (const m of body.messages ?? []) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string };
      const match = msg.Text.match(pattern);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`No email to ${to} matching ${pattern} within ${timeoutMs}ms`);
}

export async function newUserContext(browser: Browser, opts: { mobile?: boolean } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(
    opts.mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } },
  );
  return { context, page: await context.newPage() };
}

/** Accepts an invitation as a brand-new user (creates the account in the same flow). */
export async function acceptInvite(page: Page, inviteUrl: string, name: string): Promise<void> {
  await page.goto(inviteUrl);
  await expect(page.getByRole('heading', { name: /^Join / })).toBeVisible();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Choose a password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account & join' }).click();
  await page.waitForURL(/\/(dashboard|my-work|my-requests)/);
}

/** A real 64×48 PNG built in memory (solid colour; no fixture files). */
export function pngBuffer(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const w = 64;
  const h = 48;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0)]);
  for (let x = 0; x < w; x++) row.set([22, 163, 74], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

import type { Response } from 'express';
import QRCode from 'qrcode';

export function reportUrl(webUrl: string, token: string): string {
  return `${webUrl.replace(/\/$/, '')}/r/${token}`;
}

/** Writes a QR code for a public report link as SVG (default, crisp for printing) or PNG. */
export async function sendQr(res: Response, url: string, format: string | undefined, fileStem: string): Promise<void> {
  const opts = { errorCorrectionLevel: 'M' as const, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' } };
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Report-Url', url);
  if (format === 'png') {
    const png = await QRCode.toBuffer(url, { ...opts, width: 768, type: 'png' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${fileStem}.png"`);
    res.send(png);
    return;
  }
  const svg = await QRCode.toString(url, { ...opts, type: 'svg' });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Content-Disposition', `inline; filename="${fileStem}.svg"`);
  res.send(svg);
}

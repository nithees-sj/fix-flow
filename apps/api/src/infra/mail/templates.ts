import type { MailMessage } from './mail.service.js';

/** Minimal, accessible, light-themed transactional email templates (inline styles for clients). */
export type EmailTemplate =
  | { template: 'verify-email'; data: { name: string; url: string } }
  | { template: 'password-reset'; data: { name: string; url: string } }
  | { template: 'password-changed'; data: { name: string } }
  | { template: 'invitation'; data: { organizationName: string; inviterName: string; role: string; url: string } }
  | { template: 'notification'; data: { title: string; body: string; url: string | null; organizationName: string } };

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(heading: string, paragraphs: string[], cta?: { label: string; url: string }, footer?: string): string {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:#2563EB;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>
       <p style="color:#64748B;font-size:13px">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(cta.url)}</span></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0F172A">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:700;font-size:16px;margin-bottom:24px"><span style="color:#2563EB">●</span> FixFlow</div>
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 16px">${esc(heading)}</h1>
      ${paragraphs.map((p) => `<p style="line-height:1.6;margin:0 0 12px">${esc(p)}</p>`).join('')}
      ${button}
    </div>
    <p style="color:#64748B;font-size:12px;margin-top:20px">${esc(footer ?? 'You received this email because of activity on your FixFlow account.')}</p>
  </div></body></html>`;
}

export function renderEmail(t: EmailTemplate): Omit<MailMessage, 'to'> {
  switch (t.template) {
    case 'verify-email':
      return {
        subject: 'Confirm your email address',
        html: layout(`Welcome to FixFlow, ${t.data.name}`, ['Confirm your email address to secure your account.'], {
          label: 'Confirm email',
          url: t.data.url,
        }),
        text: `Confirm your FixFlow email address: ${t.data.url}`,
      };
    case 'password-reset':
      return {
        subject: 'Reset your FixFlow password',
        html: layout(
          'Reset your password',
          [`Hi ${t.data.name}, we received a request to reset your password.`, 'This link expires in 30 minutes and can be used once. If you did not request it, you can ignore this email.'],
          { label: 'Choose a new password', url: t.data.url },
        ),
        text: `Reset your FixFlow password (valid for 30 minutes): ${t.data.url}`,
      };
    case 'password-changed':
      return {
        subject: 'Your FixFlow password was changed',
        html: layout('Password changed', [
          `Hi ${t.data.name}, your password was just changed and all other sessions were signed out.`,
          'If this was not you, reset your password immediately and contact your administrator.',
        ]),
        text: 'Your FixFlow password was changed. If this was not you, reset it immediately.',
      };
    case 'invitation':
      return {
        subject: `${t.data.inviterName} invited you to ${t.data.organizationName} on FixFlow`,
        html: layout(
          `Join ${t.data.organizationName}`,
          [`${t.data.inviterName} invited you to join ${t.data.organizationName} as ${t.data.role}.`, 'The invitation expires in 7 days.'],
          { label: 'Accept invitation', url: t.data.url },
        ),
        text: `${t.data.inviterName} invited you to ${t.data.organizationName} on FixFlow: ${t.data.url}`,
      };
    case 'notification':
      return {
        subject: t.data.title,
        html: layout(
          t.data.title,
          [t.data.body],
          t.data.url ? { label: 'Open in FixFlow', url: t.data.url } : undefined,
          `${t.data.organizationName} · Manage email notifications in FixFlow → Settings → Notifications.`,
        ),
        text: `${t.data.title}\n\n${t.data.body}${t.data.url ? `\n\n${t.data.url}` : ''}`,
      };
  }
}

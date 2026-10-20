import { Inject, Injectable, Logger } from '@nestjs/common';
import { isUniqueViolation, type Database } from '@fixflow/db';
import { ENV, type Env } from '../config/env.js';
import { MailService } from '../infra/mail/mail.service.js';
import { renderEmail, type EmailTemplate } from '../infra/mail/templates.js';
import type { OutboxEventMap } from '../infra/outbox.service.js';
import { DATABASE } from '../infra/tokens.js';

/**
 * Email delivery with an exactly-once ledger: one EmailDelivery row per (outbox event,
 * recipient). A redelivered job skips recipients already marked SENT. (SMTP itself is
 * at-least-once: if the process dies between the provider accepting the message and the
 * ledger update, that one message may be re-sent — documented in docs/ARCHITECTURE.md.)
 */
@Injectable()
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly mail: MailService,
  ) {}

  async direct(outboxId: string, organizationId: string | null, payload: OutboxEventMap['email.send']): Promise<void> {
    const { to, ...template } = payload;
    await this.deliver(outboxId, organizationId, to, template as EmailTemplate);
  }

  async notifications(outboxId: string, organizationId: string, payload: OutboxEventMap['notifications.email']): Promise<void> {
    const userIds = [...new Set(payload.deliveries.map((d) => d.userId))];
    const [users, org] = await Promise.all([
      this.db.system.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }),
      this.db.system.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    ]);
    const woIds = payload.deliveries.map((d) => d.workOrderId).filter((x): x is string => !!x);
    const numbers = new Map(
      (await this.db.system.workOrder.findMany({ where: { id: { in: woIds }, organizationId }, select: { id: true, number: true } })).map((w) => [w.id, w.number]),
    );
    for (const d of payload.deliveries) {
      const email = users.find((u) => u.id === d.userId)?.email;
      if (!email) continue;
      const n = d.workOrderId ? numbers.get(d.workOrderId) : undefined;
      await this.deliver(outboxId, organizationId, email, {
        template: 'notification',
        data: {
          title: d.title,
          body: d.body,
          url: n ? `${this.env.APP_WEB_URL}/work-orders/${n}` : null,
          organizationName: org?.name ?? 'FixFlow',
        },
      });
    }
  }

  private async deliver(outboxId: string, organizationId: string | null, recipient: string, template: EmailTemplate): Promise<void> {
    const key = { outboxEventId_recipient: { outboxEventId: outboxId, recipient } };
    const existing = await this.db.system.emailDelivery.findUnique({ where: key });
    if (existing?.status === 'SENT') return;
    if (!existing) {
      try {
        await this.db.system.emailDelivery.create({ data: { outboxEventId: outboxId, organizationId, recipient, template: template.template } });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    const msg = renderEmail(template);
    const { messageId } = await this.mail.send({ to: recipient, ...msg });
    await this.db.system.emailDelivery.update({ where: key, data: { status: 'SENT', providerMessageId: messageId, sentAt: new Date() } });
    this.logger.log({ recipient: recipient.replace(/(.).+(@.+)/, '$1***$2'), template: template.template }, 'Email sent');
  }
}

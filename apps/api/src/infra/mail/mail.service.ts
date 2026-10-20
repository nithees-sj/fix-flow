import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailProvider {
  send(msg: MailMessage & { from: string }): Promise<{ messageId: string }>;
}

/** SMTP (Mailpit locally; any SMTP relay or provider bridge in production). */
class SmtpMailProvider implements MailProvider {
  private readonly transport: Transporter;
  constructor(env: Env) {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  async send(msg: MailMessage & { from: string }) {
    const info = await this.transport.sendMail(msg);
    return { messageId: info.messageId };
  }
}

class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');
  async send(msg: MailMessage & { from: string }) {
    this.logger.log(`✉  to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return { messageId: `console-${Date.now()}` };
  }
}

/** In-memory provider for tests: lets assertions read sent mail. */
export class MemoryMailProvider implements MailProvider {
  static readonly sent: (MailMessage & { from: string })[] = [];
  async send(msg: MailMessage & { from: string }) {
    MemoryMailProvider.sent.push(msg);
    return { messageId: `memory-${MemoryMailProvider.sent.length}` };
  }
}

/** Provider abstraction — swap delivery without touching business code. */
@Injectable()
export class MailService {
  private readonly provider: MailProvider;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    this.from = env.MAIL_FROM;
    this.provider =
      env.MAIL_PROVIDER === 'smtp'
        ? new SmtpMailProvider(env)
        : env.MAIL_PROVIDER === 'memory'
          ? new MemoryMailProvider()
          : new ConsoleMailProvider();
  }

  send(msg: MailMessage): Promise<{ messageId: string }> {
    return this.provider.send({ ...msg, from: this.from });
  }
}

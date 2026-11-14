import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type OtpPurpose = 'verify_email' | 'reset_password';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | undefined;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('MAIL_FROM') ?? '"Chat Center" <no-reply@chatcenter.local>';

    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? '587'),
        secure: (this.config.get<string>('SMTP_SECURE') ?? 'false') === 'true',
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  async sendOtp(to: string, code: string, purpose: OtpPurpose): Promise<void> {
    const subject = purpose === 'verify_email' ? 'Mã xác thực email' : 'Mã đặt lại mật khẩu';
    const text =
      purpose === 'verify_email'
        ? `Mã xác thực email của bạn là: ${code}. Mã này sẽ hết hạn sau 10 phút.`
        : `Mã đặt lại mật khẩu của bạn là: ${code}. Mã này sẽ hết hạn sau 10 phút.`;

    if (!this.transporter) {
      this.logger.warn(
        `SMTP is not configured; logging email instead of sending. to=${to} subject=${subject} text=${text}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
    });
  }
}

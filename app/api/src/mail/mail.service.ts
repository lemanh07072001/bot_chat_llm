import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  ATTACHMENT_PLACEHOLDER,
  type AttachmentView,
} from '../attachments/attachment.types.js';

export type OtpPurpose = 'verify_email' | 'reset_password';

/** Everything one outgoing message needs; `html` is optional. */
export interface MailContent {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** One line quoted inside a chat notification mail. */
export interface MailChatMessage {
  text: string;
  createdAt: Date | string;
  /** Public image URLs; listed as links (and small previews in HTML). */
  attachments?: AttachmentView[];
}

export interface MissedChatMailInput {
  to: string;
  agentName: string;
  visitorLabel: string;
  siteName: string;
  messages: MailChatMessage[];
  /** Deep link into the admin inbox, already absolute. */
  url: string;
}

export interface VisitorRepliesMailInput {
  to: string;
  siteName: string;
  agentName?: string;
  messages: MailChatMessage[];
}

export interface TicketReplyMailInput {
  to: string;
  siteName: string;
  agentName?: string;
  ticketNumber: number;
  /** The visitor's original ticket message, quoted below the reply. */
  original: string;
  /** May be '' for an images-only reply. */
  body: string;
  attachments?: AttachmentView[];
}

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

  /**
   * The single place mail leaves the api. Without SMTP the message is logged
   * instead of sent, which is what keeps local development usable and what
   * every caller above this line relies on.
   */
  private async sendMail(content: MailContent): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP is not configured; logging email instead of sending. to=${content.to} subject=${content.subject} text=${content.text}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: content.to,
      subject: content.subject,
      text: content.text,
      ...(content.html ? { html: content.html } : {}),
    });
  }

  async sendOtp(to: string, code: string, purpose: OtpPurpose): Promise<void> {
    const subject = purpose === 'verify_email' ? 'Mã xác thực email' : 'Mã đặt lại mật khẩu';
    const text =
      purpose === 'verify_email'
        ? `Mã xác thực email của bạn là: ${code}. Mã này sẽ hết hạn sau 10 phút.`
        : `Mã đặt lại mật khẩu của bạn là: ${code}. Mã này sẽ hết hạn sau 10 phút.`;

    await this.sendMail({ to, subject, text });
  }

  /**
   * "A visitor has been waiting too long": sent to staff who asked for it.
   * The visitor's own words are quoted, so they are escaped in the HTML part.
   */
  async sendMissedChat(input: MissedChatMailInput): Promise<void> {
    const subject = `[Chat Center] Khách đang chờ trả lời – ${input.visitorLabel}`;
    const quote = input.messages.length ? input.messages : [];

    const textLines = [
      `Xin chào ${input.agentName},`,
      '',
      `Khách "${input.visitorLabel}" đã chờ trả lời quá lâu trên ${input.siteName} và tin nhắn vẫn chưa được phản hồi.`,
    ];
    if (quote.length) {
      textLines.push('', 'Tin nhắn gần nhất của khách:');
      for (const message of quote) {
        textLines.push(...quoteTextLines(message));
      }
    }
    textLines.push('', `Mở hội thoại: ${input.url}`);

    const html = [
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">`,
      `<p>Xin chào <strong>${escapeHtml(input.agentName)}</strong>,</p>`,
      `<p>Khách <strong>${escapeHtml(input.visitorLabel)}</strong> đã chờ trả lời quá lâu trên ${escapeHtml(input.siteName)} và tin nhắn vẫn chưa được phản hồi.</p>`,
      quote.length
        ? `<ul>${quote.map(quoteHtml).join('')}</ul>`
        : '',
      `<p><a href="${escapeHtml(input.url)}">Mở hội thoại</a></p>`,
      `</div>`,
    ].join('');

    await this.sendMail({ to: input.to, subject, text: textLines.join('\n'), html });
  }

  /**
   * "You have new replies": the visitor is not on the site, so the thread is
   * carried to their inbox instead. No page URL is stored for a visitor, so the
   * mail deliberately contains no link.
   */
  async sendVisitorReplies(input: VisitorRepliesMailInput): Promise<void> {
    const subject = `${input.siteName}: bạn có tin nhắn mới`;
    const who = input.agentName ? `Nhân viên ${input.agentName}` : 'Nhân viên';

    const textLines = [
      'Xin chào,',
      '',
      `${who} vừa trả lời bạn trên ${input.siteName}:`,
    ];
    for (const message of input.messages) {
      textLines.push(...quoteTextLines(message));
    }
    textLines.push('', 'Mở lại cửa sổ chat trên trang để tiếp tục cuộc trò chuyện.');

    const html = [
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">`,
      `<p>Xin chào,</p>`,
      `<p>${escapeHtml(who)} vừa trả lời bạn trên ${escapeHtml(input.siteName)}:</p>`,
      `<ul>${input.messages.map(quoteHtml).join('')}</ul>`,
      `<p>Mở lại cửa sổ chat trên trang để tiếp tục cuộc trò chuyện.</p>`,
      `</div>`,
    ].join('');

    await this.sendMail({ to: input.to, subject, text: textLines.join('\n'), html });
  }

  /**
   * A staff reply to a ticket the visitor left while nobody was online. The
   * visitor's original request is quoted so the answer reads on its own.
   */
  async sendTicketReply(input: TicketReplyMailInput): Promise<void> {
    const subject = `[${input.siteName}] Phản hồi yêu cầu #${input.ticketNumber}`;
    const who = input.agentName ? `Nhân viên ${input.agentName}` : 'Nhân viên';

    const images = safeImages(input.attachments);
    const body = input.body || (images.length ? ATTACHMENT_PLACEHOLDER : '');

    const textLines = [
      'Xin chào,',
      '',
      `${who} vừa phản hồi yêu cầu #${input.ticketNumber} của bạn trên ${input.siteName}:`,
      '',
      body,
      ...images.map((image) => image.url),
      '',
      'Yêu cầu ban đầu của bạn:',
      ...input.original.split(/\r?\n/).map((line) => `> ${line}`),
    ];

    const html = [
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">`,
      `<p>Xin chào,</p>`,
      `<p>${escapeHtml(who)} vừa phản hồi yêu cầu #${input.ticketNumber} của bạn trên ${escapeHtml(input.siteName)}:</p>`,
      `<p style="white-space:pre-wrap">${escapeHtml(body)}</p>`,
      images.length ? `<p>${imagesHtml(images)}</p>` : '',
      `<p style="color:#666">Yêu cầu ban đầu của bạn:</p>`,
      `<blockquote style="margin:0;padding:8px 12px;border-left:3px solid #ccc;color:#555;white-space:pre-wrap">${escapeHtml(input.original)}</blockquote>`,
      `</div>`,
    ].join('');

    await this.sendMail({ to: input.to, subject, text: textLines.join('\n'), html });
  }
}

/** Only http(s) URLs ever reach a mail; anything else is dropped. */
function safeImages(attachments: AttachmentView[] | undefined): AttachmentView[] {
  return (attachments ?? []).filter((attachment) => {
    try {
      const { protocol } = new URL(attachment.url);
      return protocol === 'https:' || protocol === 'http:';
    } catch {
      return false;
    }
  });
}

/** Linked thumbnails, at most 240px wide. */
function imagesHtml(images: AttachmentView[]): string {
  return images
    .map((image) => {
      const url = escapeHtml(image.url);
      return `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="Ảnh đính kèm" width="240" style="max-width:240px;height:auto;border-radius:8px;margin:4px 4px 0 0" /></a>`;
    })
    .join('');
}

/** One quoted chat line, then one line per image URL. */
function quoteTextLines(message: MailChatMessage): string[] {
  const images = safeImages(message.attachments);
  const text = oneLine(message.text) || (images.length ? ATTACHMENT_PLACEHOLDER : '');
  return [
    `- ${formatWhen(message.createdAt)}: ${text}`,
    ...images.map((image) => `  ${image.url}`),
  ];
}

function quoteHtml(message: MailChatMessage): string {
  const images = safeImages(message.attachments);
  const text = message.text || (images.length ? ATTACHMENT_PLACEHOLDER : '');
  return `<li><span style="color:#666">${escapeHtml(formatWhen(message.createdAt))}</span> ${escapeHtml(text)}${
    images.length ? `<br />${imagesHtml(images)}` : ''
  }</li>`;
}

/** The five characters that would let quoted content break out of the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Same clock for every recipient, wherever the api happens to run. */
function formatWhen(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** A quoted message occupies one line in the plain-text part. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

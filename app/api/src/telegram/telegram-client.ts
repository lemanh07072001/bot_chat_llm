import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  chat: { id: number; type: string };
  from?: { id: number; is_bot: boolean };
  sender_chat?: unknown;
  reply_to_message?: { message_id: number; from?: { id: number; is_bot: boolean } };
  text?: string;
}
export interface TelegramUpdate { update_id: number; message?: TelegramMessage }

@Injectable()
export class TelegramClient {
  async call<T>(token: string, method: string, body: object = {}): Promise<T> {
    // Never log fetch exceptions: request URLs contain the bot credential.
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      const data = await response.json() as { ok: boolean; result: T };
      if (!response.ok || !data.ok) throw new Error('Telegram rejected request');
      return data.result;
    } catch {
      throw new ServiceUnavailableException('Telegram không phản hồi hoặc từ chối yêu cầu. Kiểm tra token, quyền bot, Topics và webhook.');
    }
  }
}

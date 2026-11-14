import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type HydratedDocument } from 'mongoose';
import { SitesService } from '../sites/sites.service.js';
import { UsersService } from '../users/users.service.js';
import { ChatService } from '../chat/chat.service.js';
import { Message } from '../chat/message.schema.js';
import { agentProfileOf } from '../users/user.schema.js';
import { RealtimeBusService } from '../realtime/realtime-bus.service.js';
import { TelegramConfig, TelegramLink, TelegramPollState, TelegramThread } from './telegram.schema.js';
import { TelegramClient, type TelegramUpdate } from './telegram-client.js';
import { SaveTelegramDto } from './telegram.dto.js';
import { decryptToken, encryptToken } from './telegram-secrets.js';

type Config = HydratedDocument<TelegramConfig>;

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly workerId = randomUUID();
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    @InjectModel(TelegramConfig.name) private readonly configs: Model<TelegramConfig>,
    @InjectModel(TelegramThread.name) private readonly threads: Model<TelegramThread>,
    @InjectModel(TelegramLink.name) private readonly links: Model<TelegramLink>,
    @InjectModel(TelegramPollState.name) private readonly polls: Model<TelegramPollState>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    private readonly settings: ConfigService,
    private readonly sites: SitesService,
    private readonly users: UsersService,
    private readonly chat: ChatService,
    private readonly bus: RealtimeBusService,
    private readonly client: TelegramClient,
  ) {}

  private key(): Buffer {
    const value = this.settings.get<string>('TELEGRAM_ENCRYPTION_KEY') ?? '';
    if (!/^[a-f\d]{64}$/i.test(value)) throw new ServiceUnavailableException('Cần cấu hình TELEGRAM_ENCRYPTION_KEY (64 ký tự hex) ở API.');
    return Buffer.from(value, 'hex');
  }
  private token(config: Config) { return decryptToken(config.encryptedToken, this.key()); }
  private route(config: Config) { return `${config.botId}:${config.chatId}:${config.revision}`; }

  async assertOwner(siteId: string, userId: string) {
    const user = await this.users.findById(userId);
    if (user?.role !== 'admin' || await this.sites.accessFor(siteId, userId) !== 'owner') {
      throw new ForbiddenException('Chỉ admin sở hữu dự án được cấu hình Telegram.');
    }
  }
  async view(siteId: string) {
    const config = await this.configs.findOne({ siteId: new Types.ObjectId(siteId) }).exec();
    return {
      enabled: config?.enabled ?? false, configured: Boolean(config), chatId: config?.chatId ?? '',
      responders: config?.responders.map(r => ({ telegramId: r.telegramId, userId: r.userId })) ?? [],
      lastError: config?.lastError ?? '',
    };
  }
  async save(siteId: string, dto: SaveTelegramDto) {
    const previous = await this.configs.findOne({ siteId: new Types.ObjectId(siteId) }).exec();
    if (!dto.enabled && !dto.botToken && previous && dto.chatId === previous.chatId) {
      await this.configs.updateOne({ _id: previous._id }, { $set: { enabled: false } }).exec();
      return this.view(siteId);
    }
    const token = dto.botToken ?? (previous ? this.token(previous) : '');
    if (!token) throw new BadRequestException('Nhập bot token trước.');
    const key = this.key();
    if (dto.enabled && !dto.responders.length) throw new BadRequestException('Cần ít nhất một người được phép trả lời.');
    if (new Set(dto.responders.map(r => r.telegramId)).size !== dto.responders.length) throw new BadRequestException('Telegram ID bị trùng.');
    for (const responder of dto.responders) {
      const user = await this.users.findById(responder.userId);
      if (!user || await this.sites.accessFor(siteId, responder.userId) === 'none') throw new BadRequestException('Người trả lời phải có tài khoản và quyền truy cập dự án.');
    }
    const me = await this.client.call<{ id: number }>(token, 'getMe');
    const group = await this.client.call<{ type: string; is_forum?: boolean }>(token, 'getChat', { chat_id: dto.chatId });
    if (group.type !== 'supergroup' || !group.is_forum) throw new BadRequestException('Cần supergroup Telegram đã bật Topics.');
    const membership = await this.client.call<{ status: string; can_manage_topics?: boolean }>(token, 'getChatMember', { chat_id: dto.chatId, user_id: me.id });
    if (membership.status !== 'administrator' || !membership.can_manage_topics) throw new BadRequestException('Bot cần quyền admin và Manage Topics.');
    const webhook = await this.client.call<{ url: string }>(token, 'getWebhookInfo');
    if (webhook.url) throw new BadRequestException('Bot đang dùng webhook khác. Dùng bot riêng hoặc chủ động xóa webhook trước; hệ thống không tự xóa.');
    const conflict = await this.configs.exists({ chatId: dto.chatId, siteId: { $ne: new Types.ObjectId(siteId) } });
    if (conflict) throw new BadRequestException('Nhóm này đã thuộc dự án khác. Mỗi dự án dùng một nhóm riêng.');
    const changed = !previous || previous.botId !== String(me.id) || previous.chatId !== dto.chatId;
    await this.configs.findOneAndUpdate({ siteId: new Types.ObjectId(siteId) }, { $set: {
      enabled: dto.enabled, chatId: dto.chatId, botId: String(me.id), encryptedToken: encryptToken(token, key),
      responders: dto.responders, lastError: '',
      ...(changed ? { revision: randomUUID(), cursor: new Types.ObjectId('000000000000000000000000'), cursorAt: new Date() } : {}),
    } }, { upsert: true }).exec();
    await this.polls.updateOne({ botId: String(me.id) }, { $setOnInsert: { offset: 0, leaseUntil: new Date(0) } }, { upsert: true }).exec();
    return this.view(siteId);
  }
  async test(siteId: string) {
    const config = await this.configs.findOne({ siteId: new Types.ObjectId(siteId) }).exec();
    if (!config) throw new BadRequestException('Chưa cấu hình Telegram.');
    const topic = await this.client.call<{ message_thread_id: number }>(this.token(config), 'createForumTopic', { chat_id: config.chatId, name: 'Kiểm tra Chat Center' });
    await this.client.call(this.token(config), 'sendMessage', {
      chat_id: config.chatId, message_thread_id: topic.message_thread_id,
      text: 'Kết nối Chat Center thành công. Đây là tin kiểm tra, không liên kết với khách. Tin thường trong nhóm không gửi ra ngoài; hãy Reply tin khách trong topic hội thoại.',
    });
    return { success: true };
  }
  onModuleInit() {
    if (this.settings.get('SERVICE_ROLE') === 'realtime' || this.settings.get('TELEGRAM_WORKER_ENABLED') === 'false') return;
    this.timer = setInterval(() => { void this.tick(); }, 2000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async lease() {
    await this.polls.updateOne({ botId: '__worker__' }, { $setOnInsert: { leaseUntil: new Date(0) } }, { upsert: true }).exec();
    return this.polls.findOneAndUpdate({ botId: '__worker__', $or: [{ leaseUntil: { $lt: new Date() } }, { leaseOwner: this.workerId }] }, {
      $set: { leaseOwner: this.workerId, leaseUntil: new Date(Date.now() + 120000) },
    }, { returnDocument: 'after' }).exec();
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    let acquired = false;
    try {
      // No secrets => disabled, and no database work needed for the worker.
      if (!this.settings.get('TELEGRAM_ENCRYPTION_KEY')) return;
      acquired = Boolean(await this.lease());
      if (!acquired) return;
      const configs = await this.configs.find({ enabled: true }).exec();
      const bots = new Map<string, Config>();
      for (const config of configs) {
        if (!await this.lease()) return;
        bots.set(config.botId, config);
        try {
          await this.forward(config);
          await this.configs.updateOne({ _id: config._id }, { $set: { lastError: '' } }).exec();
        } catch {
          await this.configs.updateOne({ _id: config._id }, { $set: { lastError: 'Chuyển tin Telegram thất bại; sẽ thử lại. Kiểm tra quyền bot và Topics.' } }).exec();
        }
      }
      for (const config of bots.values()) {
        if (!await this.lease()) return;
        try { await this.poll(config); }
        catch {
          await this.configs.updateMany({ botId: config.botId, enabled: true }, { $set: { lastError: 'Nhận tin Telegram thất bại; sẽ thử lại. Không chạy bot này ở nhiều môi trường hoặc dùng webhook đồng thời.' } }).exec();
        }
      }
    } catch { this.logger.warn('Telegram worker failed; retrying without exposing credentials.'); }
    finally {
      if (acquired) await this.polls.updateOne({ botId: '__worker__', leaseOwner: this.workerId }, { $set: { leaseUntil: new Date(0) }, $unset: { leaseOwner: 1 } }).exec().catch(() => {});
      this.running = false;
    }
  }

  private async forward(config: Config) {
    const site = await this.sites.findById(String(config.siteId));
    if (!site?.active) return;
    const pending = await this.messages.find({ siteId: config.siteId, $or: [
      { createdAt: { $gt: config.cursorAt } }, { createdAt: config.cursorAt, _id: { $gt: config.cursor } },
    ] }).sort({ createdAt: 1, _id: 1 }).limit(10).exec();
    for (const message of pending) {
      if (!await this.lease()) return;
      const latest = await this.configs.findById(config._id).exec();
      if (!latest?.enabled || latest.revision !== config.revision) return;
      // Never forward internal notes. Replies received from Telegram are not echoed.
      if (message.senderKind !== 'system' && !message.externalId) {
        const conversationId = String(message.conversationId);
        const conversation = await this.chat.findConversationById(conversationId);
        if (conversation && String(conversation.siteId) === String(config.siteId)) {
          const visitor = await this.chat.findVisitorById(String(conversation.visitorId));
          const route = this.route(config);
          let thread = await this.threads.findOne({ route, conversationId }).exec();
          if (!thread) {
            const topic = await this.client.call<{ message_thread_id: number }>(this.token(config), 'createForumTopic', {
              chat_id: config.chatId, name: `${visitor?.name || 'Khách'} · #${conversationId}`.slice(0, 128),
            });
            thread = await this.threads.create({ route, conversationId, topicId: topic.message_thread_id });
          }
          {
            const sender = message.senderKind === 'visitor' ? `Khách: ${visitor?.name || 'Ẩn danh'}` : `Nhân viên: ${message.senderName || 'Chat Center'}`;
            const header = `${site.name.slice(0, 100)} · #${conversationId}\n${sender.slice(0, 120)}\n`;
            // Split without truncating visitor text; each fragment is replyable.
            // JS string length is UTF-16; keep even emoji-heavy chunks below
            // Telegram's limit and avoid cutting a surrogate pair in half.
            const chars = Array.from(message.body);
            const parts: string[] = [];
            while (chars.length) parts.push(chars.splice(0, 1700).join(''));
            for (const [partIndex, part] of parts.entries()) {
              if (!await this.lease()) return;
              if (await this.links.exists({ route, messageId: String(message._id), part: partIndex })) continue;
              const sent = await this.client.call<{ message_id: number }>(this.token(config), 'sendMessage', {
                chat_id: config.chatId, message_thread_id: thread.topicId,
                text: `${header}${part}`, link_preview_options: { is_disabled: true },
              });
              await this.links.create({ route, telegramMessageId: sent.message_id, conversationId, topicId: thread.topicId, messageId: String(message._id), part: partIndex });
            }
          }
        }
      }
      await this.configs.updateOne({ _id: config._id, revision: config.revision }, { $set: { cursor: message._id, cursorAt: message.get('createdAt') } }).exec();
    }
  }
  private async poll(config: Config) {
    const state = await this.polls.findOne({ botId: config.botId }).exec();
    if (!state) return;
    const updates = await this.client.call<TelegramUpdate[]>(this.token(config), 'getUpdates', {
      offset: state.offset, timeout: 0, limit: 20, allowed_updates: ['message'],
    });
    for (const update of updates) {
      if (!await this.lease()) return;
      await this.receive(config.botId, update);
      await this.polls.updateOne({ botId: config.botId }, { $max: { offset: update.update_id + 1 } }).exec();
    }
  }
  async receive(botId: string, update: TelegramUpdate) {
    const incoming = update.message;
    if (!incoming || incoming.from?.is_bot || !incoming.from || incoming.sender_chat || incoming.chat.type !== 'supergroup') return;
    const text = incoming.text?.trim();
    if (!text || text.length > 4000 || !incoming.reply_to_message || !incoming.message_thread_id) return;
    if (!incoming.reply_to_message.from?.is_bot || String(incoming.reply_to_message.from.id) !== botId) return;
    const config = await this.configs.findOne({ botId, chatId: String(incoming.chat.id), enabled: true }).exec();
    if (!config) return;
    const responder = config.responders.find(r => r.telegramId === String(incoming.from!.id));
    if (!responder) return;
    const user = await this.users.findById(responder.userId);
    const site = await this.sites.findById(String(config.siteId));
    if (!user || !site?.active || await this.sites.accessFor(String(config.siteId), responder.userId) === 'none') return;
    const link = await this.links.findOne({ route: this.route(config), telegramMessageId: incoming.reply_to_message.message_id, topicId: incoming.message_thread_id }).exec();
    if (!link) return;
    const conversation = await this.chat.findConversationById(link.conversationId);
    if (!conversation || String(conversation.siteId) !== String(config.siteId) || conversation.status !== 'open') return;
    const message = await this.chat.appendMessage({
      conversationId: link.conversationId, siteId: String(config.siteId), senderKind: 'agent', senderId: responder.userId,
      senderName: `${user.name} · Telegram`.slice(0, 100), body: text,
      externalId: `telegram:${botId}:${update.update_id}`,
    });
    this.bus.emitToConversation(link.conversationId, 'message:new', { ...message.toJSON(), sender: agentProfileOf(user) });
    const updated = await this.chat.findConversationById(link.conversationId);
    const visitor = await this.chat.findVisitorById(String(conversation.visitorId));
    if (updated) this.bus.emitToSite(String(config.siteId), 'conversation:updated', {
      ...updated.toJSON(), siteName: site.name,
      visitor: visitor ? { id: String(visitor._id), name: visitor.name ?? null, email: visitor.email ?? null } : null,
    });
  }
}

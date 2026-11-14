import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TelegramService } from './telegram.service.js';
import { TelegramClient, type TelegramUpdate } from './telegram-client.js';
import { encryptToken, decryptToken } from './telegram-secrets.js';
import { SaveTelegramDto } from './telegram.dto.js';
import { ChatService } from '../chat/chat.service.js';

const SITE = '507f1f77bcf86cd799431001';
const USER = '507f1f77bcf86cd799431002';
const CONVERSATION = '507f1f77bcf86cd799431003';
const KEY = Buffer.alloc(32, 7);
const TOKEN = '123456:abcdefghijklmnopqrstuvwxyz123456';
const q = (value: unknown) => ({ exec: vi.fn().mockResolvedValue(value) });

function setup() {
  const config = { _id: new Types.ObjectId(), siteId: new Types.ObjectId(SITE), enabled: true, botId: '123456', chatId: '-1001234567890',
    revision: 'rev', encryptedToken: encryptToken(TOKEN, KEY), cursor: new Types.ObjectId(), responders: [{ telegramId: '456789', userId: USER }] };
  const configs = { findOne: vi.fn(() => q(config)), findById: vi.fn(() => q(config)), exists: vi.fn(() => Promise.resolve(false)), updateOne: vi.fn(() => q({})), findOneAndUpdate: vi.fn(() => q(config)) };
  const threads = { findOne: vi.fn(() => q(null)), create: vi.fn(async data => data) };
  const links = { findOne: vi.fn(() => q({ conversationId: CONVERSATION, topicId: 99 })), exists: vi.fn(async () => false), create: vi.fn(async data => data) };
  const polls = { updateOne: vi.fn(() => q({})) };
  const messages = { find: vi.fn(() => ({ sort: () => ({ limit: () => q([]) }) })) };
  const settings = { get: vi.fn(() => KEY.toString('hex')) };
  const site = { active: true, name: 'Project A' };
  const sites = { findById: vi.fn(async () => site), accessFor: vi.fn(async () => 'owner') };
  const users = { findById: vi.fn(async () => ({ name: 'Agent A', role: 'admin', _id: new Types.ObjectId(USER) })) };
  const conversation = { siteId: SITE, visitorId: USER, status: 'open', toJSON: () => ({ id: CONVERSATION }) };
  const chat = { findConversationById: vi.fn(async () => conversation), findVisitorById: vi.fn(async () => ({ _id: USER, name: 'Visitor' })),
    appendMessage: vi.fn(async () => ({ toJSON: () => ({ id: 'msg1', body: 'Hello' }) })) };
  const bus = { emitToConversation: vi.fn(), emitToSite: vi.fn() };
  const client = { call: vi.fn(async (_token: string, method: string) => {
    if (method === 'getMe') return { id: 123456 };
    if (method === 'getChat') return { type: 'supergroup', is_forum: true };
    if (method === 'getChatMember') return { status: 'administrator', can_manage_topics: true };
    if (method === 'getWebhookInfo') return { url: '' };
    if (method === 'createForumTopic') return { message_thread_id: 99 };
    return { message_id: 123 };
  }) };
  const service = new TelegramService(configs as never, threads as never, links as never, polls as never, messages as never,
    settings as never, sites as never, users as never, chat as never, bus as never, client as never);
  const update: TelegramUpdate = { update_id: 123, message: { message_id: 444, message_thread_id: 99,
    chat: { id: -1001234567890, type: 'supergroup' }, from: { id: 456789, is_bot: false },
    reply_to_message: { message_id: 123, from: { id: 123456, is_bot: true } }, text: 'Hello' } };
  return { service, configs, config, threads, links, polls, messages, settings, sites, users, chat, bus, client, update, conversation };
}

describe('Telegram secrets and validation', () => {
  it('encrypts tokens with randomized authenticated encryption', () => {
    const first = encryptToken(TOKEN, KEY);
    expect(first).not.toContain(TOKEN);
    expect(first).not.toEqual(encryptToken(TOKEN, KEY));
    expect(decryptToken(first, KEY)).toBe(TOKEN);
    expect(() => decryptToken(first, Buffer.alloc(32, 8))).toThrow();
  });
  it('rejects malformed bot tokens, groups and responders', async () => {
    const dto = plainToInstance(SaveTelegramDto, { enabled: true, chatId: '123', botToken: 'bad', responders: [{ telegramId: 'username', userId: 'bad' }] });
    expect((await validate(dto)).map(e => e.property)).toEqual(expect.arrayContaining(['chatId', 'botToken', 'responders']));
  });
});

describe('Telegram inbound isolation', () => {
  it('routes valid replies to the mapped conversation with an idempotency key', async () => {
    const s = setup();
    await s.service.receive('123456', s.update);
    expect(s.chat.appendMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CONVERSATION, siteId: SITE, senderId: USER, senderKind: 'agent', senderName: 'Agent A · Telegram', externalId: 'telegram:123456:123' }));
    expect(s.links.findOne).toHaveBeenCalledWith({ route: '123456:-1001234567890:rev', telegramMessageId: 123, topicId: 99 });
    expect(s.bus.emitToConversation).toHaveBeenCalledWith(CONVERSATION, 'message:new', expect.anything());
    expect(s.bus.emitToSite).toHaveBeenCalledWith(SITE, 'conversation:updated', expect.anything());
  });
  it.each(['ordinary', 'wrong-bot', 'bot', 'anonymous', 'no-topic', 'media', 'oversize'])('ignores %s messages', async kind => {
    const s = setup(); const m = s.update.message!;
    if (kind === 'ordinary') delete m.reply_to_message;
    if (kind === 'wrong-bot') m.reply_to_message!.from!.id = 999;
    if (kind === 'bot') m.from!.is_bot = true;
    if (kind === 'anonymous') m.sender_chat = {};
    if (kind === 'no-topic') delete m.message_thread_id;
    if (kind === 'media') delete m.text;
    if (kind === 'oversize') m.text = 'x'.repeat(4001);
    await s.service.receive('123456', s.update);
    expect(s.chat.appendMessage).not.toHaveBeenCalled();
  });
  it.each(['unknown-group', 'unlisted-user', 'revoked', 'maintenance', 'missing-link', 'closed', 'other-project'])('rejects %s', async kind => {
    const s = setup();
    if (kind === 'unknown-group') s.configs.findOne.mockReturnValue(q(null));
    if (kind === 'unlisted-user') s.update.message!.from!.id = 987;
    if (kind === 'revoked') s.sites.accessFor.mockResolvedValue('none');
    if (kind === 'maintenance') s.sites.findById.mockResolvedValue({ active: false, name: 'Project A' });
    if (kind === 'missing-link') s.links.findOne.mockReturnValue(q(null));
    if (kind === 'closed') s.conversation.status = 'closed';
    if (kind === 'other-project') s.conversation.siteId = USER;
    await s.service.receive('123456', s.update);
    expect(s.chat.appendMessage).not.toHaveBeenCalled();
  });
});

describe('Telegram configuration', () => {
  it('never returns the encrypted or plaintext credential', async () => {
    const s = setup(); const view = await s.service.view(SITE);
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(view).not.toHaveProperty('encryptedToken');
    expect(view.configured).toBe(true);
  });
  it('requires an admin owner, not merely admin or project membership', async () => {
    const s = setup(); s.sites.accessFor.mockResolvedValue('manager');
    await expect(s.service.assertOwner(SITE, USER)).rejects.toThrow();
    s.sites.accessFor.mockResolvedValue('owner'); s.users.findById.mockResolvedValue({ name: 'Agent', role: 'agent', _id: new Types.ObjectId(USER) });
    await expect(s.service.assertOwner(SITE, USER)).rejects.toThrow();
  });
  it('encrypts saved token and validates bot rights without changing webhook', async () => {
    const s = setup();
    await s.service.save(SITE, { enabled: true, botToken: TOKEN, chatId: s.config.chatId, responders: s.config.responders });
    const saved = s.configs.findOneAndUpdate.mock.calls[0][1].$set;
    expect(decryptToken(saved.encryptedToken, KEY)).toBe(TOKEN);
    expect(s.client.call.mock.calls.map(c => c[1])).not.toContain('deleteWebhook');
  });
  it('allows immediate disabling even when Telegram cannot be reached', async () => {
    const s = setup(); s.client.call.mockRejectedValue(new Error('offline'));
    await s.service.save(SITE, { enabled: false, chatId: s.config.chatId, responders: s.config.responders });
    expect(s.client.call).not.toHaveBeenCalled();
    expect(s.configs.updateOne).toHaveBeenCalledWith({ _id: s.config._id }, { $set: { enabled: false } });
  });
  it('rejects responders whose project access has been revoked', async () => {
    const s = setup(); s.sites.accessFor.mockResolvedValue('none');
    await expect(s.service.save(SITE, { enabled: true, chatId: s.config.chatId, responders: s.config.responders })).rejects.toThrow();
    expect(s.configs.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('Telegram outbound routing', () => {
  function outgoing() {
    const s = setup();
    const message = { _id: new Types.ObjectId(), siteId: new Types.ObjectId(SITE), conversationId: CONVERSATION,
      senderKind: 'visitor', externalId: undefined as string | undefined, body: 'Visitor says hello', get: () => new Date() };
    s.messages.find.mockReturnValue({ sort: () => ({ limit: () => q([message]) }) });
    const internal = s.service as unknown as { lease: () => Promise<boolean>; forward: (config: unknown) => Promise<void> };
    internal.lease = vi.fn(async () => true);
    return { ...s, message, forward: () => internal.forward(s.config) };
  }
  it('creates a distinct conversation topic and persists reply mapping', async () => {
    const s = outgoing(); await s.forward();
    expect(s.threads.findOne).toHaveBeenCalledWith({ route: '123456:-1001234567890:rev', conversationId: CONVERSATION });
    expect(s.threads.create).toHaveBeenCalledWith({ route: '123456:-1001234567890:rev', conversationId: CONVERSATION, topicId: 99 });
    expect(s.client.call).toHaveBeenCalledWith(TOKEN, 'sendMessage', expect.objectContaining({ chat_id: '-1001234567890', message_thread_id: 99, text: expect.stringContaining('Visitor says hello') }));
    expect(s.links.create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CONVERSATION, topicId: 99, telegramMessageId: 123 }));
    expect(s.configs.updateOne).toHaveBeenCalled();
  });
  it.each(['system', 'telegram'])('does not echo %s messages', async kind => {
    const s = outgoing();
    if (kind === 'system') s.message.senderKind = 'system';
    else s.message.externalId = 'telegram:123456:1';
    await s.forward(); expect(s.client.call).not.toHaveBeenCalled();
    expect(s.configs.updateOne).toHaveBeenCalled();
  });
  it('does not move cursor when Telegram fails', async () => {
    const s = outgoing(); s.client.call.mockRejectedValue(new Error('offline'));
    await expect(s.forward()).rejects.toThrow(); expect(s.configs.updateOne).not.toHaveBeenCalled();
  });
  it('does not forward after configuration is disabled', async () => {
    const s = outgoing(); s.config.enabled = false; await s.forward(); expect(s.client.call).not.toHaveBeenCalled();
  });
  it('resumes existing topics and skips previously linked message fragments', async () => {
    const s = outgoing();
    s.threads.findOne.mockReturnValue(q({ topicId: 88 })); s.links.exists.mockResolvedValue(true);
    await s.forward(); expect(s.client.call).not.toHaveBeenCalled(); expect(s.threads.create).not.toHaveBeenCalled();
  });
  it('splits emoji-heavy long messages within Telegram limits without truncation', async () => {
    const s = outgoing(); s.message.body = '😀'.repeat(2000); await s.forward();
    const calls = s.client.call.mock.calls as unknown as [string, string, { text: string }][];
    const texts = calls.filter(call => call[1] === 'sendMessage').map(call => call[2].text);
    expect(texts).toHaveLength(2); expect(texts.every(text => text.length <= 4096)).toBe(true);
    expect(texts.join('').split('😀').length - 1).toBe(2000);
  });
});

describe('Telegram HTTP error handling', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  it('redacts tokens from network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(`https://api.telegram.org/bot${TOKEN}/getMe`); }));
    try {
      await expect(new TelegramClient().call(TOKEN, 'getMe')).rejects.not.toThrow(TOKEN);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('Telegram persisted deduplication', () => {
  it('returns a previously persisted reply without creating a message or changing the conversation preview', async () => {
    const existing = { id: 'saved-reply' };
    const messages = { findOne: vi.fn(() => q(existing)), create: vi.fn(), findOneAndUpdate: vi.fn() };
    const conversations = { updateOne: vi.fn() };
    const chat = new ChatService({} as never, conversations as never, messages as never);
    const result = await chat.appendMessage({ conversationId: CONVERSATION, siteId: SITE, senderKind: 'agent', senderId: USER, body: 'Hello', externalId: 'telegram:123456:123' });
    expect(result).toBe(existing);
    expect(messages.create).not.toHaveBeenCalled();
    expect(messages.findOneAndUpdate).not.toHaveBeenCalled();
    expect(conversations.updateOne).not.toHaveBeenCalled();
  });
});

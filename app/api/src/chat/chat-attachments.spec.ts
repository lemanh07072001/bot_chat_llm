import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { vi } from 'vitest';
import { ChatService } from './chat.service.js';
import { Message, MessageSchema } from './message.schema.js';
import { model } from 'mongoose';
import type { AttachmentView } from '../attachments/attachment.types.js';

const CONVERSATION_ID = '507f1f77bcf86cd799440501';
const SITE_ID = '507f1f77bcf86cd799440502';
const CREATED_AT = new Date('2026-05-01T10:00:00.000Z');

const IMAGE: AttachmentView = {
  id: '507f1f77bcf86cd799440503',
  url: 'https://cdn.example.com/attachments/x.png',
  mimeType: 'image/png',
  size: 123,
  width: 10,
  height: 20,
  name: 'x.png',
};

function harness() {
  const messageModel = {
    findOne: vi.fn(),
    create: vi.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      get: () => CREATED_AT,
    }),
  };
  const conversationModel = {
    findOneAndUpdate: vi.fn(() => ({ exec: async () => null })),
  };
  const service = new ChatService({} as never, conversationModel as never, messageModel as never);

  return { service, messageModel, conversationModel };
}

function previewOf(conversationModel: { findOneAndUpdate: ReturnType<typeof vi.fn> }) {
  const [, update] = conversationModel.findOneAndUpdate.mock.calls[0];
  return (update as Array<{ $set: Record<string, unknown> }>)[0].$set.lastMessagePreview;
}

describe('ChatService.appendMessage attachments', () => {
  it('stores an image-only message with the placeholder preview', async () => {
    const h = harness();

    await h.service.appendMessage({
      conversationId: CONVERSATION_ID,
      siteId: SITE_ID,
      senderKind: 'visitor',
      body: '',
      attachments: [IMAGE],
    });

    expect(h.messageModel.create.mock.calls[0][0]).toMatchObject({ body: '', attachments: [IMAGE] });
    expect(previewOf(h.conversationModel)).toEqual({ $literal: '[Hình ảnh]' });
  });

  it('keeps the text as preview when both are present', async () => {
    const h = harness();

    await h.service.appendMessage({
      conversationId: CONVERSATION_ID,
      siteId: SITE_ID,
      senderKind: 'agent',
      body: ' xem ảnh ',
      attachments: [IMAGE],
    });

    expect(previewOf(h.conversationModel)).toEqual({ $literal: 'xem ảnh' });
  });

  it('stores [] for a text-only message', async () => {
    const h = harness();

    await h.service.appendMessage({
      conversationId: CONVERSATION_ID,
      siteId: SITE_ID,
      senderKind: 'visitor',
      body: 'hi',
    });

    expect(h.messageModel.create.mock.calls[0][0]).toMatchObject({ body: 'hi', attachments: [] });
  });

  it('rejects a message with neither text nor images', async () => {
    const h = harness();

    await expect(
      h.service.appendMessage({
        conversationId: CONVERSATION_ID,
        siteId: SITE_ID,
        senderKind: 'visitor',
        body: '   ',
        attachments: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.messageModel.create).not.toHaveBeenCalled();
  });
});

describe('Message schema attachments', () => {
  const MessageModel = model(Message.name + 'AttachmentSpec', MessageSchema);

  it('allows an empty body and serializes attachments', async () => {
    const doc = new MessageModel({
      conversationId: new Types.ObjectId(CONVERSATION_ID),
      siteId: new Types.ObjectId(SITE_ID),
      senderKind: 'visitor',
      body: '',
      attachments: [IMAGE],
    });

    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.toJSON()).toMatchObject({ body: '', attachments: [IMAGE] });
  });

  it('defaults attachments to [] in JSON', () => {
    const doc = new MessageModel({
      conversationId: new Types.ObjectId(CONVERSATION_ID),
      siteId: new Types.ObjectId(SITE_ID),
      senderKind: 'visitor',
      body: 'hi',
    });

    expect(doc.toJSON()).toMatchObject({ attachments: [] });
  });
});

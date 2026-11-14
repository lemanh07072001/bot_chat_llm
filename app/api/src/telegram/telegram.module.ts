import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SitesModule } from '../sites/sites.module.js';
import { UsersModule } from '../users/users.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { Message, MessageSchema } from '../chat/message.schema.js';
import { TelegramConfig, TelegramConfigSchema, TelegramThread, TelegramThreadSchema, TelegramLink, TelegramLinkSchema, TelegramPollState, TelegramPollStateSchema } from './telegram.schema.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';
import { TelegramClient } from './telegram-client.js';

@Module({
  imports: [SitesModule, UsersModule, ChatModule, MongooseModule.forFeature([
    { name: TelegramConfig.name, schema: TelegramConfigSchema },
    { name: TelegramThread.name, schema: TelegramThreadSchema },
    { name: TelegramLink.name, schema: TelegramLinkSchema },
    { name: TelegramPollState.name, schema: TelegramPollStateSchema },
    { name: Message.name, schema: MessageSchema },
  ])],
  controllers: [TelegramController], providers: [TelegramService, TelegramClient],
})
export class TelegramModule {}

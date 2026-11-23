import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MailModule } from './mail/mail.module.js';
import { SitesModule } from './sites/sites.module.js';
import { ChatModule } from './chat/chat.module.js';
import { WidgetModule } from './widget/widget.module.js';
import { TelegramModule } from './telegram/telegram.module.js';
import { CannedResponsesModule } from './canned-responses/canned-responses.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { NotificationSchedulerModule } from './notifications/notification-scheduler.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { AttachmentsModule } from './attachments/attachments.module.js';

import { RealtimeSharedModule } from './realtime/realtime-shared.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RealtimeSharedModule,
    MailModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        // Fail fast (~5s) instead of Mongoose's 30s default when Mongo is down
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    AuthModule,
    SitesModule,
    ChatModule,
    WidgetModule,
    TelegramModule,
    CannedResponsesModule,
    NotificationsModule,
    TicketsModule,
    AttachmentsModule,
    // Background sweeps: api only, never the realtime service.
    NotificationSchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

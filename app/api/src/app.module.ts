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
      }),
    }),
    AuthModule,
    SitesModule,
    ChatModule,
    WidgetModule,
    TelegramModule,

  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

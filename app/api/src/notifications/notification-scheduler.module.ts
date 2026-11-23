import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from '../chat/conversation.schema.js';
import { Message, MessageSchema } from '../chat/message.schema.js';
import { Visitor, VisitorSchema } from '../chat/visitor.schema.js';
import { SitesModule } from '../sites/sites.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from './notifications.module.js';
import { NotificationSchedulerService } from './notification-scheduler.service.js';

/**
 * The background sweeps. Registered by AppModule only: the realtime service
 * must never run them, and ChatService already imports NotificationsModule.
 *
 * The schemas are registered here rather than reused from ChatModule on
 * purpose — importing ChatModule would drag the controllers along with it.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Visitor.name, schema: VisitorSchema },
    ]),
    SitesModule,
    UsersModule,
    NotificationsModule,
  ],
  providers: [NotificationSchedulerService],
})
export class NotificationSchedulerModule {}

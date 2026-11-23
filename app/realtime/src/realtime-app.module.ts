import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway.js';
import { RealtimeSharedModule } from './shared/realtime/realtime-shared.module.js';
import { ChatService } from './shared/chat/chat.service.js';
import { SitesService } from './shared/sites/sites.service.js';
import { UsersService } from './shared/users/users.service.js';
import { WidgetService } from './shared/widget/widget.service.js';
import { User, UserSchema } from './shared/users/user.schema.js';
import { Site, SiteSchema } from './shared/sites/site.schema.js';
import { SiteMember, SiteMemberSchema } from './shared/sites/site-member.schema.js';
import { Conversation, ConversationSchema } from './shared/chat/conversation.schema.js';
import { Message, MessageSchema } from './shared/chat/message.schema.js';
import { Visitor, VisitorSchema } from './shared/chat/visitor.schema.js';
import { Notification, NotificationSchema } from './shared/notifications/notification.schema.js';
import { NotificationsService } from './shared/notifications/notifications.service.js';
import { NotificationRecipientsService } from './shared/notifications/notification-recipients.service.js';
import { PushSubscription, PushSubscriptionSchema } from './shared/notifications/push-subscription.schema.js';
import { PushService } from './shared/notifications/push.service.js';
import { Upload, UploadSchema } from './shared/attachments/upload.schema.js';
import { AttachmentsService } from './shared/attachments/attachments.service.js';
@Controller('health')
class HealthController { @Get() health() { return { service: 'realtime', ok: true }; } }
@Module({
 imports: [ConfigModule.forRoot({ isGlobal: true }), RealtimeSharedModule,
  MongooseModule.forRootAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('MONGODB_URI') }) }),
  MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: Site.name, schema: SiteSchema }, { name: SiteMember.name, schema: SiteMemberSchema }, { name: Conversation.name, schema: ConversationSchema }, { name: Message.name, schema: MessageSchema }, { name: Visitor.name, schema: VisitorSchema }, { name: Notification.name, schema: NotificationSchema }, { name: PushSubscription.name, schema: PushSubscriptionSchema }, { name: Upload.name, schema: UploadSchema }]),
  JwtModule.registerAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }) }),
 ], controllers: [HealthController], providers: [ChatGateway, ChatService, SitesService, UsersService, WidgetService, NotificationRecipientsService, NotificationsService, PushService, AttachmentsService],
})
export class RealtimeAppModule {}

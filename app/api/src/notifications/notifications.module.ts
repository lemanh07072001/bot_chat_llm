import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Visitor, VisitorSchema } from '../chat/visitor.schema.js';
import { SitesModule } from '../sites/sites.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  Notification,
  NotificationSchema,
} from './notification.schema.js';
import { NotificationRecipientsService } from './notification-recipients.service.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import {
  PushSubscription,
  PushSubscriptionSchema,
} from './push-subscription.schema.js';
import { PushService } from './push.service.js';
import { PushController } from './push.controller.js';

/**
 * Owns the bell. It reads visitors and project memberships directly rather than
 * importing ChatModule, which imports this module for the message hook — one
 * direction only, so there is no cycle to work around.
 *
 * Push lives here too: it is the outside-the-tab half of the same delivery, and
 * it needs RedisBridgeService for the presence gate, which RealtimeSharedModule
 * (global) already provides.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Visitor.name, schema: VisitorSchema },
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
    ]),
    SitesModule,
    UsersModule,
  ],
  controllers: [NotificationsController, PushController],
  providers: [
    NotificationsService,
    NotificationRecipientsService,
    PushService,
  ],
  exports: [NotificationsService, NotificationRecipientsService, PushService],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SitesModule } from '../sites/sites.module.js';
import { UsersModule } from '../users/users.module.js';
import { Counter, CounterSchema, Ticket, TicketSchema } from './ticket.schema.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

/**
 * Leaf module: it reads chat, sites, users and the bell, and nothing imports it
 * back, so there is no cycle. MailModule and RealtimeSharedModule are global.
 */
@Module({
  imports: [
    ChatModule,
    SitesModule,
    UsersModule,
    NotificationsModule,
    AttachmentsModule,
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Visitor, VisitorSchema } from './visitor.schema.js';
import { Conversation, ConversationSchema } from './conversation.schema.js';
import { Message, MessageSchema } from './message.schema.js';
import { ChatService } from './chat.service.js';
import { ConversationsController } from './conversations.controller.js';
import { SitesModule } from '../sites/sites.module.js';
import { UsersModule } from '../users/users.module.js';
import { InternalNote, InternalNoteSchema } from './internal-note.schema.js';
import { InternalNotesService } from './internal-notes.service.js';
import { TranslationModule } from '../translation/translation.module.js';

@Module({
  imports: [
    SitesModule,
    UsersModule,
    TranslationModule,
    MongooseModule.forFeature([
      { name: Visitor.name, schema: VisitorSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: InternalNote.name, schema: InternalNoteSchema },
    ]),
  ],
  controllers: [ConversationsController],
  providers: [ChatService, InternalNotesService],
  exports: [ChatService],
})
export class ChatModule {}

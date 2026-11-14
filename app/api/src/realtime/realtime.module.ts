import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module.js';
import { WidgetModule } from '../widget/widget.module.js';
import { UsersModule } from '../users/users.module.js';
import { SitesModule } from '../sites/sites.module.js';


/**
 * Kept separate from ChatModule so the gateway can depend on WidgetModule,
 * which itself depends on ChatModule.
 */
@Module({
  imports: [ChatModule, WidgetModule, UsersModule, SitesModule],
  providers: [],
})
export class RealtimeModule {}

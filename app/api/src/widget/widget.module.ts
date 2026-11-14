import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { UsersModule } from '../users/users.module.js';
import { WidgetService } from './widget.service.js';
import { WidgetController } from './widget.controller.js';
import { WidgetAssetController, WidgetBuildController } from './widget-asset.controller.js';
import { WidgetAssetService } from './widget-asset.service.js';
import { VisitorGuard } from './visitor.guard.js';

@Module({
  imports: [SitesModule, ChatModule, UsersModule],
  controllers: [WidgetController, WidgetAssetController, WidgetBuildController],
  providers: [WidgetService, WidgetAssetService, VisitorGuard],
  exports: [WidgetService],
})
export class WidgetModule {}

import { LocalImageService } from './local-image.service.js';
import { R2ImageService } from './r2-image.service.js';
import { SiteImagesController } from './site-images.controller.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Site, SiteSchema } from './site.schema.js';
import { SiteMember, SiteMemberSchema } from './site-member.schema.js';
import { SitesService } from './sites.service.js';
import { SitesController } from './sites.controller.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Site.name, schema: SiteSchema },
      { name: SiteMember.name, schema: SiteMemberSchema },
    ]),
  ],
  controllers: [SitesController, SiteImagesController],
  providers: [SitesService, R2ImageService, LocalImageService],
  exports: [SitesService],
})
export class SitesModule {}

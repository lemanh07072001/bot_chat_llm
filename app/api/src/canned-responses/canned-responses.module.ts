import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SitesModule } from '../sites/sites.module.js';
import { UsersModule } from '../users/users.module.js';
import { CannedResponsesController } from './canned-responses.controller.js';
import {
  GlobalCannedResponseSet,
  GlobalCannedResponseSetSchema,
} from './canned-responses.schema.js';
import { CannedResponsesService } from './canned-responses.service.js';

@Module({
  imports: [
    SitesModule,
    UsersModule,
    MongooseModule.forFeature([
      {
        name: GlobalCannedResponseSet.name,
        schema: GlobalCannedResponseSetSchema,
      },
    ]),
  ],
  controllers: [CannedResponsesController],
  providers: [CannedResponsesService],
  exports: [CannedResponsesService],
})
export class CannedResponsesModule {}

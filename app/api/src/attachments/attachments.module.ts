import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SitesModule } from '../sites/sites.module.js';
import { Upload, UploadSchema } from './upload.schema.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { AttachmentUploadService } from './attachment-upload.service.js';
import { AttachmentFileInterceptor } from './attachment-file.interceptor.js';
import { UploadsController } from './uploads.controller.js';
import { AttachmentsCleanupService } from './attachments-cleanup.service.js';
import { UploadAdmissionInterceptor } from './upload-admission.interceptor.js';

@Module({
  imports: [
    SitesModule,
    MongooseModule.forFeature([{ name: Upload.name, schema: UploadSchema }]),
  ],
  controllers: [UploadsController],
  providers: [
    AttachmentsService,
    AttachmentStorageService,
    AttachmentUploadService,
    AttachmentFileInterceptor,
    AttachmentsCleanupService,
    UploadAdmissionInterceptor,
  ],
  exports: [
    AttachmentsService,
    AttachmentUploadService,
    AttachmentFileInterceptor,
    UploadAdmissionInterceptor,
  ],
})
export class AttachmentsModule {}

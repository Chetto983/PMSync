import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { EmailsService } from './services/emails.service';
import { EmailFetchService } from './services/email-fetch.service';
import { EmailRetentionService } from './services/email-retention.service';
import { EmailSendService } from './services/email-send.service';
import { EmailSyncBackService } from './services/email-sync-back.service';
import { EmailCleanupService } from './services/email-cleanup.service';
import { AttachmentStorageService } from './services/attachment.storage';
import { AttachmentOnDemandService } from './services/attachment-on-demand.service';
import { ScheduledEmailService } from './services/scheduled-email.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { AiModule } from '../ai/ai.module';
import { EmailsController } from './controllers/emails.controller';
import { FoldersController } from './controllers/folders.controller';
import { AttachmentsController } from './controllers/attachments.controller';
import { EmailSyncModule } from '../email-sync/email-sync.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorageService } from './services/storage.service';
import { ProviderTokenService } from '../email-sync/services/provider-token.service';

@Module({
  imports: [
    PrismaModule,
    ProvidersModule,
    forwardRef(() => AiModule),
    forwardRef(() => EmailSyncModule),
    RealtimeModule,
  ],
  providers: [
    EmailService,
    EmailsService,
    EmailRetentionService,
    EmailFetchService,
    EmailSendService,
    EmailSyncBackService,
    EmailCleanupService,
    AttachmentStorageService,
    AttachmentOnDemandService,
    StorageService,
    ProviderTokenService,
    ScheduledEmailService,
  ],
  controllers: [EmailsController, FoldersController, AttachmentsController],
  exports: [
    EmailService,
    EmailsService,
    EmailRetentionService,
    EmailFetchService,
    EmailSendService,
    EmailSyncBackService,
    EmailCleanupService,
    AttachmentStorageService,
    AttachmentOnDemandService,
    StorageService,
    ScheduledEmailService,
  ],
})
export class EmailModule {}

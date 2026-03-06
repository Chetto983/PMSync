import { Global, Module } from '@nestjs/common';
import { STORAGE_SERVICE } from '../../common/interfaces/storage.interface';
import { StorageService } from './services/storage.service';
import { AttachmentStorageService } from './services/attachment.storage';
import { AttachmentMetricsService } from './services/attachment-metrics.service';

/**
 * StorageModule
 *
 * @Global() so EmailSyncModule, AiModule, and others can access storage
 * services without importing EmailModule (breaks circular dependency).
 *
 * Provides:
 * - StorageService: S3 client wrapper
 * - STORAGE_SERVICE: Interface token bound to StorageService
 * - AttachmentStorageService: Content-addressable attachment storage with dedup
 * - AttachmentMetricsService: Attachment operation observability
 *
 * Phase 49-03: Made @Global() to break EmailModule <-> EmailSyncModule forwardRef cycle.
 */
@Global()
@Module({
  providers: [
    StorageService,
    { provide: STORAGE_SERVICE, useExisting: StorageService },
    AttachmentStorageService,
    AttachmentMetricsService,
  ],
  exports: [
    StorageService,
    STORAGE_SERVICE,
    AttachmentStorageService,
    AttachmentMetricsService,
  ],
})
export class StorageModule {}

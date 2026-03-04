import { Module } from '@nestjs/common';
import { STORAGE_SERVICE } from '../../common/interfaces/storage.interface';
import { StorageService } from './services/storage.service';

/**
 * StorageModule
 *
 * Dedicated storage providers shared by EmailModule, AiModule, and sync modules.
 * This avoids importing EmailModule only to resolve STORAGE_SERVICE.
 */
@Module({
  providers: [
    StorageService,
    { provide: STORAGE_SERVICE, useExisting: StorageService },
  ],
  exports: [StorageService, STORAGE_SERVICE],
})
export class StorageModule {}

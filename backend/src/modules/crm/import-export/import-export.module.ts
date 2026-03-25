import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { CsvImportService } from './services/csv-import.service';
import { ContactImportQueueService } from './services/contact-import-queue.service';
import { ContactImportWorker } from './services/contact-import.worker';
import { ImportExportController } from './controllers/import-export.controller';

/**
 * CRM Import/Export Module
 *
 * Provides CSV import and Excel export for CRM contacts and accounts.
 * Async processing via BullMQ with Socket.IO progress tracking.
 */
@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [ImportExportController],
  providers: [CsvImportService, ContactImportQueueService, ContactImportWorker],
  exports: [CsvImportService, ContactImportQueueService],
})
export class ImportExportModule {}

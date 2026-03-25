import { Module } from '@nestjs/common';
import { CsvImportService } from './services/csv-import.service';

/**
 * CRM Import/Export Module
 *
 * Provides CSV import and Excel export for CRM contacts and accounts.
 * BullMQ worker for async import processing added in T-0703.
 */
@Module({
  providers: [CsvImportService],
  exports: [CsvImportService],
})
export class ImportExportModule {}

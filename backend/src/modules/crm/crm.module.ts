import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { DealModule } from './deal/deal.module';
import { AutomationModule } from './automation/automation.module';
import { ImportExportModule } from './import-export/import-export.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';

/**
 * CrmModule - Umbrella module for all CRM sub-modules.
 * Phase 1: Account, Pipeline, Deal, Import/Export, Custom Fields.
 */
@Module({
  imports: [AccountModule, PipelineModule, DealModule, AutomationModule, ImportExportModule, CustomFieldsModule],
  exports: [AccountModule, PipelineModule, DealModule, AutomationModule, ImportExportModule, CustomFieldsModule],
})
export class CrmModule {}

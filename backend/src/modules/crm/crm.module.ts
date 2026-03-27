import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { DealModule } from './deal/deal.module';
import { AutomationModule } from './automation/automation.module';
import { ImportExportModule } from './import-export/import-export.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { ProductModule } from './product/product.module';
import { ScoringModule } from './scoring/scoring.module';
import { LeadScoringModule } from './lead-scoring/lead-scoring.module';

/**
 * CrmModule - Umbrella module for all CRM sub-modules.
 * Phase 1: Account, Pipeline, Deal, Import/Export, Custom Fields, Product, Scoring.
 * Phase 2: Lead Scoring (Intelligence Layer).
 */
@Module({
  imports: [AccountModule, PipelineModule, DealModule, AutomationModule, ImportExportModule, CustomFieldsModule, ProductModule, ScoringModule, LeadScoringModule],
  exports: [AccountModule, PipelineModule, DealModule, AutomationModule, ImportExportModule, CustomFieldsModule, ProductModule, ScoringModule, LeadScoringModule],
})
export class CrmModule {}

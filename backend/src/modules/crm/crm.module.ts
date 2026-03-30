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
import { ForecastingModule } from './forecasting/forecasting.module';
import { ChurnModule } from './churn/churn.module';
import { NBAModule } from './nba/nba.module';
import { GovernanceModule } from './governance/governance.module';

/**
 * CrmModule - Umbrella module for all CRM sub-modules.
 * Phase 1: Account, Pipeline, Deal, Import/Export, Custom Fields, Product, Scoring.
 * Phase 2: Lead Scoring, Forecasting, Churn Prediction, NBA, Governance (Intelligence Layer).
 */
@Module({
  imports: [AccountModule, PipelineModule, DealModule, AutomationModule, ImportExportModule, CustomFieldsModule, ProductModule, ScoringModule, LeadScoringModule, ForecastingModule, ChurnModule, NBAModule, GovernanceModule],
  exports: [AccountModule, PipelineModule, DealModule, AutomationModule, ImportExportModule, CustomFieldsModule, ProductModule, ScoringModule, LeadScoringModule, ForecastingModule, ChurnModule, NBAModule, GovernanceModule],
})
export class CrmModule {}

import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { DealModule } from './deal/deal.module';
import { AutomationModule } from './automation/automation.module';

/**
 * CrmModule - Umbrella module for all CRM sub-modules.
 * Phase 1: Account management + Pipeline/Stage management + Deal management.
 */
@Module({
  imports: [AccountModule, PipelineModule, DealModule, AutomationModule],
  exports: [AccountModule, PipelineModule, DealModule, AutomationModule],
})
export class CrmModule {}

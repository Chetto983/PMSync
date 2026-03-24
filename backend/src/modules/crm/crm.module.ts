import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module';
import { PipelineModule } from './pipeline/pipeline.module';

/**
 * CrmModule - Umbrella module for all CRM sub-modules.
 * Phase 1: Account management + Pipeline/Stage management.
 */
@Module({
  imports: [AccountModule, PipelineModule],
  exports: [AccountModule, PipelineModule],
})
export class CrmModule {}

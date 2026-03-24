import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module';

/**
 * CrmModule - Umbrella module for all CRM sub-modules.
 * Phase 1: Account management.
 * Future: Pipeline, Deal, Product, Ticket modules.
 */
@Module({
  imports: [AccountModule],
  exports: [AccountModule],
})
export class CrmModule {}

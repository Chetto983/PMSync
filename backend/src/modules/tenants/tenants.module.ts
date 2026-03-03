import { Module } from '@nestjs/common';
import { TenantService } from './services/tenant.service';
import { TenantsController } from './controllers/tenants.controller';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * TenantsModule - Tenant CRUD and lifecycle management.
 *
 * Phase 32: Decoupled from ComplianceModule.
 * - TenantDeletedEvent replaces direct GdprService injection
 * - GdprEventHandlerService in ComplianceModule consumes the event
 */
@Module({
  imports: [
    PrismaModule,
    // Phase 32: No forwardRef to ComplianceModule. Uses TenantDeletedEvent instead.
    // EventEmitterModule is globally available via AppModule.
  ],
  providers: [TenantService],
  controllers: [TenantsController],
  exports: [TenantService],
})
export class TenantsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TenantService } from './services/tenant.service';
import { TenantsController } from './controllers/tenants.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ComplianceModule } from '../compliance/compliance.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ComplianceModule), // For GDPR cleanup on tenant deletion
  ],
  providers: [TenantService],
  controllers: [TenantsController],
  exports: [TenantService],
})
export class TenantsModule {}

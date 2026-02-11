import { Module } from '@nestjs/common';
import { AuditService } from '../../common/services/audit.service';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AuditService, AuditLogInterceptor],
  exports: [AuditService, AuditLogInterceptor],
})
export class AuditModule {}

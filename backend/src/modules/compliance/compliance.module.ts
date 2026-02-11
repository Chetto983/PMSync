import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GdprService } from './services/gdpr.service';
import { GdprController } from './controllers/gdpr.controller';
import { ConsentService } from './services/consent.service';
import { ConsentEnforcementService } from './services/consent-enforcement.service';
import { ConsentGuard } from './guards/consent.guard';
import { ConsentController } from './controllers/consent.controller';
import { LegalAcceptanceService } from './services/legal-acceptance.service';
import { LegalAcceptanceGuard } from './guards/legal-acceptance.guard';
import { LegalController } from './controllers/legal.controller';
import { AccountDeletionService } from './services/account-deletion.service';
import { DataDeletionController } from './controllers/data-deletion.controller';
import { DataExportService } from './services/data-export.service';
import { DataExportController } from './controllers/data-export.controller';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule, // For AuditService in AccountDeletionService
    forwardRef(() => AiModule), // For MistralAgentCleanupService (GDPR agent deletion)
  ],
  controllers: [
    GdprController,
    ConsentController,
    LegalController,
    DataDeletionController,
    DataExportController,
  ],
  providers: [
    GdprService,
    ConsentService,
    ConsentEnforcementService,
    ConsentGuard,
    LegalAcceptanceService,
    LegalAcceptanceGuard,
    AccountDeletionService,
    DataExportService,
  ],
  exports: [
    GdprService,
    ConsentService,
    ConsentEnforcementService,
    ConsentGuard,
    LegalAcceptanceService,
    LegalAcceptanceGuard,
    AccountDeletionService,
    DataExportService,
  ],
})
export class ComplianceModule {}

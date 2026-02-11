import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GdprService } from './services/gdpr.service';
import { GdprController } from './controllers/gdpr.controller';
import { ConsentService } from './services/consent.service';
import { ConsentEnforcementService } from './services/consent-enforcement.service';
import { ConsentGuard } from './guards/consent.guard';
import { ConsentController } from './controllers/consent.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AiModule), // For MistralAgentCleanupService (GDPR agent deletion)
  ],
  controllers: [GdprController, ConsentController],
  providers: [GdprService, ConsentService, ConsentEnforcementService, ConsentGuard],
  exports: [GdprService, ConsentService, ConsentEnforcementService, ConsentGuard],
})
export class ComplianceModule {}

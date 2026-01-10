import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GdprService } from './services/gdpr.service';
import { GdprController } from './controllers/gdpr.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AiModule), // For MistralAgentCleanupService (GDPR agent deletion)
  ],
  controllers: [GdprController],
  providers: [GdprService],
  exports: [GdprService], // Export for TenantService
})
export class ComplianceModule {}

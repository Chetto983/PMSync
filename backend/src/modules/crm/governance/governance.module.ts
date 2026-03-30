import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { GovernanceService } from './governance.service';
import { GovernanceController } from './governance.controller';
import { DriftDetectionService } from './drift-detection.service';

@Module({
  imports: [PrismaModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, DriftDetectionService],
  exports: [GovernanceService, DriftDetectionService],
})
export class GovernanceModule {}

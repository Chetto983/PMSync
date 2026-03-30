import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiModule } from '../../ai/ai.module';
import { ChurnFeatureService } from './churn-feature.service';
import { ChurnAssessmentService } from './churn-assessment.service';
import { ChurnController } from './churn.controller';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [ChurnController],
  providers: [ChurnFeatureService, ChurnAssessmentService],
  exports: [ChurnAssessmentService, ChurnFeatureService],
})
export class ChurnModule {}

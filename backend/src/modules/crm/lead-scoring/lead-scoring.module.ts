import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { EngagementFeatureService } from './engagement-feature.service';
import { FirmographicFeatureService } from './firmographic-feature.service';
import { BehavioralFeatureService } from './behavioral-feature.service';
import { FeatureStoreService } from './feature-store.service';
import { LeadFeatureJobService } from './lead-feature-job.service';
import { LeadScoringService } from './lead-scoring.service';

@Module({
  imports: [PrismaModule],
  providers: [
    EngagementFeatureService,
    FirmographicFeatureService,
    BehavioralFeatureService,
    FeatureStoreService,
    LeadFeatureJobService,
    LeadScoringService,
  ],
  exports: [FeatureStoreService, LeadScoringService],
})
export class LeadScoringModule {}

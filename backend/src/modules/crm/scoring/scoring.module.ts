import { Module } from '@nestjs/common';
import { DealScoringService } from './deal-scoring.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DealScoringService],
  exports: [DealScoringService],
})
export class ScoringModule {}

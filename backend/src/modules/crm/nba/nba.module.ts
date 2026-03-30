import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { NBAContextService } from './nba-context.service';
import { NBARankingService } from './nba-ranking.service';
import { NBAService } from './nba.service';
import { NBAController } from './nba.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NBAController],
  providers: [NBAContextService, NBARankingService, NBAService],
  exports: [NBAService],
})
export class NBAModule {}

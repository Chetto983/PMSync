import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { AiModule } from '../ai/ai.module';
import { CrmModule } from '../crm/crm.module';
import { CalendarModule } from '../calendar/calendar.module';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardTodayService } from './services/dashboard-today.service';
import { TodayScorerService } from './services/today-scorer.service';

/**
 * Phase 145 — DashboardModule.
 *
 * Wires the GET /dashboard/today endpoint and its aggregator. Imports
 * TasksModule (TasksAggregationService), AiModule (BriefingService),
 * CrmModule (DealService — re-exported via DealModule), and CalendarModule
 * (calendar event direct Prisma queries are colocated here, but the import
 * keeps DI happy if calendar primitives are ever needed).
 *
 * No exports — no other module consumes the dashboard.
 */
@Module({
  imports: [PrismaModule, TasksModule, AiModule, CrmModule, CalendarModule],
  controllers: [DashboardController],
  providers: [DashboardTodayService, TodayScorerService],
})
export class DashboardModule {}

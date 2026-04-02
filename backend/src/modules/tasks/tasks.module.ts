import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TasksController } from './controllers/tasks.controller';
import { TasksAggregationService } from './services/tasks-aggregation.service';
import { ManualTaskService } from './services/manual-task.service';
import { SmartViewService } from './services/smart-view.service';

@Module({
  imports: [PrismaModule],
  controllers: [TasksController],
  providers: [TasksAggregationService, ManualTaskService, SmartViewService],
  exports: [TasksAggregationService, ManualTaskService, SmartViewService],
})
export class TasksModule {}

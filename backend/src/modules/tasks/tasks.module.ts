import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TasksController } from './controllers/tasks.controller';
import { TasksAggregationService } from './services/tasks-aggregation.service';
import { ManualTaskService } from './services/manual-task.service';

@Module({
  imports: [PrismaModule],
  controllers: [TasksController],
  providers: [TasksAggregationService, ManualTaskService],
  exports: [TasksAggregationService, ManualTaskService],
})
export class TasksModule {}

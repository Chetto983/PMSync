import { Module } from '@nestjs/common';
import { TicketController } from './controllers/ticket.controller';
import { RoutingRuleController } from './controllers/routing-rule.controller';
import { TicketService } from './services/ticket.service';
import { EmailToTicketHandler } from './services/email-to-ticket.handler';
import { SlaTimerService } from './services/sla-timer.service';
import { RoutingRuleService } from './services/routing-rule.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TicketController, RoutingRuleController],
  providers: [TicketService, EmailToTicketHandler, SlaTimerService, RoutingRuleService],
  exports: [TicketService, SlaTimerService, RoutingRuleService],
})
export class TicketModule {}

import { Module } from '@nestjs/common';
import { TicketController } from './controllers/ticket.controller';
import { RoutingRuleController } from './controllers/routing-rule.controller';
import { PortalTicketController } from './controllers/portal-ticket.controller';
import { PortalCsatController } from './controllers/portal-csat.controller';
import { TicketService } from './services/ticket.service';
import { EmailToTicketHandler } from './services/email-to-ticket.handler';
import { SlaTimerService } from './services/sla-timer.service';
import { RoutingRuleService } from './services/routing-rule.service';
import { CsatService } from './services/csat.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RealtimeModule } from '../../realtime/realtime.module';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [TicketController, RoutingRuleController, PortalTicketController, PortalCsatController],
  providers: [TicketService, EmailToTicketHandler, SlaTimerService, RoutingRuleService, CsatService],
  exports: [TicketService, SlaTimerService, RoutingRuleService, CsatService],
})
export class TicketModule {}

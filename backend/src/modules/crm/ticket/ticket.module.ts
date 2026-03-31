import { Module } from '@nestjs/common';
import { TicketController } from './controllers/ticket.controller';
import { TicketService } from './services/ticket.service';
import { EmailToTicketHandler } from './services/email-to-ticket.handler';
import { SlaTimerService } from './services/sla-timer.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TicketController],
  providers: [TicketService, EmailToTicketHandler, SlaTimerService],
  exports: [TicketService, SlaTimerService],
})
export class TicketModule {}

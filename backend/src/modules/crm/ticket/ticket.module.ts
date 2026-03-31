import { Module } from '@nestjs/common';
import { TicketController } from './controllers/ticket.controller';
import { TicketService } from './services/ticket.service';
import { EmailToTicketHandler } from './services/email-to-ticket.handler';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TicketController],
  providers: [TicketService, EmailToTicketHandler],
  exports: [TicketService],
})
export class TicketModule {}

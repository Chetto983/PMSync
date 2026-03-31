import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateTicketDto,
  UpdateTicketDto,
  ListTicketsQueryDto,
  ChangeTicketStatusDto,
  CreateTicketCommentDto,
  TICKET_STATUS_TRANSITIONS,
  TicketStatus,
} from '../dto/ticket.dto';
import { SlaTimerService } from './sla-timer.service';
import { RoutingRuleService } from './routing-rule.service';
import { CsatService } from './csat.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import type { CrmTicketEventPayload } from '../../../realtime/types/realtime.types';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slaTimer: SlaTimerService,
    private readonly routingRules: RoutingRuleService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly csatService: CsatService,
  ) {}

  private buildTicketPayload(ticket: { id: string; subject: string; status: string; priority: string; assigneeId: string | null; slaDeadline: Date | string | null }): CrmTicketEventPayload {
    return {
      ticketId: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      assigneeId: ticket.assigneeId,
      slaDeadline: ticket.slaDeadline ? new Date(ticket.slaDeadline).toISOString() : null,
    };
  }

  // ---- CRUD ----

  async list(tenantId: string, query: ListTicketsQueryDto) {
    const where: Prisma.TicketWhereInput = { tenantId };

    if (query.search) {
      where.subject = { contains: query.search, mode: 'insensitive' };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.assigneeId) {
      where.assigneeId = query.assigneeId;
    }
    if (query.contactId) {
      where.contactId = query.contactId;
    }
    if (query.accountId) {
      where.accountId = query.accountId;
    }

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          contact: { select: { id: true, tenantId: true, displayName: true } },
          account: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 25,
        skip: query.offset ?? 0,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data, total, limit: query.limit ?? 25, offset: query.offset ?? 0 };
  }

  async findById(tenantId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, tenantId },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        contact: { select: { id: true, tenantId: true, displayName: true, emails: true } },
        account: { select: { id: true, name: true } },
        comments: {
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
    return ticket;
  }

  async create(tenantId: string, dto: CreateTicketDto) {
    const data: Prisma.TicketCreateInput = {
      tenant: { connect: { id: tenantId } },
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority ?? 'medium',
      slaDeadline: dto.slaDeadline ? new Date(dto.slaDeadline) : undefined,
      emailThreadId: dto.emailThreadId,
    };

    if (dto.assigneeId) {
      data.assignee = { connect: { id: dto.assigneeId } };
    }
    if (dto.contactId) {
      data.contact = {
        connect: { id_tenantId: { id: dto.contactId, tenantId } },
      };
    }
    if (dto.accountId) {
      data.account = { connect: { id: dto.accountId } };
    }
    if (dto.emailId) {
      data.email = {
        connect: { id_tenantId: { id: dto.emailId, tenantId } },
      };
    }

    // Evaluate routing rules before creation to apply assignee/priority
    const routingAction = await this.routingRules.evaluate(tenantId, {
      subject: dto.subject,
      priority: data.priority as string,
      senderEmail: dto.senderEmail,
    });
    if (routingAction) {
      if (routingAction.assignTo && !dto.assigneeId) {
        data.assignee = { connect: { id: routingAction.assignTo } };
      }
      if (routingAction.setPriority) {
        data.priority = routingAction.setPriority;
      }
    }

    let ticket = await this.prisma.ticket.create({
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        contact: { select: { id: true, tenantId: true, displayName: true } },
        account: { select: { id: true, name: true } },
      },
    });

    // Schedule SLA timer based on (potentially routing-modified) priority
    const slaResult = await this.slaTimer.scheduleForTicket(
      ticket.id,
      tenantId,
      ticket.priority,
    );
    if (slaResult) {
      ticket = await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          slaPolicyId: slaResult.slaPolicyId,
          slaDeadline: slaResult.slaDeadline,
        },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          contact: { select: { id: true, tenantId: true, displayName: true } },
          account: { select: { id: true, name: true } },
        },
      });
    }

    this.logger.log(`Ticket created: ${ticket.id} [${ticket.subject}]`);
    this.realtimeEvents.emitTicketCreated(tenantId, this.buildTicketPayload(ticket));
    return ticket;
  }

  async update(tenantId: string, id: string, dto: UpdateTicketDto) {
    await this.ensureExists(tenantId, id);

    const data: Prisma.TicketUpdateInput = {};
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.slaDeadline !== undefined) {
      data.slaDeadline = dto.slaDeadline ? new Date(dto.slaDeadline) : null;
    }

    // Handle nullable FK relations
    if (dto.assigneeId !== undefined) {
      data.assignee = dto.assigneeId
        ? { connect: { id: dto.assigneeId } }
        : { disconnect: true };
    }
    if (dto.contactId !== undefined) {
      data.contact = dto.contactId
        ? { connect: { id_tenantId: { id: dto.contactId, tenantId } } }
        : { disconnect: true };
    }
    if (dto.accountId !== undefined) {
      data.account = dto.accountId
        ? { connect: { id: dto.accountId } }
        : { disconnect: true };
    }

    return this.prisma.ticket.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        contact: { select: { id: true, tenantId: true, displayName: true } },
        account: { select: { id: true, name: true } },
      },
    });
  }

  async delete(tenantId: string, id: string) {
    await this.ensureExists(tenantId, id);
    await this.prisma.ticket.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- Status State Machine ----

  async changeStatus(tenantId: string, id: string, dto: ChangeTicketStatusDto) {
    const ticket = await this.ensureExists(tenantId, id);
    const currentStatus = ticket.status as TicketStatus;
    const targetStatus = dto.status as TicketStatus;

    const allowed = TICKET_STATUS_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new UnprocessableEntityException(
        `Cannot transition from "${currentStatus}" to "${targetStatus}". ` +
          `Allowed: [${(allowed ?? []).join(', ')}]`,
      );
    }

    const data: Prisma.TicketUpdateInput = { status: targetStatus };

    if (targetStatus === 'resolved') {
      data.resolvedAt = new Date();
    }
    if (targetStatus === 'closed') {
      data.closedAt = new Date();
      if (!ticket.resolvedAt) {
        data.resolvedAt = new Date();
      }
    }

    // Cancel SLA timer when ticket reaches terminal state
    if (['resolved', 'closed'].includes(targetStatus)) {
      await this.slaTimer.cancelForTicket(id);
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    this.realtimeEvents.emitTicketUpdated(tenantId, this.buildTicketPayload(updated));

    // Schedule CSAT survey email when ticket is resolved (fire-and-forget)
    if (targetStatus === 'resolved') {
      this.csatService.scheduleForTicket(id, tenantId).catch((err) => {
        this.logger.warn(`Failed to schedule CSAT for ticket ${id}: ${err.message}`);
      });
    }

    return updated;
  }

  // ---- Assignment ----

  async assign(
    tenantId: string,
    ticketId: string,
    assigneeId: string | null | undefined,
    assignedByUserId: string,
  ) {
    const ticket = await this.ensureExists(tenantId, ticketId);
    const previousAssignee = ticket.assigneeId;

    const data: Prisma.TicketUpdateInput = assigneeId
      ? { assignee: { connect: { id: assigneeId } } }
      : { assignee: { disconnect: true } };

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    this.logger.log(
      `Ticket ${ticketId} assigned: ${previousAssignee ?? 'none'} → ${assigneeId ?? 'unassigned'}`,
    );

    // Create audit log for assignment change
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: assignedByUserId,
        action: 'ticket.assign',
        entity: 'Ticket',
        entityId: ticketId,
        changes: {
          previousAssignee,
          newAssignee: assigneeId ?? null,
        },
      },
    });

    this.realtimeEvents.emitTicketAssigned(tenantId, this.buildTicketPayload(updated));
    return updated;
  }

  // ---- Comments ----

  async addComment(tenantId: string, ticketId: string, userId: string, dto: CreateTicketCommentDto) {
    await this.ensureExists(tenantId, ticketId);

    return this.prisma.ticketComment.create({
      data: {
        ticket: { connect: { id: ticketId } },
        author: { connect: { id: userId } },
        body: dto.body,
        isInternal: dto.isInternal ?? false,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async listComments(tenantId: string, ticketId: string, includeInternal = true) {
    await this.ensureExists(tenantId, ticketId);

    const where: Prisma.TicketCommentWhereInput = { ticketId };
    if (!includeInternal) {
      where.isInternal = false;
    }

    return this.prisma.ticketComment.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---- Helpers ----

  private async ensureExists(tenantId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, tenantId },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
    return ticket;
  }
}

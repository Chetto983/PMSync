/**
 * Phase 3 Ticketing — Integration Tests
 *
 * Validates the end-to-end ticketing flow:
 * Create → Routing → Assign → SLA → Status transitions → Resolve → CSAT
 *
 * Uses mocked PrismaService to verify service wiring and data flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketService } from '../ticket/services/ticket.service';
import { TICKET_STATUS_TRANSITIONS } from '../ticket/dto/ticket.dto';

// ============ Mock Factories ============

const TENANT_ID = 'tenant-001';
const USER_ID = 'user-001';

function createMockTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-001',
    tenantId: TENANT_ID,
    subject: '[SUPPORT] Cannot login',
    description: 'User reports login failure',
    status: 'open',
    priority: 'medium',
    assigneeId: null,
    contactId: 'contact-001',
    accountId: null,
    emailId: null,
    emailTenant: null,
    emailThreadId: null,
    slaDeadline: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date('2026-03-20'),
    updatedAt: new Date('2026-03-20'),
    assignee: null,
    contact: { id: 'contact-001', tenantId: TENANT_ID, displayName: 'John Doe' },
    account: null,
    comments: [],
    ...overrides,
  };
}

function createMockPrisma() {
  const mockTicket = createMockTicket();
  return {
    ticket: {
      create: vi.fn().mockResolvedValue(mockTicket),
      findFirst: vi.fn().mockResolvedValue(mockTicket),
      findMany: vi.fn().mockResolvedValue([mockTicket]),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        ...mockTicket,
        ...data,
        // Flatten Prisma relational syntax
        ...(data.assignee?.connect ? { assigneeId: data.assignee.connect.id } : {}),
        assignee: data.assignee?.connect
          ? { id: data.assignee.connect.id, name: 'Agent Smith', email: 'agent@test.com' }
          : null,
      })),
      delete: vi.fn().mockResolvedValue({ id: 'ticket-001' }),
      count: vi.fn().mockResolvedValue(1),
    },
    ticketComment: {
      create: vi.fn().mockResolvedValue({
        id: 'comment-001',
        ticketId: 'ticket-001',
        authorId: USER_ID,
        body: 'Working on this',
        isInternal: false,
        createdAt: new Date(),
        author: { id: USER_ID, name: 'Agent Smith', email: 'agent@test.com' },
      }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    csatSurvey: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'csat-001', token: 'survey-token-123' }),
      update: vi.fn().mockResolvedValue({}),
    },
    routingRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    slaPolicy: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

function createMockSlaTimer() {
  return {
    scheduleForTicket: vi.fn().mockResolvedValue(null),
    cancelForTicket: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRoutingRules() {
  return {
    evaluate: vi.fn().mockResolvedValue(null),
  };
}

function createMockRealtimeEvents() {
  return {
    emitTicketCreated: vi.fn(),
    emitTicketUpdated: vi.fn(),
    emitTicketAssigned: vi.fn(),
  };
}

function createMockCsatService() {
  return {
    scheduleForTicket: vi.fn().mockResolvedValue(undefined),
  };
}

// ============ Tests ============

describe('Phase 3 Integration — Ticketing Flow', () => {
  let service: TicketService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let slaTimer: ReturnType<typeof createMockSlaTimer>;
  let routingRules: ReturnType<typeof createMockRoutingRules>;
  let realtimeEvents: ReturnType<typeof createMockRealtimeEvents>;
  let csatService: ReturnType<typeof createMockCsatService>;

  beforeEach(() => {
    prisma = createMockPrisma();
    slaTimer = createMockSlaTimer();
    routingRules = createMockRoutingRules();
    realtimeEvents = createMockRealtimeEvents();
    csatService = createMockCsatService();

    service = new TicketService(
      prisma as any,
      slaTimer as any,
      routingRules as any,
      realtimeEvents as any,
      csatService as any,
    );
  });

  // ---- 1. Ticket Creation ----

  describe('create', () => {
    it('creates ticket with routing rule evaluation', async () => {
      const result = await service.create(TENANT_ID, {
        subject: 'Cannot login',
        description: 'Login page returns 500',
        priority: 'high',
      });

      expect(prisma.ticket.create).toHaveBeenCalledOnce();
      expect(routingRules.evaluate).toHaveBeenCalledWith(TENANT_ID, {
        subject: 'Cannot login',
        priority: 'high',
        senderEmail: undefined,
      });
      expect(slaTimer.scheduleForTicket).toHaveBeenCalledWith(
        result.id,
        TENANT_ID,
        result.priority,
      );
      expect(result.id).toBe('ticket-001');
    });

    it('applies routing rule auto-assignment', async () => {
      routingRules.evaluate.mockResolvedValue({
        assignTo: 'agent-002',
        setPriority: 'urgent',
      });

      await service.create(TENANT_ID, {
        subject: 'VIP client issue',
      });

      const createCall = prisma.ticket.create.mock.calls[0][0];
      expect(createCall.data.assignee).toEqual({ connect: { id: 'agent-002' } });
      expect(createCall.data.priority).toBe('urgent');
    });

    it('does not override explicit assignee with routing rule', async () => {
      routingRules.evaluate.mockResolvedValue({
        assignTo: 'agent-002',
      });

      await service.create(TENANT_ID, {
        subject: 'Issue',
        assigneeId: 'agent-003',
      });

      const createCall = prisma.ticket.create.mock.calls[0][0];
      // Explicit assignee should NOT be overridden
      expect(createCall.data.assignee).toEqual({ connect: { id: 'agent-003' } });
    });
  });

  // ---- 2. Status State Machine ----

  describe('changeStatus', () => {
    it('transitions open → in_progress', async () => {
      const result = await service.changeStatus(TENANT_ID, 'ticket-001', {
        status: 'in_progress',
      });

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-001', tenantId: TENANT_ID },
          data: { status: 'in_progress' },
        }),
      );
      expect(realtimeEvents.emitTicketUpdated).toHaveBeenCalledOnce();
    });

    it('rejects invalid transition open → resolved', async () => {
      await expect(
        service.changeStatus(TENANT_ID, 'ticket-001', { status: 'resolved' }),
      ).rejects.toThrow('Cannot transition from "open" to "resolved"');
    });

    it('sets resolvedAt when transitioning to resolved', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        createMockTicket({ status: 'in_progress' }),
      );

      await service.changeStatus(TENANT_ID, 'ticket-001', { status: 'resolved' });

      const updateCall = prisma.ticket.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('resolved');
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
    });

    it('cancels SLA timer on resolution', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        createMockTicket({ status: 'in_progress' }),
      );

      await service.changeStatus(TENANT_ID, 'ticket-001', { status: 'resolved' });

      expect(slaTimer.cancelForTicket).toHaveBeenCalledWith('ticket-001');
    });

    it('schedules CSAT survey on resolution', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        createMockTicket({ status: 'in_progress' }),
      );

      await service.changeStatus(TENANT_ID, 'ticket-001', { status: 'resolved' });

      expect(csatService.scheduleForTicket).toHaveBeenCalledWith(
        'ticket-001',
        TENANT_ID,
      );
    });

    it('sets closedAt when transitioning to closed', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        createMockTicket({ status: 'in_progress' }),
      );

      await service.changeStatus(TENANT_ID, 'ticket-001', { status: 'closed' });

      const updateCall = prisma.ticket.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('closed');
      expect(updateCall.data.closedAt).toBeInstanceOf(Date);
      // Also sets resolvedAt if not already resolved
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
    });

    it('does not overwrite resolvedAt when closing already-resolved ticket', async () => {
      const resolvedDate = new Date('2026-03-25');
      prisma.ticket.findFirst.mockResolvedValue(
        createMockTicket({ status: 'resolved', resolvedAt: resolvedDate }),
      );

      await service.changeStatus(TENANT_ID, 'ticket-001', { status: 'closed' });

      const updateCall = prisma.ticket.update.mock.calls[0][0];
      expect(updateCall.data.resolvedAt).toBeUndefined();
      expect(updateCall.data.closedAt).toBeInstanceOf(Date);
    });
  });

  // ---- 3. Assignment ----

  describe('assign', () => {
    it('assigns ticket and creates audit log', async () => {
      await service.assign(TENANT_ID, 'ticket-001', 'agent-002', USER_ID);

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { assignee: { connect: { id: 'agent-002' } } },
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            userId: USER_ID,
            action: 'ticket.assign',
            entity: 'Ticket',
            entityId: 'ticket-001',
          }),
        }),
      );
      expect(realtimeEvents.emitTicketAssigned).toHaveBeenCalledOnce();
    });

    it('unassigns ticket when assigneeId is null', async () => {
      await service.assign(TENANT_ID, 'ticket-001', null, USER_ID);

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { assignee: { disconnect: true } },
        }),
      );
    });
  });

  // ---- 4. Status Transition Map Completeness ----

  describe('status transition map', () => {
    it('defines transitions for all statuses', () => {
      const statuses = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
      for (const status of statuses) {
        expect(TICKET_STATUS_TRANSITIONS).toHaveProperty(status);
      }
    });

    it('closed has no valid transitions (terminal state)', () => {
      expect(TICKET_STATUS_TRANSITIONS.closed).toEqual([]);
    });

    it('resolved can only transition to closed', () => {
      expect(TICKET_STATUS_TRANSITIONS.resolved).toEqual(['closed']);
    });
  });

  // ---- 5. Delete with tenantId ----

  describe('delete', () => {
    it('deletes ticket with tenantId in where clause', async () => {
      await service.delete(TENANT_ID, 'ticket-001');

      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-001', tenantId: TENANT_ID },
        }),
      );
      expect(prisma.ticket.delete).toHaveBeenCalledWith({
        where: { id: 'ticket-001', tenantId: TENANT_ID },
      });
    });

    it('throws NotFoundException for non-existent ticket', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(
        service.delete(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow('not found');
    });
  });

  // ---- 6. End-to-End Flow ----

  describe('full flow: create → assign → progress → resolve', () => {
    it('completes the happy path', async () => {
      // Step 1: Create ticket
      const ticket = await service.create(TENANT_ID, {
        subject: 'Integration test ticket',
        priority: 'high',
      });
      expect(ticket.id).toBe('ticket-001');
      expect(slaTimer.scheduleForTicket).toHaveBeenCalledOnce();

      // Step 2: Assign to agent
      await service.assign(TENANT_ID, ticket.id, 'agent-002', USER_ID);
      expect(prisma.auditLog.create).toHaveBeenCalledOnce();

      // Step 3: Move to in_progress
      await service.changeStatus(TENANT_ID, ticket.id, {
        status: 'in_progress',
      });
      expect(realtimeEvents.emitTicketUpdated).toHaveBeenCalled();

      // Step 4: Resolve — triggers SLA cancel + CSAT schedule
      prisma.ticket.findFirst.mockResolvedValue(
        createMockTicket({ status: 'in_progress', assigneeId: 'agent-002' }),
      );
      await service.changeStatus(TENANT_ID, ticket.id, {
        status: 'resolved',
      });
      expect(slaTimer.cancelForTicket).toHaveBeenCalledWith(ticket.id);
      expect(csatService.scheduleForTicket).toHaveBeenCalledWith(
        ticket.id,
        TENANT_ID,
      );
    });
  });
});

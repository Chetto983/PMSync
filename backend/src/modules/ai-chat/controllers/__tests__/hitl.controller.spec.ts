import { HitlController } from '../hitl.controller';

describe('HitlController', () => {
  const makeRequest = () =>
    ({
      user: {
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
    }) as any;

  const baseAction = {
    id: 'action-1',
    actionType: 'SEND_EMAIL',
    actionPayload: {
      to: 'user@example.com',
      subject: 'Hello',
      body: 'World',
      conversationId: 'conv-1',
      toolName: 'send_email',
    },
    confidence: 0.9,
    reasoning: 'Send email requires approval',
    createdAt: new Date('2026-03-18T10:00:00.000Z'),
    expiresAt: new Date('2026-03-18T11:00:00.000Z'),
    approvedAt: new Date('2026-03-18T10:01:00.000Z'),
  };

  function makeController() {
    const hitlService = {
      approveAction: jest.fn(),
      rejectAction: jest.fn(),
      getPendingActions: jest.fn(),
      markExecuted: jest.fn(),
      markFailed: jest.fn(),
    };

    const emailExecute = jest.fn();
    const calendarExecute = jest.fn();

    const emailToolsService = {
      getTools: jest.fn(() => ({
        send_email: { execute: emailExecute },
        reply_email: { execute: jest.fn() },
        forward_email: { execute: jest.fn() },
        delete_email: { execute: jest.fn() },
      })),
    };
    const calendarToolsService = {
      getTools: jest.fn(() => ({
        delete_event: { execute: calendarExecute },
      })),
    };
    const contactToolsService = {
      getTools: jest.fn(() => ({})),
    };
    const piiResolutionService = {
      resolvePayload: jest.fn(async (_tenantId: string, _conversationId: string, payload: Record<string, unknown>) => payload),
    };

    const controller = new HitlController(
      hitlService as any,
      emailToolsService as any,
      calendarToolsService as any,
      contactToolsService as any,
      piiResolutionService as any,
    );

    return {
      controller,
      hitlService,
      emailExecute,
      calendarExecute,
      piiResolutionService,
    };
  }

  it('maps pending actions to the normalized frontend DTO', async () => {
    const { controller, hitlService } = makeController();
    hitlService.getPendingActions.mockResolvedValue([baseAction]);

    const result = await controller.getPendingActions(makeRequest(), undefined);

    expect(result.total).toBe(1);
    expect(result.actions[0]).toEqual(
      expect.objectContaining({
        id: 'action-1',
        executionId: 'action-1',
        actionType: 'SEND_EMAIL',
        severity: 'HIGH',
        summary: 'Send email requires approval',
        payload: expect.objectContaining({
          to: 'user@example.com',
          toolName: 'send_email',
          conversationId: 'conv-1',
        }),
        suspendReason: 'requires_approval',
        userId: 'user-1',
        agentName: 'ai-chat',
        status: 'PENDING',
      }),
    );
  });

  it('approves and executes the stored tool name via the AI tool services', async () => {
    const {
      controller,
      hitlService,
      emailExecute,
    } = makeController();
    hitlService.approveAction.mockResolvedValue(baseAction);
    emailExecute.mockResolvedValue({ jobId: 'job-1', status: 'queued' });

    const result = await controller.approve(makeRequest(), {
      actionId: 'action-1',
      decision: 'approve',
    });

    expect(emailExecute).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Hello',
      body: 'World',
    });
    expect(hitlService.markExecuted).toHaveBeenCalledWith(
      'action-1',
      expect.objectContaining({
        toolName: 'send_email',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'approved',
        approved: true,
        executionResult: expect.objectContaining({
          success: true,
        }),
      }),
    );
  });

  it('routes legacy delete-event payloads to calendar delete instead of email delete', async () => {
    const {
      controller,
      hitlService,
      calendarExecute,
      emailExecute,
    } = makeController();
    hitlService.approveAction.mockResolvedValue({
      ...baseAction,
      actionType: 'DELETE_EMAIL',
      actionPayload: {
        eventId: 'evt-1',
        conversationId: 'conv-2',
      },
    });
    calendarExecute.mockResolvedValue({ id: 'evt-1', deleted: true });

    await controller.approve(makeRequest(), {
      actionId: 'action-2',
      decision: 'approve',
    });

    expect(calendarExecute).toHaveBeenCalledWith({ eventId: 'evt-1' });
    expect(emailExecute).not.toHaveBeenCalled();
  });
});

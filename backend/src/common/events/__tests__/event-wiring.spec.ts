import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantDeletedEvent } from '../tenant.events';
import { DeletionExpiredEvent } from '../compliance.events';

/**
 * Integration test: proves emit -> @OnEvent handler fires.
 * Validates the event bus pattern before Plan 02 wires real handlers.
 */

@Injectable()
class TenantDeletedHandler {
  public received: TenantDeletedEvent | null = null;

  @OnEvent(TenantDeletedEvent.eventName)
  handleTenantDeleted(event: TenantDeletedEvent): void {
    this.received = event;
  }
}

@Injectable()
class DeletionExpiredHandler {
  public received: DeletionExpiredEvent | null = null;

  @OnEvent(DeletionExpiredEvent.eventName)
  handleDeletionExpired(event: DeletionExpiredEvent): void {
    this.received = event;
  }
}

describe('Event Wiring Integration', () => {
  let emitter: EventEmitter2;
  let tenantHandler: TenantDeletedHandler;
  let complianceHandler: DeletionExpiredHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [TenantDeletedHandler, DeletionExpiredHandler],
    }).compile();

    await module.init();

    emitter = module.get(EventEmitter2);
    tenantHandler = module.get(TenantDeletedHandler);
    complianceHandler = module.get(DeletionExpiredHandler);
  });

  it('TenantDeletedEvent: emit -> @OnEvent handler fires with correct payload', async () => {
    const now = new Date();
    const event = new TenantDeletedEvent('tenant-123', now);

    emitter.emit(TenantDeletedEvent.eventName, event);

    // EventEmitter2 is synchronous by default
    expect(tenantHandler.received).toBeDefined();
    expect(tenantHandler.received!.tenantId).toBe('tenant-123');
    expect(tenantHandler.received!.deletedAt).toBe(now);
  });

  it('DeletionExpiredEvent: emit -> @OnEvent handler fires with correct payload', async () => {
    const now = new Date();
    const event = new DeletionExpiredEvent('tenant-456', 'user-789', now);

    emitter.emit(DeletionExpiredEvent.eventName, event);

    expect(complianceHandler.received).toBeDefined();
    expect(complianceHandler.received!.tenantId).toBe('tenant-456');
    expect(complianceHandler.received!.userId).toBe('user-789');
    expect(complianceHandler.received!.expiredAt).toBe(now);
  });

  it('static eventName matches expected string literal', () => {
    expect(TenantDeletedEvent.eventName).toBe('tenant.deleted');
    expect(DeletionExpiredEvent.eventName).toBe('compliance.deletion-expired');
  });
});

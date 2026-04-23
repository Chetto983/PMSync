import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TriageCorrectionService } from '../triage-correction.service';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('TriageCorrectionService.getFewShotExamples', () => {
  let service: TriageCorrectionService;
  const prismaMock = {
    emailTriageFeedback: { findMany: jest.fn() },
    email: { findMany: jest.fn() },
  };
  const configMock = {
    // Phase 149 D-01: default to '14' so the service's halfLifeDays resolves to 14
    // (matches previous inlined DECAY_HALF_LIFE_DAYS = 14 semantics for existing cases).
    get: jest.fn((_key: string, defaultValue?: string) => defaultValue ?? '14'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        TriageCorrectionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = mod.get(TriageCorrectionService);
  });

  it('returns [] when no corrections exist', async () => {
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([]);
    const result = await service.getFewShotExamples('t1', 'boss@acme.com');
    expect(result).toEqual([]);
    expect(prismaMock.emailTriageFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', signal: 'correction' }),
      }),
    );
  });

  it('returns at most 3 examples (D-09c hard cap)', async () => {
    const now = new Date();
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
      { emailId: 'e1', oldValue: 'Newsletter', newValue: 'Work', createdAt: now },
      { emailId: 'e2', oldValue: 'Newsletter', newValue: 'Important', createdAt: now },
      { emailId: 'e3', oldValue: 'Newsletter', newValue: 'Sales', createdAt: now },
      { emailId: 'e4', oldValue: 'Newsletter', newValue: 'Support', createdAt: now },
    ]);
    prismaMock.email.findMany.mockResolvedValue([
      { id: 'e1', from: 'boss@acme.com' },
      { id: 'e2', from: 'boss@acme.com' },
      { id: 'e3', from: 'boss@acme.com' },
      { id: 'e4', from: 'boss@acme.com' },
    ]);
    const result = await service.getFewShotExamples('t1', 'boss@acme.com');
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('prefers sender matches (D-09a: sender-first)', async () => {
    const now = new Date();
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
      { emailId: 'sender', oldValue: 'N', newValue: 'SenderTarget', createdAt: now },
      { emailId: 'sender', oldValue: 'N', newValue: 'AnotherSenderTarget', createdAt: now },
      { emailId: 'other', oldValue: 'N', newValue: 'DomainTarget', createdAt: now },
    ]);
    prismaMock.email.findMany.mockResolvedValue([
      { id: 'sender', from: 'boss@acme.com' },
      { id: 'other', from: 'coworker@acme.com' },
    ]);
    const result = await service.getFewShotExamples('t1', 'boss@acme.com');
    const targets = result.map((r) => r.newValue);
    expect(targets).toEqual(expect.arrayContaining(['SenderTarget', 'AnotherSenderTarget']));
    expect(targets).not.toContain('DomainTarget');
  });

  it('falls back to domain when sender < 2 targets', async () => {
    const now = new Date();
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
      { emailId: 'sender', oldValue: 'N', newValue: 'SenderTarget', createdAt: now },
      { emailId: 'other', oldValue: 'N', newValue: 'DomainTarget', createdAt: now },
    ]);
    prismaMock.email.findMany.mockResolvedValue([
      { id: 'sender', from: 'boss@acme.com' },
      { id: 'other', from: 'coworker@acme.com' },
    ]);
    const result = await service.getFewShotExamples('t1', 'boss@acme.com');
    const targets = result.map((r) => r.newValue);
    expect(targets).toEqual(expect.arrayContaining(['SenderTarget', 'DomainTarget']));
  });

  it('ignores signal=edit rows (D-03: only signal=correction counts)', async () => {
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([]);
    await service.getFewShotExamples('t1', 'x@y.com');
    expect(prismaMock.emailTriageFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ signal: 'correction' }),
      }),
    );
  });
});

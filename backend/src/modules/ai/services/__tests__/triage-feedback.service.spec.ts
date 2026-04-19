import { Test } from '@nestjs/testing';
import { TriageFeedbackService } from '../triage-feedback.service';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('TriageFeedbackService', () => {
  let service: TriageFeedbackService;
  const prismaMock = {
    emailTriageFeedback: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn(),
    },
    email: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.emailTriageFeedback.count.mockResolvedValue(0);
    const mod = await Test.createTestingModule({
      providers: [
        TriageFeedbackService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = mod.get(TriageFeedbackService);
  });

  describe('recordFeedback', () => {
    it('persists the signal column (D-01 required param)', async () => {
      prismaMock.emailTriageFeedback.create.mockResolvedValue({
        id: 'f1',
        tenantId: 't1',
        emailId: 'e1',
        type: 'label_correction',
        signal: 'correction',
        oldValue: 'A',
        newValue: 'B',
        createdAt: new Date(),
      });
      await service.recordFeedback({
        tenantId: 't1',
        emailId: 'e1',
        type: 'label_correction',
        signal: 'correction',
        oldValue: 'A',
        newValue: 'B',
      });
      expect(prismaMock.emailTriageFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ signal: 'correction', tenantId: 't1' }),
      });
    });
  });

  describe('captureLabelDiff', () => {
    it('no-op on pure_reorder (same set, different order)', async () => {
      await service.captureLabelDiff('t1', 'e1', ['A', 'B'], ['B', 'A']);
      expect(prismaMock.emailTriageFeedback.create).not.toHaveBeenCalled();
    });

    it('no-op on identical labels', async () => {
      await service.captureLabelDiff('t1', 'e1', ['A'], ['A']);
      expect(prismaMock.emailTriageFeedback.create).not.toHaveBeenCalled();
    });

    it('records removed_ai_label as signal=edit with oldValue', async () => {
      prismaMock.emailTriageFeedback.create.mockResolvedValue({ id: 'f1' });
      await service.captureLabelDiff('t1', 'e1', ['Newsletter', 'Work'], ['Work']);
      expect(prismaMock.emailTriageFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          signal: 'edit',
          type: 'label_correction',
          oldValue: 'Newsletter',
          newValue: null,
        }),
      });
    });

    it('records added_back_correction when label was in this email.aiLabels', async () => {
      prismaMock.email.findFirst.mockResolvedValue({
        from: 'boss@acme.com',
        aiLabels: ['Important'],
      });
      prismaMock.email.count.mockResolvedValue(0);
      prismaMock.emailTriageFeedback.create.mockResolvedValue({ id: 'f1' });
      // User added 'Important' back (was originally AI-suggested)
      await service.captureLabelDiff('t1', 'e1', [], ['Important']);
      expect(prismaMock.emailTriageFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          signal: 'edit',
          type: 'label_correction',
          oldValue: null,
          newValue: 'Important',
        }),
      });
    });

    it('records added_back_correction when sibling email had the label', async () => {
      prismaMock.email.findFirst.mockResolvedValue({
        from: 'boss@acme.com',
        aiLabels: [],
      });
      // Sibling email has 'Important' in aiLabels
      prismaMock.email.count.mockResolvedValue(1);
      prismaMock.emailTriageFeedback.create.mockResolvedValue({ id: 'f1' });
      await service.captureLabelDiff('t1', 'e1', [], ['Important']);
      expect(prismaMock.emailTriageFeedback.create).toHaveBeenCalled();
    });

    it('skips added_personal_label when label never AI-suggested', async () => {
      prismaMock.email.findFirst.mockResolvedValue({
        from: 'boss@acme.com',
        aiLabels: [],
      });
      prismaMock.email.count.mockResolvedValue(0);
      await service.captureLabelDiff('t1', 'e1', [], ['MyCustomTag']);
      expect(prismaMock.emailTriageFeedback.create).not.toHaveBeenCalled();
    });
  });

  describe('getSuggestions — concentration rule (D-03 + D-04)', () => {
    const freshDate = () => new Date();

    it('returns no suggestions below 3 corrections', async () => {
      const now = freshDate();
      prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
        { emailId: 'e1', type: 'label_correction', newValue: 'Work', createdAt: now },
        { emailId: 'e2', type: 'label_correction', newValue: 'Work', createdAt: now },
      ]);
      prismaMock.email.findMany.mockResolvedValue([
        { id: 'e1', from: 'boss@acme.com' },
        { id: 'e2', from: 'boss@acme.com' },
      ]);
      const result = await service.getSuggestions('t1');
      expect(result).toEqual([]);
    });

    it('returns sender suggestion at 3 corrections 100% concentrated', async () => {
      const now = freshDate();
      prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
        { emailId: 'e1', type: 'label_correction', newValue: 'Work', createdAt: now },
        { emailId: 'e2', type: 'label_correction', newValue: 'Work', createdAt: now },
        { emailId: 'e3', type: 'label_correction', newValue: 'Work', createdAt: now },
      ]);
      prismaMock.email.findMany.mockResolvedValue([
        { id: 'e1', from: 'boss@acme.com' },
        { id: 'e2', from: 'boss@acme.com' },
        { id: 'e3', from: 'boss@acme.com' },
      ]);
      const result = await service.getSuggestions('t1');
      const senderSuggestions = result.filter((s) => s.scope === 'sender');
      expect(senderSuggestions).toEqual([
        expect.objectContaining({
          scope: 'sender',
          pattern: 'boss@acme.com',
          target: 'Work',
          count: 3,
        }),
      ]);
    });

    it('returns no sender suggestion when <80% concentrated', async () => {
      const now = freshDate();
      // 3 Work + 2 Sales + 1 Support → total 6, max concentration 50%
      prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
        { emailId: 'e1', type: 'label_correction', newValue: 'Work', createdAt: now },
        { emailId: 'e2', type: 'label_correction', newValue: 'Work', createdAt: now },
        { emailId: 'e3', type: 'label_correction', newValue: 'Work', createdAt: now },
        { emailId: 'e4', type: 'label_correction', newValue: 'Sales', createdAt: now },
        { emailId: 'e5', type: 'label_correction', newValue: 'Sales', createdAt: now },
        { emailId: 'e6', type: 'label_correction', newValue: 'Support', createdAt: now },
      ]);
      prismaMock.email.findMany.mockResolvedValue([
        { id: 'e1', from: 'boss@acme.com' },
        { id: 'e2', from: 'boss@acme.com' },
        { id: 'e3', from: 'boss@acme.com' },
        { id: 'e4', from: 'boss@acme.com' },
        { id: 'e5', from: 'boss@acme.com' },
        { id: 'e6', from: 'boss@acme.com' },
      ]);
      const result = await service.getSuggestions('t1');
      const senderSuggestions = result.filter((s) => s.scope === 'sender');
      expect(senderSuggestions).toEqual([]);
    });

    it('where-clause filters signal=correction (D-03: edit rows excluded)', async () => {
      prismaMock.emailTriageFeedback.findMany.mockResolvedValue([]);
      await service.getSuggestions('t1');
      expect(prismaMock.emailTriageFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            signal: 'correction',
            tenantId: 't1',
          }),
        }),
      );
    });

    it('returns domain suggestion at 9 corrections across 3 distinct senders, no role-account', async () => {
      const now = freshDate();
      const rows = [];
      for (let i = 0; i < 9; i++) {
        rows.push({
          emailId: `e${i}`,
          type: 'label_correction',
          newValue: 'Work',
          createdAt: now,
        });
      }
      prismaMock.emailTriageFeedback.findMany.mockResolvedValue(rows);
      prismaMock.email.findMany.mockResolvedValue([
        { id: 'e0', from: 'alice@acme.com' },
        { id: 'e1', from: 'alice@acme.com' },
        { id: 'e2', from: 'alice@acme.com' },
        { id: 'e3', from: 'bob@acme.com' },
        { id: 'e4', from: 'bob@acme.com' },
        { id: 'e5', from: 'bob@acme.com' },
        { id: 'e6', from: 'carol@acme.com' },
        { id: 'e7', from: 'carol@acme.com' },
        { id: 'e8', from: 'carol@acme.com' },
      ]);
      const result = await service.getSuggestions('t1');
      const domainSuggestions = result.filter((s) => s.scope === 'domain');
      expect(domainSuggestions).toEqual([
        expect.objectContaining({
          scope: 'domain',
          pattern: 'acme.com',
          target: 'Work',
          count: 9,
        }),
      ]);
    });

    it('excludes domain when any contributor is a role-account (noreply@)', async () => {
      const now = freshDate();
      const rows = [];
      for (let i = 0; i < 9; i++) {
        rows.push({
          emailId: `e${i}`,
          type: 'label_correction',
          newValue: 'Work',
          createdAt: now,
        });
      }
      prismaMock.emailTriageFeedback.findMany.mockResolvedValue(rows);
      prismaMock.email.findMany.mockResolvedValue([
        { id: 'e0', from: 'alice@acme.com' },
        { id: 'e1', from: 'alice@acme.com' },
        { id: 'e2', from: 'alice@acme.com' },
        { id: 'e3', from: 'bob@acme.com' },
        { id: 'e4', from: 'bob@acme.com' },
        { id: 'e5', from: 'bob@acme.com' },
        { id: 'e6', from: 'noreply@acme.com' }, // role-account
        { id: 'e7', from: 'noreply@acme.com' },
        { id: 'e8', from: 'noreply@acme.com' },
      ]);
      const result = await service.getSuggestions('t1');
      const domainSuggestions = result.filter((s) => s.scope === 'domain');
      expect(domainSuggestions).toEqual([]);
    });

    it('excludes domain when <3 distinct senders even if ≥8 corrections', async () => {
      const now = freshDate();
      const rows = [];
      for (let i = 0; i < 8; i++) {
        rows.push({
          emailId: `e${i}`,
          type: 'label_correction',
          newValue: 'Work',
          createdAt: now,
        });
      }
      prismaMock.emailTriageFeedback.findMany.mockResolvedValue(rows);
      // Only 2 distinct senders
      prismaMock.email.findMany.mockResolvedValue([
        { id: 'e0', from: 'alice@acme.com' },
        { id: 'e1', from: 'alice@acme.com' },
        { id: 'e2', from: 'alice@acme.com' },
        { id: 'e3', from: 'alice@acme.com' },
        { id: 'e4', from: 'bob@acme.com' },
        { id: 'e5', from: 'bob@acme.com' },
        { id: 'e6', from: 'bob@acme.com' },
        { id: 'e7', from: 'bob@acme.com' },
      ]);
      const result = await service.getSuggestions('t1');
      const domainSuggestions = result.filter((s) => s.scope === 'domain');
      expect(domainSuggestions).toEqual([]);
    });
  });
});

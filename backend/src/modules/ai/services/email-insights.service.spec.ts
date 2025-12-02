import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailInsightsService } from './email-insights.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
import { WritingStyleService } from '../voltagent/services/writing-style.service';

describe('EmailInsightsService', () => {
  let service: EmailInsightsService;
  let prismaService: jest.Mocked<PrismaService>;
  let mistralService: jest.Mocked<MistralService>;

  // Mock email data
  const mockEmail = {
    id: 'email-id-123',
    tenantId: 'tenant-id-123',
    subject: 'Q4 Budget Review Meeting',
    from: 'manager@company.com',
    to: ['team@company.com', 'finance@company.com'],
    bodyText: 'Hi team, we need to schedule a meeting to review the Q4 budget. Please let me know your availability for next week. The meeting will cover budget allocation, expenses, and future planning.',
    bodyHtml: '<p>Hi team, we need to schedule a meeting to review the Q4 budget.</p>',
    snippet: 'Hi team, we need to schedule a meeting...',
    receivedAt: new Date('2025-11-07T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      email: {
        findFirst: jest.fn(),
      },
    };

    const mockMistralService = {
      completePrompt: jest.fn(),
    };

    const mockWritingStyleService = {
      analyzeStyle: jest.fn(),
      buildStyleSection: jest.fn().mockReturnValue(''),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailInsightsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MistralService, useValue: mockMistralService },
        { provide: WritingStyleService, useValue: mockWritingStyleService },
      ],
    }).compile();

    service = module.get<EmailInsightsService>(EmailInsightsService);
    prismaService = module.get(PrismaService);
    mistralService = module.get(MistralService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('summarizeEmail', () => {
    it('should summarize email in English', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        'This email requests a Q4 budget review meeting. The sender asks for team availability next week. Topics include budget allocation, expenses, and future planning.',
      );

      // Execute
      const result = await service.summarizeEmail('tenant-id-123', 'email-id-123', 'en');

      // Assert
      expect(result).toContain('Q4 budget review');
      expect(prismaService.email.findFirst).toHaveBeenCalledWith({
        where: { id: 'email-id-123', tenantId: 'tenant-id-123' },
        select: {
          id: true,
          subject: true,
          from: true,
          to: true,
          bodyText: true,
          bodyHtml: true,
          snippet: true,
          receivedAt: true,
        },
      });
      expect(mistralService.completePrompt).toHaveBeenCalledWith({
        systemPrompt: expect.stringContaining('summarizes business emails'),
        userPrompt: expect.stringContaining('Q4 Budget Review Meeting'),
        temperature: 0.2,
        maxTokens: 400,
      });
    });

    it('should summarize email in Italian', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        'Questa email richiede una riunione per la revisione del budget Q4. Il mittente chiede la disponibilità del team per la prossima settimana.',
      );

      // Execute
      const result = await service.summarizeEmail('tenant-id-123', 'email-id-123', 'it');

      // Assert
      expect(result).toContain('budget Q4');
      expect(mistralService.completePrompt).toHaveBeenCalledWith({
        systemPrompt: expect.stringContaining('riassume email di lavoro'),
        userPrompt: expect.stringContaining('Oggetto:'),
        temperature: 0.2,
        maxTokens: 400,
      });
    });

    it('should throw NotFoundException if email not found', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(null);

      // Execute & Assert
      await expect(
        service.summarizeEmail('tenant-id-123', 'non-existent-email-id'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.summarizeEmail('tenant-id-123', 'non-existent-email-id'),
      ).rejects.toThrow('Email not found');
    });

    it('should throw BadRequestException if Mistral fails', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockRejectedValue(new Error('Mistral API error'));

      // Execute & Assert
      await expect(
        service.summarizeEmail('tenant-id-123', 'email-id-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.summarizeEmail('tenant-id-123', 'email-id-123'),
      ).rejects.toThrow('Unable to generate email summary');
    });

    it('should handle email with no subject', async () => {
      // Setup
      const emailWithoutSubject = { ...mockEmail, subject: null };
      prismaService.email.findFirst.mockResolvedValue(emailWithoutSubject);
      mistralService.completePrompt.mockResolvedValue('Summary of email without subject.');

      // Execute
      const result = await service.summarizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toBeDefined();
      expect(mistralService.completePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('(no subject)'),
        }),
      );
    });

    it('should trim whitespace from summary', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue('  Summary with whitespace  \n');

      // Execute
      const result = await service.summarizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toBe('Summary with whitespace');
      expect(result).not.toContain('\n');
    });
  });

  describe('generateSmartReplies', () => {
    it('should generate smart replies in JSON format', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"replies":["I\'ll check my calendar and get back to you.","Monday 10am works for me.","Can we schedule for Tuesday instead?"]}',
      );

      // Execute
      const result = await service.generateSmartReplies('tenant-id-123', 'email-id-123', 'en');

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]).toContain('calendar');
      expect(mistralService.completePrompt).toHaveBeenCalledWith({
        systemPrompt: expect.stringContaining('professional'),
        userPrompt: expect.stringContaining('Q4 Budget Review Meeting'),
        temperature: 0.4,
        maxTokens: 500,
      });
    });

    it('should generate smart replies in Italian', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"replies":["Controllo il mio calendario e ti faccio sapere.","Lunedì alle 10 va bene per me."]}',
      );

      // Execute
      const result = await service.generateSmartReplies('tenant-id-123', 'email-id-123', 'it');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('calendario');
      expect(mistralService.completePrompt).toHaveBeenCalledWith({
        systemPrompt: expect.stringContaining('risposte brevi'),
        userPrompt: expect.any(String),
        temperature: 0.4,
        maxTokens: 500,
      });
    });

    it('should handle markdown-fenced JSON response', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '```json\n{"replies":["Sure, I can help with that.","Let me know if you need anything else."]}\n```',
      );

      // Execute
      const result = await service.generateSmartReplies('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('help');
    });

    it('should fallback to line extraction if JSON parsing fails', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '- I will check my calendar and get back to you\n- Monday at 10am works for me\n- Let us schedule it for Tuesday',
      );

      // Execute
      const result = await service.generateSmartReplies('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]).toContain('calendar');
      expect(result[1]).toContain('Monday');
      expect(result[2]).toContain('Tuesday');
    });

    it('should limit replies to maximum 3', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"replies":["Reply 1","Reply 2","Reply 3","Reply 4","Reply 5"]}',
      );

      // Execute
      const result = await service.generateSmartReplies('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toHaveLength(3);
    });

    it('should remove duplicates from replies', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"replies":["Thanks for the update","thanks for the update","Thanks for the update."]}',
      );

      // Execute
      const result = await service.generateSmartReplies('tenant-id-123', 'email-id-123');

      // Assert
      // Should deduplicate based on lowercase comparison
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should throw BadRequestException if no replies generated', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(''); // Empty response

      // Execute & Assert
      await expect(
        service.generateSmartReplies('tenant-id-123', 'email-id-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if email not found', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(null);

      // Execute & Assert
      await expect(
        service.generateSmartReplies('tenant-id-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('categorizeEmail', () => {
    it('should categorize email with valid labels', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"labels":["Important","Action Items","Finance"]}',
      );

      // Execute
      const result = await service.categorizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toHaveLength(3);
      expect(result).toContain('Important');
      expect(result).toContain('Action Items');
      expect(result).toContain('Finance');
      expect(mistralService.completePrompt).toHaveBeenCalledWith({
        systemPrompt: expect.stringContaining('labels from'),
        userPrompt: expect.any(String),
        temperature: 0.1,
        maxTokens: 300,
      });
    });

    it('should filter out invalid labels', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"labels":["Important","InvalidLabel","Finance"]}',
      );

      // Execute
      const result = await service.categorizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).not.toContain('InvalidLabel');
      expect(result).toContain('Important');
      expect(result).toContain('Finance');
    });

    it('should normalize label capitalization', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"labels":["important","FINANCE","Action items"]}',
      );

      // Execute
      const result = await service.categorizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toContain('Important');
      expect(result).toContain('Finance');
      expect(result).toContain('Action Items');
    });

    it('should fallback to text extraction if JSON parsing fails', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        'This email is Important and contains Action Items related to Finance.',
      );

      // Execute
      const result = await service.categorizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('Important');
    });

    it('should fallback to "Important" if no labels detected', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue('No labels detected');

      // Execute
      const result = await service.categorizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toEqual(['Important']);
    });

    it('should limit labels to maximum 3', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"labels":["Important","Finance","Action Items","Follow-up","Updates"]}',
      );

      // Execute
      const result = await service.categorizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toHaveLength(3);
    });

    it('should remove duplicate labels', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"labels":["Important","important","IMPORTANT"]}',
      );

      // Execute
      const result = await service.categorizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(result).toEqual(['Important']);
    });

    it('should categorize in Italian locale', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue(
        '{"labels":["Important","Finance"]}',
      );

      // Execute
      const result = await service.categorizeEmail('tenant-id-123', 'email-id-123', 'it');

      // Assert
      expect(result).toContain('Important');
      expect(mistralService.completePrompt).toHaveBeenCalledWith({
        systemPrompt: expect.stringContaining('Suggerisci'),
        userPrompt: expect.any(String),
        temperature: 0.1,
        maxTokens: 300,
      });
    });

    it('should throw NotFoundException if email not found', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(null);

      // Execute & Assert
      await expect(
        service.categorizeEmail('tenant-id-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if Mistral fails', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockRejectedValue(new Error('API error'));

      // Execute & Assert
      await expect(
        service.categorizeEmail('tenant-id-123', 'email-id-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Content Extraction', () => {
    it('should prefer bodyText over bodyHtml', async () => {
      // Setup
      const email = {
        ...mockEmail,
        bodyText: 'Plain text content',
        bodyHtml: '<p>HTML content</p>',
      };
      prismaService.email.findFirst.mockResolvedValue(email);
      mistralService.completePrompt.mockResolvedValue('Summary');

      // Execute
      await service.summarizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(mistralService.completePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('Plain text content'),
        }),
      );
      expect(mistralService.completePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.not.stringContaining('HTML content'),
        }),
      );
    });

    it('should use bodyHtml if bodyText is empty', async () => {
      // Setup
      const email = {
        ...mockEmail,
        bodyText: '',
        bodyHtml: '<p>HTML content only</p>',
      };
      prismaService.email.findFirst.mockResolvedValue(email);
      mistralService.completePrompt.mockResolvedValue('Summary');

      // Execute
      await service.summarizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(mistralService.completePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('HTML content only'),
        }),
      );
    });

    it('should fallback to snippet if both body fields are empty', async () => {
      // Setup
      const email = {
        ...mockEmail,
        bodyText: null,
        bodyHtml: null,
        snippet: 'This is the snippet text',
      };
      prismaService.email.findFirst.mockResolvedValue(email);
      mistralService.completePrompt.mockResolvedValue('Summary');

      // Execute
      await service.summarizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(mistralService.completePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('This is the snippet text'),
        }),
      );
    });

    it('should use content unavailable if all content fields are empty', async () => {
      // Setup
      const email = {
        ...mockEmail,
        bodyText: null,
        bodyHtml: null,
        snippet: null,
      };
      prismaService.email.findFirst.mockResolvedValue(email);
      mistralService.completePrompt.mockResolvedValue('Summary');

      // Execute
      await service.summarizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(mistralService.completePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('(content unavailable)'),
        }),
      );
    });

    it('should truncate very long content', async () => {
      // Setup
      const longContent = 'a'.repeat(10000); // 10KB of text
      const email = {
        ...mockEmail,
        bodyText: longContent,
      };
      prismaService.email.findFirst.mockResolvedValue(email);
      mistralService.completePrompt.mockResolvedValue('Summary');

      // Execute
      await service.summarizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      const call = mistralService.completePrompt.mock.calls[0][0];
      // Content should be truncated to 6000 chars + "..."
      expect(call.userPrompt.length).toBeLessThan(7000);
      expect(call.userPrompt).toContain('...');
    });
  });

  describe('Locale Handling', () => {
    it('should default to English for undefined locale', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue('Summary');

      // Execute
      await service.summarizeEmail('tenant-id-123', 'email-id-123');

      // Assert
      expect(mistralService.completePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining('business emails'),
          userPrompt: expect.stringContaining('Subject:'),
        }),
      );
    });

    it('should use English for non-Italian locales', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue('Summary');

      // Execute
      await service.summarizeEmail('tenant-id-123', 'email-id-123', 'fr');

      // Assert
      expect(mistralService.completePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining('business emails'),
        }),
      );
    });

    it('should use Italian for it-IT locale', async () => {
      // Setup
      prismaService.email.findFirst.mockResolvedValue(mockEmail);
      mistralService.completePrompt.mockResolvedValue('Riassunto');

      // Execute
      await service.summarizeEmail('tenant-id-123', 'email-id-123', 'it-IT');

      // Assert
      expect(mistralService.completePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining('riassume email'),
          userPrompt: expect.stringContaining('Oggetto:'),
        }),
      );
    });
  });
});

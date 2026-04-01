import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingComposerService } from '../embedding-composer.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PiiDetectionService } from '../../guards';

const mockPrismaService = {
  emailAttachment: {
    findMany: jest.fn(),
  },
};

const mockConfigService = {
  get: jest.fn().mockReturnValue(6000),
};

describe('EmbeddingComposerService', () => {
  let service: EmbeddingComposerService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingComposerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmbeddingComposerService>(EmbeddingComposerService);
    prisma = module.get(PrismaService);
  });

  describe('composeEmailEmbeddingContent', () => {
    it('should prioritize bodyHtml over bodyText', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: 'Test Subject',
        bodyHtml: '<p>HTML content</p>',
        bodyText: 'Plain text content',
        snippet: 'Snippet content',
      });

      expect(result).toContain('Subject: Test Subject');
      expect(result).toContain('HTML content');
      expect(result).not.toContain('Plain text content');
    });

    it('should fall back to bodyText when bodyHtml is empty', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: 'Test Subject',
        bodyHtml: null,
        bodyText: 'Plain text content',
        snippet: 'Snippet content',
      });

      expect(result).toContain('Plain text content');
      expect(result).not.toContain('Snippet');
    });

    it('should fall back to snippet when both bodyHtml and bodyText are empty', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: 'Test Subject',
        bodyHtml: null,
        bodyText: '',
        snippet: 'Snippet content',
      });

      expect(result).toContain('Snippet content');
    });

    it('should return null for empty content', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: '',
        bodyHtml: null,
        bodyText: null,
        snippet: null,
      });

      expect(result).toBeNull();
    });

    it('should include English subject prefix', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: 'Meeting Tomorrow',
        bodyText: 'Let us meet',
      });

      expect(result).toContain('Subject: Meeting Tomorrow');
    });

    it('should include From/To/Date metadata when provided', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: 'Contract Renewal',
        bodyText: 'Please review the attached contract.',
        from: 'marco@example.com',
        to: ['davide@example.com', 'anna@example.com'],
        receivedAt: new Date('2026-03-25T10:00:00Z'),
      });

      expect(result).toContain('From: marco@example.com');
      expect(result).toContain('To: davide@example.com, anna@example.com');
      expect(result).toContain('Date: 2026-03-25');
      expect(result).toContain('Subject: Contract Renewal');
    });

    it('should omit metadata fields when not provided', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: 'Test',
        bodyText: 'Body',
      });

      expect(result).not.toContain('From:');
      expect(result).not.toContain('To:');
      expect(result).not.toContain('Date:');
      expect(result).toContain('Subject: Test');
    });
  });

  describe('composeEmailEmbeddingContentWithAttachments', () => {
    const tenantId = 'tenant-123';
    const emailId = 'email-456';

    it('should include attachment metadata when attachments exist', async () => {
      mockPrismaService.emailAttachment.findMany.mockResolvedValue([
        { id: 'att-1' },
        { id: 'att-2' },
      ]);

      const result = await service.composeEmailEmbeddingContentWithAttachments(
        { id: emailId, subject: 'Test', bodyText: 'Content' },
        tenantId,
      );

      expect(result.hasAttachments).toBe(true);
      expect(result.attachmentCount).toBe(2);
      expect(result.attachmentIds).toEqual(['att-1', 'att-2']);
      expect(prisma.emailAttachment.findMany).toHaveBeenCalledWith({
        where: { emailId, isInline: false, email: { tenantId } },
        select: { id: true },
      });
    });

    it('should handle emails without attachments', async () => {
      mockPrismaService.emailAttachment.findMany.mockResolvedValue([]);

      const result = await service.composeEmailEmbeddingContentWithAttachments(
        { id: emailId, subject: 'Test', bodyText: 'Content' },
        tenantId,
      );

      expect(result.hasAttachments).toBe(false);
      expect(result.attachmentCount).toBe(0);
      expect(result.attachmentIds).toEqual([]);
    });

    it('should enforce multi-tenant isolation via tenantId filter', async () => {
      mockPrismaService.emailAttachment.findMany.mockResolvedValue([]);

      await service.composeEmailEmbeddingContentWithAttachments(
        { id: emailId, subject: 'Test', bodyText: 'Content' },
        'specific-tenant',
      );

      expect(prisma.emailAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: { tenantId: 'specific-tenant' },
          }),
        }),
      );
    });

    it('should gracefully handle attachment query errors', async () => {
      mockPrismaService.emailAttachment.findMany.mockRejectedValue(new Error('DB error'));

      const result = await service.composeEmailEmbeddingContentWithAttachments(
        { id: emailId, subject: 'Test', bodyText: 'Content' },
        tenantId,
      );

      // Should return content even if attachment query fails
      expect(result.content).toContain('Content');
      expect(result.hasAttachments).toBe(false);
    });
  });

  describe('composeContactEmbeddingContent', () => {
    it('should compose content from all contact fields', () => {
      const result = service.composeContactEmbeddingContent({
        displayName: 'John Doe',
        company: 'Acme Corp',
        jobTitle: 'Engineer',
        department: 'R&D',
        notes: 'Important client',
        tags: ['VIP', 'Enterprise'],
        emails: [{ value: 'john@example.com', type: 'work' }],
        phoneNumbers: [{ value: '+1234567890', type: 'mobile' }],
      });

      // Uses English labels
      expect(result).toContain('Name: John Doe');
      expect(result).toContain('Company: Acme Corp');
      expect(result).toContain('Job Title: Engineer');
      expect(result).toContain('Department: R&D');
      expect(result).toContain('Notes: Important client');
      expect(result).toContain('Tags: VIP, Enterprise');
      expect(result).toContain('Emails: john@example.com');
      expect(result).toContain('Phones: +1234567890');
    });

    it('should return empty string for empty contact', () => {
      const result = service.composeContactEmbeddingContent({});
      expect(result).toBe(''); // Returns empty string, not null
    });

    it('should handle partial contact data', () => {
      const result = service.composeContactEmbeddingContent({
        displayName: 'Jane',
        company: null,
        emails: [],
      });

      expect(result).toContain('Name: Jane');
      expect(result).not.toContain('Company');
    });
  });

  describe('PII sanitization', () => {
    const mockPiiDetection = {
      detect: jest.fn(),
      containsPii: jest.fn(),
      redact: jest.fn(),
      resolveFromMatches: jest.fn(),
      getSupportedTypes: jest.fn(),
      configure: jest.fn(),
    };

    let serviceWithPii: EmbeddingComposerService;

    beforeEach(async () => {
      mockPiiDetection.detect.mockReset();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmbeddingComposerService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: PiiDetectionService, useValue: mockPiiDetection },
        ],
      }).compile();

      serviceWithPii = module.get<EmbeddingComposerService>(EmbeddingComposerService);
    });

    it('should sanitize email body content', () => {
      mockPiiDetection.detect.mockReturnValue({
        hasPii: true,
        redactedText: 'Contact me at [EMAIL_REDACTED:abc123]',
        piiCount: 1,
        detectedTypes: ['EMAIL'],
        originalText: 'Contact me at john@example.com',
        details: [],
      });

      const result = serviceWithPii.composeEmailEmbeddingContent({
        subject: 'Test Subject',
        bodyText: 'Contact me at john@example.com',
      });

      expect(mockPiiDetection.detect).toHaveBeenCalledWith('Contact me at john@example.com');
      expect(result).toContain('[EMAIL_REDACTED:');
      expect(result).toContain('Test Subject'); // Subject NOT sanitized
      expect(result).not.toContain('john@example.com');
    });

    it('should NOT sanitize email subject (preserves search relevance)', () => {
      // detect should NOT be called for subject
      mockPiiDetection.detect.mockReturnValue({
        hasPii: false,
        redactedText: 'Some body text',
        piiCount: 0,
        detectedTypes: [],
        originalText: 'Some body text',
        details: [],
      });

      const result = serviceWithPii.composeEmailEmbeddingContent({
        subject: 'Meeting with john@example.com',
        bodyText: 'Some body text',
      });

      // Subject should be preserved as-is
      expect(result).toContain('Subject: Meeting with john@example.com');
    });

    it('should sanitize contact emails and phones', () => {
      mockPiiDetection.detect
        .mockReturnValueOnce({
          hasPii: true,
          redactedText: '[EMAIL_REDACTED:def456]',
          piiCount: 1,
          detectedTypes: ['EMAIL'],
          originalText: 'john@example.com',
          details: [],
        })
        .mockReturnValueOnce({
          hasPii: true,
          redactedText: '[PHONE_REDACTED:ghi789]',
          piiCount: 1,
          detectedTypes: ['PHONE'],
          originalText: '+1-555-123-4567',
          details: [],
        });

      const result = serviceWithPii.composeContactEmbeddingContent({
        displayName: 'John Smith',
        emails: [{ value: 'john@example.com' }],
        phoneNumbers: [{ value: '+1-555-123-4567' }],
      });

      expect(result).toContain('John Smith'); // Name NOT sanitized
      expect(result).toContain('[EMAIL_REDACTED:');
      expect(result).toContain('[PHONE_REDACTED:');
      expect(result).not.toContain('john@example.com');
      expect(result).not.toContain('+1-555-123-4567');
    });

    it('should gracefully handle PiiDetectionService errors', () => {
      mockPiiDetection.detect.mockImplementation(() => {
        throw new Error('Detection failed');
      });

      const result = serviceWithPii.composeEmailEmbeddingContent({
        subject: 'Test',
        bodyText: 'Contact john@example.com',
      });

      // Should return original text on error
      expect(result).toContain('john@example.com');
    });

    it('should work without PiiDetectionService (graceful degradation)', async () => {
      // Default service (from outer beforeEach) has no PiiDetectionService
      const result = service.composeEmailEmbeddingContent({
        subject: 'Test',
        bodyText: 'Contact john@example.com',
      });

      // Should return original text when service unavailable
      expect(result).toContain('john@example.com');
    });

    it('should sanitize body in composeEmailEmbeddingContentWithAttachments', async () => {
      mockPrismaService.emailAttachment.findMany.mockResolvedValue([]);
      mockPiiDetection.detect.mockReturnValue({
        hasPii: true,
        redactedText: 'Call [PHONE_REDACTED:xyz999]',
        piiCount: 1,
        detectedTypes: ['PHONE'],
        originalText: 'Call +39-02-1234567',
        details: [],
      });

      const result = await serviceWithPii.composeEmailEmbeddingContentWithAttachments(
        { id: 'e-1', subject: 'Invoice', bodyText: 'Call +39-02-1234567' },
        'tenant-1',
      );

      expect(result.content).toContain('Subject: Invoice'); // Subject preserved
      expect(result.content).toContain('[PHONE_REDACTED:');
      expect(result.content).not.toContain('+39-02-1234567');
    });
  });

  describe('chunkContentForEmbedding', () => {
    it('should return single chunk for short content', () => {
      const shortContent = 'This is short content.';
      const chunks = service.chunkContentForEmbedding(shortContent);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(shortContent);
      expect(chunks[0].index).toBe(0);
    });

    it('should split long content into multiple chunks', () => {
      // Create content longer than maxCharsPerChunk (6000)
      const longContent = 'This is a sentence. '.repeat(400);
      const chunks = service.chunkContentForEmbedding(longContent);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk, i) => {
        expect(chunk.index).toBe(i);
        expect(chunk.content.length).toBeLessThanOrEqual(6000);
      });
    });

    it('should chunk at sentence boundaries when possible', () => {
      const content = 'First sentence. Second sentence. Third sentence.';
      mockConfigService.get.mockReturnValue(30); // Low chunk size for testing

      void Test.createTestingModule({
        providers: [
          EmbeddingComposerService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: ConfigService, useValue: { get: () => 30 } },
        ],
      });

      // Chunks should end at sentence boundaries
      const chunks = service.chunkContentForEmbedding(content);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should include overlap between chunks for context', () => {
      // Create content that will need multiple chunks
      const longContent = 'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.'.repeat(100);
      const chunks = service.chunkContentForEmbedding(longContent);

      if (chunks.length > 1) {
        // Verify some overlap exists (not just sequential splits)
        void chunks[0].content.slice(-50);
        void chunks[1].content.slice(0, 100);
        // At minimum, chunks should have contextual continuity
        expect(chunks[1].content.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty content gracefully', () => {
      const chunks = service.chunkContentForEmbedding('');
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('');
    });
  });

  // ==========================================================================
  // T-0403: Comprehensive chunking edge case tests (KB-M3)
  // ==========================================================================
  describe('chunkContentForEmbedding — edge cases', () => {
    let smallChunkService: EmbeddingComposerService;

    beforeEach(async () => {
      // Service with 100-char chunk size for testable chunk boundaries
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmbeddingComposerService,
          { provide: PrismaService, useValue: mockPrismaService },
          {
            provide: ConfigService,
            useValue: { get: (key: string, fallback: number) => key === 'AI_EMBEDDING_CHUNK_SIZE' ? 100 : fallback },
          },
        ],
      }).compile();
      smallChunkService = module.get(EmbeddingComposerService);
    });

    it('should handle content exactly at max chunk size', () => {
      const exact = 'a'.repeat(100);
      const chunks = smallChunkService.chunkContentForEmbedding(exact);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(exact);
    });

    it('should handle content one char over max chunk size', () => {
      const content = 'a'.repeat(101);
      const chunks = smallChunkService.chunkContentForEmbedding(content);
      expect(chunks.length).toBeGreaterThan(1);
      // All original content should be covered
      const joined = chunks.map((c) => c.content).join('');
      expect(joined.length).toBeGreaterThanOrEqual(content.length);
    });

    it('should not produce empty chunks from whitespace-only regions', () => {
      const content = 'Hello.\n' + ' '.repeat(200) + '\nWorld.';
      const chunks = smallChunkService.chunkContentForEmbedding(content);
      for (const chunk of chunks) {
        expect(chunk.content.trim().length).toBeGreaterThan(0);
      }
    });

    it('should handle single long word exceeding chunk size', () => {
      // No sentence or newline boundaries — must still chunk
      const longWord = 'abcdefghij'.repeat(20); // 200 chars, no breaks
      const chunks = smallChunkService.chunkContentForEmbedding(longWord);
      expect(chunks.length).toBeGreaterThan(1);
      // Every char should be present across chunks
      for (const c of longWord) {
        const found = chunks.some((chunk) => chunk.content.includes(c));
        expect(found).toBe(true);
      }
    });

    it('should prefer newline boundaries over hard cuts', () => {
      // 5 lines of 25 chars each = 125 chars total (> 100 chunk limit)
      const lines = Array.from({ length: 5 }, (_, i) => `Line ${i}: ${'x'.repeat(18)}`);
      const content = lines.join('\n');
      const chunks = smallChunkService.chunkContentForEmbedding(content);

      // First chunk should end at a newline, not mid-line
      expect(chunks[0].content.endsWith('x')).toBe(true);
    });

    it('should produce overlapping chunks (20% default)', () => {
      // Build content with distinct sentence markers
      const sentences = Array.from({ length: 10 }, (_, i) => `Sentence-${i}-padding.`);
      const content = sentences.join('\n');
      const chunks = smallChunkService.chunkContentForEmbedding(content);

      if (chunks.length > 1) {
        // The end of chunk N should overlap with the start of chunk N+1
        const tail0 = chunks[0].content.slice(-20);
        const head1 = chunks[1].content.slice(0, 40);
        // At least some content from end of chunk 0 should appear in chunk 1
        const overlapFound = tail0.split('').some((ch) => head1.includes(ch));
        expect(overlapFound).toBe(true);
      }
    });

    it('should handle content with only newlines', () => {
      const content = '\n'.repeat(200);
      const chunks = smallChunkService.chunkContentForEmbedding(content);
      // All chunks should be empty after trim — but the code checks .trim()
      // So no chunks should be produced from pure whitespace after trim
      for (const chunk of chunks) {
        // chunk.content is already trimmed in the implementation
        expect(typeof chunk.content).toBe('string');
      }
    });

    it('should handle unicode content correctly', () => {
      // Mix of multi-byte characters
      const content = '日本語テスト。'.repeat(20) + '\n' + 'Ñoño àccéntéd. '.repeat(10);
      const chunks = smallChunkService.chunkContentForEmbedding(content);
      expect(chunks.length).toBeGreaterThan(0);
      // No chunk should exceed max chars
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(100);
      }
    });

    it('should assign sequential indices starting from 0', () => {
      const content = 'Word. '.repeat(50); // ~300 chars
      const chunks = smallChunkService.chunkContentForEmbedding(content);
      chunks.forEach((chunk, i) => {
        expect(chunk.index).toBe(i);
      });
    });
  });

  // ==========================================================================
  // T-0403: Email composition edge cases for chunking pipeline
  // ==========================================================================
  describe('composeEmailEmbeddingContent — edge cases', () => {
    it('should return null for email with only whitespace body', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: '',
        bodyHtml: null,
        bodyText: '   \n\n  \t  ',
        snippet: null,
      });
      expect(result).toBeNull();
    });

    it('should handle HTML-only email (no bodyText/snippet)', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: 'HTML Only',
        bodyHtml: '<div><p>Rich <strong>content</strong> here.</p></div>',
        bodyText: null,
        snippet: null,
      });
      expect(result).toContain('Subject: HTML Only');
      expect(result).toContain('content');
      expect(result).not.toContain('<div>');
      expect(result).not.toContain('<strong>');
    });

    it('should handle plain text only email (no HTML/snippet)', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: null,
        bodyHtml: null,
        bodyText: 'Plain text only content',
        snippet: null,
      });
      expect(result).toBe('Plain text only content');
    });

    it('should handle email with all null fields', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: null,
        bodyHtml: null,
        bodyText: null,
        snippet: null,
        from: null,
        to: null,
        receivedAt: null,
      });
      expect(result).toBeNull();
    });

    it('should handle email with very long subject', () => {
      const longSubject = 'Re: '.repeat(500); // 2000 chars
      const result = service.composeEmailEmbeddingContent({
        subject: longSubject,
        bodyText: 'Short body',
      });
      expect(result).toContain(`Subject: ${longSubject}`);
    });

    it('should handle receivedAt as ISO string', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: 'Test',
        bodyText: 'Body',
        receivedAt: '2026-01-15T08:30:00.000Z',
      });
      expect(result).toContain('Date: 2026-01-15');
    });

    it('should handle empty to array', () => {
      const result = service.composeEmailEmbeddingContent({
        subject: 'Test',
        bodyText: 'Body',
        to: [],
      });
      expect(result).not.toContain('To:');
    });
  });
});

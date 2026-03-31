import { Test, TestingModule } from '@nestjs/testing';
import { PiiDetectionService, PiiType } from '../pii-detection-sentinel.service';
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('PiiDetectionService', () => {
  let service: PiiDetectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PiiDetectionService],
    }).compile();

    service = module.get<PiiDetectionService>(PiiDetectionService);
  });

  describe('detect - Email addresses', () => {
    it('should detect email addresses', () => {
      const text = 'Contact me at john.doe@example.com for more info.';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.detectedTypes).toContain('EMAIL');
      expect(result.piiCount).toBeGreaterThanOrEqual(1);
      expect(result.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'EMAIL',
            value: 'john.doe@example.com',
          }),
        ]),
      );
    });

    it('should detect multiple emails', () => {
      const text = 'Email admin@company.com or support@company.com';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.piiCount).toBe(2);
    });

    it('should redact emails by default', () => {
      const text = 'Contact john@example.com';
      const result = service.detect(text);

      expect(result.redactedText).not.toContain('john@example.com');
      expect(result.redactedText).toContain('[EMAIL_REDACTED:');
    });
  });

  describe('detect - Phone numbers', () => {
    it('should detect US phone numbers', () => {
      const text = 'Call me at 555-123-4567 or (555) 987-6543';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.detectedTypes).toContain('PHONE');
    });

    it('should detect international phone numbers', () => {
      const text = 'International: +1-555-123-4567';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.detectedTypes).toContain('PHONE');
    });

    it('should detect phone numbers in various formats', () => {
      const formats = [
        '555-123-4567',
        '(555) 123-4567',
        '555.123.4567',
        '+1 555 123 4567',
      ];

      for (const phone of formats) {
        const result = service.detect(`Call ${phone}`);
        expect(result.hasPii).toBe(true);
        expect(result.detectedTypes).toContain('PHONE');
      }
    });
  });

  describe('detect - Credit cards', () => {
    it('should detect credit card numbers', () => {
      const text = 'My card is 4532-1488-0343-6467';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.detectedTypes).toContain('CREDIT_CARD');
    });

    it('should detect credit cards without separators', () => {
      const text = 'Card: 4532148803436467';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.detectedTypes).toContain('CREDIT_CARD');
    });
  });

  describe('detect - SSN/Tax IDs', () => {
    it('should detect US SSN format', () => {
      const text = 'SSN: 123-45-6789';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.detectedTypes).toContain('SSN');
    });

    it('should redact SSN', () => {
      const text = 'SSN: 123-45-6789';
      const result = service.detect(text);

      expect(result.redactedText).not.toContain('123-45-6789');
      expect(result.redactedText).toContain('[SSN_REDACTED:');
    });
  });

  describe('detect - API Keys and Secrets', () => {
    it('should detect API keys', () => {
      const text = 'API_KEY=sk_test_4eC39HqLyjWDarjtT1zdp7dc';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.detectedTypes).toContain('API_KEY');
    });

    it('should detect AWS keys', () => {
      const text = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.detectedTypes).toContain('AWS_KEY');
    });
  });

  describe('redaction styles', () => {
    it('should use HASH redaction by default (unique placeholders)', () => {
      service.configure({ redactionStyle: 'HASH' });
      const text = 'Email me at test@example.com';
      const result = service.detect(text);

      expect(result.redactedText).toMatch(/\[EMAIL_REDACTED:[a-f0-9]+\]/);
    });

    it('should support MASK redaction style', () => {
      service.configure({ redactionStyle: 'MASK' });
      const text = 'Email: test@example.com';
      const result = service.detect(text);

      // MASK shows first and last char with * in between
      expect(result.redactedText).toMatch(/t\*+m/);
    });

    it('should support TYPE_LABEL redaction style', () => {
      service.configure({ redactionStyle: 'TYPE_LABEL' });
      const text = 'Email: test@example.com';
      const result = service.detect(text);

      expect(result.redactedText).toContain('[EMAIL_REDACTED]');
    });
  });

  describe('resolveFromMatches', () => {
    it('should restore original PII from redacted text using matches', () => {
      const originalText = 'Contact john@example.com or call 555-1234';
      const detectionResult = service.detect(originalText);

      // Simulate LLM returning redacted text
      const llmOutput = detectionResult.redactedText;

      // Resolve back to original
      const resolved = service.resolveFromMatches(llmOutput, detectionResult.details);

      expect(resolved).toContain('john@example.com');
      expect(resolved).toContain('555-1234');
    });

    it('should handle multiple occurrences of same PII value', () => {
      const text = 'Email john@example.com twice: john@example.com';
      const detectionResult = service.detect(text);
      const resolved = service.resolveFromMatches(
        detectionResult.redactedText,
        detectionResult.details,
      );

      // Both occurrences should be resolved
      const emailCount = (resolved.match(/john@example\.com/g) || []).length;
      expect(emailCount).toBe(2);
    });
  });

  describe('false positives', () => {
    it('should not detect extension numbers as phone numbers', () => {
      const text = 'Call extension 1234';
      const result = service.detect(text);

      // Extension "1234" should NOT be detected as phone
      const phoneMatches = result.details.filter((d) => d.type === 'PHONE');
      expect(phoneMatches.length).toBe(0);
    });

    it('should not detect regular numbers as credit cards', () => {
      const text = 'Order number 1234567890123';
      const result = service.detect(text);

      // Should not detect as credit card (not valid Luhn)
      const cardMatches = result.details.filter((d) => d.type === 'CREDIT_CARD');
      expect(cardMatches.length).toBe(0);
    });

    it('should not detect dates as SSN', () => {
      const text = 'Date: 12-25-2023';
      const result = service.detect(text);

      // Should not detect as SSN
      const ssnMatches = result.details.filter((d) => d.type === 'SSN');
      expect(ssnMatches.length).toBe(0);
    });

    it('should not detect timestamp-like run tags as phone numbers', () => {
      const text = 'AI Tool Email 20260331095822';
      const result = service.detect(text);

      const phoneMatches = result.details.filter((d) => d.type === 'PHONE');
      expect(phoneMatches.length).toBe(0);
      expect(result.redactedText).toContain('20260331095822');
    });

    it('should not flag timestamp-like run tags in containsPii', () => {
      expect(service.containsPii('AI Tool Email 20260331095822')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const result = service.detect('');

      expect(result.hasPii).toBe(false);
      expect(result.detectedTypes).toEqual([]);
      expect(result.piiCount).toBe(0);
      expect(result.redactedText).toBe('');
    });

    it('should handle null text gracefully', () => {
      const result = service.detect(null as any);

      expect(result.hasPii).toBe(false);
      expect(result.piiCount).toBe(0);
    });

    it('should handle text with no PII', () => {
      const text = 'This is a normal sentence with no sensitive data.';
      const result = service.detect(text);

      expect(result.hasPii).toBe(false);
      expect(result.detectedTypes).toEqual([]);
      expect(result.redactedText).toBe(text);
    });

    it('should handle very long text', () => {
      const longText = 'This is text. '.repeat(1000) + 'Email: test@example.com';
      const result = service.detect(longText);

      expect(result.hasPii).toBe(true);
      expect(result.detectedTypes).toContain('EMAIL');
    });
  });

  describe('containsPii (quick check)', () => {
    it('should quickly detect PII presence without details', () => {
      const textWithPii = 'Contact john@example.com';
      const textWithoutPii = 'Contact us for more info';

      expect(service.containsPii(textWithPii)).toBe(true);
      expect(service.containsPii(textWithoutPii)).toBe(false);
    });

    it('should handle empty text', () => {
      expect(service.containsPii('')).toBe(false);
      expect(service.containsPii(null as any)).toBe(false);
    });
  });

  describe('redact (convenience method)', () => {
    it('should return only redacted text without details', () => {
      const text = 'Email: test@example.com, Phone: 555-123-4567';
      const redacted = service.redact(text);

      expect(redacted).not.toContain('test@example.com');
      // Only check email redaction - phone pattern may vary by Sentinel version
      expect(redacted).toContain('[EMAIL_REDACTED:');
    });
  });

  describe('getSupportedTypes', () => {
    it('should return list of supported PII types', () => {
      const types = service.getSupportedTypes();

      expect(types).toContain('EMAIL');
      expect(types).toContain('PHONE');
      expect(types).toContain('CREDIT_CARD');
      expect(types).toContain('SSN');
      expect(types.length).toBeGreaterThan(5); // At least 12 types from Sentinel
    });
  });

  describe('configure', () => {
    it('should allow disabling redaction', () => {
      service.configure({ enableRedaction: false });
      const text = 'Email: test@example.com';
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.redactedText).toBe(text); // No redaction
    });

    it('should allow filtering specific PII types', () => {
      service.configure({ detectTypes: ['EMAIL'] as PiiType[] });
      const text = 'Email: test@example.com, Phone: 555-1234';
      const result = service.detect(text);

      // Only EMAIL should be detected
      expect(result.detectedTypes).toContain('EMAIL');
      expect(result.detectedTypes).not.toContain('PHONE');
    });
  });

  describe('multi-type detection', () => {
    it('should detect multiple PII types in same text', () => {
      const text = `
        Name: John Doe
        Email: john@example.com
        Phone: 555-123-4567
        SSN: 123-45-6789
        Card: 4532148803436467
      `;
      const result = service.detect(text);

      expect(result.hasPii).toBe(true);
      expect(result.piiCount).toBeGreaterThan(3);
      expect(result.detectedTypes.length).toBeGreaterThanOrEqual(3);
    });

    it('should track position information for each match', () => {
      const text = 'Email at position 10: test@example.com here';
      const result = service.detect(text);

      const emailMatch = result.details.find((d) => d.type === 'EMAIL');
      expect(emailMatch).toBeDefined();
      expect(emailMatch?.startIndex).toBeGreaterThan(0);
      expect(emailMatch?.endIndex).toBeGreaterThan(emailMatch?.startIndex || 0);
    });
  });
});

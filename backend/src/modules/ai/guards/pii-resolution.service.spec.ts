import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PiiResolutionService } from './pii-resolution.service';

describe('PiiResolutionService', () => {
  let cacheService: {
    get: ReturnType<typeof vi.fn>;
  };
  let service: PiiResolutionService;

  beforeEach(() => {
    cacheService = {
      get: vi.fn(),
    };
    service = new PiiResolutionService(cacheService as any);
  });

  it('resolves bracket-stripped placeholders in assistant text', async () => {
    cacheService.get.mockResolvedValue({
      mappings: [
        {
          placeholder: '[EMAIL_REDACTED:7fb78a8c]',
          originalValue: 'dvdmarchetto@gmail.com',
          type: 'EMAIL',
          detectedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await service.resolveText(
      'tenant-1',
      'conversation-1',
      'Forward email to EMAIL_REDACTED:7fb78a8c',
    );

    expect(result).toBe('Forward email to dvdmarchetto@gmail.com');
  });

  it('detects bracket-stripped placeholders', () => {
    expect(service.containsPlaceholders('EMAIL_REDACTED:7fb78a8c')).toBe(true);
    expect(service.containsPlaceholders('[EMAIL_REDACTED:7fb78a8c]')).toBe(true);
  });
});

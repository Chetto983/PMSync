import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AiController } from '../ai.controller';
import {
  DEFAULT_STALE_CONTACT_DAYS,
  MAX_STALE_CONTACT_DAYS,
  MIN_STALE_CONTACT_DAYS,
} from '../../../contacts/constants/relationship-score.constants';

const mockRelationshipScoreService = {
  getStaleContacts: vi.fn(),
  getRelationshipScores: vi.fn(),
};

function makeController() {
  return new AiController(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    mockRelationshipScoreService as any,
  );
}

describe('AiController - stale contacts', () => {
  const req = {
    user: { tenantId: 'tenant-1', userId: 'user-1' },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRelationshipScoreService.getStaleContacts.mockResolvedValue([
      {
        contactId: 'contact-1',
        name: 'Stale Contact',
        daysSinceContact: 34,
        previousFrequency: 'weekly',
        suggestedAction: 'Send a check-in email',
      },
    ]);
    mockRelationshipScoreService.getRelationshipScores.mockResolvedValue([
      {
        contactId: 'contact-1',
        totalScore: 72,
        recencyScore: 40,
        frequencyScore: 70,
        reciprocityScore: 80,
        trendScore: 60,
        trend: 'stable',
        totalInteractions: 12,
      },
    ]);
  });

  it('uses the shared 30-day default threshold when days is omitted', async () => {
    const controller = makeController();

    const result = await controller.getStaleContacts(req);

    expect(mockRelationshipScoreService.getStaleContacts).toHaveBeenCalledWith('tenant-1', {
      daysSince: DEFAULT_STALE_CONTACT_DAYS,
      limit: 20,
    });
    expect(result.thresholdDays).toBe(DEFAULT_STALE_CONTACT_DAYS);
    expect(result.staleContacts).toHaveLength(1);
  });

  it('clamps threshold days to the supported bounds', async () => {
    const controller = makeController();

    await controller.getStaleContacts(req, String(MIN_STALE_CONTACT_DAYS - 3), '5');
    expect(mockRelationshipScoreService.getStaleContacts).toHaveBeenLastCalledWith('tenant-1', {
      daysSince: MIN_STALE_CONTACT_DAYS,
      limit: 5,
    });

    await controller.getStaleContacts(req, String(MAX_STALE_CONTACT_DAYS + 100), '5');
    expect(mockRelationshipScoreService.getStaleContacts).toHaveBeenLastCalledWith('tenant-1', {
      daysSince: MAX_STALE_CONTACT_DAYS,
      limit: 5,
    });
  });
});

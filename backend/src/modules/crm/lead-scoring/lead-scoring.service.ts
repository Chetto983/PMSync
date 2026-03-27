import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateObject } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
import { FeatureStoreService, ComputedFeatures } from './feature-store.service';

// ============ Schema ============

const leadScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  tier: z.enum(['hot', 'warm', 'cold']),
  reasons: z.array(z.string()).min(1).max(5),
  confidence: z.number().min(0).max(1),
});

type LeadScoreResult = z.infer<typeof leadScoreSchema>;

// ============ Prompt ============

const SYSTEM_PROMPT = `You are a CRM lead scoring engine. Given a contact's features, return a JSON score.

Scoring criteria (weighted):
1. **Engagement (40%)**: High email activity, fast response times, meetings, and recent interactions indicate a hot lead.
2. **Firmographic (25%)**: Larger companies, known industry, higher revenue, complete data = better leads.
3. **Behavioral (35%)**: Active deals, won deals, high stage progression, recent deal activity = strong signal.

Score interpretation:
- 70-100: HOT — actively engaged, strong fit, deal in motion
- 40-69: WARM — some engagement or fit, worth nurturing
- 0-39: COLD — low engagement, poor fit, or inactive

Rules:
- Score 0 if there is zero engagement AND zero deals (truly inactive contact)
- Boost score if there are won deals (proven converter)
- Penalize if last interaction was >60 days ago
- A contact with an open deal at high stage probability should score at least 60

Return exactly: { score: number(0-100), tier: "hot"|"warm"|"cold", reasons: string[], confidence: number(0-1) }
- reasons: 1-5 short bullet points explaining the score
- confidence: how confident you are in this score (1.0 = very clear signal, 0.3 = sparse data)`;

@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);
  private readonly modelId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly modelProvider: OpenRouterProviderService,
    private readonly featureStore: FeatureStoreService,
  ) {
    this.modelId = this.configService.get<string>(
      'AI_MODEL_SIMPLE',
      'mistralai/mistral-small-2603',
    );
  }

  /**
   * Score a single contact using LLM-based analysis.
   * Reads features from the store, calls LLM, persists score.
   */
  async scoreContact(
    tenantId: string,
    contactId: string,
  ): Promise<LeadScoreResult | null> {
    const features = await this.featureStore.getLatest(tenantId, contactId);
    if (!features) {
      this.logger.debug(
        `No features found for contact ${contactId}, skipping`,
      );
      return null;
    }

    const result = await this.callLlm(features);

    // Persist to LeadScore
    await this.prisma.leadScore.upsert({
      where: {
        tenantId_contactId: { tenantId, contactId },
      },
      create: {
        tenantId,
        contactId,
        score: result.score,
        confidence: result.confidence,
        features: JSON.parse(JSON.stringify(features)) as any,
        computedAt: new Date(),
      },
      update: {
        score: result.score,
        confidence: result.confidence,
        features: JSON.parse(JSON.stringify(features)) as any,
        computedAt: new Date(),
      },
    });

    return result;
  }

  /**
   * Batch score all contacts that have features in the store.
   * Used by the nightly BullMQ job after feature computation.
   */
  async scoreAllContacts(tenantId: string): Promise<number> {
    // Get all contacts with computed features
    const featureRecords = await this.prisma.leadFeatureStore.findMany({
      where: { tenantId },
      select: { contactId: true },
      distinct: ['contactId'],
    });

    let scored = 0;
    for (const record of featureRecords) {
      try {
        await this.scoreContact(tenantId, record.contactId);
        scored++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to score contact ${record.contactId}: ${msg}`,
        );
      }
    }

    this.logger.log(`Scored ${scored}/${featureRecords.length} contacts for tenant ${tenantId}`);
    return scored;
  }

  private async callLlm(
    features: ComputedFeatures,
  ): Promise<LeadScoreResult> {
    const prompt = this.formatFeaturePrompt(features);

    const { object } = await generateObject({
      model: this.modelProvider.getChatModel(this.modelId),
      schema: leadScoreSchema,
      schemaName: 'LeadScore',
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.1,
      maxOutputTokens: 300,
      abortSignal: AbortSignal.timeout(30_000),
    });

    return object;
  }

  private formatFeaturePrompt(features: ComputedFeatures): string {
    const e = features.engagement;
    const f = features.firmographic;
    const b = features.behavioral;

    return [
      '## Engagement Features',
      `- Emails sent: ${e.emailsSent}`,
      `- Emails received: ${e.emailsReceived}`,
      `- Total interactions: ${e.totalInteractions}`,
      `- Reply ratio: ${(e.repliedRatio * 100).toFixed(0)}%`,
      `- Avg response time: ${e.avgResponseTimeHours !== null ? `${e.avgResponseTimeHours.toFixed(1)} hours` : 'unknown'}`,
      `- Last interaction: ${e.lastInteractionDaysAgo !== null ? `${e.lastInteractionDaysAgo.toFixed(0)} days ago` : 'never'}`,
      `- Meeting count: ${e.meetingCount}`,
      `- Recency score: ${e.recentActivityScore}/10`,
      '',
      '## Firmographic Features',
      `- Has linked account: ${f.hasAccount}`,
      `- Company size: ${this.decodeSize(f.companySize)}`,
      `- Industry: ${f.industryCategory ?? 'unknown'}`,
      `- Revenue range: ${this.decodeRevenue(f.revenueRange)}`,
      `- Has website: ${f.hasWebsite}`,
      `- Has phone: ${f.hasPhone}`,
      `- Has address: ${f.hasAddress}`,
      `- Account deals: ${f.accountDealCount}`,
      `- Account total deal value: €${f.accountTotalValue.toFixed(0)}`,
      '',
      '## Behavioral Features',
      `- Total deals: ${b.dealCount}`,
      `- Open deals: ${b.openDealCount}`,
      `- Won deals: ${b.wonDealCount}`,
      `- Lost deals: ${b.lostDealCount}`,
      `- Avg deal velocity: ${b.avgDealVelocityDays !== null ? `${b.avgDealVelocityDays.toFixed(0)} days` : 'no closed deals'}`,
      `- Highest stage progress: ${b.highestDealStageProgress}%`,
      `- Last CRM activity: ${b.lastContactRecencyDays !== null ? `${b.lastContactRecencyDays.toFixed(0)} days ago` : 'never'}`,
      `- Activities (30d): ${b.activityCount30d}`,
      `- Activities (90d): ${b.activityCount90d}`,
      `- Recent deal activity (7d): ${b.hasRecentDealActivity}`,
    ].join('\n');
  }

  private decodeSize(encoded: number): string {
    const map: Record<number, string> = {
      0: 'unknown',
      1: '1-10 employees',
      2: '11-50 employees',
      3: '51-200 employees',
      4: '201-500 employees',
      5: '500+ employees',
    };
    return map[encoded] ?? 'unknown';
  }

  private decodeRevenue(encoded: number): string {
    const map: Record<number, string> = {
      0: 'unknown',
      1: '<€10K',
      2: '€10K-€100K',
      3: '€100K-€1M',
      4: '€1M-€10M',
      5: '€10M+',
    };
    return map[encoded] ?? 'unknown';
  }
}

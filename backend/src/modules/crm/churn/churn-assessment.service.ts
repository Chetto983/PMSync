import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from '../../ai/services/mistral.service';
import { ChurnFeatureService, ChurnFeatures } from './churn-feature.service';

export interface ChurnAssessment {
  probability: number; // 0.0-1.0
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: Record<string, number>; // factor name -> contribution weight (0-1)
  reasoning: string;
}

const CHURN_SYSTEM_PROMPT = `You are a CRM churn risk analyst. Given engagement metrics for a contact or account, assess the probability of churn (disengagement/loss).

Analyze these signals:
- responseDecayRatio: ratio of recent (30d) vs historical (90d) email response time. >1 means slower responses = bad.
- repliedRatioRecent vs repliedRatioHistorical: reply rate trend. Declining = bad.
- meetingDropRatio: current quarter meetings / previous quarter. <1 means fewer meetings = bad.
- maxStageDaysVsAvg: days stuck in current deal stage / average stage duration. >2 = stagnating.
- staleDealCount: open deals with no activity in 30+ days.
- daysSinceLastInteraction: days since any interaction. >30 = concerning, >60 = alarming.
- inactivityStreakDays: consecutive days of zero interaction.
- emailBounceCount: bounced emails in last 90 days. >0 = potential contact loss.
- activityDecayRatio: normalized (30d*3)/90d activity volume. <1 = declining engagement.

Respond ONLY with valid JSON (no markdown, no explanation outside JSON):
{
  "probability": <float 0.0-1.0>,
  "riskLevel": "<LOW|MEDIUM|HIGH>",
  "signals": {
    "responseDecay": <float 0.0-1.0 contribution>,
    "replyRateDrop": <float 0.0-1.0>,
    "meetingDrop": <float 0.0-1.0>,
    "dealStagnation": <float 0.0-1.0>,
    "inactivity": <float 0.0-1.0>,
    "emailBounce": <float 0.0-1.0>
  },
  "reasoning": "<1-2 sentence explanation>"
}

Risk thresholds: HIGH > 0.7, MEDIUM 0.4-0.7, LOW < 0.4.
Signal contributions should sum roughly to 1.0.
If no data is available for a signal, assign 0 contribution.`;

@Injectable()
export class ChurnAssessmentService {
  private readonly logger = new Logger(ChurnAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
    private readonly featureService: ChurnFeatureService,
  ) {}

  /**
   * Assess churn risk for a contact using LLM analysis of engagement features.
   */
  async assessContact(
    tenantId: string,
    contactId: string,
  ): Promise<ChurnAssessment> {
    const features = await this.featureService.extractForContact(
      tenantId,
      contactId,
    );
    return this.assessFromFeatures(tenantId, features);
  }

  /**
   * Assess churn risk for an account (aggregated contact signals).
   */
  async assessAccount(
    tenantId: string,
    accountId: string,
  ): Promise<ChurnAssessment> {
    const features = await this.featureService.extractForAccount(
      tenantId,
      accountId,
    );
    return this.assessFromFeatures(tenantId, features);
  }

  /**
   * Assess and persist churn signal for a contact.
   */
  async computeAndStore(
    tenantId: string,
    contactId: string,
  ): Promise<void> {
    const assessment = await this.assessContact(tenantId, contactId);

    await this.prisma.churnSignal.upsert({
      where: {
        tenantId_contactId: { tenantId, contactId },
      },
      create: {
        tenantId,
        contactId,
        probability: assessment.probability,
        riskLevel: assessment.riskLevel,
        signals: assessment.signals,
        reasoning: assessment.reasoning,
        computedAt: new Date(),
      },
      update: {
        probability: assessment.probability,
        riskLevel: assessment.riskLevel,
        signals: assessment.signals,
        reasoning: assessment.reasoning,
        computedAt: new Date(),
        acknowledgedAt: null, // reset on recompute
      },
    });
  }

  /**
   * Assess and persist churn signal for an account.
   */
  async computeAndStoreAccount(
    tenantId: string,
    accountId: string,
  ): Promise<void> {
    const assessment = await this.assessAccount(tenantId, accountId);

    await this.prisma.churnSignal.upsert({
      where: {
        tenantId_accountId: { tenantId, accountId },
      },
      create: {
        tenantId,
        accountId,
        probability: assessment.probability,
        riskLevel: assessment.riskLevel,
        signals: assessment.signals,
        reasoning: assessment.reasoning,
        computedAt: new Date(),
      },
      update: {
        probability: assessment.probability,
        riskLevel: assessment.riskLevel,
        signals: assessment.signals,
        reasoning: assessment.reasoning,
        computedAt: new Date(),
        acknowledgedAt: null,
      },
    });
  }

  // ─── Internal ──────────────────────────────────────────────────

  private async assessFromFeatures(
    tenantId: string,
    features: ChurnFeatures,
  ): Promise<ChurnAssessment> {
    const userPrompt = this.buildPrompt(features);

    try {
      const response = await this.mistralService.completePrompt({
        systemPrompt: CHURN_SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.2,
        maxTokens: 512,
        timeoutMs: 15000,
        modelTier: 'fast',
        telemetryContext: {
          tenantId,
          promptName: 'churn_assessment',
        },
        validationContext: 'SYSTEM_INTERNAL',
      });

      return this.parseResponse(response);
    } catch (error) {
      this.logger.warn(
        `LLM churn assessment failed, falling back to heuristic: ${(error as Error).message}`,
      );
      return this.heuristicFallback(features);
    }
  }

  private buildPrompt(f: ChurnFeatures): string {
    return `Engagement metrics for churn assessment:

Email Response:
- Response time (recent 30d): ${f.responseTimeRecent !== null ? `${f.responseTimeRecent.toFixed(1)}h` : 'no data'}
- Response time (historical 31-90d): ${f.responseTimeHistorical !== null ? `${f.responseTimeHistorical.toFixed(1)}h` : 'no data'}
- Response decay ratio: ${f.responseDecayRatio !== null ? f.responseDecayRatio.toFixed(2) : 'no data'}
- Reply rate (recent): ${(f.repliedRatioRecent * 100).toFixed(0)}%
- Reply rate (historical): ${(f.repliedRatioHistorical * 100).toFixed(0)}%

Meetings:
- Current quarter: ${f.meetingCountCurrentQ}
- Previous quarter: ${f.meetingCountPreviousQ}
- Meeting drop ratio: ${f.meetingDropRatio !== null ? f.meetingDropRatio.toFixed(2) : 'no data'}

Deal Activity:
- Max stage stagnation ratio: ${f.maxStageDaysVsAvg !== null ? f.maxStageDaysVsAvg.toFixed(2) : 'no open deals'}
- Stale deals (30d+): ${f.staleDealCount}

Interaction:
- Days since last interaction: ${f.daysSinceLastInteraction !== null ? f.daysSinceLastInteraction.toFixed(0) : 'never interacted'}
- Inactivity streak: ${f.inactivityStreakDays} days
- Email bounces (90d): ${f.emailBounceCount}

Activity Volume:
- Activities (30d): ${f.activityCount30d}
- Activities (90d): ${f.activityCount90d}
- Activity decay ratio: ${f.activityDecayRatio !== null ? f.activityDecayRatio.toFixed(2) : 'no data'}`;
  }

  private parseResponse(raw: string): ChurnAssessment {
    // Strip think tokens (Qwen/DeepSeek)
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Extract JSON from possible markdown code blocks
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('Failed to extract JSON from LLM response');
      return this.defaultAssessment();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const probability = Math.max(0, Math.min(1, Number(parsed.probability) || 0));
    const riskLevel =
      probability > 0.7 ? 'HIGH' : probability > 0.4 ? 'MEDIUM' : 'LOW';

    return {
      probability,
      riskLevel,
      signals: parsed.signals ?? {},
      reasoning: String(parsed.reasoning ?? ''),
    };
  }

  /**
   * Rule-based fallback when LLM is unavailable.
   */
  private heuristicFallback(f: ChurnFeatures): ChurnAssessment {
    let score = 0;
    const signals: Record<string, number> = {};

    // Response decay (0-0.25)
    if (f.responseDecayRatio !== null && f.responseDecayRatio > 1.5) {
      const contrib = Math.min(0.25, (f.responseDecayRatio - 1) * 0.1);
      score += contrib;
      signals.responseDecay = contrib;
    }

    // Reply rate drop (0-0.2)
    if (f.repliedRatioHistorical > 0) {
      const drop = f.repliedRatioHistorical - f.repliedRatioRecent;
      if (drop > 0.1) {
        const contrib = Math.min(0.2, drop * 0.5);
        score += contrib;
        signals.replyRateDrop = contrib;
      }
    }

    // Meeting drop (0-0.15)
    if (f.meetingDropRatio !== null && f.meetingDropRatio < 0.5) {
      const contrib = Math.min(0.15, (1 - f.meetingDropRatio) * 0.15);
      score += contrib;
      signals.meetingDrop = contrib;
    }

    // Deal stagnation (0-0.15)
    if (f.maxStageDaysVsAvg !== null && f.maxStageDaysVsAvg > 2) {
      const contrib = Math.min(0.15, (f.maxStageDaysVsAvg - 1) * 0.05);
      score += contrib;
      signals.dealStagnation = contrib;
    }

    // Inactivity (0-0.2)
    if (f.daysSinceLastInteraction !== null) {
      if (f.daysSinceLastInteraction > 60) {
        score += 0.2;
        signals.inactivity = 0.2;
      } else if (f.daysSinceLastInteraction > 30) {
        const contrib = 0.1;
        score += contrib;
        signals.inactivity = contrib;
      }
    }

    // Bounces (0-0.05)
    if (f.emailBounceCount > 0) {
      const contrib = Math.min(0.05, f.emailBounceCount * 0.02);
      score += contrib;
      signals.emailBounce = contrib;
    }

    const probability = Math.max(0, Math.min(1, score));
    const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
      probability > 0.7 ? 'HIGH' : probability > 0.4 ? 'MEDIUM' : 'LOW';

    return {
      probability,
      riskLevel,
      signals,
      reasoning: `Heuristic assessment based on ${Object.keys(signals).length} contributing factors.`,
    };
  }

  private defaultAssessment(): ChurnAssessment {
    return {
      probability: 0,
      riskLevel: 'LOW',
      signals: {},
      reasoning: 'Unable to assess — insufficient data.',
    };
  }
}

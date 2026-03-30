import { Injectable, Logger } from '@nestjs/common';
import type { NBADealContext } from './nba-context.types';

export interface NBACandidate {
  actionType: string;
  title: string;
  reasoning: string;
  expectedImpact: number; // 0-100
  confidence: number; // 0-1
  contactId: string | null;
}

@Injectable()
export class NBARankingService {
  private readonly logger = new Logger(NBARankingService.name);

  /**
   * Generate and rank top N action candidates for a deal.
   * Uses weighted rules based on deal context signals.
   */
  generateCandidates(ctx: NBADealContext, maxResults = 3): NBACandidate[] {
    const candidates: NBACandidate[] = [];

    this.checkStagnation(ctx, candidates);
    this.checkChurnRisk(ctx, candidates);
    this.checkOverdue(ctx, candidates);
    this.checkLowEngagement(ctx, candidates);
    this.checkNoRecentContact(ctx, candidates);
    this.checkEscalation(ctx, candidates);
    this.checkDiscount(ctx, candidates);

    // Sort by urgency score (expectedImpact * confidence), take top N
    candidates.sort(
      (a, b) => b.expectedImpact * b.confidence - a.expectedImpact * a.confidence,
    );

    return candidates
      .filter((c) => c.confidence >= 0.4)
      .slice(0, maxResults);
  }

  private checkStagnation(ctx: NBADealContext, out: NBACandidate[]): void {
    if (ctx.daysInCurrentStage < 7) return;

    const urgency = Math.min(ctx.daysInCurrentStage / 30, 1);
    const primaryContact = ctx.contacts[0];

    if (ctx.daysInCurrentStage >= 14) {
      out.push({
        actionType: 'MEETING',
        title: `Schedule review meeting for "${ctx.dealName}"`,
        reasoning: `Deal has been in "${ctx.stageName}" for ${ctx.daysInCurrentStage} days. A direct meeting can unblock stalled negotiations and identify hidden objections.`,
        expectedImpact: Math.round(50 + urgency * 30),
        confidence: 0.7 + urgency * 0.2,
        contactId: primaryContact?.contactId ?? null,
      });
    }

    out.push({
      actionType: 'FOLLOW_UP',
      title: `Follow up on "${ctx.dealName}" progress`,
      reasoning: `Deal stagnant in "${ctx.stageName}" for ${ctx.daysInCurrentStage} days. A check-in can re-engage the prospect and surface blockers.`,
      expectedImpact: Math.round(40 + urgency * 20),
      confidence: 0.6 + urgency * 0.2,
      contactId: primaryContact?.contactId ?? null,
    });
  }

  private checkChurnRisk(ctx: NBADealContext, out: NBACandidate[]): void {
    if (ctx.churnRisk === null || ctx.churnRisk < 0.4) return;

    const highRiskContacts = ctx.contacts.filter(
      (c) => c.churnRisk !== null && c.churnRisk >= 0.4,
    );
    const targetContact = highRiskContacts[0] ?? ctx.contacts[0];

    out.push({
      actionType: 'CALL',
      title: `Call ${targetContact?.displayName ?? 'contact'} — churn risk detected`,
      reasoning: `Churn risk is ${ctx.churnLevel} (${Math.round((ctx.churnRisk ?? 0) * 100)}%). A personal call shows commitment and can address disengagement before it escalates.`,
      expectedImpact: Math.round(60 + (ctx.churnRisk ?? 0) * 30),
      confidence: 0.65 + (ctx.churnRisk ?? 0) * 0.25,
      contactId: targetContact?.contactId ?? null,
    });
  }

  private checkOverdue(ctx: NBADealContext, out: NBACandidate[]): void {
    if (!ctx.isOverdue || ctx.daysUntilExpectedClose === null) return;

    const daysOverdue = Math.abs(ctx.daysUntilExpectedClose);

    out.push({
      actionType: 'EMAIL',
      title: `Send urgency email — deal ${daysOverdue}d past expected close`,
      reasoning: `Expected close date was ${daysOverdue} days ago. A well-crafted email with next steps can re-establish timeline commitment.`,
      expectedImpact: Math.round(55 + Math.min(daysOverdue / 14, 1) * 25),
      confidence: 0.7,
      contactId: ctx.contacts[0]?.contactId ?? null,
    });
  }

  private checkLowEngagement(ctx: NBADealContext, out: NBACandidate[]): void {
    if (ctx.engagementScore === null || ctx.engagementScore >= 40) return;

    out.push({
      actionType: 'EMAIL',
      title: `Re-engage contacts on "${ctx.dealName}"`,
      reasoning: `Engagement score is only ${ctx.engagementScore}/100. Sharing relevant content or a case study can reignite interest.`,
      expectedImpact: 50,
      confidence: 0.55,
      contactId: ctx.contacts[0]?.contactId ?? null,
    });
  }

  private checkNoRecentContact(
    ctx: NBADealContext,
    out: NBACandidate[],
  ): void {
    if (
      ctx.daysSinceLastActivity !== null &&
      ctx.daysSinceLastActivity < 7
    )
      return;

    const daysSince = ctx.daysSinceLastActivity ?? 30;

    if (!ctx.hasRecentEmail) {
      out.push({
        actionType: 'EMAIL',
        title: `Send update email — no contact in ${daysSince}d`,
        reasoning: `No email activity in the last ${daysSince} days. Regular communication keeps the deal top-of-mind.`,
        expectedImpact: 45,
        confidence: 0.6,
        contactId: ctx.contacts[0]?.contactId ?? null,
      });
    }

    if (!ctx.hasRecentCall && daysSince >= 14) {
      out.push({
        actionType: 'CALL',
        title: `Check-in call — ${daysSince}d since last activity`,
        reasoning: `No call or activity in ${daysSince} days. A quick call can maintain relationship warmth.`,
        expectedImpact: 40,
        confidence: 0.5,
        contactId: ctx.contacts[0]?.contactId ?? null,
      });
    }
  }

  private checkEscalation(ctx: NBADealContext, out: NBACandidate[]): void {
    const shouldEscalate =
      ctx.daysInCurrentStage >= 21 &&
      ctx.amount !== null &&
      ctx.amount >= 10000 &&
      (ctx.churnRisk === null || ctx.churnRisk >= 0.5);

    if (!shouldEscalate) return;

    out.push({
      actionType: 'ESCALATE',
      title: `Escalate "${ctx.dealName}" to management`,
      reasoning: `High-value deal (€${ctx.amount?.toLocaleString()}) stalled for ${ctx.daysInCurrentStage}d with elevated risk. Management involvement can unlock executive sponsorship.`,
      expectedImpact: 70,
      confidence: 0.6,
      contactId: null,
    });
  }

  private checkDiscount(ctx: NBADealContext, out: NBACandidate[]): void {
    // Only suggest discount if deal is in late stages and stalling
    const isLateStage =
      ctx.totalStages > 0 && ctx.stageOrder / ctx.totalStages >= 0.6;
    const isStalling = ctx.daysInCurrentStage >= 14;

    if (!isLateStage || !isStalling) return;

    out.push({
      actionType: 'DISCOUNT',
      title: `Offer incentive to close "${ctx.dealName}"`,
      reasoning: `Deal is in late stage "${ctx.stageName}" (${ctx.stageOrder}/${ctx.totalStages}) but stalled for ${ctx.daysInCurrentStage}d. A time-limited offer can create urgency.`,
      expectedImpact: 60,
      confidence: 0.5,
      contactId: ctx.contacts[0]?.contactId ?? null,
    });
  }
}

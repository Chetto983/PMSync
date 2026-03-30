/**
 * Types for NBA (Next Best Action) context gathering.
 * Extracted to avoid circular dependencies between services.
 */

export interface NBADealContext {
  dealId: string;
  dealName: string;
  amount: number | null;
  currency: string;
  priority: string | null;
  source: string | null;
  score: number;

  // Stage info
  stageName: string;
  stageOrder: number;
  totalStages: number;
  daysInCurrentStage: number;

  // Pipeline info
  pipelineName: string;
  pipelineId: string;

  // Close date
  expectedCloseDate: Date | null;
  daysUntilExpectedClose: number | null;
  isOverdue: boolean;

  // Contacts
  contacts: NBAContactContext[];

  // Account
  accountName: string | null;
  accountIndustry: string | null;

  // Signals
  engagementScore: number | null; // from LeadScore (0-100)
  churnRisk: number | null; // from ChurnSignal (0-1)
  churnLevel: string | null; // HIGH, MEDIUM, LOW

  // Activity
  daysSinceLastActivity: number | null;
  recentActivityCount: number;
  hasRecentEmail: boolean;
  hasRecentMeeting: boolean;
  hasRecentCall: boolean;
}

export interface NBAContactContext {
  contactId: string;
  displayName: string | null;
  role: string | null;
  engagementScore: number | null;
  churnRisk: number | null;
}

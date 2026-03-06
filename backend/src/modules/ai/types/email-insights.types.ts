/**
 * Shared types for email insights.
 * Extracted to break circular dependency between email-insights.service.ts and email-analysis.service.ts.
 */

export interface UnifiedEmailAnalysis {
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  tone: string;
  priority: 1 | 2 | 3 | 4 | 5;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  labels: string[];
  keyTopics: string[];
  intent: string;
  escalationRisk: boolean;
  hasDeadline: boolean;
  deadlineDate: Date | null;
  needsFollowUp: boolean;
  smartReplies?: string[];
  confidence: number;
  reasoning: string;
}

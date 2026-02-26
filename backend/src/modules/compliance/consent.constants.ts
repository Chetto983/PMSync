/**
 * Consent constants for GDPR consent management (CONSENT-01)
 *
 * Features are the granular units of consent that users can grant/revoke.
 * Each feature maps to a processing activity under GDPR Article 6/7.
 */

export const CURRENT_CONSENT_VERSION = 1;

export interface ConsentFeature {
  id: string;
  label: string;
  description: string;
  required: boolean;
  category: 'ai' | 'data';
}

export const CONSENT_FEATURES: ConsentFeature[] = [
  {
    id: 'ai_email_processing',
    label: 'AI Email Processing',
    description: 'Process email content with AI for chat, analysis, and recommendations',
    required: false,
    category: 'ai',
  },
  {
    id: 'ai_smart_replies',
    label: 'AI Smart Replies',
    description: 'Generate AI-powered reply suggestions based on email content',
    required: false,
    category: 'ai',
  },
  {
    id: 'ai_summarization',
    label: 'AI Email Summarization',
    description: 'Summarize email threads using AI language models',
    required: false,
    category: 'ai',
  },
  {
    id: 'ai_scheduling',
    label: 'AI Scheduling',
    description: 'Detect and suggest calendar events from email content',
    required: false,
    category: 'ai',
  },
  {
    id: 'ai_auto_triage',
    label: 'AI Auto-Triage',
    description: 'Automatically label and prioritize incoming emails using AI',
    required: false,
    category: 'ai',
  },
  {
    id: 'email_analytics',
    label: 'Email Analytics',
    description: 'Track email open rates, response times, and communication patterns',
    required: false,
    category: 'data',
  },
  {
    id: 'contact_enrichment',
    label: 'Contact Enrichment',
    description: 'Enhance contact profiles with publicly available information',
    required: false,
    category: 'data',
  },
];

/**
 * Maps consent feature IDs to UserPreferences boolean columns.
 * Features not in this map have no UserPreferences equivalent (e.g., email_analytics).
 */
export const FEATURE_TO_PREF_MAP: Record<string, string> = {
  ai_smart_replies: 'aiSmartRepliesEnabled',
  ai_summarization: 'aiSummarizationEnabled',
  ai_scheduling: 'aiSchedulingEnabled',
  ai_auto_triage: 'aiAutoTriageEnabled',
};

/** Union type of all valid consent feature IDs */
export type ConsentFeatureId =
  | 'ai_email_processing'
  | 'ai_smart_replies'
  | 'ai_summarization'
  | 'ai_scheduling'
  | 'ai_auto_triage'
  | 'email_analytics'
  | 'contact_enrichment';

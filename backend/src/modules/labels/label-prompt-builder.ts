/**
 * Builds AI classification prompts from structured label metadata.
 * Used by the label wizard to auto-generate aiPrompt from roles/contents/actionType.
 */

/** Human-readable descriptions for role IDs */
const ROLE_DESCRIPTIONS: Record<string, string> = {
  supplier: 'suppliers, vendors, or service providers',
  customer: 'customers, clients, or paying accounts',
  internal: 'internal team members or colleagues',
  finance: 'finance, accounting, or billing departments',
  legal: 'legal teams, lawyers, or compliance officers',
  tech: 'technical teams, developers, or IT support',
  logistics: 'logistics, shipping, or warehouse teams',
  any: 'any sender',
};

/** Human-readable descriptions for content IDs */
const CONTENT_DESCRIPTIONS: Record<string, string> = {
  quote: 'quotes, estimates, or pricing proposals',
  order: 'orders, purchase confirmations, or order updates',
  invoice: 'invoices, billing, and payments',
  complaint: 'complaints, issues, or dissatisfaction reports',
  'info-request': 'information requests or inquiries',
  contract: 'contracts, agreements, or legal documents',
  delivery: 'delivery notices, shipping updates, or tracking',
  meeting: 'meeting invitations, agendas, or scheduling',
  newsletter: 'newsletters, digests, or periodic updates',
  support: 'support tickets, help requests, or troubleshooting',
  'system-alert': 'system alerts, monitoring notifications, or automated warnings',
  personal: 'personal messages, informal communication',
};

/** Prompt instructions for each action type */
const ACTION_INSTRUCTIONS: Record<string, string> = {
  urgent: 'Requires immediate attention. Mark as high priority.',
  followup: 'Requires follow-up. Set needsFollowUp=true.',
  decide: 'Requires a decision. Mark as actionable.',
  none: 'Informational only. No action needed.',
};

/** Maps action type to default lane */
export const ACTION_TO_LANE: Record<string, string> = {
  urgent: 'action-now',
  followup: 'waiting-on-reply',
  decide: 'action-now',
  none: 'review-later',
};

export interface LabelWizardMetadata {
  name: string;
  roles: string[];
  contents: string[];
  actionType: string;
  aiPrompt?: string | null;
}

/**
 * Builds an AI prompt from structured label metadata.
 * If the label has a manually-set aiPrompt (power user override), returns it as-is.
 */
export function buildAiPromptFromMetadata(label: LabelWizardMetadata): string {
  if (label.aiPrompt) {
    return label.aiPrompt;
  }

  const parts: string[] = [];

  if (label.roles.length > 0 && !label.roles.includes('any')) {
    const roleText = label.roles
      .map((r) => ROLE_DESCRIPTIONS[r] || r)
      .join(', ');
    parts.push(`Use for emails from ${roleText}.`);
  }

  if (label.contents.length > 0) {
    const contentText = label.contents
      .map((c) => CONTENT_DESCRIPTIONS[c] || c)
      .join(', ');
    parts.push(`Content typically includes ${contentText}.`);
  }

  const actionInstruction = ACTION_INSTRUCTIONS[label.actionType] || ACTION_INSTRUCTIONS.none;
  parts.push(actionInstruction);

  return parts.join(' ');
}

/** Role options available in the wizard (IDs only — frontend handles i18n) */
export const WIZARD_ROLE_OPTIONS = Object.keys(ROLE_DESCRIPTIONS);

/** Content options available in the wizard */
export const WIZARD_CONTENT_OPTIONS = Object.keys(CONTENT_DESCRIPTIONS);

/** Action type options available in the wizard */
export const WIZARD_ACTION_OPTIONS = Object.keys(ACTION_INSTRUCTIONS);

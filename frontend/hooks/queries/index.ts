/**
 * Query hooks index
 * Re-exports all TanStack Query hooks for convenient imports
 */

export * from './use-folders';
export * from './dashboard-keys';
export * from './use-dashboard';
export * from './use-unified-email-counts';
export * from './settings-keys';
export * from './use-settings';
export * from './follow-up-keys';
export * from './use-follow-ups';
export * from './calendar-keys';
export * from './use-calendar';
export * from './contacts-keys';
export * from './use-contacts';
export * from './email-keys';
export * from './use-emails';
export * from './use-correct-triage';
export * from './use-labels';
export * from './use-label-wizard';
export * from './providers-keys';
export * from './use-signatures';
export * from './use-templates';
export * from './use-scheduled-emails';
export * from './billing-keys';
export * from './use-billing';
export * from './use-subscription-features';
export * from './use-subscription-limits';
export * from './consent-keys';
export * from './use-consent';
export * from './use-data-rights';
export * from './use-ai-draft';
export * from './use-ai-health';
export * from './use-writing-style';
export * from './use-organizations';
export * from './use-admin';
export * from './reminder-keys';
export * from './use-reminders';
export * from './crm-accounts-keys';
export * from './use-crm-accounts';
export * from './crm-deals-keys';
export * from './use-crm-deals';
export * from './crm-pipelines-keys';
export * from './use-crm-pipelines';
export * from './crm-custom-fields-keys';
export * from './use-crm-custom-fields';
export * from './crm-products-keys';
export * from './use-crm-products';
export * from './crm-lead-scores-keys';
export * from './use-crm-lead-scores';
export * from './crm-forecast-keys';
export * from './use-crm-forecast';
export * from './crm-churn-keys';
export * from './use-crm-churn';
export * from './crm-nba-keys';
export * from './use-crm-nba';
export * from './crm-governance-keys';
export * from './use-crm-governance';
export * from './crm-tickets-keys';
export * from './use-crm-tickets';
export * from './crm-kb-keys';
export * from './use-crm-kb';
export * from './crm-context-keys';
export * from './use-crm-context';
export * from './crm-activities-keys';
export * from './use-crm-activities';
export * from './crm-suggestions-keys';
export * from './use-crm-suggestions';
export * from './tasks-keys';
export * from './use-tasks';
// Note: use-providers exports are NOT re-exported here because use-settings already
// exports useProviders, useSyncAllProviders, useDeleteProvider. Import directly from
// './use-providers' if you need the dedicated provider hooks (useProvider, useUpdateProvider etc).

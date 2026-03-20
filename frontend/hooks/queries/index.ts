/**
 * Query hooks index
 * Re-exports all TanStack Query hooks for convenient imports
 */

export * from './use-folders';
export * from './dashboard-keys';
export * from './use-dashboard';
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
export * from './use-labels';
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
export * from './use-writing-style';
export * from './use-organizations';
export * from './use-admin';
export * from './reminder-keys';
export * from './use-reminders';
// Note: use-providers exports are NOT re-exported here because use-settings already
// exports useProviders, useSyncAllProviders, useDeleteProvider. Import directly from
// './use-providers' if you need the dedicated provider hooks (useProvider, useUpdateProvider etc).

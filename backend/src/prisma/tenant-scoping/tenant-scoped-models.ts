/**
 * Set of Prisma model names that have a `tenantId` field.
 * The tenant-scoping extension auto-injects tenantId for these models.
 *
 * Derived from schema.prisma — update when adding/removing tenantId from models.
 *
 * Models WITHOUT tenantId (excluded):
 * - Tenant (root entity)
 * - AiMessage (scoped via AiConversation)
 * - voltagent_memory_* (internal agent memory tables)
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'AIMemory',
  'ActionQueue',
  'AgentActionFeedback',
  'AgentLearningProfile',
  'AiConversation',
  'AiDraftFeedback',
  'AiRunLedger',
  'AuditLog',
  'CalendarEvent',
  'CalendarEventAttachment',
  'CalendarPreference',
  'CalendarSyncState',
  'Contact',
  'DashboardPreference',
  'DataExportRequest',
  'Email',
  'EmailAnalysis',
  'EmailAttachment',
  'EmailFollowUp',
  'EmailLabel',
  'EmailSignature',
  'EmailTemplate',
  'Embedding',
  'Folder',
  'LegalAcceptance',
  'MfaBackupCode',
  'MfaSecret',
  'MistralAgent',
  'PasswordResetToken',
  'ProviderConfig',
  'RefreshToken',
  'ProviderContact',
  'ScheduledEmail',
  'Session',
  'Subscription',
  'TrustedDevice',
  'User',
  'UserConsent',
  'UserLabel',
  'UserPreferences',
  'WebAuthnCredential',
  'WebhookSubscription',
  'WritingStyleProfile',
]);

/**
 * Models with composite primary keys: @@id([id, tenantId])
 * These require tenantId in the composite key for findUnique/update/delete.
 */
export const COMPOSITE_PK_MODELS = new Set<string>([
  'Email',
  'Folder',
  'Embedding',
  'CalendarEvent',
  'Contact',
]);

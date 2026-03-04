/**
 * Permission Taxonomy & PolicyService Interface
 *
 * Phase 35 Plan 02 -- RBAC foundation for v4.1.
 * Defines all MailAgent resource:action permission pairs and the
 * PolicyService contract for evaluating user access.
 */

/**
 * Permission enum covering all MailAgent resource:action pairs.
 * Format: resource:action (lowercase, colon-separated).
 */
export enum Permission {
  // Email domain
  EMAIL_READ = 'email:read',
  EMAIL_WRITE = 'email:write',
  EMAIL_DELETE = 'email:delete',
  EMAIL_SEND = 'email:send',

  // AI domain
  AI_CHAT = 'ai:chat',
  AI_BRIEFING = 'ai:briefing',
  AI_TRIAGE = 'ai:triage',
  AI_DRAFT = 'ai:draft',
  AI_RUNS_READ = 'ai:runs:read',
  AI_RUNS_EXPORT = 'ai:runs:export',

  // Calendar domain
  CALENDAR_READ = 'calendar:read',
  CALENDAR_WRITE = 'calendar:write',
  CALENDAR_DELETE = 'calendar:delete',

  // Contacts domain
  CONTACTS_READ = 'contacts:read',
  CONTACTS_WRITE = 'contacts:write',
  CONTACTS_DELETE = 'contacts:delete',
  CONTACTS_EXPORT = 'contacts:export',

  // Admin domain
  ADMIN_USERS = 'admin:users',
  ADMIN_BILLING = 'admin:billing',
  ADMIN_AUDIT = 'admin:audit',
  ADMIN_SETTINGS = 'admin:settings',
}

/**
 * Result of a policy evaluation.
 */
export interface PolicyEvaluation {
  allowed: boolean;
  reason?: string;
  requiredPermissions: Permission[];
}

/**
 * PolicyService interface for RBAC evaluation.
 * Implementation deferred to v4.1 -- this is the contract.
 */
export interface IPolicyService {
  /**
   * Evaluate whether a subject has a specific permission.
   */
  evaluate(
    subjectId: string,
    permission: Permission,
    context?: Record<string, unknown>,
  ): Promise<PolicyEvaluation>;

  /**
   * Check multiple permissions at once for a subject.
   * Returns a map of permission -> granted boolean.
   */
  checkAll(
    subjectId: string,
    permissions: Permission[],
  ): Promise<Map<Permission, boolean>>;

  /**
   * List all permissions granted to a subject.
   */
  listPermissions(subjectId: string): Promise<Permission[]>;
}

/**
 * Injection token for IPolicyService.
 */
export const POLICY_SERVICE = Symbol('POLICY_SERVICE');

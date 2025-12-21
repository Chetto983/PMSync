# Module Safety Audit Report

Source: `backend/scripts/module-safety-audit-report.json`
Timestamp: 2025-12-21T20:46:52.525Z

## Summary
- Total files: 25
- Total checks: 339
- Passed checks: 269
- Failed checks: 70
- Overall score: 88

## Severity Summary
| Severity | Count |
| --- | --- |
| Critical | 7 |
| High | 14 |
| Medium | 44 |
| Low | 5 |

## Module Summary
| Module | Files | Score | Issues |
| --- | --- | --- | --- |
| ai | 5 | 87 | 5 |
| analytics | 1 | 100 | 0 |
| auth | 2 | 68 | 3 |
| calendar | 2 | 88 | 1 |
| compliance | 1 | 95 | 1 |
| contacts | 2 | 88 | 1 |
| email | 3 | 100 | 0 |
| email-sync | 1 | 75 | 1 |
| health | 1 | 100 | 0 |
| labels | 1 | 85 | 1 |
| modules | 1 | 100 | 0 |
| providers | 2 | 80 | 2 |
| tenants | 1 | 95 | 1 |
| users | 1 | 85 | 1 |
| voltagent | 1 | 80 | 2 |

## Check Summary
| Check | Passed | Failed | Severity |
| --- | --- | --- | --- |
| ApiBearerAuth | 25 | 0 | medium |
| ApiOperation | 25 | 0 | low |
| ApiResponse | 20 | 5 | low |
| ApiTags | 25 | 0 | medium |
| IDORPrevention | 7 | 7 | high |
| JwtAuthGuard | 25 | 0 | critical |
| NoHardcodedSecrets | 25 | 0 | critical |
| NoSQLInjection | 25 | 0 | critical |
| NoXSSRisk | 25 | 0 | high |
| ParseUUIDPipe | 0 | 25 | medium |
| TenantGuard | 25 | 0 | critical |
| TenantIdUsage | 18 | 7 | critical |
| Throttle | 6 | 19 | medium |
| ValidationPipe | 18 | 7 | high |

## Findings By File

### backend/src/modules/ai/controllers/ai.controller.ts
- Module: ai
- Score: 100
- Issues: none
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration

### backend/src/modules/ai/controllers/ai-health.controller.ts
- Module: ai
- Score: 75
- Issues:
  - Missing TenantIdUsage: Tenant ID used for data isolation
- Failed checks:
  - ValidationPipe (high): Input validation for request bodies
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - TenantIdUsage (critical): Tenant ID used for data isolation

### backend/src/modules/ai/controllers/knowledge-base.controller.ts
- Module: ai
- Score: 80
- Issues:
  - Missing ApiResponse: Swagger response documentation
  - Potential IDOR risk - database operations without tenant verification
- Failed checks:
  - ApiResponse (low): Swagger response documentation
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - IDORPrevention (high): Missing ownership verification

### backend/src/modules/ai/controllers/personalization.controller.ts
- Module: ai
- Score: 85
- Issues:
  - Potential IDOR risk - database operations without tenant verification
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - IDORPrevention (high): Missing ownership verification

### backend/src/modules/ai/voltagent/controllers/document-library.controller.ts
- Module: voltagent
- Score: 80
- Issues:
  - Missing ApiResponse: Swagger response documentation
  - Potential IDOR risk - database operations without tenant verification
- Failed checks:
  - ApiResponse (low): Swagger response documentation
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - IDORPrevention (high): Missing ownership verification

### backend/src/modules/ai/voltagent/voltagent.controller.ts
- Module: ai
- Score: 95
- Issues:
  - Missing ApiResponse: Swagger response documentation
- Failed checks:
  - ApiResponse (low): Swagger response documentation
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration

### backend/src/modules/analytics/controllers/analytics.controller.ts
- Module: analytics
- Score: 100
- Issues: none
- Failed checks:
  - ValidationPipe (high): Input validation for request bodies
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration

### backend/src/modules/auth/controllers/auth.controller.ts
- Module: auth
- Score: 75
- Issues:
  - Missing TenantIdUsage: Tenant ID used for data isolation
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - TenantIdUsage (critical): Tenant ID used for data isolation

### backend/src/modules/auth/controllers/mfa.controller.ts
- Module: auth
- Score: 60
- Issues:
  - Missing TenantIdUsage: Tenant ID used for data isolation
  - Potential IDOR risk - database operations without tenant verification
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - TenantIdUsage (critical): Tenant ID used for data isolation
  - IDORPrevention (high): Missing ownership verification

### backend/src/modules/calendar/controllers/calendar.controller.ts
- Module: calendar
- Score: 100
- Issues: none
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation

### backend/src/modules/calendar/controllers/calendar-webhook.controller.ts
- Module: calendar
- Score: 75
- Issues:
  - Missing TenantIdUsage: Tenant ID used for data isolation
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - TenantIdUsage (critical): Tenant ID used for data isolation

### backend/src/modules/compliance/controllers/gdpr.controller.ts
- Module: compliance
- Score: 95
- Issues:
  - Missing ApiResponse: Swagger response documentation
- Failed checks:
  - ApiResponse (low): Swagger response documentation
  - ValidationPipe (high): Input validation for request bodies
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration

### backend/src/modules/contacts/controllers/contacts.controller.ts
- Module: contacts
- Score: 100
- Issues: none
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation

### backend/src/modules/contacts/controllers/contacts-webhook.controller.ts
- Module: contacts
- Score: 75
- Issues:
  - Missing TenantIdUsage: Tenant ID used for data isolation
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - TenantIdUsage (critical): Tenant ID used for data isolation

### backend/src/modules/email/controllers/attachments.controller.ts
- Module: email
- Score: 100
- Issues: none
- Failed checks:
  - ValidationPipe (high): Input validation for request bodies
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration

### backend/src/modules/email/controllers/emails.controller.ts
- Module: email
- Score: 100
- Issues: none
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation

### backend/src/modules/email/controllers/folders.controller.ts
- Module: email
- Score: 100
- Issues: none
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration

### backend/src/modules/email-sync/controllers/webhook.controller.ts
- Module: email-sync
- Score: 75
- Issues:
  - Missing TenantIdUsage: Tenant ID used for data isolation
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - TenantIdUsage (critical): Tenant ID used for data isolation

### backend/src/modules/email-sync/email-sync.controller.ts
- Module: modules
- Score: 100
- Issues: none
- Failed checks:
  - ValidationPipe (high): Input validation for request bodies
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration

### backend/src/modules/health/controllers/health.controller.ts
- Module: health
- Score: 100
- Issues: none
- Failed checks:
  - ValidationPipe (high): Input validation for request bodies
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration

### backend/src/modules/labels/controllers/labels.controller.ts
- Module: labels
- Score: 85
- Issues:
  - Potential IDOR risk - database operations without tenant verification
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - IDORPrevention (high): Missing ownership verification

### backend/src/modules/providers/controllers/oauth-callback.controller.ts
- Module: providers
- Score: 75
- Issues:
  - Missing TenantIdUsage: Tenant ID used for data isolation
- Failed checks:
  - ValidationPipe (high): Input validation for request bodies
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - TenantIdUsage (critical): Tenant ID used for data isolation

### backend/src/modules/providers/controllers/providers.controller.ts
- Module: providers
- Score: 85
- Issues:
  - Potential IDOR risk - database operations without tenant verification
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - IDORPrevention (high): Missing ownership verification

### backend/src/modules/tenants/controllers/tenants.controller.ts
- Module: tenants
- Score: 95
- Issues:
  - Missing ApiResponse: Swagger response documentation
- Failed checks:
  - ApiResponse (low): Swagger response documentation
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration

### backend/src/modules/users/controllers/users.controller.ts
- Module: users
- Score: 85
- Issues:
  - Potential IDOR risk - database operations without tenant verification
- Failed checks:
  - ParseUUIDPipe (medium): Parameter type validation
  - Throttle (medium): Rate limiting configuration
  - IDORPrevention (high): Missing ownership verification

## Recommendations
- CRITICAL: Fix all critical security issues immediately
- Add tenant ownership verification to all database operations

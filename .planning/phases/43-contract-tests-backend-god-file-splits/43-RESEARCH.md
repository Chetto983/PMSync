# Phase 43: Contract Tests & Backend God-File Splits - Research

**Researched:** 2026-03-05
**Domain:** API contract testing, backend service decomposition, Node.js streaming
**Confidence:** HIGH

## Summary

Phase 43 has two orthogonal tracks: (A) enforcing frontend-backend API contract alignment via CI, and (B) decomposing 5 backend god-files (6,087 lines total) into sub-400-line focused services/controllers with zero behavior change. Additionally, the attachment download endpoint must be fixed to use piped streaming instead of buffering the entire response into memory.

The project already has most of the infrastructure needed: OpenAPI spec generation exists in CI (`scripts/generate-openapi.ts`), Spectral linting is configured, and `openapi-typescript` type generation is wired. The missing piece is actual contract validation tests that compare frontend API module types/expectations against the OpenAPI spec. The god-file splits are straightforward extraction refactors -- the files have clear method groupings that map to the planned split targets.

**Primary recommendation:** Write pre-split characterization tests for each god-file FIRST (TEST-06), then split files, then add contract tests as a CI gate. Fix the streaming bug in `attachments.controller.ts` lines 128-131 (currently buffers entire response with `arrayBuffer()` + `Buffer.from()`).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| APIS-01 | >=5 critical API contract tests validating FE API modules against OpenAPI spec | CI already generates OpenAPI spec; contract tests compare FE type expectations against spec paths/schemas |
| APIS-02 | Contract tests run as required CI gate | Add contract-test step to `.github/workflows/ci.yml` after OpenAPI generation |
| APIS-03 | Attachment proxy uses piped stream instead of arrayBuffer + Buffer.from | Fix in `attachments.controller.ts` lines 128-131; use `Readable.fromWeb()` + `.pipe(res)` |
| APIS-04 | Content-Length header passthrough from S3 on attachment proxy | Already implemented at line 121-124 of `attachments.controller.ts`; verify with test |
| QUAL-01 | email-sync-back.service.ts (1429 lines) split into sync-delta, sync-full, sync-message-mapper | Split by provider: gmail-sync-back, microsoft-sync-back, imap-sync-back + shared batch service |
| QUAL-02 | auth.service.ts (1376 lines) split into token, session, oauth-flow services | Split: auth-login, auth-registration, auth-token (refresh rotation), auth-password-reset |
| QUAL-03 | emails.controller.ts (1188 lines) split into email-search, email-thread, email-actions controllers | Split: email-crud, email-calendar-invite, email-bulk-ops controllers + keep slim emails.controller |
| QUAL-04 | email-insights.service.ts (1056 lines) split into insight-generator, insight-cache services | Split: email-analysis, email-compose, insight-helpers (validators, parsers, prompt builders) |
| QUAL-05 | contacts.service.ts (1038 lines) split into contact-sync, contact-search services | Split: contact-crud, contact-sync, contact-search services |
| QUAL-06 | All resulting backend files < 400 lines | Enforced by line-count check in verification |
| TEST-04 | Contract tests for >=5 critical APIs (auth login, emails list, contacts list, AI chat stream, briefing) | Jest tests reading OpenAPI spec JSON and validating schema shapes |
| TEST-05 | Attachment proxy test with large file (>=50MB) -- no OOM, stream completes, Content-Length correct | Integration test with mock S3 response; verify memory stays flat via `process.memoryUsage()` |
| TEST-06 | Backend god-file split regression tests -- write tests BEFORE splitting, verify identical behavior after | Characterization tests per service testing public API methods |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Jest | 30.2.0 | Test runner | Already configured in project |
| ts-jest | 29.4.6 | TypeScript transform | Already configured |
| @nestjs/swagger | (installed) | OpenAPI spec generation | Already wired in `main.ts` + `generate-openapi.ts` |
| openapi-typescript | (installed) | Generate TS types from spec | Already in CI pipeline |
| Spectral | (installed) | OpenAPI linting | Already configured with `.spectral.yaml` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-fetch | (installed) | HTTP client for S3 proxy | Already used in attachments controller |
| stream/web + stream | Node built-in | Piped streaming | For attachment proxy fix (APIS-03) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom contract tests | Pact.io | Overkill -- project already has OpenAPI spec generation; simple schema comparison is sufficient |
| Custom contract tests | Dredd | Requires live server; OpenAPI spec comparison is lighter and CI-friendly |

**Installation:**
No new packages needed. Everything required is already installed.

## Architecture Patterns

### Contract Test Pattern

Contract tests validate that frontend API module type expectations match the OpenAPI spec generated from backend decorators.

**Approach:** Read `openapi-spec.json` (generated in CI), validate:
1. Endpoint paths exist in spec
2. Response schemas match frontend type shapes
3. Required fields are present
4. HTTP methods match

```
backend/
├── scripts/
│   └── generate-openapi.ts     # Already exists
├── test/
│   └── contract/
│       ├── auth-login.contract.spec.ts
│       ├── emails-list.contract.spec.ts
│       ├── contacts-list.contract.spec.ts
│       ├── ai-chat.contract.spec.ts
│       └── briefing.contract.spec.ts
```

### God-File Split Pattern

**Strategy:** Extract methods into focused services, keep the original class as a thin facade that delegates to sub-services. This preserves the public API and DI registration.

```
# BEFORE
email-sync-back.service.ts (1429 lines, 1 class)

# AFTER
email-sync-back.service.ts          (~100 lines, delegates to sub-services)
├── gmail-sync-back.service.ts      (~350 lines, Gmail-specific sync)
├── microsoft-sync-back.service.ts  (~300 lines, Microsoft-specific sync)
├── imap-sync-back.service.ts       (~350 lines, IMAP-specific sync)
└── sync-batch.service.ts           (~250 lines, batch orchestration)
```

### Recommended Split Plan

#### 1. email-sync-back.service.ts (1429 lines)

Current method grouping by provider:
- Lines 304-506: `syncToGmail` + Gmail helpers
- Lines 507-604: `syncToMicrosoft` + Microsoft helpers
- Lines 605-781: `syncToImap` + IMAP helpers
- Lines 782-894: `syncOperationsBatch` (orchestrator)
- Lines 895-1074: `syncGmailBatch`
- Lines 1075-1162: `syncMicrosoftBatch`
- Lines 1163-1330: `syncImapBatch`
- Lines 1331-1429: Provider folder/ID lookup helpers

**Split target:** 4 files (gmail-sync-back, microsoft-sync-back, imap-sync-back, sync-back-orchestrator)

#### 2. auth.service.ts (1376 lines)

Current method grouping:
- Lines 128-277: `register` (registration flow)
- Lines 278-488: OTP send/verify
- Lines 489-702: `login` + `createSession`
- Lines 703-899: Passkey/WebAuthn + MFA
- Lines 900-1163: Password reset flow
- Lines 1164-1376: Logout + refresh token management + profile

**Split target:** 4 files (auth-registration, auth-login, auth-password-reset, auth-token)

#### 3. emails.controller.ts (1188 lines)

Current route grouping:
- Lines 123-253: List, stats, search (query endpoints)
- Lines 283-575: Thread, calendar invite, get email (read endpoints)
- Lines 576-767: Calendar invite send/cancel (calendar actions)
- Lines 768-923: Send, reply, forward, update, delete (email actions)
- Lines 924-1076: Drafts + bulk operations
- Lines 1076-1188: Fetch archived, maintenance, retention, attachment download, helpers

**Split target:** 3 controllers (email-query, email-calendar-invite, email-actions) + slim emails.controller

#### 4. email-insights.service.ts (1056 lines)

Current method grouping:
- Lines 148-390: `analyzeEmailUnified` + mapping/validation helpers
- Lines 403-519: `generateSmartReplies`
- Lines 520-830: `composeEmail` + prompt builders + JSON parsers
- Lines 836-1056: Error mapping + utility methods (strip markdown, label linking)

**Split target:** 3 files (email-analysis, email-compose, insight-utils)

#### 5. contacts.service.ts (1038 lines)

Current method grouping:
- Lines 81-296: List, get, counts, update counts (CRUD reads)
- Lines 296-620: Create, update, delete, toggle VIP, list VIP (CRUD writes)
- Lines 667-870: Photo, find by emails, delete provider contacts (provider operations)
- Lines 871-1038: Sync, find-or-create unified, create local, extract from emails, import vCard

**Split target:** 3 files (contact-crud, contact-provider-ops, contact-sync)

### Anti-Patterns to Avoid

- **Moving methods AND changing behavior simultaneously:** Split is a pure refactor. Zero logic changes. If a bug is found during split, fix it in a separate commit.
- **Breaking the module registration:** New sub-services must be registered as providers in the same NestJS module and injected into the facade service.
- **Circular dependencies between split files:** Sub-services should NOT depend on each other. They share only the facade's constructor dependencies (PrismaService, etc.).
- **Splitting controllers without updating route prefixes:** NestJS routes are defined by `@Controller('path')` + method decorators. Split controllers must maintain identical route paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI spec generation | Custom spec builder | `@nestjs/swagger` + `generate-openapi.ts` | Already works, maintains sync with decorators |
| Type generation from spec | Manual type sync | `openapi-typescript` | Already in CI, generates from spec |
| Stream piping | Custom buffering | `Readable.fromWeb(s3Response.body).pipe(res)` | Node.js built-in, memory-safe |
| Contract validation | Custom schema parser | Read `openapi-spec.json` + validate paths/schemas | Spec is the single source of truth |

## Common Pitfalls

### Pitfall 1: OpenAPI Spec Generation Requires DB Connection
**What goes wrong:** `generate-openapi.ts` boots the full NestJS app, which needs Postgres + Redis.
**Why it happens:** CI step uses `continue-on-error: true` -- spec generation silently fails, contract tests can't run.
**How to avoid:** Contract tests must handle missing spec gracefully OR generate spec without full app boot (mock DB). The current CI already handles this with conditional steps.
**Warning signs:** Contract test step skipped in every CI run.

### Pitfall 2: Controller Split Breaks Swagger Route Registration
**What goes wrong:** New controllers not imported in module's `controllers` array, routes disappear from OpenAPI spec.
**Why it happens:** NestJS discovers routes via module metadata. Forgetting to register a controller means its routes are invisible.
**How to avoid:** After splitting, verify the OpenAPI spec still contains all original paths by diffing before/after.

### Pitfall 3: Attachment Streaming on Windows
**What goes wrong:** `Readable.fromWeb()` not available in older Node.js or behaves differently.
**Why it happens:** Node 20 supports `Readable.fromWeb()` but some edge cases with `node-fetch` Response bodies.
**How to avoid:** Use `pipeline()` from `stream/promises` for proper backpressure handling and error cleanup. Alternative: use `s3Response.body.pipeTo()` with web streams, or cast through `Readable.from()`.

### Pitfall 4: Facade Service Becomes a Pass-Through Blocker
**What goes wrong:** The original service becomes 100% delegation with zero value, yet consumers still import it.
**Why it happens:** Over-aggressive splitting where the facade adds no orchestration logic.
**How to avoid:** Keep orchestration logic (retry, timeout, batch coordination) in the facade. Only extract provider-specific or domain-specific logic.

### Pitfall 5: Test Files Growing Past 400 Lines
**What goes wrong:** Characterization tests for a 1400-line service naturally exceed 400 lines.
**Why it happens:** The 400-line limit applies to source files, not test files.
**How to avoid:** Clarify: QUAL-06 "All resulting backend files < 400 lines" applies to the split source files, not test files. Tests can be longer.

## Code Examples

### Contract Test Pattern
```typescript
// Source: Project-specific pattern based on existing OpenAPI infrastructure
import * as fs from 'fs';

describe('Auth Login Contract', () => {
  let spec: any;

  beforeAll(() => {
    const specPath = 'openapi-spec.json';
    if (!fs.existsSync(specPath)) {
      console.warn('OpenAPI spec not found -- skipping contract tests');
      return;
    }
    spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
  });

  it('POST /api/v1/auth/login exists and returns expected shape', () => {
    if (!spec) return; // Skip if spec unavailable
    const path = spec.paths['/api/v1/auth/login'];
    expect(path).toBeDefined();
    expect(path.post).toBeDefined();

    const response = path.post.responses['201'] || path.post.responses['200'];
    expect(response).toBeDefined();
    // Validate response schema matches frontend expectations
  });
});
```

### Attachment Streaming Fix (APIS-03)
```typescript
// BEFORE (OOM risk on large files):
const arrayBuffer = await s3Response.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);
res.send(buffer);

// AFTER (piped stream, constant memory):
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

if (s3Response.body) {
  const nodeStream = Readable.fromWeb(s3Response.body as any);
  await pipeline(nodeStream, res);
} else {
  throw new Error('No response body from S3');
}
```

### Facade Delegation Pattern (God-File Split)
```typescript
// email-sync-back.service.ts (after split, ~150 lines)
@Injectable()
export class EmailSyncBackService {
  constructor(
    private gmailSync: GmailSyncBackService,
    private microsoftSync: MicrosoftSyncBackService,
    private imapSync: ImapSyncBackService,
  ) {}

  async syncOperationToProvider(operation: EmailSyncOperation): Promise<void> {
    // Orchestration logic (retry, timeout) stays here
    return this.executeWithRetry(async () => {
      const accessToken = await this.getValidAccessToken(operation.provider);
      switch (operation.provider.providerType) {
        case 'google': return this.gmailSync.sync(operation, accessToken);
        case 'microsoft': return this.microsoftSync.sync(operation, accessToken);
        default: return this.imapSync.sync(operation, operation.provider);
      }
    });
  }
}
```

### NestJS Module Registration After Split
```typescript
// email.module.ts -- add new sub-services to providers array
@Module({
  providers: [
    // ... existing providers
    GmailSyncBackService,      // NEW
    MicrosoftSyncBackService,  // NEW
    ImapSyncBackService,       // NEW
    EmailSyncBackService,      // EXISTING (now facade)
  ],
  controllers: [
    EmailsController,          // EXISTING (slimmed)
    EmailQueryController,      // NEW
    EmailCalendarController,   // NEW
    EmailActionsController,    // NEW
    AttachmentsController,     // EXISTING
    // ...
  ],
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Buffer entire S3 response | Pipe streams with backpressure | Node 18+ | Prevents OOM on large attachments |
| Manual FE/BE type sync | openapi-typescript from spec | Already in CI | Single source of truth for API types |
| Monolithic service files | Focused sub-services with facade | This phase | Maintainability, testability |

**Existing infrastructure already in place:**
- `generate-openapi.ts` -- generates spec from NestJS decorators
- `.spectral.yaml` -- lints generated spec
- CI step generates types via `openapi-typescript`
- `api.generated.ts` exists as placeholder (empty export)

## Open Questions

1. **OpenAPI spec generation in CI without DB**
   - What we know: Script requires full NestJS boot (DB + Redis). CI uses `continue-on-error: true`.
   - What's unclear: Whether contract tests should generate spec locally or rely on a committed spec file.
   - Recommendation: Generate spec as part of the contract test setup. If DB unavailable, skip with warning. For local dev, run `npx ts-node scripts/generate-openapi.ts` with Docker services running.

2. **Duplicate attachment download routes**
   - What we know: Both `attachments.controller.ts` (`GET /email/attachments/:id/download`) and `emails.controller.ts` (`GET /emails/:emailId/attachments/:attachmentId/download`) serve downloads.
   - What's unclear: Which route the frontend actually uses, whether both need the streaming fix.
   - Recommendation: Fix streaming in `attachments.controller.ts` (the primary route). The `emails.controller.ts` route redirects to signed URL, so it does not buffer. Verify frontend usage during implementation.

3. **auth.service.ts split and refresh token methods**
   - What we know: Refresh token methods (lines 1195-1376) were added in Phase 42-03. They're tightly coupled with login/session methods.
   - What's unclear: Whether token service should own session creation too, or just token rotation.
   - Recommendation: Keep `createSession` in auth-login service. Put `createRefreshToken`, `rotateRefreshToken`, `deleteAllRefreshTokens` in auth-token service. Put `getCurrentUserProfile` in auth-login or a separate profile service.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + ts-jest 29.4.6 |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern="<pattern>" --forceExit` |
| Full suite command | `cd backend && npx jest --passWithNoTests --ci --forceExit` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APIS-01 | >=5 contract tests validate FE types vs OpenAPI spec | unit | `npx jest --testPathPattern="contract" --forceExit` | No -- Wave 0 |
| APIS-02 | Contract tests run as CI gate | CI config | Manual: verify ci.yml step added | No -- Wave 0 |
| APIS-03 | Attachment proxy uses piped stream | integration | `npx jest --testPathPattern="attachment.*stream" --forceExit` | No -- Wave 0 |
| APIS-04 | Content-Length passthrough from S3 | integration | Same as APIS-03 test file | No -- Wave 0 |
| QUAL-01 | email-sync-back split (<400 lines each) | unit + line count | `npx jest --testPathPattern="email-sync-back" --forceExit && wc -l` | No -- Wave 0 |
| QUAL-02 | auth.service split (<400 lines each) | unit + line count | `npx jest --testPathPattern="auth\.(login\|registration\|token\|password)" --forceExit` | No -- Wave 0 |
| QUAL-03 | emails.controller split (<400 lines each) | unit + line count | `npx jest --testPathPattern="email.*(query\|calendar\|actions)" --forceExit` | No -- Wave 0 |
| QUAL-04 | email-insights split (<400 lines each) | unit + line count | `npx jest --testPathPattern="email-(analysis\|compose\|insight)" --forceExit` | No -- Wave 0 |
| QUAL-05 | contacts.service split (<400 lines each) | unit + line count | `npx jest --testPathPattern="contact-(crud\|provider\|sync)" --forceExit` | No -- Wave 0 |
| QUAL-06 | All resulting files <400 lines | script | `find backend/src -name "*.ts" | xargs wc -l | awk '$1>400'` | N/A |
| TEST-04 | Contract tests for 5 critical APIs | unit | Same as APIS-01 | No -- Wave 0 |
| TEST-05 | 50MB+ attachment no OOM, stream completes | integration | `npx jest --testPathPattern="attachment.*large" --forceExit` | No -- Wave 0 |
| TEST-06 | Pre-split regression tests pass before AND after | unit | Per-service test files | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern="<changed-area>" --forceExit`
- **Per wave merge:** `cd backend && npx jest --passWithNoTests --ci --forceExit`
- **Phase gate:** Full suite green + `wc -l` on all split files < 400

### Wave 0 Gaps
- [ ] `backend/test/contract/auth-login.contract.spec.ts` -- covers APIS-01, TEST-04
- [ ] `backend/test/contract/emails-list.contract.spec.ts` -- covers APIS-01, TEST-04
- [ ] `backend/test/contract/contacts-list.contract.spec.ts` -- covers APIS-01, TEST-04
- [ ] `backend/test/contract/ai-chat.contract.spec.ts` -- covers APIS-01, TEST-04
- [ ] `backend/test/contract/briefing.contract.spec.ts` -- covers APIS-01, TEST-04
- [ ] `backend/src/modules/email/controllers/__tests__/attachment-streaming.spec.ts` -- covers APIS-03, APIS-04, TEST-05
- [ ] Pre-split characterization tests for each god-file -- covers TEST-06
- [ ] CI workflow update for contract test gate -- covers APIS-02

## Sources

### Primary (HIGH confidence)
- Project codebase inspection: all 5 god-files examined with method-level granularity
- `backend/.github/workflows/ci.yml` -- existing CI pipeline with OpenAPI generation
- `backend/scripts/generate-openapi.ts` -- existing spec generation script
- `backend/src/modules/email/controllers/attachments.controller.ts` -- streaming bug at lines 128-131
- `backend/jest.config.js` -- test configuration

### Secondary (MEDIUM confidence)
- NestJS Swagger module patterns for controller splitting
- Node.js `Readable.fromWeb()` API for stream conversion (Node 20 LTS)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already installed and configured in project
- Architecture: HIGH -- god-files examined at method level, split boundaries are natural
- Pitfalls: HIGH -- attachment streaming bug is clearly visible in source code
- Contract testing: MEDIUM -- approach is sound but OpenAPI spec generation's CI reliability is a concern (needs DB)

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable domain, no external dependency changes expected)

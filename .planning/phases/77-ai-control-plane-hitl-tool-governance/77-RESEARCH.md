# Phase 77: AI Control Plane -- HITL & Tool Governance - Research

**Researched:** 2026-03-18
**Domain:** NestJS HITL lifecycle, AI tool registry governance, Prisma enum migration
**Confidence:** HIGH

## Summary

Phase 77 addresses a well-scoped problem: the HITL approval system works but has a messy contract (redundant DTO fields, wrong ActionType mappings, hardcoded severity lookups, controller-level tool resolution), and the tool registry (Phase 32 stub) lacks governance metadata. The codebase is clean enough that this is a refactoring and hardening exercise, not a greenfield build.

The main technical risks are: (1) the Prisma ActionType enum migration requires a careful SQL data migration to rename existing values in production rows before altering the enum type, (2) the controller currently hardcodes tool resolution via `resolveToolName()` and `getExecutableTool()` which directly imports tool services -- this must move to registry-based lookup, and (3) the frontend `PendingAction` type is defined in `frontend/lib/api/ai.ts` and used by `use-ai-actions.ts` and `HitlApprovalCard.tsx` -- all must adapt to the new DTO shape.

**Primary recommendation:** Work bottom-up: Prisma migration first (ActionType enum), then registry interface + metadata, then controller refactor, then DTO cleanup, then frontend adaptation, then tests last.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Extend existing `IToolRegistryService` (Phase 32 stub) with governance fields: `domain`, `riskLevel`, `requiresApproval`, `inputSchema`
- Each tool service registers metadata at startup via the registry -- registry is the single source of truth
- `needsApproval` stays on AI SDK `tool()` calls for SDK compatibility, but the registry is authoritative for HITL
- No decorators -- explicit registry registration preferred over reflection-based metadata
- 3-tier risk: LOW / MEDIUM / HIGH with specific tool assignments
- LOW = read-only: search_emails, read_email, view_calendar, list_contacts, list_folders, semantic_search, ask_user
- MEDIUM = reversible mutations: archive_email, move_email, create_event, update_event, draft_email, create_contact, update_contact, create_folder, save_memory, run_code
- HIGH = irreversible/external: send_email, delete_email, forward_email, reply_email, delete_event, delete_contact
- Default: `riskLevel === 'HIGH'` implies `requiresApproval: true`; MEDIUM/LOW default to false
- 6 domains: email, calendar, contacts, knowledge, productivity, system
- ActionType enum values match tool names 1:1 (SEND_EMAIL for send_email, etc.)
- `resolveToolName()` and `mapSeverity()` disappear from controller
- 3 outcome states: executed / failed / rejected (no approved_only)
- Response shape: `{ outcome, summary, executionTimeMs, data?, error?, reason? }`
- Pending DTO: drop executionId, agentName, adjustedConfidence; add riskLevel, domain
- Contract tests via supertest against real NestJS app
- E2E HITL tests against real Railway deployment with dvdmarchetto@gmail.com tenant
- 100% coverage of all HIGH-risk tools in E2E

### Claude's Discretion
- Exact IAiTool interface field types and method signatures
- Registry initialization pattern (module onModuleInit vs factory)
- Prisma migration ordering and rollback strategy
- Test fixture setup and cleanup approach
- Whether to keep tool-approval-gates.spec.ts or fully replace it

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AICP-01 | HITL uses one canonical pending-actions DTO and one approval lifecycle | Current PendingActionResponse has 14 fields, 3 redundant (executionId, agentName, adjustedConfidence). Clean DTO documented below with exact field mapping. |
| AICP-02 | Approve/reject endpoints return real execution outcome | Current approve returns `{ status, approved, approvedBy, approvedAt, executionResult, action }` -- needs restructuring to `{ outcome, summary, executionTimeMs, data?, error?, reason? }` |
| AICP-03 | Every mutating tool declares name, domain, riskLevel, requiresApproval, inputSchema | IToolRegistryService interface needs governance fields. Current IAiTool has name, description, parameters, execute. Full tool inventory documented (30 tools, 6 HIGH-risk). |
| AICP-04 | Action taxonomy correct (no mismatches) | Current `mapToolToActionType` has `delete_event: 'SCHEDULE_MEETING'` and fallback to `CREATE_TASK`. Prisma enum needs 6 new values, 1 rename, several removals. |
| AICP-12 | Contract tests for DTO shapes and HITL lifecycle | Existing test infrastructure: vitest (.test.ts) for integration, jest (.spec.ts) for unit. supertest pattern exists in hitl.test.ts. |
| AICP-14 | HITL E2E flow tested (trigger, approve, execute, verify) | E2E against Railway deployment. Existing hitl.test.ts pattern for Prisma lifecycle. Need new E2E test file for full flow. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | 11 | Backend framework | Already in use, provides DI for registry pattern |
| Prisma | Latest | ORM + migration | Already in use, handles ActionType enum migration |
| AI SDK | v6 | `tool()` function with `needsApproval` | Already in use, tools defined via `tool()` |
| zod | 3.x | Input schema validation | Already used for all tool inputSchema definitions |
| supertest | Latest | HTTP contract testing | Already in devDependencies, used in existing tests |
| vitest | Latest | Integration test runner | Already configured for .test.ts files |
| jest | Latest | Unit/spec test runner | Already configured for .spec.ts files |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-validator | Latest | DTO validation | Already used in ApproveActionDto |
| @nestjs/swagger | Latest | OpenAPI decorators | Already used for API documentation |

### Alternatives Considered
None -- all decisions are locked. No new dependencies needed.

**Installation:**
No new packages required. All dependencies already exist.

## Architecture Patterns

### Current Architecture (What Exists)

```
backend/src/
  common/
    interfaces/tool-registry.interface.ts    # IAiTool, IToolRegistryService (Phase 32 stub)
    modules/tool-registry/
      tool-registry.service.ts               # ToolRegistryService implementation
      tool-registry.module.ts
  modules/ai-chat/
    controllers/
      hitl.controller.ts                     # HITL endpoints (approve, pending-actions)
    services/
      hitl.service.ts                        # ActionQueue lifecycle (Prisma)
      ai-chat.service.ts                     # Tool assembly, mapToolToActionType
    dto/
      hitl.dto.ts                            # ApproveActionDto, PendingActionResponse
    tools/
      email-tools.service.ts                 # 9 tools
      calendar-tools.service.ts              # 4 tools
      contact-tools.service.ts               # 3 tools (no delete_contact)
      folder-tools.service.ts                # 2 tools
      rag-tools.service.ts                   # 2 tools
      conversation-tools.service.ts          # 1 tool (ask_user)
      sandbox-tools.service.ts               # 1 tool (run_code)
      productivity-tools.service.ts          # 6 tools
      reminder-tools.service.ts              # 2 tools
      tool-approval-gates.spec.ts            # Existing approval gate tests (22 tools)

frontend/
  lib/api/ai.ts                              # PendingAction type, aiChatApi methods
  hooks/ai/use-ai-actions.ts                 # useAiActions hook
  components/chat/
    HitlApprovalCard.tsx                     # Approval UI component
    AssistantMessage.tsx                     # Renders HitlPendingActions
```

### Pattern 1: Extended Tool Registry with Governance Metadata

**What:** Add governance fields to IAiTool interface and validate on registration.
**When to use:** Every tool registration.

```typescript
// Extend existing IAiTool interface
export type ToolDomain = 'email' | 'calendar' | 'contacts' | 'knowledge' | 'productivity' | 'system';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface IAiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  // Governance fields (Phase 77)
  domain: ToolDomain;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  inputSchema: unknown; // zod schema or JSON schema
  execute(input: Record<string, unknown>, context: IToolContext): Promise<unknown>;
}

// Registration validation in ToolRegistryService
registerTool(tool: IAiTool): void {
  // Fail registration if governance fields missing
  if (!tool.domain || !tool.riskLevel || tool.requiresApproval === undefined || !tool.inputSchema) {
    throw new Error(`Tool "${tool.name}" missing governance metadata`);
  }
  this.tools.set(tool.name, tool);
}
```

### Pattern 2: Registry-Based Controller (Replace Hardcoded Lookups)

**What:** HitlController queries ToolRegistryService for metadata instead of maintaining mapSeverity/resolveToolName.
**When to use:** All HITL operations.

```typescript
// BEFORE (current -- hardcoded in controller)
private mapSeverity(actionType: string, toolName?: string): 'LOW' | 'MEDIUM' | 'HIGH' { ... }
private resolveToolName(actionType: string, payload: Record<string, unknown>): string | undefined { ... }

// AFTER (registry-based)
// Controller injects TOOL_REGISTRY_SERVICE
// Tool name IS the action type (1:1 mapping)
const toolMeta = this.toolRegistry.getTool(toolName);
const riskLevel = toolMeta?.riskLevel ?? 'LOW';
```

### Pattern 3: ActionType Enum 1:1 with Tool Names

**What:** ActionType enum values directly match tool names in UPPER_SNAKE_CASE.
**When to use:** Prisma migration.

```
// BEFORE
enum ActionType {
  SEND_EMAIL, SCHEDULE_MEETING, CREATE_TASK, UPDATE_CONTACT,
  UPDATE_DEAL, ADD_LABEL, ARCHIVE_EMAIL, SNOOZE_EMAIL,
  CREATE_CONTACT, DELETE_CONTACT, DELETE_EMAIL, REPLY_EMAIL, FORWARD_EMAIL
}

// AFTER -- only mutating tools that can trigger HITL
enum ActionType {
  SEND_EMAIL, DELETE_EMAIL, FORWARD_EMAIL, REPLY_EMAIL,
  DELETE_EVENT, DELETE_CONTACT,
  // MEDIUM tools that COULD be promoted to require approval:
  ARCHIVE_EMAIL, MOVE_EMAIL, CREATE_EVENT, UPDATE_EVENT,
  DRAFT_EMAIL, CREATE_CONTACT, UPDATE_CONTACT,
  CREATE_FOLDER, SAVE_MEMORY, RUN_CODE,
  // Productivity + reminder (for completeness)
  STAR_EMAIL, MARK_EMAIL_READ, LABEL_EMAIL,
  LIST_EMAIL_INDEX, LIST_FOLLOW_UPS, UPDATE_FOLLOW_UP,
  CREATE_REMINDER, LIST_REMINDERS
}
```

### Anti-Patterns to Avoid
- **Controller-level tool resolution:** Never maintain a separate mapping table in the controller when the registry is the source of truth.
- **ActionType as semantic label:** ActionType should be the tool name, not a semantic grouping (no more `SCHEDULE_MEETING` for `delete_event`).
- **Dual source of truth for approval:** `needsApproval` on `tool()` stays for AI SDK compatibility, but the registry's `requiresApproval` is authoritative. Never check `needsApproval` in HITL code paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DTO validation | Manual field checks | class-validator decorators on DTO classes | Already in use, handles validation + Swagger docs |
| Enum migration | Raw SQL in application code | Prisma migration with `execute` for data migration | Prisma manages schema state, raw SQL only for data migration step |
| API contract testing | Custom HTTP clients | supertest + NestJS `Test.createTestingModule()` | Standard NestJS testing pattern, already used in codebase |
| Tool metadata validation | Runtime type guards | Strict TypeScript interface + registration-time validation | Fails fast at startup, not at request time |

## Common Pitfalls

### Pitfall 1: Prisma Enum Migration Ordering
**What goes wrong:** Adding new enum values and renaming existing ones in the same migration can fail if data references old values.
**Why it happens:** PostgreSQL enum alterations are DDL operations. Renaming a value that's referenced by rows requires the data migration to happen between the rename and any value removal.
**How to avoid:**
1. First migration: ADD new values (DELETE_EVENT, etc.)
2. Data migration: UPDATE rows using old values to new values
3. Second migration (or same, after data): Remove unused values (SCHEDULE_MEETING, CREATE_TASK, etc.)
**Warning signs:** Migration fails with "value still in use" errors.

### Pitfall 2: Breaking Frontend with DTO Changes
**What goes wrong:** Changing PendingActionResponse shape breaks frontend before it's updated.
**Why it happens:** Frontend uses `executionId` as the action identifier in multiple places (HitlApprovalCard key, approveAction parameter).
**How to avoid:** Update backend DTO and frontend type simultaneously. The frontend uses `executionId` in:
- `AssistantMessage.tsx` line 29: `key={action.executionId}`
- `AssistantMessage.tsx` line 31: `onApprove={() => approveAction(action.executionId)}`
- `use-ai-actions.ts` line 126: `mutationFn` parameter
- `use-ai-actions.ts` line 190: `getAction` lookup
**Warning signs:** TypeScript compilation failures in frontend after backend changes.

### Pitfall 3: Tool Inventory Mismatch (22 vs 30 Tools)
**What goes wrong:** tool-approval-gates.spec.ts covers 22 tools but createToolSet assembles 30 (adds 6 productivity + 2 reminder tools).
**Why it happens:** Productivity and reminder tools were added after the original spec was written.
**How to avoid:** The new registry assertion test must cover ALL tools returned by createToolSet (30 total), not just the 22 in the old spec. Full inventory:
- Email: 9 (search_emails, read_email, send_email, delete_email, forward_email, reply_email, draft_email, archive_email, move_email)
- Calendar: 4 (view_calendar, create_event, update_event, delete_event)
- Contacts: 3 (search_contacts, create_contact, update_contact)
- Folders: 2 (list_folders, create_folder)
- RAG: 2 (semantic_search, save_memory)
- Conversation: 1 (ask_user)
- Sandbox: 1 (run_code)
- Productivity: 6 (list_email_index, star_email, mark_email_read, label_email, list_follow_ups, update_follow_up)
- Reminder: 2 (create_reminder, list_reminders)
- **Total: 30 tools**
**Warning signs:** Registry assertion test counts differ from actual tool count.

### Pitfall 4: delete_contact Tool Does Not Exist Yet
**What goes wrong:** CONTEXT.md lists delete_contact as HIGH-risk, but the tool is not implemented. Only search/create/update_contact exist.
**Why it happens:** The ActionType enum has DELETE_CONTACT, and the controller maps it, but no tool service builds it.
**How to avoid:** Either (a) implement delete_contact in ContactToolsService as part of this phase, or (b) keep it in the enum/registry metadata but mark it as unimplemented. The E2E test for delete_contact will need to actually build and test it.
**Warning signs:** E2E test for delete_contact fails because the tool doesn't exist.

### Pitfall 5: Approval Response Shape Change Breaks Frontend
**What goes wrong:** Current approve returns `{ status: 'approved', approved: true, executionResult: {...} }`. New shape is `{ outcome, summary, executionTimeMs, ... }`.
**Why it happens:** Frontend `use-ai-actions.ts` line 128 destructures `response.data` expecting current shape. `ApprovalResponse` type in `ai.ts` must change.
**How to avoid:** Update both backend response and frontend type + hook simultaneously. The frontend `onApprove` callback receives `executionResult` (line 134) -- the callback signature changes.

### Pitfall 6: HitlController Imports Tool Services Directly
**What goes wrong:** The controller currently imports EmailToolsService, CalendarToolsService, ContactToolsService and calls their `getTools()` method in `getExecutableTool()`.
**Why it happens:** The registry was Phase 32 stub, not yet used for tool execution.
**How to avoid:** The controller must use the registry to look up tools by name. But the registry currently stores `IAiTool` objects with `execute(input, context)` which requires `IToolContext`. The current tool services return AI SDK `tool()` objects with `execute(args)` (different signature). The registry tools (from domain modules) and the chat tools (from tool services) are TWO DIFFERENT sets. The controller needs to resolve execution via the tool services pattern or the registry must also provide executable tools.

## Code Examples

### Current Tool Registration Pattern (Domain Modules)

```typescript
// backend/src/modules/email/tools/email-search.tool.ts (example)
// Domain modules register via OnModuleInit
@Injectable()
export class EmailSearchTool implements OnModuleInit {
  constructor(
    @Inject(TOOL_REGISTRY_SERVICE) private registry: IToolRegistryService,
  ) {}

  onModuleInit() {
    this.registry.registerTool({
      name: 'email_search',
      description: '...',
      parameters: {},
      execute: async (input, context) => { ... },
    });
  }
}
```

### Current AI SDK Tool Pattern (Chat Tool Services)

```typescript
// backend/src/modules/ai-chat/tools/email-tools.service.ts
// Chat tools use AI SDK tool() function -- NOT the registry
return tool({
  description: 'Send an email...',
  inputSchema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
  needsApproval: true,
  execute: async (args) => { ... },
});
```

### Critical Integration Gap

The codebase has TWO tool systems:
1. **Registry tools** (IAiTool interface, registered by domain modules like email.module.ts, calendar.module.ts) -- used for tool discovery
2. **Chat tools** (AI SDK `tool()` objects, built by *ToolsService classes in ai-chat/tools/) -- used for actual execution

The HitlController currently uses the chat tools system (imports tool services directly). Phase 77 needs to either:
- **Option A:** Extend the registry to also store the AI SDK tool objects (add execution capability)
- **Option B:** Keep both systems but have the controller look up metadata from registry and execution from tool services via registry indirection

**Recommendation:** Option A is cleaner. Have each *ToolsService register its tools in the registry with full governance metadata. The registry becomes the single source of truth for BOTH metadata and execution. The `createToolSet()` method in AiChatService can build tools from the registry instead of importing all 9 tool services.

### Prisma Migration Pattern

```sql
-- Step 1: Add new enum values
ALTER TYPE "ActionType" ADD VALUE 'DELETE_EVENT';
ALTER TYPE "ActionType" ADD VALUE 'ARCHIVE_EMAIL';
ALTER TYPE "ActionType" ADD VALUE 'MOVE_EMAIL';
-- ... etc

-- Step 2: Data migration (rename existing rows)
UPDATE action_queue SET "actionType" = 'DELETE_EVENT' WHERE "actionType" = 'SCHEDULE_MEETING';
UPDATE action_queue SET "actionType" = 'DELETE_EMAIL' WHERE "actionType" = 'CREATE_TASK' AND ...;

-- Step 3: Remove old values (requires PostgreSQL workaround)
-- PostgreSQL doesn't support DROP VALUE on enums directly.
-- Workaround: create new enum type, migrate column, drop old type.
```

**Important PostgreSQL limitation:** You cannot remove values from a PostgreSQL enum. The standard workaround is:
1. Create a new enum type with only the desired values
2. ALTER the column to use the new type (with a USING clause to cast)
3. Drop the old enum type
4. Rename the new enum type

### New Approval Response Shape

```typescript
// backend/src/modules/ai-chat/dto/hitl.dto.ts
export class ApprovalResponseDto {
  @ApiProperty({ enum: ['executed', 'failed', 'rejected'] })
  outcome: 'executed' | 'failed' | 'rejected';

  @ApiProperty()
  summary: string;

  @ApiProperty()
  executionTimeMs: number;

  @ApiPropertyOptional()
  data?: Record<string, unknown>;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional()
  reason?: string; // rejection reason
}
```

### New Pending Action DTO Shape

```typescript
// Cleaned PendingActionResponse (drops executionId, agentName, adjustedConfidence)
export class PendingActionDto {
  @ApiProperty() id: string;
  @ApiProperty() actionType: string;       // = tool name in UPPER_SNAKE_CASE
  @ApiProperty() toolName: string;         // = original tool name (snake_case)
  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] }) riskLevel: RiskLevel;   // NEW from registry
  @ApiProperty() domain: ToolDomain;       // NEW from registry
  @ApiProperty() summary: string;
  @ApiProperty() payload: Record<string, unknown>;
  @ApiProperty() status: 'PENDING';
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional() expiresAt: Date | null;
  @ApiPropertyOptional() confidence?: number;
  @ApiPropertyOptional() reasoning?: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Controller-hardcoded severity mapping | Registry-based riskLevel lookup | Phase 77 | Eliminates mapSeverity() |
| ActionType as semantic label (SCHEDULE_MEETING) | ActionType = tool name 1:1 | Phase 77 | Eliminates resolveToolName() |
| Controller imports tool services directly | Registry provides both metadata + execution | Phase 77 | Decouples controller from tool services |
| Approve returns { status, approved, executionResult } | Returns { outcome, summary, data } | Phase 77 | Cleaner frontend consumption |

## Open Questions

1. **delete_contact tool implementation**
   - What we know: ActionType enum has DELETE_CONTACT, CONTEXT.md lists it as HIGH-risk, but no tool implementation exists
   - What's unclear: Should Phase 77 implement delete_contact in ContactToolsService, or just register the enum value and defer implementation?
   - Recommendation: Implement it -- it's a simple CRUD tool (call contactsService.delete), and E2E tests require it

2. **Dual tool system unification scope**
   - What we know: Registry tools (domain modules) and chat tools (tool services) are separate systems
   - What's unclear: How far to unify? Full unification means tool services register their AI SDK tools in the registry, which changes createToolSet() significantly
   - Recommendation: Register governance metadata in registry, but keep AI SDK tool() objects in tool services. Controller looks up metadata from registry, execution from tool services. Full unification is Phase 82+ scope.

3. **Productivity + reminder tools governance classification**
   - What we know: CONTEXT.md only classifies the original tools. Productivity tools (star_email, mark_email_read, label_email, etc.) and reminder tools need classification.
   - What's unclear: Exact risk levels for the 8 additional tools
   - Recommendation: All 8 are MEDIUM or LOW (reversible mutations or read-only). Specifically:
     - LOW: list_email_index, list_follow_ups, list_reminders
     - MEDIUM: star_email, mark_email_read, label_email, update_follow_up, create_reminder

4. **Existing tool registration via domain modules**
   - What we know: Some domain modules (email.module, calendar.module, contacts.module, ai.module) already register tools via the Phase 32 registry
   - What's unclear: Whether these registrations should be removed/updated or kept alongside the new governance registration
   - Recommendation: Update these registrations to include governance fields. Keep them as the canonical registration path.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (integration .test.ts) + jest (unit .spec.ts) |
| Config file | backend/vitest.config.ts + backend/jest.config.js |
| Quick run command | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl.test.ts` |
| Full suite command | `cd backend && npx vitest run && npx jest` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AICP-01 | Canonical pending-actions DTO shape | contract (vitest) | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-contract.test.ts` | No -- Wave 0 |
| AICP-02 | Approve/reject returns execution outcome | contract (vitest) | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-contract.test.ts` | No -- Wave 0 |
| AICP-03 | Every mutating tool has governance metadata | unit (jest) | `cd backend && npx jest src/modules/ai-chat/tools/tool-registry-governance.spec.ts` | No -- Wave 0 |
| AICP-04 | ActionType matches tool name 1:1 | unit (jest) | `cd backend && npx jest src/modules/ai-chat/tools/tool-registry-governance.spec.ts` | No -- Wave 0 |
| AICP-12 | Contract tests for DTO + HITL lifecycle | contract (vitest) | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-contract.test.ts` | No -- Wave 0 |
| AICP-14 | HITL E2E flow (trigger, approve, execute, verify) | e2e (vitest) | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-e2e.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-contract.test.ts && npx jest src/modules/ai-chat/tools/tool-registry-governance.spec.ts`
- **Per wave merge:** `cd backend && npx vitest run && npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts` -- covers AICP-01, AICP-02, AICP-12
- [ ] `backend/src/modules/ai-chat/tools/tool-registry-governance.spec.ts` -- covers AICP-03, AICP-04
- [ ] `backend/src/modules/ai-chat/__tests__/hitl-e2e.test.ts` -- covers AICP-14

## Sources

### Primary (HIGH confidence)
- Codebase analysis of `backend/src/modules/ai-chat/controllers/hitl.controller.ts` -- current HITL implementation
- Codebase analysis of `backend/src/modules/ai-chat/services/hitl.service.ts` -- ActionQueue lifecycle
- Codebase analysis of `backend/src/common/interfaces/tool-registry.interface.ts` -- IAiTool, IToolRegistryService
- Codebase analysis of `backend/src/common/modules/tool-registry/tool-registry.service.ts` -- registry implementation
- Codebase analysis of `backend/src/modules/ai-chat/services/ai-chat.service.ts` -- createToolSet, mapToolToActionType
- Codebase analysis of `backend/src/modules/ai-chat/tools/tool-approval-gates.spec.ts` -- current approval tests
- Codebase analysis of `backend/prisma/schema.prisma` -- ActionQueue model, ActionType enum
- Codebase analysis of `frontend/lib/api/ai.ts` -- PendingAction type, aiChatApi methods
- Codebase analysis of `frontend/hooks/ai/use-ai-actions.ts` -- useAiActions hook
- Codebase analysis of `frontend/src/components/chat/HitlApprovalCard.tsx` -- approval UI

### Secondary (MEDIUM confidence)
- AI SDK v6 `tool()` function behavior with `needsApproval` flag -- based on codebase usage patterns
- PostgreSQL enum migration limitations -- based on established PostgreSQL documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in codebase, no new dependencies
- Architecture: HIGH - clear refactoring path from current code to target
- Pitfalls: HIGH - identified from direct code analysis of affected files
- Tool inventory: HIGH - verified via tool-approval-gates.spec.ts + productivity/reminder service inspection
- Prisma migration: MEDIUM - PostgreSQL enum removal requires workaround (CREATE TYPE ... AS ENUM pattern)

**Research date:** 2026-03-18
**Valid until:** 2026-04-17 (30 days -- stable domain, no external dependency changes expected)

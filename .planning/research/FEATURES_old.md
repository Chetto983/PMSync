# Features Research: Code Quality Standards

## Summary

A well-refactored codebase exhibits three characteristics: **elimination of duplication** (DRY), **removal of dead code**, and **file sizes under 500 lines** for cognitive manageability. Table stakes include type safety, consistent naming, and test coverage for refactored code. Differentiators include measurable complexity metrics (cyclomatic < 10), zero ESLint/TypeScript errors, and sub-500-line modules with single responsibilities.

---

## Table Stakes (Must Have)

### 1. Zero Duplicate Code (DRY Principle)

**Criteria:**
- No function appears in more than one file with >80% logic similarity
- Utility functions consolidated in dedicated `utils/` directories
- Shared logic extracted to common modules (`backend/src/common/`)

**PMSync-Specific:**
- Consolidate 3 sanitization functions into `backend/src/modules/ai/voltagent/utils/sanitize.utils.ts`
- Single source of truth for LLM response cleaning patterns

**Measurement:**
- `jscpd` (copy-paste detector) reports 0% duplication in targeted areas
- Code review checklist: "Is this logic already implemented elsewhere?"

---

### 2. No Dead Code

**Criteria:**
- No code marked `@deprecated` without scheduled removal (max 30-day grace period)
- No exported functions with zero callers (verified via static analysis)
- No commented-out code blocks in production files
- No unreachable code after `return`, `throw`, or `process.exit()`

**PMSync-Specific:**
- Remove all `DEPRECATED TOOLS` blocks in `email.tools.ts`, `folder.tools.ts`, etc.
- Delete deprecated `MEDIUM` model mapping in Mistral provider
- Remove `extractPlainText` dead code in `base-email-sync.service.ts` (lines 1314-1346)

**Measurement:**
- TypeScript `--noUnusedLocals --noUnusedParameters` passes
- ESLint `no-unreachable` rule enabled
- Manual grep: `git grep -n "DEPRECATED\|TODO.*remove\|FIXME.*delete"` returns 0 matches

---

### 3. File Size Under 500 Lines (Hard Limit)

**Criteria:**
- No source file exceeds 500 lines of code (excluding comments/imports)
- Complex files split by single-responsibility principle
- Each file has one primary export/class/concern

**PMSync-Specific Violations (from CONCERNS.md):**
| File | Lines | Target |
|------|-------|--------|
| `imap.driver.ts` | 2,249 | Split: `imap-connection.ts`, `imap-folder.ts`, `imap-email.ts` |
| `emails.service.ts` | 1,705 | Split: `email-crud.service.ts`, `email-bulk.service.ts` |
| `folder-sync.service.ts` | 1,629 | Split by provider |
| `microsoft.driver.ts` | 1,429 | Split: `ms-auth.ts`, `ms-folder.ts`, `ms-email.ts` |
| `google.driver.ts` | 1,364 | Split: `gmail-auth.ts`, `gmail-folder.ts`, `gmail-email.ts` |
| `base-email-sync.service.ts` | 1,382 | Extract retry logic, error handling |
| `knowledge-base.service.ts` | 1,371 | Split RAG, embedding, retrieval |

**Measurement:**
```bash
find backend/src -name "*.ts" -exec wc -l {} \; | awk '$1 > 500 {print}'
# Target: 0 files returned
```

---

### 4. Type Safety Enforcement

**Criteria:**
- Zero TypeScript errors in strict mode
- No `any` casts without explicit justification comment
- All function parameters and return types explicitly typed
- Interface-driven contracts between modules

**PMSync-Specific:**
- Run `npm run type-check` as CI gate
- Audit existing `any` usage in AI modules (service wrappers)

**Measurement:**
- `tsc --noEmit` exits with code 0
- ESLint `@typescript-eslint/no-explicit-any` set to `error` (currently `off` in backend)

---

### 5. Consistent Naming Conventions

**Criteria:**
- Files follow pattern: `*.service.ts`, `*.controller.ts`, `*.utils.ts`
- Functions: camelCase
- Classes/Types: PascalCase
- Constants: UPPER_SNAKE_CASE
- Boolean variables: `is*`, `has*`, `can*` prefixes

**PMSync-Specific:**
- Already enforced per CONVENTIONS.md
- Verify new utility files follow naming

**Measurement:**
- ESLint naming convention rules pass
- Code review checklist enforces pattern

---

### 6. Test Coverage for Refactored Code

**Criteria:**
- Every refactored function has at least one unit test
- Edge cases documented in test descriptions
- Integration tests for cross-module refactors
- No refactor merged without corresponding test additions

**PMSync-Specific:**
- Add tests for consolidated `sanitize.utils.ts`
- Test file size: mirrors source file (e.g., `sanitize.utils.spec.ts`)

**Measurement:**
- Jest coverage report shows >80% for touched files
- PR review requires test file changes if source changes

---

## Differentiators (Excellence)

### 1. Cyclomatic Complexity < 10

**Criteria:**
- No function has cyclomatic complexity > 10
- Complex branching extracted to strategy patterns or lookup tables
- Early returns reduce nesting depth

**Tools:**
- ESLint `complexity` rule set to `["error", 10]`
- `ts-complexity` CLI for pre-commit checks

**PMSync Opportunity:**
- IMAP driver has complex state machines - extract to finite state automata
- Folder sync conditional logic - use provider-specific strategy classes

---

### 2. Zero ESLint Warnings

**Criteria:**
- All ESLint warnings resolved or explicitly disabled with explanation
- No `eslint-disable` comments without inline justification
- Consistent formatting (Prettier integrated)

**Measurement:**
- `npm run lint` returns 0 warnings
- CI fails on any new warning

---

### 3. Single Responsibility per Module

**Criteria:**
- Each service has one reason to change
- Dependencies injected, not instantiated internally
- Side effects isolated to edges (controllers, gateways)

**PMSync Excellence Pattern:**
```
email-sync/
├── drivers/
│   ├── imap/
│   │   ├── imap-connection.driver.ts    # Connection lifecycle
│   │   ├── imap-folder.driver.ts        # Folder operations
│   │   └── imap-email.driver.ts         # Email fetch/sync
│   ├── google/
│   │   ├── gmail-auth.driver.ts
│   │   ├── gmail-folder.driver.ts
│   │   └── gmail-email.driver.ts
│   └── microsoft/
│       ├── ms-auth.driver.ts
│       ├── ms-folder.driver.ts
│       └── ms-email.driver.ts
└── services/
    ├── sync-orchestrator.service.ts     # Coordinates drivers
    ├── sync-scheduler.service.ts        # Timing/cron
    └── sync-retry.service.ts            # Error recovery
```

---

### 4. Comprehensive JSDoc on Public APIs

**Criteria:**
- Every exported function/class has JSDoc with description
- Parameters documented with types and semantics
- `@throws` documented for functions that can fail
- `@example` for complex usage patterns

**Measurement:**
- TypeDoc generates complete API documentation
- ESLint `jsdoc/require-jsdoc` on public exports

---

### 5. Atomic Commits with Focused Changes

**Criteria:**
- Each commit does one thing (refactor OR feature OR fix)
- Commit messages explain "why" not "what"
- No "cleanup" commits mixing unrelated changes

**Measurement:**
- Code review: each PR has single logical change
- Git history readable without diffing

---

## Anti-Features (Remove These)

### 1. God Files / Mega Services

**Definition:** Files over 500 lines handling multiple concerns

**PMSync Examples:**
- `emails.service.ts` (1,705 lines) - handles CRUD, bulk ops, cleanup, threading
- `imap.driver.ts` (2,249 lines) - handles auth, folders, emails, attachments

**Removal Strategy:**
- Extract cohesive functionality into focused services
- Use composition over inheritance
- Apply Interface Segregation Principle

---

### 2. Copy-Paste Programming

**Definition:** Nearly identical code in multiple locations

**PMSync Example:**
```typescript
// Three locations with similar regex-based sanitization:
// 1. chat-context-builder.service.ts - sanitizeLlmResponse()
// 2. conversation-management.service.ts - sanitizeMessageContent()
// 3. observability/hooks.ts - stripInternalMarkers()
```

**Removal Strategy:**
- Create `sanitize.utils.ts` with canonical implementation
- Re-export or call from all three locations
- Test once, fix everywhere

---

### 3. Zombie Code (Dead but Undead)

**Definition:** Code marked deprecated but never removed, or commented blocks

**PMSync Examples:**
- `DEPRECATED TOOLS` blocks in 5+ tool files (consolidated but not deleted)
- `MEDIUM` model mapping in Mistral (deprecated comment but still executed)
- `extractPlainText` function never called

**Removal Strategy:**
- Set removal deadline when marking deprecated (max 30 days)
- Add pre-commit hook to fail on `@deprecated` without `@removal-date`
- Weekly dead code audit via `ts-prune`

---

### 4. Implicit Dependencies

**Definition:** Services that reach into globals or instantiate their own dependencies

**Pattern to Remove:**
```typescript
// BAD: Implicit dependency
class EmailService {
  private cache = new CacheService(); // Creates its own
}

// GOOD: Explicit injection
class EmailService {
  constructor(private cache: CacheService) {} // Injected
}
```

**Measurement:**
- NestJS `@Injectable()` decorators on all services
- No `new Service()` calls inside other services

---

### 5. Magic Strings and Numbers

**Definition:** Hardcoded values without named constants

**Pattern to Remove:**
```typescript
// BAD
if (retryCount > 3) { ... }
cache.set(key, value, 300000); // What is 300000?

// GOOD
const MAX_RETRIES = 3;
const CACHE_TTL_5_MIN = 5 * 60 * 1000;
```

**Measurement:**
- ESLint `no-magic-numbers` rule enabled
- Grep for numeric literals in business logic

---

### 6. Inconsistent Error Handling

**Definition:** Mix of thrown errors, returned nulls, and silent failures

**Pattern to Remove:**
```typescript
// BAD: Inconsistent
function getUser(id) {
  if (!id) return null; // Silent failure
  // ...
  throw new Error('User not found'); // Different failure mode
}

// GOOD: Consistent
function getUser(id): User | null {
  if (!id) return null;
  const user = db.find(id);
  return user ?? null; // Always null for "not found"
}
```

---

## Measurable Criteria

### Automated Metrics

| Metric | Tool | Target | Current (Estimate) |
|--------|------|--------|-------------------|
| Duplication | `jscpd` | 0% in refactored areas | ~3% (sanitization) |
| Max file lines | `wc -l` | 500 | 2,249 (imap.driver.ts) |
| Cyclomatic complexity | ESLint | <10 per function | Unknown |
| TypeScript errors | `tsc --noEmit` | 0 | 0 (assumed) |
| ESLint errors | `npm run lint` | 0 | 0 (assumed) |
| Dead exports | `ts-prune` | 0 | Unknown |
| Test coverage (refactored) | Jest | >80% | Variable |

### Manual Review Checklist

Before merging any refactor PR:
- [ ] No new files over 500 lines
- [ ] No duplicate logic introduced
- [ ] All deprecated code has removal date
- [ ] Tests added for changed logic
- [ ] JSDoc on public exports
- [ ] Naming follows conventions
- [ ] No `any` without justification comment

### CI/CD Gates

```yaml
# Suggested CI checks for refactoring milestone
quality-gates:
  - name: "File size check"
    command: "find backend/src -name '*.ts' | xargs wc -l | awk '$1 > 500 {exit 1}'"

  - name: "Duplication check"
    command: "npx jscpd backend/src --threshold 1"

  - name: "Dead code check"
    command: "npx ts-prune backend/src | grep -v '(used in module)' | head -10 && exit 1"

  - name: "Type check"
    command: "npm run type-check"

  - name: "Lint"
    command: "npm run lint"

  - name: "Tests"
    command: "npm run test -- --coverage --coverageThreshold='{\"global\":{\"lines\":80}}'"
```

---

## References

**Industry Standards:**
- Clean Code (Robert C. Martin) - File size, function size, naming
- SOLID Principles - Single Responsibility, Interface Segregation
- DRY Principle - Don't Repeat Yourself

**TypeScript/NestJS Specific:**
- NestJS Best Practices: https://docs.nestjs.com/fundamentals/testing
- TypeScript ESLint: https://typescript-eslint.io/rules/
- Prisma Best Practices: https://www.prisma.io/docs/guides/performance-and-optimization

**Tools:**
- jscpd (copy-paste detector): https://github.com/kucherenko/jscpd
- ts-prune (dead code): https://github.com/nadeesha/ts-prune
- ESLint complexity rule: https://eslint.org/docs/rules/complexity

**PMSync Context:**
- `.planning/codebase/CONCERNS.md` - Identified issues
- `.planning/codebase/CONVENTIONS.md` - Naming patterns
- `.planning/codebase/TESTING.md` - Test patterns
- `CLAUDE.md` - 500-line file limit rule

---

*Research date: 2026-01-31*

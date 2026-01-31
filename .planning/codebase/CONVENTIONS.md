# Coding Conventions

**Analysis Date:** 2026-01-31

## Naming Patterns

**Files:**
- Services: `*.service.ts` (e.g., `cache.service.ts`, `prisma-retry.service.ts`)
- Controllers: `*.controller.ts` (e.g., `emails.controller.ts`)
- Modules: `*.module.ts` (e.g., `app.module.ts`)
- Filters: `*.filter.ts` (e.g., `all-exceptions.filter.ts`)
- Interceptors: `*.interceptor.ts` (e.g., `provider-error.interceptor.ts`)
- Guards: `*.guard.ts` (e.g., `feature-flag.guard.ts`)
- Middleware: `*.middleware.ts` (e.g., `request-id.middleware.ts`)
- DTOs: `*.dto.ts` (e.g., `pagination.dto.ts`)
- Tests: `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`
- React Components: PascalCase with `.tsx` extension (e.g., `AgentProgressIndicator.tsx`)
- React Hooks: `use*.ts` or `use*.tsx` (e.g., `use-ai-actions.test.tsx`)
- Config files: `*.config.ts` (e.g., `ai.config.ts`, `logger.config.ts`)

**Functions:**
- camelCase for all function names
- Async functions use `async` keyword explicitly
- Exported utility functions: `withPrismaRetry`, `withStoreHydration` (prefix pattern for higher-order functions)
- Private methods/functions: camelCase, prefixed with underscore only when true private class members needed
- Callback functions: `on*` pattern for event handlers (e.g., `onAiActionCreated`, `onApprove`)

**Variables:**
- camelCase for all variables and constants
- Constants exported from modules: PascalCase + CONST_CASE when all-caps semantic is needed (rare)
- Enum values: PascalCase for enum names, UPPER_CASE for values (e.g., `CacheNamespace.PROVIDER_TOKEN`)
- Boolean variables: `is*` prefix (e.g., `isConnected`, `isAuthenticated`, `isHydrated`)
- Temporary/ignored variables: prefixed with underscore (e.g., `_unused`, `argsIgnorePattern: '^_'`)

**Types:**
- Interfaces: PascalCase, suffixed with `Type` or `Props` when describing function/component signatures
- Type aliases: PascalCase (e.g., `PrismaRetryableCode`)
- Enum names: PascalCase (e.g., `CacheNamespace`, `ActionType`)
- Enum values: UPPER_SNAKE_CASE (e.g., `PROVIDER_TOKEN`, `USER_SESSION`)
- Generic types: Single letter or descriptive (e.g., `T`, `TData`)
- DTO classes: PascalCase suffixed with `Dto` (e.g., `PaginationDto`)

**API/Query Keys:**
- Hierarchical array format for TanStack Query: `['domain', 'resource', 'id?']`
- Example: `aiActionsKeys.all = ['aiActions']`, `aiActionsKeys.pending() = ['aiActions', 'pending']`
- Cache namespaces: `PREFIX:DATA` format (e.g., `provider:token`, `email:meta`, `user:session`)

## Code Style

**Formatting:**
- 4-space indentation (enforced by default)
- Max line length: flexible (ESLint doesn't enforce)
- No Prettier config found at root (but configs exist in `/backend` and `/frontend`)
- Uses ESLint flat config format (`eslint.config.mjs`, `eslint.config.js`)

**Linting:**

Backend (`backend/eslint.config.js`):
- TypeScript ESLint recommended + type-checked
- Disables strict type safety for common pragmatic patterns:
  - `@typescript-eslint/no-explicit-any`: off
  - `@typescript-eslint/no-unsafe-member-access`: off
  - `@typescript-eslint/no-unsafe-assignment`: off
  - `@typescript-eslint/explicit-function-return-type`: off
  - `@typescript-eslint/require-await`: off
- Unused variable pattern: allows underscore-prefixed variables (`argsIgnorePattern: '^_'`)
- Combined with ESLint Prettier config for formatting

Frontend (`frontend/eslint.config.mjs`):
- Extends Next.js ESLint config + TypeScript recommended (not type-checked)
- Console warnings: `'no-console': 'warn'`
- `@typescript-eslint/no-explicit-any`: warn (not off)
- `@typescript-eslint/no-unused-vars`: warn with underscore pattern
- Stricter than backend

## Import Organization

**Order:**
1. Node.js/external packages (NestJS, React, etc.)
2. Custom application imports with path aliases (`@/...`)
3. Relative imports (`./`, `../`) - rare in this codebase

**Path Aliases:**
- Backend: `@/` → `src/` (configured in backend/tsconfig.json)
- Frontend: `@/` → `.` (root directory, configured in frontend/jest.config.js)

**Example imports:**
```typescript
// NestJS core
import { Module, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Third-party
import { createClient, RedisClientType } from 'redis';
import { renderHook, waitFor } from '@testing-library/react';

// Application imports
import { CacheService } from '@/common/services/cache.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { voltAgentApi } from '@/lib/api/ai';

// Relative (rare)
import { helper } from './helper';
```

## Error Handling

**Patterns:**
- Custom error classes extend base `Error` with additional context
- Error hierarchy: `ProviderError` (base) → `TokenExpiredError`, `InsufficientPermissionsError`, `RateLimitError`
- Errors include `code` (string), `provider` (string), and `originalError` (for wrapping)
- NestJS filters catch exceptions globally (`AllExceptionsFilter`, `HttpExceptionFilter`)
- Async operations use try-catch with proper logging

**Error Handling Strategy:**
```typescript
// Custom error with context
export class ProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public originalError?: any,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// Subclasses for specific cases
export class TokenExpiredError extends ProviderError {
  constructor(provider: string, originalError?: any) {
    super('Access token expired. Please reconnect.', 'TOKEN_EXPIRED', provider, originalError);
    this.name = 'TokenExpiredError';
  }
}

// Usage in interceptors
try {
  // operation
} catch (error) {
  if (error.code === 'P2002') { // Prisma unique constraint
    // retry logic
  }
  this.logger.error('Operation failed:', error);
  throw new ProviderError(message, code, provider, error);
}
```

**Graceful Degradation:**
- Services like `CacheService` don't throw on Redis connection failure - return null/false instead
- Allows app to start without non-critical infrastructure

## Logging

**Framework:** Pino (structured JSON logging via `nestjs-pino`)

**Patterns:**
- Inject `Logger` from `@nestjs/common` in services
- Named loggers by class: `new Logger(ClassName.name)`
- Structured context included automatically
- Log levels: `log()`, `debug()`, `warn()`, `error()`

**Example:**
```typescript
private readonly logger = new Logger(CacheService.name);

// Usage
this.logger.log(`Connected to Redis at ${host}:${port}`);
this.logger.warn('Redis not connected, cache miss');
this.logger.error('Cache operation failed:', error);
this.logger.debug('Graceful degradation enabled');
```

**Audit Logging:** `AuditService` tracks user actions (separate from main logs)

## Comments

**When to Comment:**
- JSDoc/TSDoc for all public APIs (services, public methods, exported functions)
- Inline comments for complex logic or non-obvious decisions
- Reference comments linking to specifications (e.g., `@see EMAIL_CONSOLIDATION_ENTRY.md`)
- Section separators for large files (e.g., `// ==========================================================================`)

**JSDoc/TSDoc Pattern:**
```typescript
/**
 * Brief description of what this does
 *
 * Longer explanation if needed. Can reference external docs.
 *
 * @param param1 - Description of parameter
 * @param param2 - Description of parameter
 * @returns Description of return value
 * @throws Error description if applicable
 * @example
 * ```typescript
 * const result = await service.method(param);
 * ```
 */
export async function myFunction(param1: string, param2: number): Promise<Result> {
  // implementation
}
```

**Class Properties:**
```typescript
export class CacheService {
  /**
   * Redis client instance
   */
  private client: RedisClientType;

  /**
   * Cache statistics
   */
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };
}
```

## Function Design

**Size Guidelines:**
- Keep functions under 200 lines (strict 500-line file limit)
- Aim for focused, single-responsibility functions
- Break complex logic into helper functions

**Parameters:**
- Max 4 positional parameters (use objects for more)
- Use options objects for optional parameters: `{ ttl?: number, namespace?: CacheNamespace }`
- Destructure in function signature when passing multiple options

**Return Values:**
- Explicit return types (auto-inferred is acceptable but documented in JSDoc)
- Return early for error cases
- Use `null` for "not found" (consistent with Query pattern)
- Never return `undefined` for missing cache entries - use `null`

## Module Design

**Exports:**
- Named exports for types, classes, functions
- Default exports avoided (single default rarely appropriate)
- Barrel files (index.ts) export grouped related items

**Example barrel file pattern:**
```typescript
// lib/api/index.ts
export { voltAgentApi } from './ai';
export { crmApi } from './crm';
export { contactsApi } from './contacts';
export type { BriefingResponse, ActionItem } from './types';
```

**Barrel Files:**
- Used extensively in `frontend/lib/`, `frontend/hooks/`
- Simplify imports: `import { useSomeData } from '@/hooks'` instead of `@/hooks/queries/use-some-data`
- Group by functional domain

**Services:**
- Decorated with `@Injectable()` in NestJS backend
- Registered in module providers
- Use constructor injection for dependencies
- Implement lifecycle hooks (`OnModuleInit`, `OnModuleDestroy`) when needed

**Example service pattern:**
```typescript
@Injectable()
export class MyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MyService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  async onModuleInit() {
    // initialization
  }

  async onModuleDestroy() {
    // cleanup
  }

  async method(param: string): Promise<Result> {
    // implementation
  }
}
```

## Special Patterns

**Utility Functions:**
- Standalone functions exported from service files
- Example: `withPrismaRetry<T>(fn: () => Promise<T>, options?: PrismaRetryOptions)`
- Can be used outside NestJS DI context

**Decorators:**
- NestJS decorators: `@Module()`, `@Injectable()`, `@Catch()`, `@Get()`, `@Post()`
- Custom decorators: `@FeatureFlag()` in `common/decorators/`
- React components: None (not using class components with decorators)

**Enums:**
- Used for namespaced constants (e.g., `CacheNamespace`)
- Prevents magic strings throughout codebase
- Values are UPPER_CASE, names are PascalCase

**DTOs:**
- Class-based with `class-validator` decorators
- Used for request/response validation in NestJS
- Methods like `.create()` for factory patterns

```typescript
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  get skip(): number {
    return ((this.page || 1) - 1) * (this.limit || 50);
  }
}
```

---

*Convention analysis: 2026-01-31*

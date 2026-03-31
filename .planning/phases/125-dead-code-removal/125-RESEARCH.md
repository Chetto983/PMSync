# Phase 125: Dead Code Removal - Research

**Researched:** 2026-03-31
**Domain:** Legacy artifact removal (JWT Swagger, deprecated API aliases, Tailwind CSS pipeline)
**Confidence:** HIGH

## Summary

Phase 125 removes three categories of dead code: (1) JWT/Bearer auth artifacts from the Swagger layer and related scripts, (2) deprecated `voltAgentApi`/`multiAgentApi` frontend aliases, and (3) the entire Tailwind CSS build pipeline. The codebase audit reveals clear, mechanically-removable targets with well-defined boundaries.

The critical nuance is distinguishing JWT-related dead code from **legitimate JWT usage** that must be preserved: Google Pub/Sub OIDC verification in `gmail-webhook.service.ts`, Microsoft OAuth token validation in `microsoft-oauth.service.ts`, the sandbox service's compute SDK JWT extraction, and PII detection sentinel's `JWT_TOKEN` type constant. These are production JWT consumers unrelated to the old auth system.

**Primary recommendation:** Treat this as three independent sub-phases executed sequentially: Swagger/Bearer cleanup, alias verification, Tailwind removal. Each can be validated independently. The Tailwind removal is the riskiest due to visual regression potential.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEGC-01 | All JWT-related dead code removed (guard comments, env vars, key gen script, @ApiBearerAuth decorators, addBearerAuth config) | 46 @ApiBearerAuth occurrences across 38 controllers identified; 2 addBearerAuth calls (main.ts:597, generate-openapi.ts:25); 1 key gen script; 3 guard comments; JWT_SECRET in .env; preserve list documented |
| LEGC-02 | Deprecated voltAgentApi/multiAgentApi aliases confirmed fully removed | Grep returns zero matches in frontend/src -- already removed. Verification-only task. |
| LEGC-03 | Tailwind CSS package removed -- @tailwind base converted to plain CSS | tailwindcss 4.2.2, @tailwindcss/postcss 4.2.2, postcss 8.5.8, autoprefixer 10.4.27 identified; globals.css uses @tailwind base + @layer base with CSS custom properties; 3 chat CSS files are pure CSS (no Tailwind); zero Tailwind utility classes in .tsx files |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Post-edit validation MANDATORY: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` after every file edit
- SCOPE CONTROL: Do exactly what was asked. No unrequested features, refactors, or improvements
- FOLLOW EXISTING PATTERNS: Never invent new approaches when codebase patterns exist
- Max 500 lines per file. No exceptions
- Frontend: MUI only, no Tailwind utilities (already enforced -- this phase finalizes that)
- Backend: Multi-tenant rule (not directly relevant but must not break during edits)

## Architecture Patterns

### LEGC-01: JWT/Bearer Dead Code Inventory

**What must be REMOVED:**

| Target | Location | Count | Action |
|--------|----------|-------|--------|
| `@ApiBearerAuth()` decorator | 38 controller files | 46 occurrences | Replace with `@ApiCookieAuth()` |
| `ApiBearerAuth` import | Same 38 controller files | 38 imports | Replace with `ApiCookieAuth` import |
| `.addBearerAuth()` | `backend/src/main.ts:597` | 1 | Replace with `.addCookieAuth()` |
| `.addBearerAuth()` | `backend/scripts/generate-openapi.ts:25` | 1 | Replace with `.addCookieAuth()` |
| JWT key gen script | `backend/scripts/generate-es256-keys.ts` | 1 file | Delete entirely |
| Guard comments referencing JWT | `better-auth.guard.ts:40`, `tenant.guard.ts:18`, `roles.guard.ts:18` | 3 comments | Remove or rewrite to remove JWT reference |
| `JWT_SECRET` env var | `backend/.env:31` | 1 | Remove line |
| JWT comment in `.env.example` | `backend/.env.example:94` | 1 | Verify -- this is about Google Pub/Sub OIDC, KEEP it |

**What must be PRESERVED (not JWT auth dead code):**

| Component | File | Why Preserve |
|-----------|------|-------------|
| Google Pub/Sub OIDC JWT verification | `email-sync/services/gmail-webhook.service.ts` | Production webhook security -- verifies Google-signed JWTs |
| Google Pub/Sub JWT references in webhook controller | `email-sync/controllers/webhook.controller.ts` | Same system -- extracts and validates Pub/Sub bearer tokens |
| Microsoft OAuth JWT validation | `providers/services/microsoft-oauth.service.ts` | Validates MS access tokens, refresh flow |
| Sandbox service JWT extraction | `ai-chat/services/sandbox.service.ts` | Extracts sandbox_id from compute SDK JWT payload |
| PII detection `JWT_TOKEN` type | `ai/guards/pii-detection-sentinel.service.ts` | PII classification enum -- detects JWT tokens in user data |
| Microsoft driver Bearer headers | `email-sync/drivers/microsoft/microsoft.driver.ts` | OAuth access tokens for MS Graph API calls |
| Microsoft webhook Bearer headers | `email-sync/services/microsoft-webhook.service.ts` | OAuth access tokens for MS Graph subscription management |

### LEGC-02: Alias Verification

**Current state:** `voltAgentApi` and `multiAgentApi` return **zero matches** across all frontend source files. This requirement is already satisfied.

**Verification tasks only:**
1. Confirm zero grep hits for `voltAgentApi` in `frontend/src/` and `frontend/lib/`
2. Confirm zero grep hits for `multiAgentApi` in `frontend/src/` and `frontend/lib/`
3. Check documentation files for stale references and update if found

### LEGC-03: Tailwind CSS Removal

**Current Tailwind infrastructure:**

| File | Purpose | Action |
|------|---------|--------|
| `frontend/tailwind.config.ts` | Theme config (76 lines) | Delete -- CSS vars defined in globals.css, not consumed by any utility classes |
| `frontend/postcss.config.js` | PostCSS with @tailwindcss/postcss + autoprefixer | Rewrite -- keep autoprefixer only OR delete if Next.js handles it |
| `frontend/styles/globals.css` | `@config` + `@tailwind base` + `@layer base` with CSS vars | Remove lines 1-3 (the @config and @tailwind directives), keep everything else |
| `frontend/package.json` | `tailwindcss: ^4.1.18`, `@tailwindcss/postcss: ^4.1.18` | Remove both deps |

**What `@tailwind base` provides in Tailwind v4.2.2:**
- Preflight CSS reset (based on modern-normalize)
- Sets `box-sizing: border-box` on all elements
- Removes default margins on body, headings, etc.
- Sets `line-height: 1.5` on body
- Normalizes form element fonts

**Risk:** Removing Preflight changes default element styles. However, since this project uses MUI exclusively (which applies its own CSS baseline via `<CssBaseline />`), Preflight removal should be safe IF `<CssBaseline />` is present.

**Verification needed at plan time:**

| Check | Why |
|-------|-----|
| `<CssBaseline />` in `_app.tsx` or theme provider | MUI's own CSS reset replaces Preflight |
| `border-color` rule in `@layer base` block | Currently sets `border-color: hsl(var(--border))` on `*` -- must remain |
| Chat CSS files (`chat-layout.css`, `chat-sidebar.css`, `chat-thread.css`) | Pure CSS with custom properties, no Tailwind. Unaffected. |
| `@layer base` CSS block | Native CSS `@layer` -- works without Tailwind |

**PostCSS decision:** After removing `@tailwindcss/postcss`, the `postcss.config.js` can either:
- Keep `autoprefixer` only (if any CSS needs vendor prefixes)
- Be deleted entirely (Next.js 16 has built-in PostCSS support, but custom config overrides it)

Recommendation: Keep `postcss.config.js` with `autoprefixer` only. Autoprefixer still adds value for older browser support.

**NPM packages to remove:**
```bash
cd frontend && npm uninstall tailwindcss @tailwindcss/postcss
```

**Packages to KEEP:**
- `postcss` -- used by autoprefixer and Next.js
- `autoprefixer` -- still needed for vendor prefixes

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS reset after Tailwind removal | Custom normalize.css | MUI `<CssBaseline />` | Already included in MUI, covers all Preflight functionality |
| Cookie auth Swagger docs | Custom security scheme | `@ApiCookieAuth()` + `.addCookieAuth()` from `@nestjs/swagger` | Built-in, verified available in v11.2.6 |
| Visual regression testing | Manual eyeball checks | Build + dev server check of key pages | Automated visual regression is overkill for this removal |

## Common Pitfalls

### Pitfall 1: Removing JWT code that isn't dead
**What goes wrong:** Removing Google Pub/Sub OIDC verification or Microsoft OAuth token validation breaks production webhooks and email sync.
**Why it happens:** Searching for "JWT" or "Bearer" catches both dead auth code AND legitimate OAuth/OIDC usage.
**How to avoid:** The preserve list above is exhaustive. Only remove `@ApiBearerAuth` decorator usage and `addBearerAuth` Swagger config. Never touch files in the preserve list.
**Warning signs:** Any change to `email-sync/`, `providers/`, `ai-chat/services/sandbox.service.ts`, or `ai/guards/pii-detection-sentinel.service.ts`.

### Pitfall 2: Breaking CSS after Tailwind removal
**What goes wrong:** Elements lose their reset styles (margins appear on headings, box-sizing reverts to content-box).
**Why it happens:** `@tailwind base` injected Preflight (CSS reset). Without it, browser defaults apply.
**How to avoid:** Verify MUI `<CssBaseline />` is in the component tree. It provides equivalent normalization.
**Warning signs:** Layout shifts, unexpected margins, form elements looking different after the change.

### Pitfall 3: postcss.config.js deletion breaking Next.js CSS
**What goes wrong:** Next.js CSS processing changes behavior when postcss.config.js is removed vs modified.
**Why it happens:** Next.js detects postcss.config.js and uses it. Removing it makes Next.js use its own default (which includes autoprefixer). Keeping a broken one causes build failures.
**How to avoid:** Either delete entirely OR update to autoprefixer-only. Don't leave a config referencing @tailwindcss/postcss after uninstalling the package.

### Pitfall 4: Forgetting generate-openapi.ts
**What goes wrong:** The OpenAPI generation script still produces Bearer auth in the spec.
**Why it happens:** `scripts/generate-openapi.ts` has its own DocumentBuilder with `.addBearerAuth()`, separate from `main.ts`.
**How to avoid:** Update both `main.ts` AND `generate-openapi.ts`.

### Pitfall 5: Stale JWT_SECRET in .env files
**What goes wrong:** `JWT_SECRET` remains in `.env` files even though nothing reads it.
**Why it happens:** `.env` cleanup is easy to forget when focus is on source code.
**How to avoid:** Remove `JWT_SECRET` from `.env`. Check `.env.production` and `.env.railway.template` too. Do NOT remove `GOOGLE_PUBSUB_AUDIENCE` -- that's the Pub/Sub OIDC config, which is legitimate.

## Code Examples

### Replacing @ApiBearerAuth with @ApiCookieAuth (per controller)

```typescript
// BEFORE
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
export class UsersController { ... }

// AFTER
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';

@ApiCookieAuth()
@ApiTags('users')
@Controller('users')
export class UsersController { ... }
```

### Replacing addBearerAuth in DocumentBuilder

```typescript
// BEFORE (main.ts + generate-openapi.ts)
const swaggerConfig = new DocumentBuilder()
  .setTitle('PMSync API')
  .setDescription('AI-powered multi-tenant email assistant API')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

// AFTER
const swaggerConfig = new DocumentBuilder()
  .setTitle('PMSync API')
  .setDescription('AI-powered multi-tenant email assistant API')
  .setVersion('1.0')
  .addCookieAuth('pmsync.session_token')
  .build();
```

### globals.css after Tailwind removal

```css
/* BEFORE (lines 1-4) */
/* stylelint-disable at-rule-no-unknown */
@config '../tailwind.config.ts';
@tailwind base;
/* stylelint-enable at-rule-no-unknown */

/* AFTER -- remove all 4 lines above, keep everything below unchanged */
@layer base {
  :root {
    --background: 0 0% 100%;
    /* ... all CSS vars remain identical ... */
  }
}
```

### postcss.config.js after Tailwind removal

```javascript
// AFTER
module.exports = {
  plugins: {
    autoprefixer: {},
  },
};
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 (backend + frontend) + Vitest 4.0.18 (backend) |
| Config file | `backend/jest.config.ts`, `frontend/jest.config.ts` |
| Quick run command | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` |
| Full suite command | `cd backend && npm test && cd ../frontend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEGC-01 | No @ApiBearerAuth in codebase, Swagger shows cookie auth | grep + type-check | `grep -r "ApiBearerAuth" backend/src && cd backend && npx tsc --noEmit` | N/A (grep validation) |
| LEGC-02 | No voltAgentApi/multiAgentApi aliases | grep | `grep -r "voltAgentApi\|multiAgentApi" frontend/src` | N/A (grep validation) |
| LEGC-03 | No tailwindcss in deps, frontend builds clean | build + type-check | `cd frontend && npx tsc --noEmit && npm run build` | N/A (build validation) |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` in affected workspace
- **Per wave merge:** Full type-check both workspaces + frontend build
- **Phase gate:** `grep` absence checks + full build green

### Wave 0 Gaps
None -- this phase requires grep validation and type-checks, not new test files.

## Quantified Scope

| Category | Count |
|----------|-------|
| Controllers needing @ApiBearerAuth -> @ApiCookieAuth | 38 files, 46 decorator instances |
| Import lines to update | 38 |
| addBearerAuth -> addCookieAuth | 2 (main.ts + generate-openapi.ts) |
| Files to delete | 2 (generate-es256-keys.ts, tailwind.config.ts) |
| Guard comments to clean | 3 |
| NPM packages to remove | 2 (tailwindcss, @tailwindcss/postcss) |
| CSS files to edit | 1 (globals.css -- remove 4 lines) |
| Config files to edit | 1 (postcss.config.js) |
| Env files to clean | 1 (.env -- remove JWT_SECRET line) |
| Frontend API aliases to verify | 2 (already gone, verification only) |

## Open Questions

1. **`<CssBaseline />` location**
   - What we know: MUI is the UI framework and CssBaseline is standard MUI practice
   - What's unclear: Whether it's in `_app.tsx` or a theme wrapper
   - Recommendation: Verify during task execution. If missing, this phase should NOT add it (scope control). Flag as a concern.

2. **Cookie name for addCookieAuth**
   - What we know: better-auth sets a session cookie. The exact cookie name may be `better-auth.session_token` or `pmsync.session_token`
   - What's unclear: The exact cookie name used by better-auth in this project
   - Recommendation: Check better-auth config during execution to use the correct cookie name in `.addCookieAuth()`

## Sources

### Primary (HIGH confidence)
- Codebase grep audit -- all file counts and locations verified against actual source
- `@nestjs/swagger` 11.2.6 -- `ApiCookieAuth` and `addCookieAuth` verified available via runtime check
- Tailwind CSS 4.2.2 installed -- `@tailwind base` behavior confirmed as Preflight injection

### Secondary (MEDIUM confidence)
- Tailwind v4 Preflight behavior -- based on Tailwind docs + training data. Preflight = modern-normalize + box-sizing + margin reset

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, only removal and built-in replacements
- Architecture: HIGH -- mechanical find-and-replace with clear preserve boundaries
- Pitfalls: HIGH -- preserve list verified against actual codebase grep results

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable -- removal work, no external dependency changes expected)

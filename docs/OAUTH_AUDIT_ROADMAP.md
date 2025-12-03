# OAuth Authentication Audit & Roadmap

Scope: `backend/src/modules/providers/` (OAuth services, controllers, DTOs) and related authentication flows. Goal: Implement OAuth 2.0 best practices for Google and Microsoft authentication with proper security controls.

## Current Implementation Summary

### Architecture
- **Google OAuth**: Uses `google-auth-library` and `googleapis`
- **Microsoft OAuth**: Uses `@azure/msal-node` (ConfidentialClientApplication)
- **Token Storage**: Encrypted with AES via CryptoService, stored in PostgreSQL
- **Flow**: Authorization Code Grant with offline access for refresh tokens

### Files Audited
- `services/google-oauth.service.ts` - Google OAuth2 implementation
- `services/microsoft-oauth.service.ts` - Microsoft OAuth2 with MSAL
- `services/provider-config.service.ts` - Token persistence and provider management
- `controllers/oauth-callback.controller.ts` - OAuth callback handling
- `controllers/providers.controller.ts` - Provider API endpoints

---

## Critical Issues Found

### 1. CSRF State Validation Missing
**Severity: HIGH**
**Files:** `oauth-callback.controller.ts:39-66, 73-102`

**Problem:** State parameter is generated server-side but NEVER validated on callback. The state is passed directly to frontend without verification.

```typescript
// Current: State just passed through
return res.redirect(
  `${frontendUrl}/auth/oauth-callback?code=...&state=${encodeURIComponent(state || '')}&provider=google`,
);
```

**Risk:** CSRF attacks can trick users into connecting attacker-controlled accounts.

**Fix:**
- Store state in Redis/session with short TTL (5 min)
- Validate state on callback before redirecting
- Return 400 if state missing or invalid

### 2. Microsoft State Generation Weak
**Severity: HIGH**
**File:** `microsoft-oauth.service.ts:413-416`

**Problem:** Uses `Math.random()` which is NOT cryptographically secure.

```typescript
// Current: Weak random
private generateRandomState(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}
```

**Fix:** Use `crypto.randomBytes(16).toString('hex')` like Google does.

### 3. No PKCE Implementation
**Severity: MEDIUM**
**Files:** `google-oauth.service.ts`, `microsoft-oauth.service.ts`

**Problem:** Neither Google nor Microsoft OAuth uses PKCE (Proof Key for Code Exchange), which is now recommended for ALL clients (not just public clients).

**Best Practice (from [Google](https://developers.google.com/identity/protocols/oauth2/native-app)):**
> PKCE is strongly recommended for installed applications.

**Best Practice (from [Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)):**
> Use the auth code flow paired with PKCE and OpenID Connect to get tokens.

**Fix:**
- Generate `code_verifier` (43-128 chars, URL-safe random)
- Create `code_challenge` = base64url(sha256(code_verifier))
- Include `code_challenge` and `code_challenge_method=S256` in auth URL
- Send `code_verifier` in token exchange

### 4. Overly Broad Google Scopes
**Severity: MEDIUM**
**File:** `google-oauth.service.ts:28-36`

**Problem:** Requesting `https://mail.google.com/` (full access) when `gmail.modify` might suffice.

```typescript
const defaultScopes = [
  'https://mail.google.com/', // Full access - too broad
  'https://www.googleapis.com/auth/gmail.modify',
  // ...
];
```

**Best Practice (from [Google](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)):**
> Use incremental authorization to request appropriate OAuth scopes when the functionality is needed.

**Fix:** Use minimum required scopes. If full access isn't needed, remove `https://mail.google.com/`.

### 5. Token Refresh Rotation Not Verified
**Severity: MEDIUM**
**Files:** `google-oauth.service.ts:117-144`, `microsoft-oauth.service.ts:178-212`

**Problem:**
- Google: Refresh token returned from Google may be rotated, but code doesn't save new refresh token
- Microsoft: Handles rotation but doesn't always persist it

**Best Practice (from [Google](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)):**
> Save refresh tokens in secure long-term storage. If Refresh Token Rotation is enabled, a new Refresh Token is generated with each request.

**Fix:** Always check for and persist new refresh tokens after refresh operations.

### 6. No Token Revocation Handling
**Severity: MEDIUM**
**Files:** Both OAuth services

**Problem:** No handling for:
- User revokes access from Google/Microsoft account settings
- User changes password (invalidates tokens)
- Admin revokes access

**Best Practice (from [Google](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)):**
> Integrate with Cross-Account Protection service to be notified of token revocation.

**Fix:**
- Handle 401/403 errors during API calls as potential revocation
- Mark provider as "needs_reauth" instead of silently failing
- Implement Cross-Account Protection for Google
- Implement Microsoft webhook for security events

### 7. Sensitive Token Logging
**Severity: LOW**
**Files:** Both OAuth services

**Problem:** Token lengths and prefixes are logged, which could be useful for attackers.

```typescript
this.logger.log(`Access token is valid JWT (${response.accessToken.length} chars)`);
this.logger.debug(`Token length: ${token.length}, starts with: ${token.substring(0, 50)}...`);
```

**Fix:** Remove token-related logging in production, or only log in development mode.

### 8. Open Redirect Potential
**Severity: LOW**
**File:** `oauth-callback.controller.ts:16-31`

**Problem:** Frontend URL is dynamically determined with fallback logic.

```typescript
private getFrontendUrl(): string {
  const envFrontend = process.env.FRONTEND_URL;
  // ... fallback logic
}
```

**Fix:**
- Strictly whitelist allowed redirect URLs
- Validate against whitelist before redirecting

---

## Phase 1 - Critical Security Fixes (Week 1)

### 1.1 Implement CSRF State Validation
- [ ] Create `OAuthStateService` to manage state tokens
- [ ] Store state in Redis with 5-minute TTL
- [ ] Include metadata: `{ userId, tenantId, provider, createdAt }`
- [ ] Validate state on callback before redirecting
- [ ] Return 400 Bad Request if state invalid/expired
- [ ] Add tests for state validation

### 1.2 Fix Microsoft State Generation
- [ ] Replace `Math.random()` with `crypto.randomBytes(16).toString('hex')`
- [ ] Add test for state entropy

### 1.3 Add PKCE Support
- [ ] Create PKCE utility functions (verifier generation, challenge creation)
- [ ] Store `code_verifier` alongside state in Redis
- [ ] Add `code_challenge` to Google auth URL
- [ ] Add `code_challenge` to Microsoft auth URL
- [ ] Pass `code_verifier` in token exchange
- [ ] Add tests for PKCE flow

## Phase 2 - Token Security Hardening (Week 2)

### 2.1 Refresh Token Rotation Persistence
- [ ] Google: Check for new refresh token in refresh response
- [ ] Update database with new refresh token when rotated
- [ ] Add logging for token rotation events

### 2.2 Token Revocation Handling
- [ ] Handle 401/invalid_grant errors as revocation signals
- [ ] Add `needsReauth` flag to ProviderConfig
- [ ] Emit realtime event when provider needs reauth
- [ ] Frontend: Show "Reconnect" button for revoked providers
- [ ] Add test for revocation handling

### 2.3 Reduce Token Logging
- [ ] Remove token length/content logging
- [ ] Only log token operations in debug mode
- [ ] Audit all log statements for sensitive data

## Phase 3 - Scope Optimization (Week 3)

### 3.1 Review and Minimize Scopes
- [ ] Audit actual API usage for each feature
- [ ] Create scope profiles: minimal, standard, full
- [ ] Implement incremental authorization for optional features
- [ ] Document required scopes per feature

### 3.2 Implement Scope-Based Feature Gating
- [ ] Store granted scopes in ProviderConfig
- [ ] Check scopes before making API calls
- [ ] Gracefully degrade if scope missing
- [ ] Prompt for additional consent when needed

## Phase 4 - Advanced Security (Week 4)

### 4.1 Cross-Account Protection (Google)
- [ ] Register for Google Cross-Account Protection
- [ ] Implement webhook for security events
- [ ] Handle RISC events (token revocation, account disabled)

### 4.2 Microsoft Security Events
- [ ] Implement Microsoft Graph change notifications
- [ ] Handle security-related events
- [ ] Auto-invalidate tokens on security events

### 4.3 Rate Limiting
- [ ] Add rate limiting on OAuth endpoints
- [ ] Track failed token refresh attempts
- [ ] Implement exponential backoff

## Phase 5 - Monitoring & DX (Week 5)

### 5.1 OAuth Metrics
- [ ] Track token refresh success/failure rates
- [ ] Monitor token expiration distribution
- [ ] Alert on elevated revocation rates

### 5.2 Error Handling Improvements
- [ ] Standardize OAuth error responses
- [ ] Provide actionable error messages
- [ ] Add troubleshooting guide for common errors

### 5.3 Documentation
- [ ] Document OAuth flow for developers
- [ ] Create runbook for token rotation incidents
- [ ] Document scope requirements per feature

---

## Implementation Priority

| Issue | Severity | Effort | Priority |
|-------|----------|--------|----------|
| CSRF State Validation | HIGH | Medium | P0 |
| Microsoft State Generation | HIGH | Low | P0 |
| PKCE Implementation | MEDIUM | Medium | P1 |
| Token Revocation Handling | MEDIUM | Medium | P1 |
| Refresh Token Rotation | MEDIUM | Low | P1 |
| Scope Optimization | MEDIUM | High | P2 |
| Token Logging Reduction | LOW | Low | P2 |
| Open Redirect Fix | LOW | Low | P2 |

---

## Sources

- [Google OAuth Best Practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Google OAuth 2.0 Overview](https://developers.google.com/identity/protocols/oauth2)
- [Google PKCE for Native Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Microsoft OAuth 2.0 Authorization Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft Refresh Tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)
- [Microsoft Graph Auth](https://learn.microsoft.com/en-us/graph/auth-v2-user)
- [Auth0 PKCE Guide](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce)
- [OAuth 2.0 Security Best Practices (Medium)](https://medium.com/@basakerdogan/oauth-2-0-security-best-practices-from-authorization-code-to-pkce-beccdbe7ec35)

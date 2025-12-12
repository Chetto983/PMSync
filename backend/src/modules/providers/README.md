# Providers Module Documentation

## Overview

The **Providers Module** handles OAuth2 authentication and token management for external service providers:
- **Google** - Gmail, Calendar, Contacts via Google APIs
- **Microsoft** - Outlook Mail, Calendar, Contacts via Microsoft Graph API
- **IMAP/Generic** - Standard IMAP/SMTP email providers

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ProvidersModule                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ GoogleOAuthSvc  │  │MicrosoftOAuthSvc│  │   ImapService   │  │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤  │
│  │ generateAuthUrl │  │ generateAuthUrl │  │ testConnection  │  │
│  │ exchangeCode    │  │ exchangeCode    │  │ validateConfig  │  │
│  │ refreshToken    │  │ refreshToken    │  └─────────────────┘  │
│  │ testGmail*      │  │ testMail*       │                       │
│  │ testCalendar*   │  │ testCalendar*   │                       │
│  │ testContacts    │  │ testContacts    │                       │
│  └─────────────────┘  └─────────────────┘                       │
│           │                    │                                 │
│           ▼                    ▼                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  ProviderTokenService                      │  │
│  │  (Centralized token management with Redis locking)         │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ getProviderWithToken(providerId) → {provider, accessToken} │  │
│  │ - Automatic token refresh with distributed locking         │  │
│  │ - Prevents race conditions in multi-instance deployments   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Email Driver Architecture                      │
│  (Uses EmailDriverFactory from email-sync module)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  GoogleDriver   │  │ MicrosoftDriver │  │   IMAPDriver    │  │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤  │
│  │ listMessages    │  │ listMessages    │  │ listMessages    │  │
│  │ sendMessage     │  │ sendMessage     │  │ sendMessage     │  │
│  │ syncFolders     │  │ syncFolders     │  │ syncFolders     │  │
│  │ getAttachment   │  │ getAttachment   │  │ getAttachment   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Calendar & Contacts Provider Factories              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CalendarProviderFactory (in calendar module)                    │
│  ├── GoogleCalendarProvider                                      │
│  └── MicrosoftCalendarProvider                                   │
│                                                                  │
│  ContactsProviderFactory (in contacts module)                    │
│  ├── GoogleContactsProvider                                      │
│  └── MicrosoftContactsProvider                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Services

### GoogleOAuthService

Handles Google OAuth2 flow with PKCE support:

```typescript
// Generate OAuth URL with PKCE
const { authUrl, state } = googleOAuthService.generateAuthUrl(scopes, pkceOptions);

// Exchange authorization code for tokens
const tokens = await googleOAuthService.exchangeCodeForTokens(code, codeVerifier);

// Refresh expired token
const refreshed = await googleOAuthService.refreshAccessToken(refreshToken);
```

### MicrosoftOAuthService

Handles Microsoft OAuth2 flow via MSAL:

```typescript
// Generate OAuth URL with PKCE
const { authUrl, state } = microsoftOAuthService.generateAuthUrl(scopes, pkceOptions);

// Exchange authorization code for tokens
const tokens = await microsoftOAuthService.exchangeCodeForTokens(code, codeVerifier);

// Get valid token (auto-refreshes if needed)
const accessToken = await microsoftOAuthService.getTokenOrRefresh(provider);
```

### ProviderTokenService

Centralized token management with distributed locking (in email-sync module):

```typescript
// Get provider with fresh access token
const { provider, accessToken } = await providerTokenService.getProviderWithToken(providerId);

// Features:
// - Automatic token refresh when expired
// - Redis-based distributed locking (prevents race conditions)
// - Works with Google, Microsoft, and IMAP providers
```

## OAuth Scopes

### Google Scopes
```
https://www.googleapis.com/auth/userinfo.email
https://mail.google.com/
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/contacts
```

### Microsoft Scopes
```
openid
profile
email
offline_access
https://graph.microsoft.com/Mail.ReadWrite
https://graph.microsoft.com/Mail.Send
https://graph.microsoft.com/Calendars.ReadWrite
https://graph.microsoft.com/Contacts.ReadWrite
```

## Module Structure

```
src/modules/providers/
├── README.md                           # This file
├── providers.module.ts                 # Module definition
├── controllers/
│   ├── providers.controller.ts         # OAuth flow endpoints
│   └── oauth-callback.controller.ts    # OAuth callback handler
├── services/
│   ├── google-oauth.service.ts         # Google OAuth2 + API testing
│   ├── microsoft-oauth.service.ts      # Microsoft OAuth2 + API testing
│   ├── imap.service.ts                 # IMAP/SMTP connection testing
│   ├── oauth-state.service.ts          # PKCE state management
│   ├── caldav.service.ts               # CalDAV protocol support
│   └── provider-config.service.ts      # Provider configuration CRUD
├── interfaces/
│   ├── calendar-provider.interface.ts  # ICalendarProvider interface
│   └── contacts-provider.interface.ts  # IContactsProvider interface
└── dto/
    ├── google-provider.dto.ts          # Google connection DTOs
    ├── microsoft-provider.dto.ts       # Microsoft connection DTOs
    ├── generic-provider.dto.ts         # IMAP/generic DTOs
    └── provider-response.dto.ts        # Response DTOs
```

## Provider Configuration

Stored in `ProviderConfig` entity (Prisma):

```typescript
interface ProviderConfig {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  providerType: 'google' | 'microsoft' | 'imap' | 'generic';

  // OAuth tokens (encrypted with AES)
  accessToken?: string;
  tokenEncryptionIv?: string;
  refreshToken?: string;
  refreshTokenEncryptionIv?: string;
  tokenExpiresAt?: Date;

  // IMAP/SMTP settings (for generic providers)
  imapHost?: string;
  imapPort?: number;
  imapUseTls?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUseTls?: boolean;

  // Feature flags
  supportsEmail: boolean;
  supportsCalendar: boolean;
  supportsContacts: boolean;
  isActive: boolean;
}
```

## Error Handling

All OAuth services throw typed errors:

```typescript
try {
  const tokens = await googleOAuthService.exchangeCodeForTokens(code);
} catch (error) {
  if (error instanceof UnauthorizedException) {
    // Invalid code or token revoked
    // Action: Prompt user to reconnect
  } else if (error instanceof ForbiddenException) {
    // Insufficient permissions
    // Action: Prompt user to grant required scopes
  }
}
```

### Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `UnauthorizedException` | Token expired/revoked | Trigger re-authentication flow |
| `ForbiddenException` | Missing scopes | Request additional permissions |
| `Rate limit exceeded` | API quota hit | Implement exponential backoff |

## Token Security

- **Encryption**: All tokens encrypted with AES-256-CBC before storage
- **PKCE**: OAuth flows use Proof Key for Code Exchange
- **Distributed Locking**: Redis-based locks prevent concurrent token refresh
- **Auto-Refresh**: Tokens refreshed proactively before expiration

## Testing

```bash
# Run provider service tests
npx jest src/modules/providers

# Test specific service
npx jest src/modules/providers/services/provider-config.service.spec.ts
```

## Related Modules

- **email-sync**: Email synchronization using `EmailDriverFactory`
- **calendar**: Calendar sync using `CalendarProviderFactory`
- **contacts**: Contact sync using `ContactsProviderFactory`

---

**Last Updated**: 2025-12-12
**Version**: 1.0.0 (Post-Driver Migration)

# MFA Enhancement Roadmap

> **Status**: Complete (All 8 Phases implemented)
> **Created**: 2025-12-04
> **Updated**: 2025-12-05
> **Priority**: High
> **Library**: [morka17/MFA](https://github.com/morka17/MFA), [@simplewebauthn](https://simplewebauthn.dev/)

---

## Quick TODO Summary

### Phase 1: TOTP (Authenticator Apps) ✅ COMPLETE

- [x] Clone morka17/MFA and extract authenticator patterns
- [x] Install dependencies (otplib, qrcode)
- [x] Create `totp.service.ts` with QR code generation
- [x] Add `MfaSecret` Prisma model
- [x] Write unit tests (11 tests passing)

### Phase 2: Backup Codes ✅ COMPLETE

- [x] Create `backup-codes.service.ts`
- [x] Add `MfaBackupCode` Prisma model
- [x] Implement 10 hashed recovery codes
- [x] Write unit tests (10 tests passing)

### Phase 3: Trusted Devices ✅ COMPLETE

- [x] Create `trusted-device.service.ts`
- [x] Add `TrustedDevice` Prisma model
- [x] Implement 30-day "Keep me signed in"
- [x] Write unit tests (18 tests passing)

### Phase 4-5: Integration & API ✅ COMPLETE

- [x] Update auth flow with MFA checks
- [x] Create `mfa.controller.ts` endpoints (12 endpoints)
- [x] Add MFA challenge endpoint `/auth/mfa/verify`
- [x] Add trusted device verification during login
- [x] Add Swagger documentation
- [x] Write controller tests (19 tests passing)

### Phase 6: Frontend ✅ COMPLETE

- [x] Add i18n translations (EN/IT)
- [x] Create MFA setup wizard components
- [x] Add trusted devices management UI
- [x] Create Security section in Settings page
- [x] Create MFA API client (`lib/api/mfa.ts`)

**Known Issues / Future Improvements:** _All addressed_

- `Settings.tsx` reviewed: copy centralized, responsive mobile navigation added, and strings routed through translation fallbacks. **Closed**
- Mobile view responsiveness improved for settings navigation/content. **Closed**
- Began splitting/structuring `Settings.tsx` by extracting copy helpers and mobile nav; further modularization optional. **Closed**
- Security E2E suites re-enabled with deterministic tenant/user setup and MFA bypass for tests. **Closed**

### Phase 7: Testing (Complete)

- [x] Unit tests (58 tests passing)
  - TOTP service: 11 tests
  - Backup codes service: 10 tests
  - Trusted device service: 18 tests
  - MFA controller: 19 tests
- [x] Auth test harness fixed (Totp/Backup/Trusted providers wired; auth service/controller specs green)
- [x] E2E tests re-enabled and passing
  - `authentication.e2e.spec.ts`
  - `tenant-isolation.e2e.spec.ts`
- [x] Security audit (baseline review completed; no blocking issues)

### Phase 8: WebAuthn/Biometric ✅ COMPLETE

- [x] Install `@simplewebauthn/server` v10+ and `@simplewebauthn/browser` v10+
- [x] Add `WebAuthnCredential` Prisma model with full schema
- [x] Create `webauthn.service.ts` for Face ID/Touch ID/Windows Hello
- [x] Add frontend passkey setup components (PasskeyCard.tsx)
- [x] Add passkey login button on login page
- [x] Create public endpoints for passwordless login flow
- [x] Add i18n translations (EN/IT) for passkeys
- [x] Tested with Windows Hello on localhost

---

## Overview

Enhance the existing OTP-based MFA system using the **morka17/MFA** library, which provides a comprehensive TypeScript implementation of Multi-Factor Authentication including TOTP, QR codes, backup codes, and trusted devices.

---

## Current State Analysis

### Existing Implementation
- **Location**: `src/modules/auth/services/otp-security.service.ts`
- **Features**:
  - Email OTP (6-digit codes)
  - HMAC-SHA256 hashed storage
  - Rate limiting (in-memory)
  - Lockout after N failed attempts
  - OWASP/NIST compliant

### Missing Features (To Add via morka17/MFA)
- TOTP (Time-based One-Time Password) for authenticator apps
- QR code generation for TOTP setup
- Backup/recovery codes
- Trusted device tokens ("Keep me signed in")
- WebAuthn/FIDO2 (future phase)

---

## Library: morka17/MFA

### Features We'll Use
| Feature | Priority | Notes |
|---------|----------|-------|
| **Authenticator Apps (TOTP)** | High | Google Authenticator, Authy, Microsoft Authenticator |
| **QR Code Generation** | High | For TOTP setup |
| **Backup Codes** | High | Emergency access |
| **Email OTP** | Exists | Keep current implementation |
| ~~SMS OTP~~ | Skip | Not needed |
| **WebAuthn/FIDO2** | Medium | Face ID, Touch ID, Windows Hello, YubiKey |

### Installation
```bash
# Clone and integrate relevant modules from morka17/MFA
git clone https://github.com/morka17/MFA.git temp-mfa
# Extract: authenticator, backup codes, and related services
```

### Key Dependencies (from morka17/MFA)
- Prisma ORM (already using)
- TypeScript (already using)
- Redis for rate limiting (optional, can use existing in-memory)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MFA ENHANCEMENT ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │   MFA Methods    │    │   User Actions   │    │    Storage       │      │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤      │
│  │ ✅ Email OTP     │    │ Setup TOTP       │    │ MfaSecret table  │      │
│  │ ✅ SMS OTP       │    │ Verify Code      │    │ BackupCode table │      │
│  │ 🆕 TOTP (App)    │    │ Generate Backup  │    │ TrustedDevice    │      │
│  │ 🆕 Backup Codes  │    │ Trust Device     │    │ table            │      │
│  │ 🆕 Trusted Device│    │ Revoke Device    │    │                  │      │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         TOTP Setup Flow                              │   │
│  │                                                                      │   │
│  │  1. User enables TOTP → Generate secret (Base32)                    │   │
│  │  2. Generate otpauth:// URI → Create QR code                        │   │
│  │  3. User scans QR → App generates codes                             │   │
│  │  4. User enters code → Verify & activate TOTP                       │   │
│  │  5. Generate backup codes → Store hashed                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Trusted Device Flow                             │   │
│  │                                                                      │   │
│  │  1. User logs in + MFA → Check "Keep me signed in"                  │   │
│  │  2. Generate device token (UUID + fingerprint hash)                 │   │
│  │  3. Store token with 30-day expiry                                  │   │
│  │  4. Next login → Check device token → Skip MFA if valid             │   │
│  │  5. User can revoke devices from settings                           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

```prisma
// Add to schema.prisma

/// TOTP secrets for authenticator apps
model MfaSecret {
  id          String   @id @default(uuid())
  userId      String   @unique
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // TOTP secret (encrypted)
  secret      String   // Encrypted Base32 secret
  encryptionIv String  // IV for decryption

  // Status
  isEnabled   Boolean  @default(false) // Only true after first successful verification
  verifiedAt  DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
}

/// Backup/recovery codes for MFA
model MfaBackupCode {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Code storage (hashed)
  codeHash    String   // HMAC-SHA256 hash of the code

  // Status
  isUsed      Boolean  @default(false)
  usedAt      DateTime?

  createdAt   DateTime @default(now())

  @@index([userId, isUsed])
}

/// Trusted devices for "Keep me signed in"
model TrustedDevice {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Device identification
  deviceToken String   @unique // UUID token stored in cookie
  deviceName  String?  // "Chrome on Windows", "Safari on iPhone"
  deviceHash  String   // Hash of user-agent + IP for validation

  // Location info (optional)
  ipAddress   String?
  location    String?  // "Rome, Italy"

  // Expiration
  expiresAt   DateTime // 30 days from creation
  lastUsedAt  DateTime @default(now())

  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([deviceToken])
  @@index([expiresAt])
}
```

---

## Implementation Phases

### Phase 1: Integrate morka17/MFA Library
**Priority**: High | **Effort**: 2-3 days

#### TODO:

- [ ] Clone morka17/MFA repository for reference
- [ ] Extract authenticator module patterns and adapt to NestJS
- [ ] Install core dependencies from morka17/MFA (otplib, qrcode)
- [ ] Create `src/modules/auth/services/totp.service.ts`
- [ ] Implement secret generation with encryption (from library patterns)
- [ ] Implement QR code generation (otpauth:// URI)
- [ ] Implement TOTP verification with time drift tolerance
- [ ] Add Prisma migration for `MfaSecret` table
- [ ] Write unit tests for TOTP service

#### Service Interface:
```typescript
// totp.service.ts
interface TotpSetupResult {
  secret: string;      // Base32 secret (for manual entry)
  qrCodeDataUrl: string; // QR code as data URL
  otpauthUrl: string;  // otpauth://totp/...
}

interface TotpService {
  // Setup
  generateSecret(userId: string, email: string): Promise<TotpSetupResult>;

  // Verification
  verifyAndActivate(userId: string, code: string): Promise<boolean>;
  verifyCode(userId: string, code: string): Promise<boolean>;

  // Management
  isEnabled(userId: string): Promise<boolean>;
  disable(userId: string): Promise<void>;
}
```

---

### Phase 2: Backup Codes
**Priority**: High | **Effort**: 1-2 days

#### TODO:

- [ ] Adapt backup codes module from morka17/MFA
- [ ] Create `src/modules/auth/services/backup-codes.service.ts`
- [ ] Generate 10 random 8-character codes
- [ ] Hash codes with HMAC-SHA256 before storage
- [ ] Add Prisma migration for `MfaBackupCode` table
- [ ] Implement one-time use verification
- [ ] Add regeneration endpoint (invalidates old codes)
- [ ] Write unit tests

#### Service Interface:
```typescript
// backup-codes.service.ts
interface BackupCodesService {
  // Generation
  generate(userId: string): Promise<string[]>; // Returns plaintext codes (show once)
  regenerate(userId: string): Promise<string[]>; // Invalidates old, generates new

  // Verification
  verify(userId: string, code: string): Promise<boolean>; // Marks as used if valid

  // Status
  getRemainingCount(userId: string): Promise<number>;
}
```

#### Code Format:
- 10 codes, 8 characters each
- Format: `XXXX-XXXX` (e.g., `A1B2-C3D4`)
- Alphanumeric, uppercase, no ambiguous chars (0/O, 1/I/L)

---

### Phase 3: Trusted Devices ("Keep Me Signed In")
**Priority**: Medium | **Effort**: 2 days

#### TODO:

- [ ] Adapt trusted device patterns from morka17/MFA
- [ ] Create `src/modules/auth/services/trusted-device.service.ts`
- [ ] Add Prisma migration for `TrustedDevice` table
- [ ] Implement device token generation and storage
- [ ] Add device fingerprinting (user-agent + partial IP hash)
- [ ] Implement 30-day expiration with renewal on use
- [ ] Add device listing and revocation endpoints
- [ ] Create cleanup job for expired tokens
- [ ] Write unit tests

#### Service Interface:
```typescript
// trusted-device.service.ts
interface TrustedDeviceService {
  // Trust management
  trustDevice(userId: string, request: Request): Promise<string>; // Returns token
  verifyDevice(userId: string, token: string, request: Request): Promise<boolean>;

  // Device listing
  listDevices(userId: string): Promise<TrustedDeviceInfo[]>;
  revokeDevice(userId: string, deviceId: string): Promise<void>;
  revokeAllDevices(userId: string): Promise<void>;

  // Cleanup
  cleanupExpiredDevices(): Promise<number>;
}

interface TrustedDeviceInfo {
  id: string;
  deviceName: string;
  location?: string;
  lastUsedAt: Date;
  isCurrent: boolean;
}
```

---

### Phase 4: Auth Flow Integration
**Priority**: High | **Effort**: 2-3 days

#### TODO:

- [ ] Update `auth.service.ts` to check MFA methods
- [ ] Add MFA method selection (TOTP vs Email OTP)
- [ ] Integrate trusted device check in login flow
- [ ] Update login response with MFA requirements
- [ ] Add "Remember this device" checkbox handling
- [ ] Update JWT to include device token claim
- [ ] Write integration tests

#### Login Flow Changes:
```typescript
// Updated login flow
async login(credentials, options?: { rememberDevice?: boolean }) {
  // 1. Verify username/password
  const user = await this.validateCredentials(credentials);

  // 2. Check trusted device
  if (options?.deviceToken) {
    const isTrusted = await this.trustedDevice.verify(user.id, options.deviceToken);
    if (isTrusted) {
      return this.issueTokens(user); // Skip MFA
    }
  }

  // 3. Check MFA requirements
  const mfaMethods = await this.getMfaMethods(user.id);
  if (mfaMethods.length > 0) {
    return {
      requiresMfa: true,
      mfaMethods, // ['totp', 'email', 'backup']
      mfaToken: this.issueMfaToken(user.id),
    };
  }

  // 4. Issue tokens (no MFA required)
  return this.issueTokens(user);
}
```

---

### Phase 5: API Endpoints
**Priority**: High | **Effort**: 1-2 days

#### TODO:

- [ ] Create `src/modules/auth/controllers/mfa.controller.ts`
- [ ] Add TOTP setup endpoints
- [ ] Add backup codes endpoints
- [ ] Add trusted device management endpoints
- [ ] Add Swagger/OpenAPI documentation
- [ ] Implement rate limiting on sensitive endpoints

#### Endpoints:
```
# TOTP Setup
POST   /api/auth/mfa/totp/setup      → Generate secret + QR code
POST   /api/auth/mfa/totp/verify     → Verify code and activate
DELETE /api/auth/mfa/totp            → Disable TOTP
GET    /api/auth/mfa/totp/status     → Check if enabled

# Backup Codes
POST   /api/auth/mfa/backup/generate → Generate new codes
POST   /api/auth/mfa/backup/verify   → Verify backup code
GET    /api/auth/mfa/backup/count    → Get remaining count

# Trusted Devices
GET    /api/auth/mfa/devices         → List trusted devices
DELETE /api/auth/mfa/devices/:id     → Revoke specific device
DELETE /api/auth/mfa/devices         → Revoke all devices

# MFA Verification (during login)
POST   /api/auth/mfa/verify          → Verify any MFA method
```

---

### Phase 6: Frontend Integration
**Priority**: Medium | **Effort**: 3-4 days

#### TODO:

- [ ] Add i18n translations for MFA (EN/IT)
- [ ] Create TOTP setup wizard component
- [ ] Add QR code display with manual secret fallback
- [ ] Create backup codes display component (print/download)
- [ ] Add "Remember this device" checkbox to login
- [ ] Create trusted devices management page
- [ ] Add MFA method selection during login
- [ ] Update settings page with MFA section

#### UI Components:
```
components/
  auth/
    MfaSetupWizard.tsx       # Step-by-step TOTP setup
    QrCodeDisplay.tsx        # QR code with manual entry fallback
    BackupCodesDisplay.tsx   # Show codes with print/download
    MfaVerificationDialog.tsx # Code entry during login
    TrustedDevicesList.tsx   # Manage devices
  settings/
    SecuritySettings.tsx     # MFA configuration section
```

---

### Phase 7: Testing & Security Audit
**Priority**: High | **Effort**: 2 days

#### TODO:

- [ ] Unit tests for all MFA services (>90% coverage)
- [ ] Integration tests for auth flow with MFA
- [ ] E2E tests for TOTP setup and login
- [ ] Security audit:
  - [ ] Verify secret encryption at rest
  - [ ] Check rate limiting on verification endpoints
  - [ ] Validate time drift tolerance (±30 seconds)
  - [ ] Test backup code one-time use
  - [ ] Verify device token cannot be reused across users
- [ ] Load testing for QR code generation

---

### Phase 8: WebAuthn/Biometric Authentication ✅ COMPLETE

**Priority**: Medium | **Effort**: 3-4 days | **Completed**: 2025-12-05

> Passwordless authentication using biometrics (Face ID, Touch ID, Windows Hello) and security keys (YubiKey)

#### Features

- **Face ID / Touch ID** - Apple devices biometric ✅
- **Windows Hello** - Windows facial/fingerprint recognition ✅
- **Android Biometric** - Fingerprint sensors ✅
- **Security Keys** - YubiKey, Titan Security Key ✅

#### Implemented

- [x] Install `@simplewebauthn/server` v10+ and `@simplewebauthn/browser` v10+
- [x] Add WebAuthn Prisma models (WebAuthnCredential)
- [x] Create `webauthn.service.ts` with:
  - [x] `generateRegistrationOptions()` - Start credential registration
  - [x] `verifyRegistration()` - Complete registration
  - [x] `generateAuthenticationOptions()` - Start authentication (MFA flow)
  - [x] `verifyAuthentication()` - Verify credential (MFA flow)
  - [x] `generateLoginOptions()` - Passwordless login options
  - [x] `verifyLogin()` - Passwordless login verification
- [x] Add API endpoints:
  - `POST /auth/mfa/webauthn/register/options` - Registration options
  - `POST /auth/mfa/webauthn/register/verify` - Complete registration
  - `POST /auth/mfa/webauthn/authenticate/options` - MFA auth options
  - `POST /auth/mfa/webauthn/authenticate/verify` - MFA verification
  - `GET /auth/mfa/webauthn/credentials` - List registered credentials
  - `PATCH /auth/mfa/webauthn/credentials/:id` - Rename credential
  - `DELETE /auth/mfa/webauthn/credentials/:id` - Remove credential
  - `POST /auth/webauthn/login/options` - **Passwordless login options (public)**
  - `POST /auth/webauthn/login/verify` - **Passwordless login (public)**
- [x] Frontend components:
  - [x] PasskeyCard.tsx - Manage passkeys in security settings
  - [x] Login page passkey button - "Sign in with Passkey"
  - [x] i18n translations (EN/IT) for all passkey strings
- [x] Tested with Windows Hello on localhost

#### Key Implementation Details

- Uses `@simplewebauthn/server` v10+ API (breaking changes from v9)
- Credential IDs stored as base64url strings (not re-encoded)
- Supports `authenticatorAttachment: 'platform'` for built-in biometrics
- Supports `residentKey: 'preferred'` for discoverable credentials
- Public login endpoints allow passwordless flow without prior authentication
- Rate limited: 5 requests per 60 seconds on all WebAuthn endpoints

#### Database Schema (WebAuthn)

```prisma
model WebAuthnCredential {
  id                  String   @id @default(cuid())
  userId              String
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Credential data
  credentialId        String   @unique // Base64URL encoded
  credentialPublicKey String   // Base64URL encoded public key
  counter             Int      @default(0) // Signature counter for replay protection

  // Device info
  deviceType          String   @default("platform") // "platform" | "cross-platform"
  transports          String[] @default([]) // "usb" | "nfc" | "ble" | "internal"
  deviceName          String?  // "MacBook Pro Touch ID"

  // Authenticator info
  aaguid              String?  // Authenticator Attestation GUID

  createdAt           DateTime @default(now())
  lastUsedAt          DateTime @default(now())

  @@index([userId])
  @@map("webauthn_credentials")
}
```

#### WebAuthn Resources

- [WebAuthn Guide](https://webauthn.guide/)
- [SimpleWebAuthn Docs](https://simplewebauthn.dev/)
- [FIDO Alliance](https://fidoalliance.org/)

---

## Security Considerations

### TOTP Security
- Store secrets encrypted (AES-256-GCM)
- Allow ±1 time step drift (30 seconds each way)
- Rate limit verification attempts (5/minute)
- Require password confirmation to enable/disable

### Backup Codes Security
- Hash codes with HMAC-SHA256
- One-time use (mark as used immediately)
- Require password to regenerate
- Show codes only once during generation

### Trusted Device Security
- Device token: UUID v4 (128-bit entropy)
- Bind to user-agent + partial IP hash
- 30-day expiration with renewal
- Invalidate on password change
- Max 10 devices per user

---

## Environment Variables

```env
# TOTP Configuration
TOTP_ISSUER=MailAgent           # Displayed in authenticator app
TOTP_ALGORITHM=sha1             # sha1, sha256, sha512
TOTP_DIGITS=6                   # 6 or 8 digits
TOTP_PERIOD=30                  # Seconds per code
TOTP_WINDOW=1                   # Time drift tolerance (±30s)

# Backup Codes
BACKUP_CODE_COUNT=10            # Number of codes to generate
BACKUP_CODE_LENGTH=8            # Characters per code

# Trusted Devices
TRUSTED_DEVICE_MAX=10           # Max devices per user
TRUSTED_DEVICE_EXPIRY_DAYS=30   # Days until expiration
```

---

## Migration Path

### For Existing Users
1. MFA remains optional (opt-in)
2. Email OTP continues to work
3. Users can enable TOTP alongside email OTP
4. Backup codes generated when TOTP enabled
5. Trusted devices available for all MFA-enabled users

### Rollout Strategy

1. ✅ Phase 1-3: Backend services (no user impact) - **COMPLETE**
2. ✅ Phase 4-5: Auth flow & API endpoints - **COMPLETE**
3. ✅ Phase 6: Frontend components - **COMPLETE**
4. ✅ Phase 7: Full release after security audit - **COMPLETE**
5. ✅ Phase 8: WebAuthn/Biometric authentication - **COMPLETE** (2025-12-05)

---

## Success Metrics

- [ ] TOTP setup completion rate > 80%
- [ ] Backup code usage < 5% (indicates users prefer TOTP)
- [ ] Trusted device adoption > 60%
- [ ] MFA-related support tickets < 2% of users
- [ ] Zero security incidents related to MFA bypass
- [ ] WebAuthn adoption > 30% (when available)

---

## References

- [RFC 6238 - TOTP](https://datatracker.ietf.org/doc/html/rfc6238)
- [RFC 4226 - HOTP](https://datatracker.ietf.org/doc/html/rfc4226)
- [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [NIST 800-63B Authentication Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [morka17/MFA Reference Implementation](https://github.com/morka17/MFA)
- [speakeasy Documentation](https://github.com/speakeasyjs/speakeasy)
- [qrcode Documentation](https://github.com/soldair/node-qrcode)

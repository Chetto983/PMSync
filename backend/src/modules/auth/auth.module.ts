import { Module, forwardRef } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuthController } from './controllers/auth.controller';
import { MfaController } from './controllers/mfa.controller';
import { AuthService } from './services/auth.service';
import { AuthRegistrationService } from './services/auth-registration.service';
import { AuthLoginService } from './services/auth-login.service';
import { AuthTokenService } from './services/auth-token.service';
import { AuthPasswordResetService } from './services/auth-password-reset.service';
import { AuthConfigService } from './services/auth-config.service';
import { OtpSecurityService } from './services/otp-security.service';
import { TotpService } from './services/totp.service';
import { BackupCodesService } from './services/backup-codes.service';
import { TrustedDeviceService } from './services/trusted-device.service';
import { WebAuthnService } from './services/webauthn.service';
import { RedisRateLimiterService } from '../../common/services/redis-rate-limiter.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailService } from '../email/services/email.service';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { ComplianceModule } from '../compliance/compliance.module';

/**
 * AuthModule - Secure authentication with fail-fast configuration
 *
 * Security features:
 * - Fail-fast on missing/weak JWT_SECRET (no fallback to 'secret')
 * - Separate secrets for access tokens and password reset
 * - Session validation in JWT strategy
 * - OTP hashing with HMAC-SHA256
 * - Rate limiting and lockout for OTP attempts
 *
 * Required environment variables:
 * - JWT_SECRET: Secure secret for access tokens (min 32 chars)
 * - PASSWORD_RESET_SECRET: Separate secret for password reset (min 32 chars)
 *
 * Optional environment variables:
 * - ACCESS_TOKEN_EXPIRES_IN: Token TTL (default: 7d, aligned to session TTL)
 * - OTP_EXPIRATION: OTP TTL in ms (default: 300000 = 5 min)
 * - OTP_MAX_ATTEMPTS: Max failed OTP attempts before lockout (default: 5)
 *
 * @see AUTH_MODULE_ROADMAP.md for implementation details
 */
@Module({
  imports: [
    PrismaModule,
    UsersModule,
    ConfigModule,
    ComplianceModule, // LegalAcceptanceService for registration-time legal acceptance
    forwardRef(() => EmailModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // JWT configuration with ES256 support and HS256 fallback
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const privateKeyRaw = config.get<string>('JWT_PRIVATE_KEY');
        const publicKeyRaw = config.get<string>('JWT_PUBLIC_KEY');

        // Handle PEM newline escaping from env vars
        const privateKey = privateKeyRaw?.replace(/\\n/g, '\n');
        const publicKey = publicKeyRaw?.replace(/\\n/g, '\n');

        const expiresIn = config.get<string>('ACCESS_TOKEN_EXPIRES_IN') || '15m';

        if (privateKey && publicKey) {
          // ES256 mode (2026 best practice: asymmetric signing)
          return {
            privateKey,
            publicKey,
            signOptions: {
              algorithm: 'ES256',
              expiresIn: expiresIn as any,
              issuer: 'pmsync-auth',
              audience: 'pmsync-api',
              keyid: crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 8),
            },
          };
        }

        // HS256 fallback (dev/test without ES256 keys)
        const secret = config.get<string>('JWT_SECRET');
        if (!secret || secret === 'secret' || secret.length < 32) {
          throw new Error(
            'FATAL: JWT_SECRET or JWT_PRIVATE_KEY/JWT_PUBLIC_KEY must be configured. ' +
              'Set a secure JWT_SECRET (min 32 chars) or provide ES256 keypair.',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as any,
            issuer: 'pmsync-auth',
            audience: 'pmsync-api',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    // Phase 43: Auth sub-services (must be before facade for DI ordering)
    AuthRegistrationService,
    AuthLoginService,
    AuthTokenService,
    AuthPasswordResetService,
    AuthService,
    AuthConfigService,
    OtpSecurityService,
    TotpService,
    BackupCodesService,
    TrustedDeviceService,
    WebAuthnService,
    RedisRateLimiterService,
    JwtStrategy,
    // EmailService removed — provided by EmailModule (forwardRef import above)
  ],
  controllers: [AuthController, MfaController],
  exports: [
    AuthService,
    AuthConfigService,
    OtpSecurityService,
    TotpService,
    BackupCodesService,
    TrustedDeviceService,
    WebAuthnService,
    RedisRateLimiterService,
    JwtModule,
  ],
})
export class AuthModule {}

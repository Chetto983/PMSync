import { Module, forwardRef } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './controllers/auth.controller';
import { MfaController } from './controllers/mfa.controller';
import { AuthService } from './services/auth.service';
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
    // JWT configuration with fail-fast validation
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.get<string>('JWT_SECRET');

        // SECURITY: Fail fast if JWT_SECRET is missing or weak
        if (!secret || secret === 'secret' || secret.length < 32) {
          throw new Error(
            'FATAL: JWT_SECRET is missing, too short (<32 chars), or using unsafe default. ' +
              'Set a secure JWT_SECRET environment variable.',
          );
        }

        // Parse expiration - aligned to 7d session TTL (SEC-01)
        // Session validation handles revocation; env var override still works
        const expiresInConfig = config.get<string>('ACCESS_TOKEN_EXPIRES_IN') || '7d';
        const expiresIn = expiresInConfig; // JWT library handles '7d' format

        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as any, // Cast to any for flexibility with string format
            issuer: 'pmsync-auth',
            audience: 'pmsync-api',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
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

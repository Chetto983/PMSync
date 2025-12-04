import { Module } from '@nestjs/common';
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
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailService } from '../email/services/email.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersModule } from '../users/users.module';

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
 * - ACCESS_TOKEN_EXPIRES_IN: Token TTL (default: 15m)
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

        // Parse expiration - convert string like '15m' to seconds for JWT
        const expiresInConfig = config.get<string>('ACCESS_TOKEN_EXPIRES_IN') || '15m';
        const expiresIn = expiresInConfig; // JWT library handles '15m' format

        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as any, // Cast to any for flexibility with string format
            issuer: 'mailagent-auth',
            audience: 'mailagent-api',
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
    JwtStrategy,
    EmailService,
  ],
  controllers: [AuthController, MfaController],
  exports: [
    AuthService,
    AuthConfigService,
    OtpSecurityService,
    TotpService,
    BackupCodesService,
    TrustedDeviceService,
    JwtModule,
  ],
})
export class AuthModule {}

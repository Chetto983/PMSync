import { Global, Module } from '@nestjs/common';
import { EmailService } from './services/email.service';

/**
 * TransactionalEmailModule - Global module for transactional email sending.
 *
 * Phase 45 Plan 03: Extracted as @Global() module to break the
 * Auth -> Email circular dependency. EmailService is a standalone
 * nodemailer wrapper with zero domain dependencies, so it can be
 * safely shared across modules without forwardRef.
 *
 * Consumers: AuthModule (OTP, password reset), EmailModule (re-exports)
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class TransactionalEmailModule {}

import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { getConfiguration } from '../../../config/configuration';

@Injectable()
export class EmailService {
  private logger = new Logger(EmailService.name);
  private transporter!: nodemailer.Transporter;
  private config = getConfiguration();

  constructor() {
    this.initializeTransporter();
  }

  /**
   * Initialize nodemailer transporter - uses centralized config
   */
  private initializeTransporter() {
    const emailConfig = this.config.email;
    this.transporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort,
      secure: emailConfig.smtpPort === 465,
      auth: {
        user: emailConfig.smtpUser,
        pass: emailConfig.smtpPassword,
      },
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 5_000,
    });
  }

  /**
   * Send OTP email
   */
  async sendOtp(email: string, code: string) {
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Your Verification Code</h2>
          <p>Please use the following code to verify your email:</p>
          <div style="background-color: #f0f0f0; padding: 20px; border-radius: 5px; text-align: center;">
            <h1 style="color: #007bff; margin: 0;">${code}</h1>
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </body>
      </html>
    `;

    return this.sendEmail(email, 'Your Verification Code', html);
  }

  /**
   * Send password reset email
   * Links to Better Auth's reset flow callback URL.
   */
  async sendPasswordResetLink(email: string, resetLink: string) {
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password. Click the link below to reset it:</p>
          <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
          <p>Or copy and paste this link in your browser: ${resetLink}</p>
          <p>This link will expire in 15 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </body>
      </html>
    `;

    return this.sendEmail(email, 'Password Reset Request', html);
  }

  /**
   * Send email verification link for new signups.
   */
  async sendVerificationEmail(email: string, verificationUrl: string) {
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Verify Your Email</h2>
          <p>Thank you for signing up for PMSync. Please verify your email address by clicking the link below:</p>
          <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email
          </a>
          <p>Or copy and paste this link in your browser: ${verificationUrl}</p>
          <p>If you didn't create an account, please ignore this email.</p>
        </body>
      </html>
    `;

    return this.sendEmail(email, 'Verify Your Email - PMSync', html);
  }

  /**
   * Backward-compatible legacy reset email helper.
   */
  async sendPasswordReset(email: string, token: string) {
    const resetLink = `${this.config.frontendUrl}/auth/reset-password?token=${token}`;
    return this.sendPasswordResetLink(email, resetLink);
  }

  /**
   * Send generic email - uses centralized config for sender
   * Non-blocking: logs errors but doesn't throw (development may not have SMTP configured)
   */
  async sendEmail(to: string, subject: string, html: string) {
    try {
      const emailConfig = this.config.email;
      const from = `${emailConfig.fromEmail}@${emailConfig.fromDomain}`;

      const sendPromise = this.transporter.sendMail({ from, to, subject, html });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SMTP send timed out after 8s')), 8_000),
      );
      const result = await Promise.race([sendPromise, timeoutPromise]);

      this.logger.log(`Email sent to ${to}: ${subject}`);
      return result;
    } catch (error) {
      // CRIT-1 FIX (2025-01-05): Never return fake success for email delivery
      // This was masking OTP/password reset failures - security critical!
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[CRITICAL] Email delivery failed for ${to}: ${errorMessage}`);

      // Throw instead of returning mock success - callers must handle failures
      throw new Error(`Email delivery failed: ${errorMessage}`);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { getConfiguration } from '../../../config/configuration';

@Injectable()
export class EmailService {
  private logger = new Logger(EmailService.name);
  private config = getConfiguration();
  private apiKey: string;
  private fromAddress: string;

  constructor() {
    const emailConfig = this.config.email;
    this.apiKey = emailConfig.smtpPassword; // SendGrid API key
    this.fromAddress = `${emailConfig.fromEmail}@${emailConfig.fromDomain}`;
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
   * Send email via SendGrid HTTP API (v3).
   * Railway blocks outbound SMTP ports, so we use the REST API instead.
   */
  async sendEmail(to: string, subject: string, html: string) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: this.fromAddress },
          subject,
          content: [{ type: 'text/html', value: html }],
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`SendGrid API ${response.status}: ${body}`);
      }

      this.logger.log(`Email sent to ${to}: ${subject}`);
      return { accepted: [to] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[CRITICAL] Email delivery failed for ${to}: ${errorMessage}`);
      throw new Error(`Email delivery failed: ${errorMessage}`);
    }
  }
}

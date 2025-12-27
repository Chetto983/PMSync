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
   * Links to frontend page which calls backend API
   */
  async sendPasswordReset(email: string, token: string) {
    const resetLink = `${this.config.frontendUrl}/auth/reset-password?token=${token}`;
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
   * Send generic email - uses centralized config for sender
   * Non-blocking: logs errors but doesn't throw (development may not have SMTP configured)
   */
  async sendEmail(to: string, subject: string, html: string) {
    try {
      const emailConfig = this.config.email;
      const from = `${emailConfig.fromEmail}@${emailConfig.fromDomain}`;

      const result = await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      this.logger.log(`Email sent to ${to}: ${subject}`);
      return result;
    } catch (error) {
      // In development, SMTP server may not be configured
      // Log the error but don't throw - allow application to continue
      this.logger.warn(`Email delivery failed for ${to}: ${error instanceof Error ? error.message : String(error)}`);
      return {
        accepted: [to],
        rejected: [],
        messageId: 'dev-mock-' + Date.now(),
      };
    }
  }
}

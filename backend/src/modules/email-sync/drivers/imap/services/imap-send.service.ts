/**
 * ImapSendService
 *
 * Extracted from IMAPDriver - handles SMTP sending and draft operations.
 * Uses nodemailer for SMTP transport and ImapConnectionPoolService for IMAP folder operations.
 *
 * Features:
 * - SMTP message sending via nodemailer
 * - RFC 2047 encoding for non-ASCII display names
 * - Draft save/send operations
 * - Sent message saving to IMAP folder
 * - Proper MIME message building
 */

import { Injectable, Logger, Scope } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ImapConnectionPoolService } from './imap-connection-pool.service';
import { ImapFolderService } from './imap-folder.service';
import {
  SmtpConfig,
} from '../interfaces/imap-internal.interface';
import {
  ComposeMessage,
  EmailAddress,
  CanonicalMessage,
} from '../../interfaces/canonical.types';
import { MimeBuilder } from '../../../../../common/utils';

@Injectable({ scope: Scope.TRANSIENT })
export class ImapSendService {
  private readonly logger = new Logger(ImapSendService.name);

  private smtpConfig?: SmtpConfig;
  private userEmail?: string;

  constructor(
    private readonly connectionPool: ImapConnectionPoolService,
    private readonly folderService: ImapFolderService,
  ) {}

  /**
   * Initialize the send service with SMTP configuration
   */
  initialize(smtpConfig: SmtpConfig, userEmail: string): void {
    this.smtpConfig = smtpConfig;
    this.userEmail = userEmail;
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return !!this.smtpConfig && !!this.userEmail;
  }

  /**
   * Get the user email address
   */
  getUserEmail(): string | undefined {
    return this.userEmail;
  }

  /**
   * Clear the configuration (on disconnect)
   */
  clearConfig(): void {
    this.smtpConfig = undefined;
    this.userEmail = undefined;
  }

  /**
   * Send a new message via SMTP
   *
   * @param message Message to send
   * @returns ID of the sent message
   */
  async sendMessage(message: ComposeMessage): Promise<string> {
    if (!this.smtpConfig) {
      throw new Error('SMTP not configured');
    }

    const transporter = nodemailer.createTransport({
      host: this.smtpConfig.host,
      port: this.smtpConfig.port,
      secure: this.smtpConfig.secure,
      auth: this.smtpConfig.auth,
    });

    const result = await transporter.sendMail({
      from: message.fromEmail || this.userEmail,
      to: message.to.map((a) => this.formatEmailAddress(a)).join(', '),
      cc: message.cc?.map((a) => this.formatEmailAddress(a)).join(', '),
      bcc: message.bcc?.map((a) => this.formatEmailAddress(a)).join(', '),
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml,
      attachments: message.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content ? Buffer.from(att.content, 'base64') : att.contentStream,
        contentType: att.mimeType,
      })),
      inReplyTo: message.inReplyTo,
      references: message.references,
    });

    // Also save to Sent folder via IMAP
    await this.saveSentMessage(message);

    return result.messageId || `sent-${Date.now()}`;
  }

  /**
   * Save a draft message to the Drafts folder
   *
   * @param message Draft content
   * @param existingDraftId Optional ID of existing draft to update
   * @param deleteMessage Optional callback to delete existing draft
   * @returns ID of the saved draft
   */
  async saveDraft(
    message: ComposeMessage,
    existingDraftId?: string,
    deleteMessage?: (id: string, permanent: boolean) => Promise<void>,
  ): Promise<string> {
    return this.connectionPool.withConnection(async (client) => {
      // Find drafts folder using folder service
      const draftsFolder = await this.folderService.resolveFolder('DRAFTS');

      // Delete existing draft if updating
      if (existingDraftId && deleteMessage) {
        try {
          await deleteMessage(existingDraftId, true);
        } catch {
          // Ignore if delete fails
        }
      }

      // Build RFC 822 message
      const messageWithFrom = message.fromEmail
        ? message
        : { ...message, fromEmail: this.userEmail };
      const rfc822 = await this.buildRfc822Message(messageWithFrom);

      // Append to Drafts folder with \Draft flag
      const result = await client.append(draftsFolder, rfc822, ['\\Draft', '\\Seen']);

      // Handle result - append can return false on failure
      if (!result || typeof result === 'boolean') {
        throw new Error('Failed to save draft');
      }

      return `${draftsFolder}:${result.uid}`;
    });
  }

  /**
   * Send an existing draft
   *
   * @param draftId Draft message ID
   * @param getMessage Callback to get message content (from facade)
   * @param deleteMessage Callback to delete draft after sending (from facade)
   */
  async sendDraft(
    draftId: string,
    getMessage: (id: string, options: { includeBody: boolean }) => Promise<CanonicalMessage | null>,
    deleteMessage: (id: string, permanent: boolean) => Promise<void>,
  ): Promise<void> {
    // Get the draft message using callback
    const draft = await getMessage(draftId, { includeBody: true });
    if (!draft) {
      throw new Error(`Draft not found: ${draftId}`);
    }

    // Convert to ComposeMessage and send
    const message: ComposeMessage = {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml || '',
      bodyText: draft.bodyText,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
    };

    await this.sendMessage(message);

    // Delete the draft using callback
    await deleteMessage(draftId, true);
  }

  /**
   * Encode a string using RFC 2047 if it contains non-ASCII characters.
   */
  private encodeRfc2047(text: string): string {
    if (!/[^\x00-\x7F]/.test(text)) {
      return text;
    }
    return `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`;
  }

  /**
   * Format email address for SMTP with RFC 2047 encoding for non-ASCII names.
   */
  private formatEmailAddress(address: EmailAddress): string {
    if (address.name) {
      const encodedName = this.encodeRfc2047(address.name);
      if (encodedName.startsWith('=?')) {
        return `${encodedName} <${address.email}>`;
      }
      return `"${address.name}" <${address.email}>`;
    }
    return address.email;
  }

  /**
   * Save sent message to Sent folder
   */
  private async saveSentMessage(message: ComposeMessage): Promise<void> {
    return this.connectionPool.withConnection(async (client) => {
      try {
        // Use folder service to resolve Sent folder
        const sentFolder = await this.folderService.resolveFolder('SENT');
        const messageWithFrom = message.fromEmail
          ? message
          : { ...message, fromEmail: this.userEmail };
        const rfc822 = await this.buildRfc822Message(messageWithFrom);
        await client.append(sentFolder, rfc822, ['\\Seen']);
      } catch (error) {
        this.logger.warn('Failed to save sent message to Sent folder', error);
        // Don't throw - the email was sent successfully
      }
    });
  }

  /**
   * Build RFC 822 message from ComposeMessage
   */
  private async buildRfc822Message(message: ComposeMessage): Promise<Buffer> {
    return MimeBuilder.build(message);
  }
}

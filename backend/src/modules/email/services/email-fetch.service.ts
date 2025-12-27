import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { google } from 'googleapis';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import { CryptoService } from '../../../common/services/crypto.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/**
 * Service to fetch archived emails on-demand from email servers
 */
@Injectable()
export class EmailFetchService {
  private readonly logger = new Logger(EmailFetchService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private providerTokenService: ProviderTokenService,
  ) {}

  /**
   * Fetch email content from the provider when body is missing or archived.
   * The database is a cache - this fetches the full email from Gmail/Microsoft/IMAP.
   */
  async fetchArchivedEmail(emailId: string, tenantId: string) {
    // Get the email (archived or with missing body content)
    const email = await this.prisma.email.findFirst({
      where: {
        id: emailId,
        tenantId,
      },
      include: {
        provider: true,
      },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    // Check if body content is already present
    if (email.bodyHtml && email.bodyText && !email.isArchived) {
      this.logger.log(`Email ${emailId} already has body content, returning existing data`);
      return email;
    }

    this.logger.log(`Fetching email ${emailId} content from ${email.provider.providerType} provider`);

    try {
      let fetchedContent: { bodyText?: string; bodyHtml?: string; headers?: Record<string, string> } = {};

      // Fetch from appropriate provider
      switch (email.provider.providerType) {
        case 'google':
          fetchedContent = await this.fetchFromGmail(email, email.provider);
          break;
        case 'microsoft':
          fetchedContent = await this.fetchFromMicrosoft(email, email.provider);
          break;
        case 'imap':
        case 'generic':
          fetchedContent = await this.fetchFromIMAP(email, email.provider);
          break;
        default:
          throw new Error(`Unsupported provider type: ${email.provider.providerType}`);
      }

      // Update email with fetched content
      const updatedEmail = await this.prisma.email.update({
        where: { id: emailId },
        data: {
          bodyText: fetchedContent.bodyText,
          bodyHtml: fetchedContent.bodyHtml,
          headers: fetchedContent.headers as any,
          isArchived: false, // No longer archived since we restored content
        },
        include: {
          attachments: true,
        },
      });

      this.logger.log(`Successfully restored archived email ${emailId}`);

      return updatedEmail;
    } catch (error) {
      this.logger.error(`Failed to fetch archived email ${emailId}:`, error);
      throw error;
    }
  }

  private async fetchFromGmail(email: any, provider: any) {
    const { provider: freshProvider, accessToken } =
      await this.providerTokenService.getProviderWithToken(provider.id);
    if (freshProvider.providerType !== 'google') {
      throw new Error(`Provider ${provider.id} is not a Gmail provider`);
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const messageResponse = await gmail.users.messages.get({
      userId: 'me',
      id: email.externalId,
      format: 'full',
    });

    const message = messageResponse.data;

    let bodyText = '';
    let bodyHtml = '';

    const extractBody = (part: any) => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText = Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.parts) {
        part.parts.forEach(extractBody);
      }
    };

    if (message.payload) {
      extractBody(message.payload);
    }

    const headers: Record<string, string> = (message.payload?.headers || []).reduce((acc, h) => {
      if (h.name && h.value) {
        acc[h.name] = h.value;
      }
      return acc;
    }, {} as Record<string, string>);

    return {
      bodyText,
      bodyHtml,
      headers,
    };
  }

  private async fetchFromMicrosoft(email: any, provider: any) {
    const { provider: freshProvider, accessToken } =
      await this.providerTokenService.getProviderWithToken(provider.id);
    if (freshProvider.providerType !== 'microsoft') {
      throw new Error(`Provider ${provider.id} is not a Microsoft provider`);
    }

    const graphClient = GraphClient.init({
      authProvider: (done: (error: any, token: string) => void) => {
        done(null, accessToken);
      },
    });

    const message = await graphClient
      .api(`/me/messages/${email.externalId}`)
      .header('Prefer', 'outlook.body-content-type="html"')
      .get();

    const bodyText = message.body?.contentType === 'text' ? message.body.content : '';
    const bodyHtml = message.body?.contentType === 'html' ? message.body.content : '';

    const headers = {
      'From': message.from?.emailAddress?.address,
      'To': message.toRecipients?.map((r: any) => r.emailAddress?.address).join(', '),
      'Subject': message.subject,
      'Date': message.receivedDateTime,
      'Message-ID': message.internetMessageId,
    };

    return {
      bodyText,
      bodyHtml,
      headers,
    };
  }

  private async fetchFromIMAP(email: any, provider: any) {
    if (
      !provider.imapUsername ||
      !provider.imapPassword ||
      !provider.imapEncryptionIv ||
      !['imap', 'generic'].includes(provider.providerType)
    ) {
      throw new Error('IMAP provider missing credentials');
    }

    const imapPassword = this.crypto.decrypt(
      provider.imapPassword,
      provider.imapEncryptionIv,
    );

    const client = new ImapFlow({
      host: provider.imapHost,
      port: provider.imapPort || 993,
      secure: provider.imapUseTls ?? true,
      auth: {
        user: provider.imapUsername,
        pass: imapPassword,
      },
      logger: false,
    });

    let lock: { release: () => void } | null = null;
    try {
      await client.connect();

      const { folderPath, uid } = this.parseImapExternalId(email.externalId, email.folder);
      const uidNumber = parseInt(uid, 10);
      if (!Number.isFinite(uidNumber)) {
        throw new Error(`Invalid IMAP UID: ${email.externalId}`);
      }

      lock = await client.getMailboxLock(folderPath);
      const messageStream = await client.download(uidNumber.toString(), undefined, { uid: true });
      const parsed = await simpleParser(messageStream.content);

      const headers: Record<string, string> = {};
      parsed.headers.forEach((value: any, key: string) => {
        headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
      });

      return {
        bodyText: parsed.text,
        bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
        headers,
      };
    } finally {
      if (lock) {
        lock.release();
      }
      try {
        await client.logout();
      } catch (logoutError) {
        this.logger.warn(
          `Failed to logout IMAP client: ${
            logoutError instanceof Error ? logoutError.message : String(logoutError)
          }`,
        );
      }
    }
  }

  private parseImapExternalId(
    externalId: string,
    fallbackFolder?: string | null,
  ): { folderPath: string; uid: string } {
    const lastColon = externalId.lastIndexOf(':');
    if (lastColon > 0) {
      return {
        folderPath: externalId.substring(0, lastColon),
        uid: externalId.substring(lastColon + 1),
      };
    }
    return { folderPath: fallbackFolder || 'INBOX', uid: externalId };
  }
}

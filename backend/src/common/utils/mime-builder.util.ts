import MailComposer from 'nodemailer/lib/mail-composer';
import type {
  AttachmentData,
  ComposeMessage,
  EmailAddress,
} from '../../modules/email-sync/drivers/interfaces/canonical.types';

type AddressInput = string | { name: string; address: string };

export class MimeBuilder {
  private static formatAddress(address: EmailAddress): AddressInput {
    if (address.name) {
      return { name: address.name, address: address.email };
    }
    return address.email;
  }

  private static formatAddresses(addresses?: EmailAddress[]): AddressInput[] | undefined {
    if (!addresses || addresses.length === 0) return undefined;
    return addresses.map((address) => this.formatAddress(address));
  }

  private static formatAttachments(attachments?: AttachmentData[]): Array<{
    filename: string;
    content: Buffer | AttachmentData['contentStream'];
    contentType: string;
    cid?: string;
    contentDisposition?: 'inline' | 'attachment';
  }> | undefined {
    if (!attachments || attachments.length === 0) return undefined;

    return attachments.map((att) => ({
      filename: att.filename,
      content: att.content ? Buffer.from(att.content, 'base64') : att.contentStream,
      contentType: att.mimeType,
      cid: att.contentId,
      contentDisposition: att.isInline ? 'inline' : 'attachment',
    }));
  }

  static async build(message: ComposeMessage): Promise<Buffer> {
    const mailOptions = {
      from: message.fromEmail,
      to: this.formatAddresses(message.to),
      cc: this.formatAddresses(message.cc),
      bcc: this.formatAddresses(message.bcc),
      replyTo: message.replyTo ? this.formatAddress(message.replyTo) : undefined,
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml,
      attachments: this.formatAttachments(message.attachments),
      inReplyTo: message.inReplyTo,
      references: message.references,
      date: new Date(),
    };

    const composer = new MailComposer(mailOptions);
    return composer.compile().build();
  }
}

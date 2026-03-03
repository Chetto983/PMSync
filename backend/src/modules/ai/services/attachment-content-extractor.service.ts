import { Injectable, Inject, Logger } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../common/interfaces/storage.interface';

// Lazy loader to support pdf-parse v2.x (exports PDFParse class)
const loadPdfParse = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('pdf-parse');
  // v2.x exports PDFParse class
  if (mod?.PDFParse) return mod.PDFParse;
  // v1.x exported a function directly
  if (typeof mod === 'function') return mod;
  if (mod?.default && typeof mod.default === 'function') return mod.default;
  throw new Error('pdf-parse module did not export a function or PDFParse class');
};

export interface AttachmentContent {
  attachmentId: string;
  filename: string;
  extractedText: string;
  extractionMethod: 'pdf-parse' | 'text' | 'unsupported';
}

/**
 * Service for extracting text content from email attachments.
 *
 * Supports:
 * - PDF files (via pdf-parse)
 * - Text files (plain text, JSON, CSV, markdown, etc.)
 *
 * Future extensions:
 * - Office documents (DOCX via mammoth, XLSX via xlsx)
 * - Images (OCR via Tesseract.js or cloud OCR)
 * - Archives (ZIP/RAR extraction)
 */
@Injectable()
export class AttachmentContentExtractorService {
  private readonly logger = new Logger(AttachmentContentExtractorService.name);
  private readonly MAX_ATTACHMENT_TEXT: number;

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {
    // Limit attachment text to 50K chars per attachment
    // This prevents extremely large files from bloating embeddings
    this.MAX_ATTACHMENT_TEXT = 50000;
  }

  /**
   * Extract text content from attachment based on MIME type
   */
  async extractTextFromAttachment(
    storagePath: string,
    mimeType: string,
    filename: string,
  ): Promise<string | null> {
    try {
      // Normalize MIME type (remove parameters like "; charset=utf-8")
      const normalizedMimeType = this.normalizeMimeType(mimeType);

      // Only extract from supported types
      if (!this.isSupportedMimeType(normalizedMimeType)) {
        this.logger.debug(
          `Unsupported MIME type for extraction: ${mimeType} (normalized: ${normalizedMimeType}) (${filename})`,
        );
        return null;
      }

      // Get signed URL and fetch content
      const signedUrl = await this.storageService.getSignedDownloadUrl(storagePath, 300);
      const response = await fetch(signedUrl);

      if (!response.ok) {
        this.logger.warn(
          `Failed to fetch attachment for extraction: ${filename} (status: ${response.status})`,
        );
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Extract based on type
      let extractedText: string | null = null;

      if (normalizedMimeType === 'application/pdf') {
        extractedText = await this.extractFromPDF(buffer, filename);
      } else if (this.isTextMimeType(normalizedMimeType)) {
        extractedText = await this.extractFromText(buffer, filename);
      }

      // Truncate if too long (ensure final length doesn't exceed MAX_ATTACHMENT_TEXT)
      if (extractedText && extractedText.length > this.MAX_ATTACHMENT_TEXT) {
        const suffix = '\n... [truncated]';
        const limit = this.MAX_ATTACHMENT_TEXT - suffix.length;
        this.logger.debug(
          `Truncating attachment text from ${extractedText.length} to ${this.MAX_ATTACHMENT_TEXT} chars (${filename})`,
        );
        extractedText = extractedText.substring(0, limit) + suffix;
      }

      if (extractedText) {
        this.logger.verbose(
          `Successfully extracted ${extractedText.length} chars from ${filename} (${mimeType})`,
        );
      }

      return extractedText;
    } catch (error) {
      this.logger.error(
        `Failed to extract text from attachment ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Extract text from PDF using pdf-parse
   */
  private async extractFromPDF(buffer: Buffer, filename: string): Promise<string | null> {
    try {
      const PDFParse = loadPdfParse();

      // pdf-parse v2.x uses class-based API
      if (PDFParse.prototype && typeof PDFParse.prototype.getText === 'function') {
        // v2.x API: new PDFParse({ data: buffer })
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();

        if (result.text && result.text.trim().length > 0) {
          this.logger.debug(
            `Extracted ${result.text.length} chars from PDF: ${filename} (${result.pages?.length || 'unknown'} pages)`,
          );
          return result.text.trim();
        }
      } else {
        // v1.x API: pdfParse(buffer)
        const data = await PDFParse(buffer);

        if (data.text && data.text.trim().length > 0) {
          this.logger.debug(
            `Extracted ${data.text.length} chars from PDF: ${filename} (${data.numpages} pages)`,
          );
          return data.text.trim();
        }
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `PDF extraction failed for ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Extract text from plain text files
   */
  private async extractFromText(buffer: Buffer, filename: string): Promise<string | null> {
    try {
      const text = buffer.toString('utf-8').trim();

      if (text.length > 0) {
        this.logger.debug(`Extracted ${text.length} chars from text file: ${filename}`);
        return text;
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Text extraction failed for ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Normalize MIME type by removing parameters (e.g., "text/html; charset=utf-8" → "text/html")
   */
  private normalizeMimeType(mimeType: string): string {
    return mimeType.split(';')[0].trim().toLowerCase();
  }

  /**
   * Check if MIME type is supported for extraction
   * Note: mimeType should be normalized before calling this
   */
  private isSupportedMimeType(mimeType: string): boolean {
    const supported = [
      'application/pdf',
      'text/plain',
      'text/html',
      'text/csv',
      'text/markdown',
      'text/x-markdown',
      'application/json',
      'text/xml',
      'application/xml',
    ];

    return supported.includes(mimeType) || mimeType.startsWith('text/');
  }

  /**
   * Check if MIME type is text-based
   * Note: mimeType should be normalized before calling this
   */
  private isTextMimeType(mimeType: string): boolean {
    return (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml'
    );
  }

  /**
   * Extract text from multiple attachments in parallel
   */
  async extractFromAttachments(
    attachments: Array<{
      id: string;
      filename: string;
      mimeType: string;
      storagePath: string;
    }>,
  ): Promise<AttachmentContent[]> {
    if (!attachments || attachments.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(
      attachments.map(async (att) => {
        const text = await this.extractTextFromAttachment(
          att.storagePath,
          att.mimeType,
          att.filename,
        );

        return {
          attachmentId: att.id,
          filename: att.filename,
          extractedText: text || '',
          extractionMethod: this.getExtractionMethod(att.mimeType),
        };
      }),
    );

    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<AttachmentContent>).value)
      .filter((content) => content.extractedText.length > 0);
  }

  private getExtractionMethod(mimeType: string): 'pdf-parse' | 'text' | 'unsupported' {
    const normalizedMimeType = this.normalizeMimeType(mimeType);
    if (normalizedMimeType === 'application/pdf') return 'pdf-parse';
    if (this.isTextMimeType(normalizedMimeType)) return 'text';
    return 'unsupported';
  }
}

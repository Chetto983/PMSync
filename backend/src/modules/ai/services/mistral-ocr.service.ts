import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStorageService, STORAGE_SERVICE } from '../../../common/interfaces/storage.interface';

/**
 * Result of OCR extraction
 */
export interface OcrExtractionResult {
  text: string;
  pageCount?: number;
  confidence?: number;
}

/**
 * Mistral OCR Service - On-Demand Attachment Extraction
 *
 * Uses Mistral OCR API for extracting text from attachments.
 * This is called ON-DEMAND by the agent, not during email indexing.
 *
 * Benefits:
 * - Cost-saving: Only pay when agent needs attachment content
 * - Better quality: 98.96% accuracy on scanned docs, 96.12% on tables
 * - More formats: Supports images, scanned PDFs, handwriting
 *
 * Pricing: $1/1000 pages (with batch API)
 *
 * @see https://mistral.ai/news/mistral-ocr
 */
@Injectable()
export class MistralOcrService {
  private readonly logger = new Logger(MistralOcrService.name);
  private readonly apiKey: string | undefined;
  private readonly ocrModel = 'mistral-ocr-latest';
  private readonly maxFileSizeMb = 50; // Mistral OCR limit

  /**
   * Minimum file size for images to be worth OCR (in bytes)
   * Smaller images are likely signatures, logos, icons, tracking pixels
   */
  private readonly minImageSizeKb = 15; // 15KB minimum for images

  /**
   * Common patterns for irrelevant images (signatures, logos, icons)
   */
  private readonly irrelevantImagePatterns = [
    // Social media icons
    /facebook|twitter|linkedin|instagram|youtube|tiktok/i,
    // Email signature patterns
    /signature|logo|icon|banner|footer|header/i,
    // Tracking pixels
    /pixel|tracking|beacon|spacer|1x1|transparent/i,
    // Generic small image names
    /button|arrow|bullet|divider|separator|line/i,
    // CID images (often inline)
    /^cid:/i,
    /^image\d{3,}/i, // Generic "image001.png" patterns
  ];

  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {
    this.apiKey = this.configService.get<string>('MISTRAL_API_KEY');
  }

  /**
   * Check if Mistral OCR is available
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Extract text from attachment using Mistral OCR API
   *
   * @param storagePath - Path to attachment in storage (S3/GCS/local)
   * @param mimeType - MIME type of the attachment
   * @param filename - Original filename (for logging)
   * @returns Extracted text or null if failed/unsupported
   */
  async extractFromAttachment(
    storagePath: string,
    mimeType: string,
    filename: string,
  ): Promise<OcrExtractionResult | null> {
    if (!this.apiKey) {
      this.logger.warn('Mistral OCR not available: MISTRAL_API_KEY not configured');
      return null;
    }

    // Check if MIME type is supported
    if (!this.isSupportedMimeType(mimeType)) {
      this.logger.debug(`Unsupported MIME type for OCR: ${mimeType} (${filename})`);
      return null;
    }

    // Smart filtering: Skip likely irrelevant images based on filename
    if (this.isImage(mimeType) && this.isLikelyIrrelevantImage(filename)) {
      this.logger.debug(`Skipping likely irrelevant image: ${filename}`);
      return null;
    }

    try {
      // 1. Download attachment from storage
      const signedUrl = await this.storageService.getSignedDownloadUrl(storagePath, 300);
      const response = await fetch(signedUrl);

      if (!response.ok) {
        this.logger.warn(`Failed to download attachment for OCR: ${filename} (status: ${response.status})`);
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Check file size - too large
      const fileSizeMb = buffer.length / (1024 * 1024);
      if (fileSizeMb > this.maxFileSizeMb) {
        this.logger.warn(`Attachment too large for OCR: ${filename} (${fileSizeMb.toFixed(1)}MB > ${this.maxFileSizeMb}MB)`);
        return null;
      }

      // Smart filtering: Skip small images (likely logos, icons, tracking pixels)
      if (this.isImageTooSmallForOcr(mimeType, buffer.length)) {
        this.logger.debug(
          `Skipping small image (${(buffer.length / 1024).toFixed(1)}KB < ${this.minImageSizeKb}KB): ${filename}`,
        );
        return null;
      }

      // 2. Convert to base64
      const base64 = buffer.toString('base64');

      // 3. Call Mistral OCR API
      const ocrResult = await this.callMistralOcr(base64, mimeType, filename);

      if (ocrResult) {
        this.logger.log(
          `Mistral OCR extracted ${ocrResult.text.length} chars from ${filename}` +
          (ocrResult.pageCount ? ` (${ocrResult.pageCount} pages)` : ''),
        );
      }

      return ocrResult;
    } catch (error) {
      this.logger.error(
        `Mistral OCR extraction failed for ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
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
  ): Promise<Array<{ attachmentId: string; filename: string; text: string }>> {
    if (!attachments.length) {
      return [];
    }

    const results = await Promise.allSettled(
      attachments.map(async (att) => {
        const result = await this.extractFromAttachment(att.storagePath, att.mimeType, att.filename);
        return {
          attachmentId: att.id,
          filename: att.filename,
          text: result?.text || '',
        };
      }),
    );

    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<{ attachmentId: string; filename: string; text: string }>).value)
      .filter((content) => content.text.length > 0);
  }

  /**
   * Call Mistral OCR API
   */
  private async callMistralOcr(
    base64Content: string,
    mimeType: string,
    filename: string,
  ): Promise<OcrExtractionResult | null> {
    // Determine document type for Mistral
    const documentType = this.getDocumentType(mimeType);

    const requestBody = {
      model: this.ocrModel,
      document: {
        type: 'base64',
        source: base64Content,
        // Include MIME type hint for better processing
        document_type: documentType,
      },
      // Request markdown output for better structure preservation
      include_image_base64: false,
    };

    const response = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.warn(`Mistral OCR API error for ${filename}: ${response.status} ${errorText}`);
      return null;
    }

    const result = await response.json();

    // Handle different response formats
    // Mistral OCR returns { pages: [...], text: "..." }
    if (result.text) {
      return {
        text: result.text,
        pageCount: result.pages?.length,
        confidence: result.confidence,
      };
    }

    // Fallback: concatenate page texts
    if (result.pages && Array.isArray(result.pages)) {
      const pageTexts = result.pages
        .map((page: { markdown?: string; text?: string }) => page.markdown || page.text || '')
        .filter(Boolean);

      if (pageTexts.length > 0) {
        return {
          text: pageTexts.join('\n\n---\n\n'),
          pageCount: result.pages.length,
        };
      }
    }

    this.logger.warn(`Mistral OCR returned empty result for ${filename}`);
    return null;
  }

  /**
   * Check if MIME type is supported for OCR
   */
  private isSupportedMimeType(mimeType: string): boolean {
    const normalizedMimeType = mimeType.split(';')[0].trim().toLowerCase();

    const supported = [
      // PDFs (scanned and text-based)
      'application/pdf',
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/tiff',
      'image/bmp',
      // Office documents (Mistral OCR supports these)
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
      'application/msword', // DOC
      'application/vnd.ms-excel', // XLS
      'application/vnd.ms-powerpoint', // PPT
    ];

    return supported.includes(normalizedMimeType);
  }

  /**
   * Get document type hint for Mistral OCR
   */
  private getDocumentType(mimeType: string): string {
    const normalizedMimeType = mimeType.split(';')[0].trim().toLowerCase();

    if (normalizedMimeType === 'application/pdf') {
      return 'pdf';
    }
    if (normalizedMimeType.startsWith('image/')) {
      return 'image';
    }
    if (normalizedMimeType.includes('word') || normalizedMimeType.includes('document')) {
      return 'document';
    }
    if (normalizedMimeType.includes('excel') || normalizedMimeType.includes('spreadsheet')) {
      return 'spreadsheet';
    }
    if (normalizedMimeType.includes('powerpoint') || normalizedMimeType.includes('presentation')) {
      return 'presentation';
    }

    return 'document'; // Default
  }

  /**
   * Check if MIME type is an image
   */
  private isImage(mimeType: string): boolean {
    const normalizedMimeType = mimeType.split(';')[0].trim().toLowerCase();
    return normalizedMimeType.startsWith('image/');
  }

  /**
   * Smart filter: Check if an image is likely irrelevant (logo, icon, signature, etc.)
   * This saves OCR costs by skipping small/decorative images.
   */
  private isLikelyIrrelevantImage(filename: string): boolean {
    // Check against common irrelevant patterns
    for (const pattern of this.irrelevantImagePatterns) {
      if (pattern.test(filename)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Additional size-based filtering for images
   * Called after downloading to check actual file size
   */
  private isImageTooSmallForOcr(mimeType: string, fileSizeBytes: number): boolean {
    if (!this.isImage(mimeType)) {
      return false; // Size check only for images, not PDFs/documents
    }

    const fileSizeKb = fileSizeBytes / 1024;
    if (fileSizeKb < this.minImageSizeKb) {
      return true; // Too small - likely icon/logo/tracking pixel
    }

    return false;
  }
}

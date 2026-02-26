/**
 * Document Library Controller
 *
 * REST API endpoints for managing document libraries and querying documents
 * using Mistral's document_library built-in RAG tool.
 *
 * Features:
 * - Library CRUD operations
 * - Document upload and management
 * - RAG-powered document queries
 *
 * @see https://docs.mistral.ai/agents/tools/built-in/document_library
 */
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Logger,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { QuotaGuard } from '../../../subscription/guards/quota.guard';
import { DocumentLibraryService, type DocumentLibrary, type LibraryDocument, type DocumentQueryResult } from '../services/document-library.service';
import { getErrorTranslations } from '../locales';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

// ============================================================================
// DTOs
// ============================================================================

class CreateLibraryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class QueryDocumentsDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  query!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  libraryIds?: string[];

  @IsOptional()
  @IsString()
  locale?: string;
}

// ============================================================================
// Controller
// ============================================================================

@ApiTags('Document Library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent/documents')
export class DocumentLibraryController {
  private readonly logger = new Logger(DocumentLibraryController.name);

  constructor(private readonly documentLibraryService: DocumentLibraryService) {}

  // ==========================================================================
  // Library Management
  // ==========================================================================

  /**
   * Create a new document library.
   */
  @Post('libraries')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a document library',
    description: 'Create a new document library for storing and querying documents with built-in RAG.',
  })
  async createLibrary(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateLibraryDto,
  ): Promise<{ success: boolean; library: DocumentLibrary }> {
    const { tenantId } = req.user;
    this.logger.log(`Creating document library "${dto.name}" for tenant ${tenantId}`);

    const library = await this.documentLibraryService.createLibrary(tenantId, dto);

    return { success: true, library };
  }

  /**
   * List all document libraries for the tenant.
   */
  @Get('libraries')
  @ApiOperation({
    summary: 'List document libraries',
    description: 'Get all document libraries for the current tenant.',
  })
  async listLibraries(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; libraries: DocumentLibrary[]; count: number }> {
    const { tenantId } = req.user;
    const libraries = await this.documentLibraryService.listLibraries(tenantId);

    return {
      success: true,
      libraries,
      count: libraries.length,
    };
  }

  /**
   * Get a specific library by ID.
   */
  @Get('libraries/:libraryId')
  @ApiOperation({
    summary: 'Get document library',
    description: 'Get details of a specific document library.',
  })
  async getLibrary(
    @Req() req: AuthenticatedRequest,
    @Param('libraryId') libraryId: string,
  ): Promise<{ success: boolean; library: DocumentLibrary }> {
    const { tenantId } = req.user;
    const library = await this.documentLibraryService.getLibrary(tenantId, libraryId);

    if (!library) {
      const t = getErrorTranslations('en');
      throw new NotFoundException(t.http.notFound.library);
    }

    return { success: true, library };
  }

  /**
   * Delete a document library.
   */
  @Delete('libraries/:libraryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete document library',
    description: 'Delete a document library and all its documents.',
  })
  async deleteLibrary(
    @Req() req: AuthenticatedRequest,
    @Param('libraryId') libraryId: string,
  ): Promise<{ success: boolean; message: string }> {
    const { tenantId } = req.user;
    this.logger.log(`Deleting document library ${libraryId} for tenant ${tenantId}`);

    await this.documentLibraryService.deleteLibrary(tenantId, libraryId);

    return { success: true, message: 'Library deleted successfully' };
  }

  // ==========================================================================
  // Document Management
  // ==========================================================================

  /**
   * Upload a document to a library.
   */
  @Post('libraries/:libraryId/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload document',
    description: 'Upload a document to a library. Supported formats: PDF, TXT, MD, DOC, DOCX.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadDocument(
    @Req() req: AuthenticatedRequest,
    @Param('libraryId') libraryId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ success: boolean; document: LibraryDocument }> {
    const { tenantId } = req.user;

    const t = getErrorTranslations('en');

    if (!file) {
      throw new BadRequestException(t.http.badRequest.noFile);
    }

    // Validate file type
    const allowedMimeTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        t.http.badRequest.unsupportedFileType(file.mimetype, 'PDF, TXT, MD, DOC, DOCX'),
      );
    }

    // Max file size: 10MB
    const maxSizeMb = 10;
    const maxSize = maxSizeMb * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(t.http.badRequest.fileTooLarge(maxSizeMb));
    }

    this.logger.log(`Uploading document "${file.originalname}" to library ${libraryId}`);

    const document = await this.documentLibraryService.uploadDocument(tenantId, {
      libraryId,
      filename: file.originalname,
      content: file.buffer,
      mimeType: file.mimetype,
    });

    return { success: true, document };
  }

  /**
   * List documents in a library.
   */
  @Get('libraries/:libraryId/documents')
  @ApiOperation({
    summary: 'List documents',
    description: 'Get all documents in a library.',
  })
  async listDocuments(
    @Req() req: AuthenticatedRequest,
    @Param('libraryId') libraryId: string,
  ): Promise<{ success: boolean; documents: LibraryDocument[]; count: number }> {
    const { tenantId } = req.user;
    const documents = await this.documentLibraryService.listDocuments(tenantId, libraryId);

    return {
      success: true,
      documents,
      count: documents.length,
    };
  }

  /**
   * Delete a document from a library.
   */
  @Delete('libraries/:libraryId/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete document',
    description: 'Delete a document from a library.',
  })
  async deleteDocument(
    @Req() req: AuthenticatedRequest,
    @Param('libraryId') libraryId: string,
    @Param('documentId') documentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const { tenantId } = req.user;
    this.logger.log(`Deleting document ${documentId} from library ${libraryId}`);

    await this.documentLibraryService.deleteDocument(tenantId, libraryId, documentId);

    return { success: true, message: 'Document deleted successfully' };
  }

  // ==========================================================================
  // Document Query (RAG)
  // ==========================================================================

  /**
   * Query documents using Mistral's built-in RAG.
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Query documents',
    description: `Query documents using Mistral's document_library RAG tool.

Features:
- Natural language questions
- Automatic chunking and embedding
- Citation support with document sources
- Multi-library search

Results are cached for 15 minutes.`,
  })
  async queryDocuments(
    @Req() req: AuthenticatedRequest,
    @Body() dto: QueryDocumentsDto,
  ): Promise<{ success: boolean; result: DocumentQueryResult }> {
    const { tenantId } = req.user;
    this.logger.log(`Document query: "${dto.query.substring(0, 50)}..." for tenant ${tenantId}`);

    const result = await this.documentLibraryService.queryDocuments(
      tenantId,
      dto.query,
      dto.libraryIds,
      dto.locale || 'en',
    );

    return { success: true, result };
  }

  /**
   * Get service status.
   */
  @Get('status')
  @ApiOperation({
    summary: 'Get document library service status',
    description: 'Check if the document library service is enabled and configured.',
  })
  async getStatus(): Promise<{
    success: boolean;
    enabled: boolean;
    features: string[];
  }> {
    return {
      success: true,
      enabled: true,
      features: [
        'document_library_rag',
        'automatic_chunking',
        'citation_support',
        'multi_library_search',
        'pdf_support',
        'text_support',
      ],
    };
  }
}

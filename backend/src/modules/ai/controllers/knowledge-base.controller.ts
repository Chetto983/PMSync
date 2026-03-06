import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../modules/auth/guards/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../subscription/guards/quota.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { KnowledgeBaseService, type KnowledgeBaseSearchHit } from '../services/knowledge-base.service';
import { getErrorTranslations } from '../locales';
import {
  BackfillEmailsDto,
  ListEmbeddingsQueryDto,
  TenantScopedQueryDto,
  SearchKnowledgeBaseDto,
} from '../dto/knowledge-base.dto';

@ApiTags('AI Knowledge Base')
@ApiBearerAuth()
@Controller('ai/knowledge-base')
@UseGuards(TenantGuard, QuotaGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post('emails/backfill')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Backfill embeddings for emails that are missing vector representations' })
  @ApiOkResponse({
    schema: {
      properties: {
        success: { type: 'boolean' },
        processed: { type: 'number' },
        embedded: { type: 'number' },
        skipped: { type: 'number' },
        remaining: { type: 'number' },
      },
    },
  })
  async backfillEmails(@Request() req: AuthenticatedRequest, @Body() body: BackfillEmailsDto) {
    this.ensureAdmin(req.user.role);

    const targetTenantId = this.resolveTenantId(req, body.tenantId);

    const result = await this.knowledgeBaseService.backfillEmailEmbeddingsForTenant(targetTenantId, {
      limit: body.limit,
      batchSize: body.batchSize,
      includeDeleted: body.includeDeleted,
    });

    return {
      success: true,
      ...result,
    };
  }

  @Get('embeddings')
  @ApiOperation({ summary: 'List embeddings stored for the tenant knowledge base' })
  @ApiOkResponse({
    schema: {
      properties: {
        success: { type: 'boolean' },
        total: { type: 'number' },
        items: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async listEmbeddings(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListEmbeddingsQueryDto,
  ) {
    this.ensureAdmin(req.user.role);
    const targetTenantId = this.resolveTenantId(req, query.tenantId);

    const result = await this.knowledgeBaseService.listEmbeddings(targetTenantId, {
      limit: query.limit,
      offset: query.offset,
    });

    return {
      success: true,
      items: result.items,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.items.length < result.total,
      },
    };
  }

  @Delete('embeddings/:id')
  @ApiOperation({ summary: 'Delete a specific embedding entry' })
  async deleteEmbedding(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: TenantScopedQueryDto,
  ) {
    this.ensureAdmin(req.user.role);
    const targetTenantId = this.resolveTenantId(req, query.tenantId);

    await this.knowledgeBaseService.deleteEmbedding(targetTenantId, id);

    return {
      success: true,
      deleted: id,
    };
  }

  @Delete('embeddings/email/:emailId')
  @ApiOperation({ summary: 'Purge embeddings associated with a specific email' })
  async deleteEmbeddingsForEmail(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Query() query: TenantScopedQueryDto,
  ) {
    this.ensureAdmin(req.user.role);
    const targetTenantId = this.resolveTenantId(req, query.tenantId);

    const count = await this.knowledgeBaseService.deleteEmbeddingsForEmail(targetTenantId, emailId);

    return {
      success: true,
      purged: count,
      emailId,
    };
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Search the tenant knowledge base using semantic similarity (RAG memory)',
  })
  async searchKnowledgeBase(
    @Request() req: AuthenticatedRequest,
    @Body() body: SearchKnowledgeBaseDto,
  ): Promise<{ success: true; usedQuery: string; items: KnowledgeBaseSearchHit[] }> {
    const result = await this.knowledgeBaseService.searchKnowledgeBase({
      tenantId: req.user.tenantId,
      query: body.query,
      emailId: body.emailId,
      limit: body.limit,
    });

    return {
      success: true,
      ...result,
    };
  }

  private ensureAdmin(role: string) {
    if (role !== 'admin' && role !== 'super-admin') {
      const t = getErrorTranslations('en');
      throw new ForbiddenException(t.http.forbidden.admin);
    }
  }

  private resolveTenantId(req: AuthenticatedRequest, requestedTenantId?: string): string {
    if (!requestedTenantId || requestedTenantId === req.user.tenantId) {
      return req.user.tenantId;
    }

    if (req.user.role !== 'super-admin') {
      const t = getErrorTranslations('en');
      throw new ForbiddenException(t.http.forbidden.crossTenant);
    }

    return requestedTenantId;
  }
}

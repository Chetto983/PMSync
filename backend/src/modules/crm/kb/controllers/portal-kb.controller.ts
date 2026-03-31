import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../../../common/auth/public.decorator';
import { PrismaService } from '../../../../prisma/prisma.service';
import { KBService } from '../services/kb.service';
import { SearchArticlesQueryDto } from '../dto/kb.dto';

/**
 * Public portal KB controller — no auth required.
 * Resolves tenant from URL slug parameter.
 * Only exposes published articles.
 */
@ApiTags('Portal - Knowledge Base')
@Public()
@Controller('portal/:tenantSlug/kb')
export class PortalKBController {
  constructor(
    private readonly kbService: KBService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveTenantId(slug: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });
    if (!tenant || !tenant.isActive) {
      throw new NotFoundException(`Portal not found`);
    }
    return tenant.id;
  }

  @Get('categories')
  @ApiOperation({ summary: 'Public: List KB categories with article counts' })
  @ApiResponse({ status: 200, description: 'Categories returned' })
  async listCategories(@Param('tenantSlug') tenantSlug: string) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.kbService.listCategories(tenantId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Public: Full-text search published KB articles' })
  @ApiResponse({ status: 200, description: 'Search results returned' })
  async search(
    @Param('tenantSlug') tenantSlug: string,
    @Query() query: SearchArticlesQueryDto,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.kbService.searchArticles(tenantId, query);
  }

  @Get('articles')
  @ApiOperation({ summary: 'Public: List published KB articles' })
  @ApiResponse({ status: 200, description: 'Published articles returned' })
  async listArticles(
    @Param('tenantSlug') tenantSlug: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    return this.kbService.listArticles(tenantId, {
      status: 'published',
      categoryId,
    });
  }

  @Get('articles/:slug')
  @ApiOperation({ summary: 'Public: Get published KB article by slug' })
  @ApiResponse({ status: 200, description: 'Article returned' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticle(
    @Param('tenantSlug') tenantSlug: string,
    @Param('slug') slug: string,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);
    const article = await this.kbService.findArticleBySlug(tenantId, slug);
    if (article.status !== 'published') {
      throw new NotFoundException('Article not found');
    }
    return article;
  }
}

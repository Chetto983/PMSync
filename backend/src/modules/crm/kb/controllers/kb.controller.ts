import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { KBService } from '../services/kb.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateArticleDto,
  UpdateArticleDto,
  ListArticlesQueryDto,
  SearchArticlesQueryDto,
} from '../dto/kb.dto';

@ApiTags('CRM - Knowledge Base')
@ApiCookieAuth()
@Controller('crm/kb')
@UseGuards(TenantGuard, RolesGuard)
export class KBController {
  constructor(private readonly kbService: KBService) {}

  // ─── Categories ───

  @Get('categories')
  @ApiOperation({ summary: 'List KB categories with article counts' })
  @ApiResponse({ status: 200, description: 'Categories returned' })
  async listCategories(@Req() req: any) {
    return this.kbService.listCategories(req.user.tenantId);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create KB category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  async createCategory(@Req() req: any, @Body() dto: CreateCategoryDto) {
    return this.kbService.createCategory(req.user.tenantId, dto);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Update KB category' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.kbService.updateCategory(req.user.tenantId, id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete KB category' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  async deleteCategory(@Req() req: any, @Param('id') id: string) {
    return this.kbService.deleteCategory(req.user.tenantId, id);
  }

  // ─── Articles ───

  @Get('articles')
  @ApiOperation({ summary: 'List KB articles with filters' })
  @ApiResponse({ status: 200, description: 'Articles returned' })
  async listArticles(@Req() req: any, @Query() query: ListArticlesQueryDto) {
    return this.kbService.listArticles(req.user.tenantId, query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Full-text search KB articles' })
  @ApiResponse({ status: 200, description: 'Search results returned' })
  async searchArticles(@Req() req: any, @Query() query: SearchArticlesQueryDto) {
    return this.kbService.searchArticles(req.user.tenantId, query);
  }

  @Get('articles/:slug')
  @ApiOperation({ summary: 'Get KB article by slug' })
  @ApiResponse({ status: 200, description: 'Article returned' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async findBySlug(@Req() req: any, @Param('slug') slug: string) {
    return this.kbService.findArticleBySlug(req.user.tenantId, slug);
  }

  @Post('articles')
  @ApiOperation({ summary: 'Create KB article' })
  @ApiResponse({ status: 201, description: 'Article created' })
  async createArticle(@Req() req: any, @Body() dto: CreateArticleDto) {
    return this.kbService.createArticle(req.user.tenantId, req.user.id, dto);
  }

  @Patch('articles/:id')
  @ApiOperation({ summary: 'Update KB article' })
  @ApiResponse({ status: 200, description: 'Article updated' })
  async updateArticle(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.kbService.updateArticle(req.user.tenantId, id, dto);
  }

  @Delete('articles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete KB article' })
  @ApiResponse({ status: 200, description: 'Article deleted' })
  async deleteArticle(@Req() req: any, @Param('id') id: string) {
    return this.kbService.deleteArticle(req.user.tenantId, id);
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateArticleDto,
  UpdateArticleDto,
  ListArticlesQueryDto,
  SearchArticlesQueryDto,
} from '../dto/kb.dto';

@Injectable()
export class KBService {
  private readonly logger = new Logger(KBService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Categories ───

  async listCategories(tenantId: string) {
    const categories = await this.prisma.kBCategory.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { articles: true } },
        children: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: { _count: { select: { articles: true } } },
        },
      },
    });

    return categories;
  }

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    const slug = this.generateSlug(dto.name);

    try {
      return await this.prisma.kBCategory.create({
        data: {
          tenantId,
          name: dto.name,
          slug,
          description: dto.description,
          parentId: dto.parentId,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Category with slug "${slug}" already exists`,
        );
      }
      throw error;
    }
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.kBCategory.findFirst({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);

    const data: Prisma.KBCategoryUncheckedUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
      data.slug = this.generateSlug(dto.name);
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.parentId !== undefined) data.parentId = dto.parentId;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    try {
      return await this.prisma.kBCategory.update({ where: { id, tenantId }, data });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Category slug already exists`);
      }
      throw error;
    }
  }

  async deleteCategory(tenantId: string, id: string) {
    const category = await this.prisma.kBCategory.findFirst({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);

    await this.prisma.kBCategory.delete({ where: { id, tenantId } });
    return { deleted: true };
  }

  // ─── Articles ───

  async listArticles(tenantId: string, query: ListArticlesQueryDto) {
    const where: Prisma.KBArticleWhereInput = { tenantId };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status) where.status = query.status;
    if (query.tag) where.tags = { has: query.tag };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.kBArticle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 25,
        skip: query.offset ?? 0,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          author: { select: { id: true, name: true } },
        },
      }),
      this.prisma.kBArticle.count({ where }),
    ]);

    return { data, total };
  }

  async findArticleBySlug(tenantId: string, slug: string) {
    const article = await this.prisma.kBArticle.findFirst({
      where: { tenantId, slug },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        author: { select: { id: true, name: true } },
      },
    });
    if (!article) throw new NotFoundException(`Article "${slug}" not found`);
    return article;
  }

  async findArticleById(tenantId: string, id: string) {
    const article = await this.prisma.kBArticle.findFirst({
      where: { id, tenantId },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        author: { select: { id: true, name: true } },
      },
    });
    if (!article) throw new NotFoundException(`Article ${id} not found`);
    return article;
  }

  async createArticle(tenantId: string, authorId: string, dto: CreateArticleDto) {
    const slug = this.generateSlug(dto.title);
    const isPublished = dto.status === 'published';

    try {
      return await this.prisma.kBArticle.create({
        data: {
          tenantId,
          title: dto.title,
          slug,
          body: dto.body,
          categoryId: dto.categoryId,
          tags: dto.tags ?? [],
          status: dto.status ?? 'draft',
          authorId,
          publishedAt: isPublished ? new Date() : null,
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          author: { select: { id: true, name: true } },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Article with slug "${slug}" already exists`,
        );
      }
      throw error;
    }
  }

  async updateArticle(tenantId: string, id: string, dto: UpdateArticleDto) {
    const existing = await this.findArticleById(tenantId, id);

    const data: Prisma.KBArticleUncheckedUpdateInput = {};
    if (dto.title !== undefined) {
      data.title = dto.title;
      data.slug = this.generateSlug(dto.title);
    }
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'published' && existing.status !== 'published') {
        data.publishedAt = new Date();
      }
    }

    try {
      return await this.prisma.kBArticle.update({
        where: { id, tenantId },
        data,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          author: { select: { id: true, name: true } },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Article slug already exists`);
      }
      throw error;
    }
  }

  async deleteArticle(tenantId: string, id: string) {
    await this.findArticleById(tenantId, id);
    await this.prisma.kBArticle.delete({ where: { id, tenantId } });
    return { deleted: true };
  }

  // ─── Full-Text Search (T-1705) ───

  async searchArticles(tenantId: string, query: SearchArticlesQueryDto) {
    const limit = query.limit ?? 10;
    const searchTerm = query.q.trim();

    if (!searchTerm) return { data: [], total: 0 };

    const results = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        slug: string;
        snippet: string;
        category_name: string | null;
        category_slug: string | null;
        relevance: number;
      }>
    >`
      SELECT
        a.id,
        a.title,
        a.slug,
        ts_headline('simple', a.body, plainto_tsquery('simple', ${searchTerm}),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=40, MinWords=20'
        ) AS snippet,
        c.name AS category_name,
        c.slug AS category_slug,
        ts_rank(a.search_vector, plainto_tsquery('simple', ${searchTerm})) AS relevance
      FROM kb_articles a
      LEFT JOIN kb_categories c ON c.id = a."categoryId"
      WHERE a."tenantId" = ${tenantId}
        AND a.status = 'published'
        AND a.search_vector @@ plainto_tsquery('simple', ${searchTerm})
      ORDER BY relevance DESC
      LIMIT ${limit}
    `;

    return {
      data: results.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        snippet: r.snippet,
        category: r.category_name
          ? { name: r.category_name, slug: r.category_slug }
          : null,
        relevance: Number(r.relevance),
      })),
      total: results.length,
    };
  }

  // ─── Helpers ───

  private generateSlug(text: string): string {
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || `kb-${Date.now()}`;
  }
}

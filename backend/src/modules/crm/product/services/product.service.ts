import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from '../dto/product.dto';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListProductsQueryDto) {
    const where: Prisma.CrmProductWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.crmProduct.findMany({
        where,
        orderBy: { name: 'asc' },
        take: query.limit ?? 25,
        skip: query.offset ?? 0,
      }),
      this.prisma.crmProduct.count({ where }),
    ]);

    return { data, total };
  }

  async findById(tenantId: string, id: string) {
    const product = await this.prisma.crmProduct.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return product;
  }

  async create(tenantId: string, dto: CreateProductDto) {
    try {
      return await this.prisma.crmProduct.create({
        data: {
          tenantId,
          name: dto.name,
          code: dto.code,
          description: dto.description,
          price: dto.price,
          currency: dto.currency,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Product with code "${dto.code}" already exists`,
        );
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    await this.findById(tenantId, id);

    try {
      return await this.prisma.crmProduct.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.code !== undefined && { code: dto.code }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.currency !== undefined && { currency: dto.currency }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Product with code "${dto.code}" already exists`,
        );
      }
      throw error;
    }
  }

  async delete(tenantId: string, id: string) {
    await this.findById(tenantId, id);

    await this.prisma.crmProduct.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { deleted: true };
  }
}

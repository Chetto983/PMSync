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
import { ProductService } from '../services/product.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from '../dto/product.dto';

@ApiTags('CRM - Products')
@ApiCookieAuth()
@Controller('crm/products')
@UseGuards(TenantGuard, RolesGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'List products with filters' })
  @ApiResponse({ status: 200, description: 'Products returned successfully' })
  async list(@Req() req: any, @Query() query: ListProductsQueryDto) {
    return this.productService.list(req.user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product returned' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findById(@Req() req: any, @Param('id') id: string) {
    return this.productService.findById(req.user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 409, description: 'Product code already exists' })
  async create(@Req() req: any, @Body() dto: CreateProductDto) {
    return this.productService.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete product' })
  @ApiResponse({ status: 200, description: 'Product soft-deleted' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.productService.delete(req.user.tenantId, id);
  }
}

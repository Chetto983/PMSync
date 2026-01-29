/**
 * Memory Controller - REST API for Frontend Memory UI
 *
 * Provides endpoints for the Memory page to display, search, and manage memories.
 * Uses AIMemoryService for storage operations.
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../../subscription/guards/quota.guard';
import { AIMemoryService, type StoreMemoryInput } from '../services/ai-memory.service';
import { MemoryType } from '@prisma/client';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    sub: string;
  };
}

@ApiTags('VoltAgent Memory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent/memory')
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);

  constructor(private readonly memoryService: AIMemoryService) {}

  /**
   * Get memories by type
   */
  @Get()
  @ApiOperation({ summary: 'Get user memories by type' })
  async getMemories(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: MemoryType,
    @Query('limit') limit?: string,
  ) {
    const { tenantId, userId } = req.user;

    const memories = await this.memoryService.getMemories(
      tenantId,
      userId,
      {
        type,
        limit: limit ? parseInt(limit, 10) : 100,
      }
    );

    return {
      success: true,
      memories,
      total: memories.length,
    };
  }

  /**
   * Search memories semantically
   */
  @Get('search')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Search memories by query' })
  async searchMemories(
    @Req() req: AuthenticatedRequest,
    @Query('query') query: string,
    @Query('limit') limit?: string,
  ) {
    const { tenantId, userId } = req.user;

    if (!query) {
      return { success: true, memories: [], total: 0 };
    }

    const memories = await this.memoryService.searchMemoriesSemantic(
      tenantId,
      userId,
      query,
      limit ? parseInt(limit, 10) : 10,
    );

    return {
      success: true,
      memories,
      total: memories.length,
    };
  }

  /**
   * Store a new memory
   */
  @Post()
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Store a new memory' })
  async storeMemory(
    @Req() req: AuthenticatedRequest,
    @Body() body: { content: string; type?: MemoryType },
  ) {
    const { tenantId, userId } = req.user;

    const memory = await this.memoryService.storeMemory(
      tenantId,
      userId,
      {
        content: body.content,
        type: body.type || MemoryType.FACT,
        source: 'EXPLICIT',
        confidence: 1.0,
      } as StoreMemoryInput,
    );

    return {
      success: true,
      memory,
    };
  }

  /**
   * Delete a specific memory
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a memory' })
  async deleteMemory(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const { tenantId, userId } = req.user;

    await this.memoryService.deleteMemory(tenantId, userId, id);

    return {
      success: true,
      message: 'Memory deleted',
    };
  }

  /**
   * Clear all memories for user
   */
  @Delete()
  @ApiOperation({ summary: 'Clear all memories' })
  async clearAllMemories(@Req() req: AuthenticatedRequest) {
    const { tenantId, userId } = req.user;

    const count = await this.memoryService.clearAllMemories(tenantId, userId);

    return {
      success: true,
      message: 'All memories cleared',
      count,
    };
  }
}

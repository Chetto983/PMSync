/**
 * Memory Controller
 * Phase 9e: Extracted from voltagent.controller.ts (2026-01-23)
 *
 * Handles AI memory CRUD operations.
 */
import {
  Controller,
  Post,
  Get,
  Put,
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
import { QuotaGuard } from '../../../subscription/guards/quota.guard';
import { AIMemoryService } from '../services/ai-memory.service';
import type { MemoryType } from '@prisma/client';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

@ApiTags('VoltAgent Memory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent')
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);

  constructor(private readonly aiMemoryService: AIMemoryService) {}

  /**
   * List user memories with optional filtering.
   */
  @Get('memory')
  @ApiOperation({ summary: 'List user memories' })
  async listMemories(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const memories = await this.aiMemoryService.getMemories(
      req.user.tenantId,
      req.user.userId,
      {
        type: type as MemoryType | undefined,
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
      },
    );

    return {
      success: true,
      memories,
      total: memories.length,
    };
  }

  /**
   * Search memories by content.
   */
  @Get('memory/search')
  @ApiOperation({ summary: 'Search user memories' })
  async searchMemories(
    @Req() req: AuthenticatedRequest,
    @Query('query') query: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      return { success: true, memories: [], total: 0 };
    }

    const memories = await this.aiMemoryService.searchMemories(
      req.user.tenantId,
      req.user.userId,
      query,
      limit ? parseInt(limit, 10) : 50,
    );

    return {
      success: true,
      memories,
      total: memories.length,
    };
  }

  /**
   * Get memory statistics for the user.
   */
  @Get('memory/stats')
  @ApiOperation({ summary: 'Get memory statistics' })
  async getMemoryStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.aiMemoryService.getStats(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      ...stats,
    };
  }

  /**
   * Get procedural patterns (learned task workflows).
   */
  @Get('memory/patterns')
  @ApiOperation({ summary: 'Get procedural patterns' })
  async getPatterns(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const patterns = await this.aiMemoryService.getPatterns(
      req.user.tenantId,
      req.user.userId,
      limit ? parseInt(limit, 10) : 20,
    );

    return {
      success: true,
      patterns,
    };
  }

  /**
   * Get history for a specific memory.
   */
  @Get('memory/:id/history')
  @ApiOperation({ summary: 'Get memory change history' })
  async getMemoryHistory(
    @Req() req: AuthenticatedRequest,
    @Param('id') memoryId: string,
  ) {
    const history = await this.aiMemoryService.getMemoryHistory(
      req.user.tenantId,
      req.user.userId,
      memoryId,
    );

    return {
      success: true,
      history,
    };
  }

  /**
   * Store a new memory.
   */
  @Post('memory')
  @ApiOperation({ summary: 'Store a new memory' })
  async storeMemory(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      content: string;
      type: MemoryType;
      source?: 'EXPLICIT' | 'INFERRED' | 'CONVERSATION';
      category?: string;
      tags?: string[];
      confidence?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    const memory = await this.aiMemoryService.storeMemory(
      req.user.tenantId,
      req.user.userId,
      body,
    );

    return {
      success: true,
      memory,
    };
  }

  /**
   * Update an existing memory.
   */
  @Put('memory/:id')
  @ApiOperation({ summary: 'Update a memory' })
  async updateMemory(
    @Req() req: AuthenticatedRequest,
    @Param('id') memoryId: string,
    @Body()
    body: {
      content?: string;
      type?: MemoryType;
      category?: string;
      tags?: string[];
      confidence?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    const memory = await this.aiMemoryService.updateMemory(
      req.user.tenantId,
      req.user.userId,
      memoryId,
      body,
    );

    return {
      success: true,
      memory,
    };
  }

  /**
   * Delete a specific memory.
   */
  @Delete('memory/:id')
  @ApiOperation({ summary: 'Delete a memory' })
  async deleteMemory(
    @Req() req: AuthenticatedRequest,
    @Param('id') memoryId: string,
  ) {
    await this.aiMemoryService.deleteMemory(
      req.user.tenantId,
      req.user.userId,
      memoryId,
    );

    return {
      success: true,
      message: 'Memory deleted',
    };
  }

  /**
   * Clear all memories for the user (GDPR compliance).
   */
  @Delete('memory')
  @ApiOperation({ summary: 'Clear all memories' })
  async clearAllMemories(@Req() req: AuthenticatedRequest) {
    const count = await this.aiMemoryService.clearAllMemories(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      message: `Cleared ${count} memories`,
      count,
    };
  }
}

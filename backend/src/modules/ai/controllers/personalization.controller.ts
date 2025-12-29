import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import {
  PersonalizationService,
  MemoryType,
  UserPersonalizationProfile,
} from '../voltagent/services/personalization.service';

/**
 * DTO for storing a new memory
 */
class StoreMemoryDto {
  @IsString()
  content: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  source?: 'EXPLICIT' | 'INFERRED' | 'BEHAVIOR';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

/**
 * DTO for searching memories
 */
class SearchMemoriesDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number;
}

/**
 * DTO for learning from interaction
 */
class LearnInteractionDto {
  @IsString()
  action: string;

  @IsString()
  context: string;

  @IsString()
  outcome: 'positive' | 'negative' | 'neutral';
}

/**
 * DTO for updating user profile
 */
class UpdateProfileDto {
  @IsOptional()
  @IsString()
  jobRole?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  companySize?: string;

  @IsOptional()
  @IsString()
  communicationStyle?: string;

  @IsOptional()
  @IsString()
  responseLength?: string;

  @IsOptional()
  @IsString()
  proactivityLevel?: string;

  @IsOptional()
  @IsString()
  workingHoursStart?: string;

  @IsOptional()
  @IsString()
  workingHoursEnd?: string;

  @IsOptional()
  workingDays?: string[];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

@ApiTags('AI Personalization')
@ApiBearerAuth()
@Controller('ai/personalization')
@UseGuards(JwtAuthGuard, TenantGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PersonalizationController {
  constructor(private readonly personalizationService: PersonalizationService) {}

  /**
   * Get user's personalization profile
   * GET /ai/personalization/profile
   */
  @Get('profile')
  @ApiOperation({ summary: 'Get personalization profile' })
  @ApiResponse({ status: 200, description: 'Returns user personalization profile' })
  async getProfile(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; profile: UserPersonalizationProfile | null }> {
    const profile = await this.personalizationService.getUserProfile(
      req.user.tenantId,
      req.user.userId,
    );
    return { success: true, profile };
  }

  /**
   * Update user's personalization profile
   * PATCH /ai/personalization/profile
   */
  @Patch('profile')
  @ApiOperation({ summary: 'Update personalization profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<{ success: boolean; profile: UserPersonalizationProfile }> {
    const profile = await this.personalizationService.updateUserProfile(
      req.user.tenantId,
      req.user.userId,
      dto as Partial<UserPersonalizationProfile>,
    );
    return { success: true, profile };
  }

  /**
   * Get personalization context for AI
   * POST /ai/personalization/context
   */
  @Post('context')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get personalization context for AI interactions' })
  @ApiResponse({ status: 200, description: 'Returns personalization context' })
  async getContext(
    @Request() req: AuthenticatedRequest,
    @Body() body: { query?: string },
  ) {
    const context = await this.personalizationService.getPersonalizationContext(
      req.user.tenantId,
      req.user.userId,
      body.query,
    );
    return { success: true, context };
  }

  /**
   * Store a new memory
   * POST /ai/personalization/memories
   */
  @Post('memories')
  @ApiOperation({ summary: 'Store a new memory' })
  @ApiResponse({ status: 201, description: 'Memory stored successfully' })
  async storeMemory(
    @Request() req: AuthenticatedRequest,
    @Body() dto: StoreMemoryDto,
  ) {
    const memoryId = await this.personalizationService.storeMemory(
      req.user.tenantId,
      req.user.userId,
      dto.content,
      dto.type as MemoryType,
      {
        category: dto.category,
        source: dto.source,
        confidence: dto.confidence,
      },
    );
    return { success: true, memoryId };
  }

  /**
   * Search memories using semantic similarity
   * POST /ai/personalization/memories/search
   */
  @Post('memories/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search memories using semantic similarity' })
  @ApiResponse({ status: 200, description: 'Returns matching memories' })
  async searchMemories(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SearchMemoriesDto,
  ) {
    const memories = await this.personalizationService.getRelevantMemories(
      req.user.tenantId,
      req.user.userId,
      dto.query,
      dto.limit || 5,
    );
    return { success: true, memories };
  }

  /**
   * Get memories by type
   * GET /ai/personalization/memories/:type
   */
  @Get('memories/:type')
  @ApiOperation({ summary: 'Get memories by type' })
  @ApiParam({ name: 'type', enum: ['PREFERENCE', 'FACT', 'PATTERN', 'INTERACTION', 'CONTACT_NOTE'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Returns memories of specified type' })
  async getMemoriesByType(
    @Request() req: AuthenticatedRequest,
    @Param('type') type: string,
    @Query('limit') limit?: number,
  ) {
    const memories = await this.personalizationService.getMemoriesByType(
      req.user.tenantId,
      req.user.userId,
      type as MemoryType,
      limit || 20,
    );
    return { success: true, memories };
  }

  /**
   * Delete a specific memory
   * DELETE /ai/personalization/memories/:id
   */
  @Delete('memories/:id')
  @ApiOperation({ summary: 'Delete a specific memory' })
  @ApiParam({ name: 'id', description: 'Memory ID' })
  @ApiResponse({ status: 200, description: 'Memory deleted' })
  async deleteMemory(
    @Request() req: AuthenticatedRequest,
    @Param('id') memoryId: string,
  ) {
    const deleted = await this.personalizationService.deleteMemory(
      req.user.tenantId,
      req.user.userId,
      memoryId,
    );
    return { success: deleted };
  }

  /**
   * Clear all memories
   * DELETE /ai/personalization/memories
   */
  @Delete('memories')
  @ApiOperation({ summary: 'Clear all user memories' })
  @ApiResponse({ status: 200, description: 'All memories cleared' })
  async clearAllMemories(@Request() req: AuthenticatedRequest) {
    const count = await this.personalizationService.clearAllMemories(
      req.user.tenantId,
      req.user.userId,
    );
    return { success: true, deletedCount: count };
  }

  /**
   * Learn from user interaction
   * POST /ai/personalization/learn
   */
  @Post('learn')
  @ApiOperation({ summary: 'Learn from user interaction' })
  @ApiResponse({ status: 200, description: 'Interaction recorded' })
  async learnFromInteraction(
    @Request() req: AuthenticatedRequest,
    @Body() dto: LearnInteractionDto,
  ) {
    await this.personalizationService.learnFromInteraction(
      req.user.tenantId,
      req.user.userId,
      dto,
    );
    return { success: true };
  }

  /**
   * Check if user is within working hours
   * GET /ai/personalization/working-hours
   */
  @Get('working-hours')
  @ApiOperation({ summary: 'Check if user is within working hours' })
  @ApiResponse({ status: 200, description: 'Returns working hours status' })
  async checkWorkingHours(@Request() req: AuthenticatedRequest) {
    const profile = await this.personalizationService.getUserProfile(
      req.user.tenantId,
      req.user.userId,
    );

    if (!profile) {
      return { success: true, withinWorkingHours: true, reason: 'No profile set' };
    }

    const withinWorkingHours = this.personalizationService.isWithinWorkingHours(profile);
    return {
      success: true,
      withinWorkingHours,
      workingHours: {
        start: profile.workingHoursStart,
        end: profile.workingHoursEnd,
        days: profile.workingDays,
      },
    };
  }
}

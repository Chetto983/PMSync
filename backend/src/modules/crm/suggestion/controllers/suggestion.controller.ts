import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { CrmSuggestionService } from '../services/crm-suggestion.service';
import { EmailSuggestionGeneratorService } from '../services/email-suggestion-generator.service';
import {
  ListSuggestionsQueryDto,
  BulkSuggestionDto,
} from '../dto/suggestion.dto';

@ApiTags('CRM - Suggestions')
@ApiCookieAuth()
@Controller('crm/suggestions')
@UseGuards(TenantGuard, RolesGuard)
export class SuggestionController {
  constructor(
    private readonly suggestionService: CrmSuggestionService,
    private readonly emailSuggestionGenerator: EmailSuggestionGeneratorService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List CRM suggestions (default: pending)' })
  @ApiResponse({ status: 200, description: 'Suggestions returned' })
  async list(@Req() req: any, @Query() query: ListSuggestionsQueryDto) {
    return this.suggestionService.list(req.user.tenantId, query);
  }

  @Get('for-email/:emailId')
  @ApiOperation({ summary: 'Get or generate suggestions for a specific email' })
  @ApiResponse({ status: 200, description: 'Suggestions returned' })
  async forEmail(@Req() req: any, @Param('emailId') emailId: string) {
    return this.emailSuggestionGenerator.getOrGenerate(req.user.tenantId, emailId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single suggestion' })
  @ApiResponse({ status: 200, description: 'Suggestion returned' })
  async findById(@Req() req: any, @Param('id') id: string) {
    return this.suggestionService.findById(req.user.tenantId, id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept suggestion — creates the CRM entity' })
  @ApiResponse({ status: 200, description: 'Suggestion accepted, entity created' })
  async accept(@Req() req: any, @Param('id') id: string) {
    return this.suggestionService.accept(req.user.tenantId, id, req.user.id);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a suggestion' })
  @ApiResponse({ status: 200, description: 'Suggestion dismissed' })
  async dismiss(@Req() req: any, @Param('id') id: string) {
    return this.suggestionService.dismiss(req.user.tenantId, id);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk accept or dismiss suggestions' })
  @ApiResponse({ status: 200, description: 'Bulk operation result' })
  async bulk(@Req() req: any, @Body() dto: BulkSuggestionDto) {
    return this.suggestionService.bulk(req.user.tenantId, dto, req.user.id);
  }
}

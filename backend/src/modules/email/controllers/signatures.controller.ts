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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailSignatureService } from '../services/email-signature.service';
import { CreateSignatureDto, UpdateSignatureDto, SignatureResponseDto } from '../dto/signature.dto';
import { AuthenticatedRequest } from '../../../common/types/request.types';

@ApiTags('Email Signatures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('emails/signatures')
export class SignaturesController {
  constructor(private signatureService: EmailSignatureService) {}

  @Get()
  @ApiOperation({ summary: 'List all signatures' })
  @ApiQuery({ name: 'providerId', required: false, description: 'Filter by provider ID' })
  @ApiResponse({ status: 200, type: [SignatureResponseDto] })
  async findAll(@Request() req: AuthenticatedRequest, @Query('providerId') providerId?: string) {
    return this.signatureService.findAll(req.user.tenantId, req.user.id, providerId);
  }

  @Get('default')
  @ApiOperation({ summary: 'Get default signature' })
  @ApiQuery({ name: 'providerId', required: false, description: 'Provider ID for provider-specific default' })
  @ApiResponse({ status: 200, type: SignatureResponseDto })
  async findDefault(@Request() req: AuthenticatedRequest, @Query('providerId') providerId?: string) {
    return this.signatureService.findDefault(req.user.tenantId, req.user.id, providerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a signature by ID' })
  @ApiResponse({ status: 200, type: SignatureResponseDto })
  async findOne(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.signatureService.findOne(req.user.tenantId, req.user.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new signature' })
  @ApiResponse({ status: 201, type: SignatureResponseDto })
  async create(@Request() req: AuthenticatedRequest, @Body() dto: CreateSignatureDto) {
    return this.signatureService.create(req.user.tenantId, req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a signature' })
  @ApiResponse({ status: 200, type: SignatureResponseDto })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSignatureDto,
  ) {
    return this.signatureService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a signature' })
  @ApiResponse({ status: 200 })
  async delete(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.signatureService.delete(req.user.tenantId, req.user.id, id);
  }

  @Post(':id/set-default')
  @ApiOperation({ summary: 'Set signature as default' })
  @ApiResponse({ status: 200, type: SignatureResponseDto })
  async setDefault(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.signatureService.setDefault(req.user.tenantId, req.user.id, id);
  }
}

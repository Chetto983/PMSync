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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { AccountService } from '../services/account.service';
import { CreateAccountDto, UpdateAccountDto, ListAccountsQueryDto } from '../dto/account.dto';

@ApiTags('CRM - Accounts')
@ApiBearerAuth()
@Controller('crm/accounts')
@UseGuards(TenantGuard, RolesGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  @ApiOperation({ summary: 'List accounts' })
  @ApiResponse({ status: 200, description: 'Accounts returned successfully' })
  async list(@Req() req: any, @Query() query: ListAccountsQueryDto) {
    const tenantId = req.user.tenantId;
    return this.accountService.list(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiResponse({ status: 200, description: 'Account returned' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findById(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.findById(tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  async create(@Req() req: any, @Body() dto: CreateAccountDto) {
    const tenantId = req.user.tenantId;
    return this.accountService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update account' })
  @ApiResponse({ status: 200, description: 'Account updated' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.accountService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete account (soft)' })
  @ApiResponse({ status: 200, description: 'Account soft-deleted' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.delete(tenantId, id);
  }
}

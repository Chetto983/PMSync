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
import {
  CreateAccountDto,
  UpdateAccountDto,
  ListAccountsQueryDto,
  LinkContactDto,
} from '../dto/account.dto';

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

  @Get('by-contact/:contactId')
  @ApiOperation({ summary: 'List accounts linked to a contact' })
  @ApiResponse({ status: 200, description: 'Linked accounts returned' })
  async getAccountsByContact(
    @Req() req: any,
    @Param('contactId') contactId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.accountService.getAccountsByContact(tenantId, contactId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiResponse({ status: 200, description: 'Account returned' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findById(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.findById(tenantId, id);
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'Get child accounts' })
  @ApiResponse({ status: 200, description: 'Child accounts returned' })
  @ApiResponse({ status: 404, description: 'Parent account not found' })
  async getChildren(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.getChildren(tenantId, id);
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

  @Get(':id/contacts')
  @ApiOperation({ summary: 'List contacts linked to account' })
  @ApiResponse({ status: 200, description: 'Linked contacts returned' })
  async getContacts(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.getContacts(tenantId, id);
  }

  @Post(':id/contacts')
  @ApiOperation({ summary: 'Link contact to account' })
  @ApiResponse({ status: 201, description: 'Contact linked' })
  @ApiResponse({ status: 409, description: 'Contact already linked' })
  async linkContact(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: LinkContactDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.accountService.linkContact(tenantId, id, dto);
  }

  @Delete(':accountId/contacts/:contactId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink contact from account' })
  @ApiResponse({ status: 200, description: 'Contact unlinked' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  async unlinkContact(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Param('contactId') contactId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.accountService.unlinkContact(tenantId, accountId, contactId);
  }
}
